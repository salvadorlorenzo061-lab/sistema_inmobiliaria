const express = require('express');
const cors = require('cors');
const db = require('../Conexion');

const router = express.Router();

router.use(cors());
router.use(express.json());

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows || []);
    });
});

const ULTIMO_CONVENIO_ACTIVO_SUBQUERY = `
    SELECT cp.id_convenio, cp.id_contrato, cp.fecha_inicio, cp.monto_original, cp.saldo_actual, cp.cuotas_pactadas, cp.monto_cuota
    FROM convenio_pagos cp
    INNER JOIN (
        SELECT id_contrato, MAX(id_convenio) AS ultimo_id_convenio
        FROM convenio_pagos
        WHERE LOWER(COALESCE(estado, 'activo')) IN ('activo', 'pendiente', 'incumplido', 'pagado')
        GROUP BY id_contrato
    ) ult ON ult.ultimo_id_convenio = cp.id_convenio
`;

const RESUMEN_PAGOS_CONTRATO_SUBQUERY = `
    SELECT
        p.id_contrato,
        COALESCE(SUM(CASE
            WHEN pd.tipo_concepto IN ('cuota_terreno', 'enganche', 'abono_capital') THEN pd.subtotal
            ELSE 0
        END), 0) AS capital_pagado_total,
        COALESCE(SUM(CASE
            WHEN pd.tipo_concepto = 'enganche' THEN pd.subtotal
            ELSE 0
        END), 0) AS enganche_pagado,
        COALESCE(COUNT(DISTINCT CASE
            WHEN pd.numero_cuota_afectada > 0 AND pd.tipo_concepto = 'cuota_terreno' THEN pd.numero_cuota_afectada
            ELSE NULL
        END), 0) AS cuotas_pagadas
    FROM pagos p
    INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
    GROUP BY p.id_contrato
`;

const calcularLiquidacionCapital = ({
    capital_restante,
    interes_anual,
    cuotas_totales,
    cuotas_pagadas,
    cuota_objetivo
}) => {
    const capitalRestante = Math.round(Math.max(toNumber(capital_restante, 0), 0));
    const interesAnual = Math.max(toNumber(interes_anual, 0), 0);
    const cuotasTotales = Math.max(parseInt(cuotas_totales || 0, 10), 0);

    const cuotaObjetivo = Math.max(parseInt(cuota_objetivo || 0, 10), 0);
    const cuotasPagadasBody = Math.max(parseInt(cuotas_pagadas || 0, 10), 0);

    const cuotasPagadasBase = cuotaObjetivo > 0
        ? Math.max(cuotaObjetivo - 1, 0)
        : cuotasPagadasBody;

    const mesesPendientes = Math.max(cuotasTotales - cuotasPagadasBase, 0);
    const tasaMensual = interesAnual / 100 / 12;

    const calcularCuotaFija = (principal, tasa, cuotas) => {
        if (principal <= 0 || cuotas <= 0) return 0;
        if (tasa <= 0) return principal / cuotas;
        const factor = Math.pow(1 + tasa, cuotas);
        const denominador = factor - 1;
        if (!Number.isFinite(factor) || Math.abs(denominador) < 1e-12) {
            return principal / cuotas;
        }
        return principal * ((tasa * factor) / denominador);
    };

    const cuotaMensual = Math.round(calcularCuotaFija(capitalRestante, tasaMensual, mesesPendientes));
    const tablaAmortizacion = [];
    let saldo = capitalRestante;
    let interesAcumulado = 0;
    let totalPagos = 0;

    for (let indice = 1; indice <= mesesPendientes; indice += 1) {
        const esUltima = indice === mesesPendientes;
        const interesMes = Math.round(saldo * tasaMensual);
        const capitalCuota = esUltima
            ? saldo
            : Math.round(Math.min(Math.max(cuotaMensual - interesMes, 0), saldo));
        const pagoMes = Math.round(capitalCuota + interesMes);
        const saldoFinal = Math.round(Math.max(saldo - capitalCuota, 0));

        interesAcumulado = Math.round(interesAcumulado + interesMes);
        totalPagos = Math.round(totalPagos + pagoMes);
        tablaAmortizacion.push({
            indice,
            numero_cuota: cuotasPagadasBase + indice,
            saldo_inicial: saldo,
            capital_cuota: capitalCuota,
            interes_mes: interesMes,
            cuota_estimada: pagoMes,
            saldo_final: saldoFinal,
            interes_acumulado: interesAcumulado
        });
        saldo = saldoFinal;
    }

    const interesPorMes = tablaAmortizacion[0]?.interes_mes || 0;
    const interesTotalPendiente = interesAcumulado;
    const totalLiquidacion = totalPagos;

    return {
        cuota_objetivo: cuotaObjetivo || null,
        cuotas_totales: cuotasTotales,
        cuotas_pagadas: cuotasPagadasBase,
        meses_pendientes: mesesPendientes,
        capital_restante: round2(capitalRestante),
        interes_anual: round2(interesAnual),
        tasa_mensual: round2(tasaMensual * 100),
        cuota_mensual: cuotaMensual,
        interes_por_mes: interesPorMes,
        interes_total_pendiente: interesTotalPendiente,
        total_liquidacion: totalLiquidacion,
        tabla_amortizacion: tablaAmortizacion
    };
};

router.get('/buscar-residente', (req, res) => {
    const { criterio } = req.query;

    if (!criterio) {
        return res.status(400).send('Debe proporcionar un criterio de busqueda.');
    }

    const searchTerm = `%${criterio}%`;

    const sql = `
        SELECT
            r.id_residente,
            r.nombre,
            r.dpi,
            r.numero_identificacion,
            c.id_contrato,
            c.codigo_contrato,
            c.estado AS estado_contrato,
            c.fecha_firma,
            COALESCE(c.saldo_pendiente, conv.saldo_actual, c.monto_total) AS saldo_pendiente,
            COALESCE(conv.monto_original,
                c.monto_total + COALESCE(pagos_resumen.capital_pagado_total, 0)
            ) AS monto_total_original,
            c.enganche,
            c.monto_cuota,
            c.cuotas_pactadas,
            c.plazo_meses,
            c.interes_porcentaje,
            COALESCE(conv.id_convenio, 0) AS id_convenio_activo,
            tc.nombre_tipo_contrato
        FROM residentes r
        INNER JOIN contratos_residentes c ON c.id_residente = r.id_residente
        INNER JOIN tipos_contrato tc ON tc.id_tipo_contrato = c.id_tipo_contrato
        LEFT JOIN (
            ${ULTIMO_CONVENIO_ACTIVO_SUBQUERY}
        ) conv ON conv.id_contrato = c.id_contrato
        LEFT JOIN (
            ${RESUMEN_PAGOS_CONTRATO_SUBQUERY}
        ) pagos_resumen ON pagos_resumen.id_contrato = c.id_contrato
        WHERE (
            r.nombre LIKE ?
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
          AND c.estado = 'activo'
          AND COALESCE(c.id_proyecto, 0) > 0
          AND COALESCE(c.id_empresa_marca, r.id_empresa, 0) > 0
        ORDER BY CASE WHEN LOWER(TRIM(COALESCE(c.estado, ''))) = 'activo' THEN 0 ELSE 1 END, c.id_contrato DESC
        LIMIT 60
    `;

    db.query(sql, [searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
        if (err) {
            console.error('Error en busqueda de cuenta capital:', err.message);
            return res.status(500).send('No se pudo buscar el residente.');
        }

        if (!rows || rows.length === 0) {
            return res.status(404).send('No se encontraron residentes.');
        }

        return res.status(200).json(rows);
    });
});

router.get('/detalle-contrato/:id_contrato', (req, res) => {
    const idContrato = Number(req.params?.id_contrato || 0);
    if (!idContrato) {
        return res.status(400).send('Contrato invalido.');
    }

    const sqlContrato = `
        SELECT
            c.id_contrato,
            c.codigo_contrato,
            c.id_residente,
            c.fecha_firma,
            COALESCE(c.saldo_pendiente, conv.saldo_actual, c.monto_total) AS saldo_pendiente,
            COALESCE(conv.monto_original,
                c.monto_total + COALESCE(pagos_resumen.capital_pagado_total, 0)
            ) AS monto_total_original,
            c.enganche,
            c.monto_cuota,
            c.interes_porcentaje,
            c.cuotas_pactadas,
            c.plazo_meses,
            r.nombre AS nombre_residente,
            COALESCE(conv.id_convenio, 0) AS id_convenio_activo,
            conv.fecha_inicio AS convenio_fecha_inicio,
            conv.saldo_actual AS convenio_saldo_actual,
            conv.monto_original AS convenio_monto_original,
            conv.cuotas_pactadas AS convenio_cuotas,
            conv.monto_cuota AS convenio_monto_cuota,
            COALESCE(pagos_resumen.cuotas_pagadas, 0) AS cuotas_pagadas_reales,
            COALESCE(pagos_resumen.capital_pagado_total, 0) AS capital_pagado_total,
            COALESCE(pagos_resumen.enganche_pagado, 0) AS enganche_pagado_total
        FROM contratos_residentes c
        INNER JOIN residentes r ON r.id_residente = c.id_residente
        LEFT JOIN (
            ${ULTIMO_CONVENIO_ACTIVO_SUBQUERY}
        ) conv ON conv.id_contrato = c.id_contrato
        LEFT JOIN (
            ${RESUMEN_PAGOS_CONTRATO_SUBQUERY}
        ) pagos_resumen ON pagos_resumen.id_contrato = c.id_contrato
        WHERE c.id_contrato = ?
        LIMIT 1
    `;

    const sqlMesesPendientes = `
        SELECT
            m.mes,
            m.numero_cuota
        FROM (
            SELECT
                pd.mes_pagado AS mes,
                COALESCE(pd.numero_cuota_afectada, 0) AS numero_cuota,
                MAX(fh.fecha_evento) AS fecha_ref
            FROM facturas_historial fh
            LEFT JOIN pagos_detalle pd ON pd.id_pago = fh.id_pago
            WHERE fh.id_contrato = ?
              AND fh.estado_factura = 'EMITIDA'
              AND pd.mes_pagado IS NOT NULL
              AND pd.mes_pagado <> ''
            GROUP BY pd.mes_pagado, COALESCE(pd.numero_cuota_afectada, 0)
        ) m
        ORDER BY m.fecha_ref DESC
    `;

    db.query(sqlContrato, [idContrato], (err, contratoRows) => {
        if (err) {
            console.error('Error obteniendo contrato para cuenta capital:', err.message);
            return res.status(500).send('No se pudo obtener el contrato.');
        }

        if (!contratoRows || contratoRows.length === 0) {
            return res.status(404).send('Contrato no encontrado.');
        }

        const contrato = contratoRows[0];

        const cuotasTotales = Math.max(
            parseInt(contrato.convenio_cuotas || 0, 10),
            parseInt(contrato.plazo_meses || contrato.cuotas_pactadas || 0, 10),
            0
        );

        const enganchePagadoRaw = Math.max(toNumber(contrato.enganche_pagado_total, 0), 0);
        const capitalPagado = Math.max(toNumber(contrato.capital_pagado_total, 0), 0);
        const precioTerreno = round2(Math.max(toNumber(contrato.monto_total_original, 0), 0));
        const engancheContrato = round2(Math.max(toNumber(contrato.enganche, 0), 0));
        const enganchePagado = round2(Math.min(enganchePagadoRaw, engancheContrato));
        const enganchePendiente = round2(Math.max(engancheContrato - enganchePagado, 0));
        const capitalInicialFinanciado = round2(Math.max(precioTerreno - engancheContrato, 0));
        const capitalRestante = round2(Math.max(
            Number(contrato.id_convenio_activo || 0) > 0
                ? toNumber(contrato.convenio_saldo_actual, capitalInicialFinanciado - capitalPagado)
                : capitalInicialFinanciado - capitalPagado,
            0
        ));
        const cuotasPagadasReales = Math.max(parseInt(contrato.cuotas_pagadas_reales || 0, 10), 0);
        const cuotaSiguiente = enganchePendiente > 0.01
            ? 0
            : (cuotasTotales > 0 ? Math.min(cuotasPagadasReales + 1, cuotasTotales) : 1);

        const payload = {
            id_contrato: contrato.id_contrato,
            id_residente: contrato.id_residente,
            codigo_contrato: contrato.codigo_contrato,
            nombre_residente: contrato.nombre_residente,
            fecha_firma: contrato.fecha_firma,
            id_convenio_activo: Number(contrato.id_convenio_activo || 0),
            precio_total_terreno: precioTerreno,
            capital_inicial_financiado: capitalInicialFinanciado,
            capital_restante: round2(capitalRestante),
            enganche_registrado: engancheContrato,
            enganche_pagado: enganchePagado,
            enganche_pendiente: enganchePendiente,
            estado_enganche: engancheContrato <= 0 || enganchePendiente <= 0.01 ? 'PAGADO' : 'PENDIENTE DE PAGO',
            numero_cuota_enganche: 0,
            capital_pagado: round2(capitalPagado),
            interes_anual: round2(toNumber(contrato.interes_porcentaje, 14)),
            cuotas_totales: cuotasTotales,
            cuotas_pagadas: cuotasPagadasReales,
            cuotas_pendientes: Math.max(cuotasTotales - cuotasPagadasReales, 0),
            cuota_siguiente: cuotaSiguiente
        };

        const simulacionBase = calcularLiquidacionCapital({
            capital_restante: payload.capital_restante,
            interes_anual: payload.interes_anual,
            cuotas_totales: payload.cuotas_totales,
            cuotas_pagadas: payload.cuotas_pagadas
        });

        db.query(sqlMesesPendientes, [idContrato], (mesesErr, mesesRows) => {
            if (mesesErr) {
                console.error('Error consultando meses pagados para cuenta capital:', mesesErr.message);
            }

            return res.status(200).json({
                contrato: payload,
                meses_pagados_detalle: Array.isArray(mesesRows) ? mesesRows : [],
                simulacion_base: simulacionBase
            });
        });
    });
});

router.post('/generar-plan-caja', async (req, res) => {
    try {
        const idContrato = Number(req.body?.id_contrato || 0);
        const capitalRestante = round2(Math.max(toNumber(req.body?.capital_restante, 0), 0));
        const cuotasPactadas = Math.max(parseInt(req.body?.cuotas_pactadas || 0, 10), 0);
        const fechaInicio = String(req.body?.fecha_inicio || '').trim() || new Date().toISOString().slice(0, 10);

        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(400).json({ message: 'Contrato invalido.' });
        }

        if (capitalRestante <= 0 || cuotasPactadas <= 0) {
            return res.status(400).json({ message: 'El capital restante y las cuotas pactadas deben ser mayores a cero.' });
        }

        const contratoRows = await queryAsync(`
            SELECT id_contrato, codigo_contrato, enganche, fecha_compra, fecha_firma
            FROM contratos_residentes
            WHERE id_contrato = ?
              AND estado = 'activo'
            LIMIT 1
        `, [idContrato]);

        if (!contratoRows.length) {
            return res.status(404).json({ message: 'Contrato activo no encontrado.' });
        }

        await queryAsync(`
            CREATE TABLE IF NOT EXISTS convenio_pagos (
                id_convenio INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                id_contrato INT NOT NULL,
                fecha_convenio DATE NOT NULL,
                monto_original DECIMAL(12,2) NOT NULL DEFAULT 0,
                saldo_actual DECIMAL(12,2) NOT NULL DEFAULT 0,
                cuotas_pactadas INT NOT NULL DEFAULT 1,
                monto_cuota DECIMAL(12,2) NOT NULL DEFAULT 0,
                fecha_inicio DATE NULL,
                observaciones TEXT NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'activo',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_convenio_contrato (id_contrato),
                INDEX idx_convenio_estado (estado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        const planesActivos = await queryAsync(`
            SELECT id_convenio
            FROM convenio_pagos
            WHERE id_contrato = ?
              AND LOWER(COALESCE(estado, 'activo')) IN ('activo', 'pendiente', 'incumplido')
            ORDER BY id_convenio DESC
            LIMIT 1
        `, [idContrato]);

        if (planesActivos.length) {
            return res.status(409).json({
                message: `El contrato ya tiene un plan de pagos activo (#${planesActivos[0].id_convenio}). Revise Convenio de Pagos antes de generar otro.`
            });
        }

        const montoCuota = Math.round(capitalRestante / cuotasPactadas);
        const fechaInicioContrato = contratoRows[0].fecha_compra || contratoRows[0].fecha_firma || fechaInicio;
        const observaciones = `Plan generado desde Cuenta Estado Capital. Se conservan los nombres Cuota 1 a Cuota ${cuotasPactadas} y los meses/años desde la fecha contractual. Capital Q${capitalRestante.toFixed(2)} en ${cuotasPactadas} cuotas. El interes proyectado permanece informativo y no se capitaliza en el saldo.`;
        const insertResult = await queryAsync(`
            INSERT INTO convenio_pagos
                (id_contrato, fecha_convenio, monto_original, saldo_actual, cuotas_pactadas, monto_cuota, fecha_inicio, observaciones, estado)
            VALUES (?, CURRENT_DATE, ?, ?, ?, ?, ?, ?, 'activo')
        `, [idContrato, capitalRestante, capitalRestante, cuotasPactadas, montoCuota, fechaInicioContrato, observaciones]);

        return res.status(200).json({
            message: 'Plan de cuotas generado correctamente en Caja.',
            id_convenio: Number(insertResult?.insertId || 0),
            id_contrato: idContrato,
            cuotas_pactadas: cuotasPactadas,
            monto_cuota: montoCuota,
            saldo_actual: capitalRestante,
            fecha_inicio: fechaInicioContrato
        });
    } catch (error) {
        console.error('Error generando plan de Caja desde Cuenta Estado:', error.message);
        return res.status(500).json({ message: 'No se pudo generar el plan de cuotas en Caja.' });
    }
});

router.post('/simular-liquidacion', (req, res) => {
    const {
        capital_restante,
        interes_anual,
        cuotas_totales,
        cuotas_pagadas,
        cuota_objetivo
    } = req.body || {};

    const simulacion = calcularLiquidacionCapital({
        capital_restante,
        interes_anual,
        cuotas_totales,
        cuotas_pagadas,
        cuota_objetivo
    });

    return res.status(200).json(simulacion);
});

module.exports = router;
