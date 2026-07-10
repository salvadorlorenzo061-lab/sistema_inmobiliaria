const express = require("express");
const db = require('../Conexion'); 
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());

const NOMBRES_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows || []);
    });
});

const existeColumna = async (tabla, columna) => {
    const rows = await queryAsync(
        `
            SELECT COUNT(*) AS total
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
        `,
        [tabla, columna]
    );

    return Number(rows?.[0]?.total || 0) > 0;
};

const existeTabla = async (tabla) => {
    const rows = await queryAsync(
        `
            SELECT COUNT(*) AS total
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
        `,
        [tabla]
    );

    return Number(rows?.[0]?.total || 0) > 0;
};

const asegurarTablaMorosidad = async () => {
    await queryAsync(`
        CREATE TABLE IF NOT EXISTS morosidad (
            id_morosidad INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_contrato INT NOT NULL,
            mes_atrasado VARCHAR(80) NOT NULL,
            monto_deuda_original DECIMAL(12,2) NOT NULL DEFAULT 0,
            monto_mora DECIMAL(12,2) NOT NULL DEFAULT 0,
            dias_retraso INT NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_morosidad_contrato_mes (id_contrato, mes_atrasado),
            INDEX idx_morosidad_estado (estado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const tieneMontoMora = await existeColumna('morosidad', 'monto_mora');
    if (!tieneMontoMora) {
        await queryAsync('ALTER TABLE morosidad ADD COLUMN monto_mora DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER mes_atrasado');
    }

    const tieneMontoDeudaOriginal = await existeColumna('morosidad', 'monto_deuda_original');
    if (!tieneMontoDeudaOriginal) {
        await queryAsync('ALTER TABLE morosidad ADD COLUMN monto_deuda_original DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER mes_atrasado');
    } else {
        // Normaliza esquema legado en produccion donde la columna existe sin DEFAULT.
        await queryAsync('ALTER TABLE morosidad MODIFY COLUMN monto_deuda_original DECIMAL(12,2) NOT NULL DEFAULT 0');
    }

    const tieneDiasRetraso = await existeColumna('morosidad', 'dias_retraso');
    if (!tieneDiasRetraso) {
        await queryAsync('ALTER TABLE morosidad ADD COLUMN dias_retraso INT NOT NULL DEFAULT 0 AFTER monto_mora');
    }

    const tieneEstado = await existeColumna('morosidad', 'estado');
    if (!tieneEstado) {
        await queryAsync("ALTER TABLE morosidad ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' AFTER dias_retraso");
    }
};

const parseFecha = (value) => {
    const d = value ? new Date(value) : null;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
};

const labelMes = (date) => `${NOMBRES_MESES[date.getMonth()]} ${date.getFullYear()}`;

router.get('/meses-pendientes', async (req, res) => {
    try {
        const idContrato = Number(req.query?.id_contrato || 0);
        const hoy = new Date();

        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(200).json({ meses: [`${NOMBRES_MESES[hoy.getMonth()]} ${hoy.getFullYear()}`] });
        }

        const contratoRows = await queryAsync(
            'SELECT fecha_compra, fecha_fin, fecha_firma, cuotas_pactadas, monto_total, monto_cuota FROM contratos_residentes WHERE id_contrato = ? LIMIT 1',
            [idContrato]
        );

        if (!contratoRows.length) {
            return res.status(404).json({ meses: [], message: 'Contrato no encontrado.' });
        }

        const contrato = contratoRows[0];

        const parseFechaValida = (value) => {
            const parsed = value ? new Date(value) : null;
            return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
        };

        const fechaCompra = parseFechaValida(contrato.fecha_compra);
        const fechaFin = parseFechaValida(contrato.fecha_fin);
        const fechaFirma = parseFechaValida(contrato.fecha_firma);
        const fechaInicioBase = fechaCompra || fechaFirma || new Date();
        const fechaInicio = new Date(fechaInicioBase.getFullYear(), fechaInicioBase.getMonth(), 1);
        const fechaLimite = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const cuotasPactadas = Number(contrato.cuotas_pactadas || 0);
        const saldoPendiente = Number(contrato.monto_total || 0);
        const montoCuota = Number(contrato.monto_cuota || 0);
        const fechaFinMes = (fechaFin && fechaFin >= fechaInicio)
            ? new Date(fechaFin.getFullYear(), fechaFin.getMonth(), 1)
            : null;

        const candidatos = [];
        let cursor = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);

        if (fechaFinMes) {
            while (cursor <= fechaFinMes) {
                candidatos.push(labelMes(cursor));
                cursor.setMonth(cursor.getMonth() + 1);
            }
        } else {
            const mesesTranscurridos = Math.max(
                ((fechaLimite.getFullYear() - fechaInicio.getFullYear()) * 12) +
                (fechaLimite.getMonth() - fechaInicio.getMonth()) + 1,
                1
            );

            const totalMesesObjetivo = Math.max(
                Number.isInteger(cuotasPactadas) && cuotasPactadas > 0 ? cuotasPactadas : 0,
                mesesTranscurridos
            );

            for (let i = 0; i < totalMesesObjetivo; i += 1) {
                candidatos.push(labelMes(cursor));
                cursor.setMonth(cursor.getMonth() + 1);
            }
        }

        const tienePagos = await existeTabla('pagos');
        const tienePagosDetalle = await existeTabla('pagos_detalle');
        const pagosDetalleTieneMes = tienePagosDetalle ? await existeColumna('pagos_detalle', 'mes_pagado') : false;
        const pagosDetalleTieneTipo = tienePagosDetalle ? await existeColumna('pagos_detalle', 'tipo_concepto') : false;

        let mesesPagados = [];
        if (tienePagos && tienePagosDetalle && pagosDetalleTieneMes && pagosDetalleTieneTipo) {
            mesesPagados = await queryAsync(
                `
                    SELECT DISTINCT pd.mes_pagado
                    FROM pagos p
                    INNER JOIN pagos_detalle pd ON p.id_pago = pd.id_pago
                    WHERE p.id_contrato = ?
                      AND pd.tipo_concepto = 'cuota_terreno'
                      AND pd.mes_pagado IS NOT NULL
                      AND pd.mes_pagado != ''
                `,
                [idContrato]
            );
        }

        const mesesPagadosSet = new Set();
        (mesesPagados || []).forEach((row) => {
            if (row?.mes_pagado && String(row.mes_pagado).trim()) {
                mesesPagadosSet.add(String(row.mes_pagado).trim());
            }
        });

        const pendientes = candidatos.filter((mes) => !mesesPagadosSet.has(mes));
        const cuotasRestantesPorSaldo = (montoCuota > 0 && saldoPendiente > 0)
            ? Math.ceil(saldoPendiente / montoCuota)
            : 0;

        if (cuotasRestantesPorSaldo > 0 && pendientes.length < cuotasRestantesPorSaldo) {
            const pendientesSet = new Set(pendientes);
            const base = fechaFinMes
                ? new Date(fechaFinMes.getFullYear(), fechaFinMes.getMonth(), 1)
                : new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
            let offset = fechaFinMes ? 1 : candidatos.length;

            while (pendientesSet.size < cuotasRestantesPorSaldo) {
                const extra = new Date(base.getFullYear(), base.getMonth(), 1);
                extra.setMonth(extra.getMonth() + offset);
                const etiqueta = labelMes(extra);
                if (!mesesPagadosSet.has(etiqueta)) {
                    pendientesSet.add(etiqueta);
                }
                offset += 1;
            }

            return res.status(200).json({ meses: Array.from(pendientesSet) });
        }

        return res.status(200).json({ meses: pendientes });
    } catch (error) {
        console.error('Error al obtener meses pendientes de morosidad:', error);
        return res.status(500).json({
            success: false,
            message: 'No se pudieron obtener los meses pendientes.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

const calcularMorasAutomaticas = async () => {
    await asegurarTablaMorosidad();

    const tieneInteresMoratorio = await existeColumna('tipos_contrato', 'interes_moratorio');
    const sqlInteresMoratorio = tieneInteresMoratorio
        ? 'COALESCE(tc.interes_moratorio, 0)'
        : '0';

    const contratos = await queryAsync(`
        SELECT
            c.id_contrato,
            c.codigo_contrato,
            c.fecha_compra,
            c.fecha_firma,
            c.dia_pago_limite,
            c.monto_cuota,
            c.monto_total,
            c.estado,
            ${sqlInteresMoratorio} AS interes_moratorio
        FROM contratos_residentes c
        LEFT JOIN tipos_contrato tc ON tc.id_tipo_contrato = c.id_tipo_contrato
        WHERE c.estado = 'activo'
    `);

    if (!contratos.length) {
        return { generated: 0, examinedContracts: 0 };
    }

    let pagosRows = [];
    const tienePagos = await existeTabla('pagos');
    const tienePagosDetalle = await existeTabla('pagos_detalle');
    const pagosDetalleTieneMes = tienePagosDetalle ? await existeColumna('pagos_detalle', 'mes_pagado') : false;
    const pagosDetalleTieneTipo = tienePagosDetalle ? await existeColumna('pagos_detalle', 'tipo_concepto') : false;

    if (tienePagos && tienePagosDetalle && pagosDetalleTieneMes && pagosDetalleTieneTipo) {
        pagosRows = await queryAsync(`
            SELECT DISTINCT p.id_contrato, pd.mes_pagado
            FROM pagos p
            INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
            WHERE pd.tipo_concepto = 'cuota_terreno'
              AND pd.mes_pagado IS NOT NULL
              AND pd.mes_pagado != ''
        `);
    }

    const moraExistenteRows = await queryAsync(`
        SELECT id_contrato, mes_atrasado
        FROM morosidad
    `);

    const pagosPorContrato = new Map();
    pagosRows.forEach((r) => {
        const key = String(r.id_contrato);
        if (!pagosPorContrato.has(key)) pagosPorContrato.set(key, new Set());
        pagosPorContrato.get(key).add(String(r.mes_pagado || '').trim());
    });

    const morasExistentesPorContrato = new Map();
    moraExistenteRows.forEach((r) => {
        const key = String(r.id_contrato);
        if (!morasExistentesPorContrato.has(key)) morasExistentesPorContrato.set(key, new Set());
        morasExistentesPorContrato.get(key).add(String(r.mes_atrasado || '').trim());
    });

    const hoy = new Date();
    const inserts = [];

    contratos.forEach((contrato) => {
        const saldoPendiente = Number(contrato.monto_total || 0);
        const montoCuota = Number(contrato.monto_cuota || 0);
        const interesMoratorio = Number(contrato.interes_moratorio || 0);

        if (saldoPendiente <= 0 || montoCuota <= 0) {
            return;
        }

        const inicioRaw = parseFecha(contrato.fecha_compra) || parseFecha(contrato.fecha_firma);
        if (!inicioRaw) {
            return;
        }

        const diaPagoLimite = Math.max(1, Math.min(28, Number(contrato.dia_pago_limite || 5)));
        const inicio = new Date(inicioRaw.getFullYear(), inicioRaw.getMonth(), 1);
        const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);

        const pagadosSet = pagosPorContrato.get(String(contrato.id_contrato)) || new Set();
        const morasSet = morasExistentesPorContrato.get(String(contrato.id_contrato)) || new Set();

        while (cursor <= hoy) {
            const etiquetaMes = labelMes(cursor);

            const fechaVencimiento = new Date(cursor.getFullYear(), cursor.getMonth(), diaPagoLimite);
            const vencido = hoy > fechaVencimiento;

            if (vencido && !pagadosSet.has(etiquetaMes) && !morasSet.has(etiquetaMes)) {
                const msPorDia = 1000 * 60 * 60 * 24;
                const diasRetraso = Math.max(Math.floor((hoy - fechaVencimiento) / msPorDia), 1);
                const moraCalculada = interesMoratorio > 0
                    ? Number((montoCuota * (interesMoratorio / 100)).toFixed(2))
                    : 0;

                inserts.push([
                    contrato.id_contrato,
                    etiquetaMes,
                    saldoPendiente,
                    moraCalculada,
                    diasRetraso,
                    'pendiente'
                ]);

                morasSet.add(etiquetaMes);
            }

            cursor.setMonth(cursor.getMonth() + 1);
        }
    });

    if (!inserts.length) {
        return { generated: 0, examinedContracts: contratos.length };
    }

    await queryAsync(
        'INSERT IGNORE INTO morosidad (id_contrato, mes_atrasado, monto_deuda_original, monto_mora, dias_retraso, estado) VALUES ?',
        [inserts]
    );

    return { generated: inserts.length, examinedContracts: contratos.length };
};

router.get("/", (req, res) => {
    const sql = `
        SELECT
            m.*, 
            c.codigo_contrato,
            r.nombre AS nombre_residente,
            r.numero_identificacion
        FROM morosidad m
        LEFT JOIN contratos_residentes c ON c.id_contrato = m.id_contrato
        LEFT JOIN residentes r ON r.id_residente = c.id_residente
        ORDER BY m.id_morosidad DESC
    `;

    db.query(sql, (err, result) => {
        if (err) return res.status(500).send("Error");
        return res.send(result);
    });
});

router.post('/generar-automatico', async (req, res) => {
    try {
        const data = await calcularMorasAutomaticas();
        return res.status(200).json({
            success: true,
            message: 'Generación automática de mora finalizada',
            ...data
        });
    } catch (error) {
        console.error('Error al generar mora automática:', error);
        return res.status(500).json({
            success: false,
            message: 'No se pudo generar mora automática.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

// Endpoint extra para la creación manual si la necesitas
router.post("/crear", async (req, res) => {
    try {
        await asegurarTablaMorosidad();

        const idContrato = Number(req.body?.id_contrato);
        const mesAtrasado = String(req.body?.mes_atrasado || '').trim();
        const montoMora = Number(req.body?.monto_mora || 0);
        const diasRetraso = Math.max(0, Number(req.body?.dias_retraso || 0));
        const estado = String(req.body?.estado || 'pendiente').trim() || 'pendiente';

        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(400).json({ success: false, message: 'Contrato inválido.' });
        }

        if (!mesAtrasado) {
            return res.status(400).json({ success: false, message: 'Debes indicar el mes atrasado.' });
        }

        const existeContratoRows = await queryAsync(
            'SELECT id_contrato, monto_total FROM contratos_residentes WHERE id_contrato = ? LIMIT 1',
            [idContrato]
        );

        if (!existeContratoRows.length) {
            return res.status(400).json({ success: false, message: 'El contrato seleccionado no existe.' });
        }

        const existentes = await queryAsync(
            'SELECT id_morosidad FROM morosidad WHERE id_contrato = ? AND mes_atrasado = ? LIMIT 1',
            [idContrato, mesAtrasado]
        );

        const montoDeudaOriginal = Number(existeContratoRows?.[0]?.monto_total || 0);

        if (existentes.length) {
            await queryAsync(
                'UPDATE morosidad SET monto_deuda_original = ?, monto_mora = ?, dias_retraso = ?, estado = ? WHERE id_morosidad = ?',
                [montoDeudaOriginal, montoMora, diasRetraso, estado, existentes[0].id_morosidad]
            );

            return res.status(200).json({ success: true, message: 'Mora actualizada correctamente.' });
        }

        await queryAsync(
            'INSERT INTO morosidad (id_contrato, mes_atrasado, monto_deuda_original, monto_mora, dias_retraso, estado) VALUES (?, ?, ?, ?, ?, ?)',
            [idContrato, mesAtrasado, montoDeudaOriginal, montoMora, diasRetraso, estado]
        );

        return res.status(200).json({ success: true, message: 'Mora generada correctamente.' });
    } catch (error) {
        console.error('Error al crear mora manual:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al generar mora manual.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

router.put("/actualizar-estado", (req, res) => {
    const { id_morosidad, estado } = req.body;
    db.query('UPDATE morosidad SET estado = ? WHERE id_morosidad = ?', [estado, id_morosidad], (err, result) => {
        if (err) res.status(500).send("Error");
        else res.status(200).send("Estado actualizado");
    });
});

module.exports = router;