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

const calcularLiquidacionCapital = ({
    capital_restante,
    interes_anual,
    cuotas_totales,
    cuotas_pagadas,
    cuota_objetivo
}) => {
    const capitalRestante = Math.max(toNumber(capital_restante, 0), 0);
    const interesAnual = Math.max(toNumber(interes_anual, 0), 0);
    const cuotasTotales = Math.max(parseInt(cuotas_totales || 0, 10), 0);

    const cuotaObjetivo = Math.max(parseInt(cuota_objetivo || 0, 10), 0);
    const cuotasPagadasBody = Math.max(parseInt(cuotas_pagadas || 0, 10), 0);

    const cuotasPagadasBase = cuotaObjetivo > 0
        ? Math.max(cuotaObjetivo - 1, 0)
        : cuotasPagadasBody;

    const mesesPendientes = Math.max(cuotasTotales - cuotasPagadasBase, 0);
    const tasaMensual = interesAnual / 100 / 12;

    const interesPorMes = round2(capitalRestante * tasaMensual);
    const interesTotalPendiente = round2(capitalRestante * tasaMensual * mesesPendientes);
    const totalLiquidacion = round2(capitalRestante + interesTotalPendiente);

    return {
        cuota_objetivo: cuotaObjetivo || null,
        cuotas_totales: cuotasTotales,
        cuotas_pagadas: cuotasPagadasBase,
        meses_pendientes: mesesPendientes,
        capital_restante: round2(capitalRestante),
        interes_anual: round2(interesAnual),
        tasa_mensual: round2(tasaMensual * 100),
        interes_por_mes: interesPorMes,
        interes_total_pendiente: interesTotalPendiente,
        total_liquidacion: totalLiquidacion
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
            c.monto_total,
            c.enganche,
            c.monto_cuota,
            c.cuotas_pactadas,
            c.plazo_meses,
            c.interes_porcentaje,
            tc.nombre_tipo_contrato
        FROM residentes r
        INNER JOIN contratos_residentes c ON c.id_residente = r.id_residente
        INNER JOIN tipos_contrato tc ON tc.id_tipo_contrato = c.id_tipo_contrato
        WHERE (
            r.nombre LIKE ?
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
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
            c.fecha_firma,
            c.monto_total,
            c.enganche,
            c.monto_cuota,
            c.interes_porcentaje,
            c.cuotas_pactadas,
            c.plazo_meses,
            r.nombre AS nombre_residente,
            COALESCE(conv.id_convenio, 0) AS id_convenio_activo,
            conv.saldo_actual AS convenio_saldo_actual,
            conv.cuotas_pactadas AS convenio_cuotas,
            conv.monto_cuota AS convenio_monto_cuota
        FROM contratos_residentes c
        INNER JOIN residentes r ON r.id_residente = c.id_residente
        LEFT JOIN (
            SELECT cp.id_convenio, cp.id_contrato, cp.saldo_actual, cp.cuotas_pactadas, cp.monto_cuota
            FROM convenio_pagos cp
            INNER JOIN (
                SELECT id_contrato, MAX(id_convenio) AS ultimo_id_convenio
                FROM convenio_pagos
                WHERE LOWER(COALESCE(estado, 'activo')) IN ('activo', 'pendiente', 'incumplido', 'pagado')
                GROUP BY id_contrato
            ) ult ON ult.ultimo_id_convenio = cp.id_convenio
        ) conv ON conv.id_contrato = c.id_contrato
        WHERE c.id_contrato = ?
        LIMIT 1
    `;

    const sqlPagos = `
        SELECT
            COALESCE(COUNT(DISTINCT CASE WHEN fh.numero_cuota_afectada > 0 THEN fh.numero_cuota_afectada END), 0) AS cuotas_pagadas,
            COALESCE(SUM(CASE WHEN fh.tipo_concepto IN ('cuota_terreno', 'abono_capital') THEN fh.subtotal ELSE 0 END), 0) AS capital_pagado,
            COALESCE(SUM(CASE WHEN fh.tipo_concepto = 'enganche' THEN fh.subtotal ELSE 0 END), 0) AS enganche_pagado
        FROM facturas_historial fh
        WHERE fh.id_contrato = ?
          AND fh.estado_factura = 'EMITIDA'
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

        db.query(sqlPagos, [idContrato], (pagosErr, pagosRows) => {
            if (pagosErr) {
                console.error('Error obteniendo pagos para cuenta capital:', pagosErr.message);
                return res.status(500).send('No se pudo calcular el estado actual del contrato.');
            }

            const pagos = pagosRows?.[0] || {};

            const cuotasTotales = Math.max(
                parseInt(contrato.convenio_cuotas || 0, 10),
                parseInt(contrato.plazo_meses || contrato.cuotas_pactadas || 0, 10),
                0
            );

            const capitalRestante = Math.max(
                toNumber(contrato.convenio_saldo_actual, -1) >= 0
                    ? toNumber(contrato.convenio_saldo_actual, 0)
                    : toNumber(contrato.monto_total, 0),
                0
            );

            const enganchePagado = Math.max(toNumber(pagos.enganche_pagado, 0), 0);
            const capitalPagado = Math.max(toNumber(pagos.capital_pagado, 0), 0);

            // Si monto_total fue reducido en cobros, este calculo reconstruye una vista inicial aproximada.
            const capitalInicialEstimado = round2(capitalRestante + capitalPagado);
            const precioTotalEstimado = round2(capitalInicialEstimado + enganchePagado);

            const payload = {
                id_contrato: contrato.id_contrato,
                codigo_contrato: contrato.codigo_contrato,
                nombre_residente: contrato.nombre_residente,
                fecha_firma: contrato.fecha_firma,
                id_convenio_activo: Number(contrato.id_convenio_activo || 0),
                precio_total_estimado: precioTotalEstimado,
                capital_inicial_estimado: capitalInicialEstimado,
                capital_restante: round2(capitalRestante),
                enganche_registrado: round2(toNumber(contrato.enganche, 0)),
                enganche_pagado: round2(enganchePagado),
                capital_pagado: round2(capitalPagado),
                interes_anual: round2(toNumber(contrato.interes_porcentaje, 14)),
                cuotas_totales: cuotasTotales,
                cuotas_pagadas: Math.max(parseInt(pagos.cuotas_pagadas || 0, 10), 0)
            };

            const simulacionBase = calcularLiquidacionCapital({
                capital_restante: payload.capital_restante,
                interes_anual: payload.interes_anual,
                cuotas_totales: payload.cuotas_totales,
                cuotas_pagadas: payload.cuotas_pagadas
            });

            return res.status(200).json({
                contrato: payload,
                simulacion_base: simulacionBase
            });
        });
    });
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
