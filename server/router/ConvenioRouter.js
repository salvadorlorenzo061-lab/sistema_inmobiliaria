const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');
const { calcularTotalPlanPlano, redondear2 } = require('../utils/amortizacion');

router.use(cors());

const queryAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows || []);
    });
});

const asegurarTablaConvenios = async () => {
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
            INDEX idx_convenio_estado (estado),
            CONSTRAINT fk_convenio_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_residentes(id_contrato) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const columnas = await queryAsync(`
        SELECT COLUMN_NAME AS column_name
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'convenio_pagos'
    `);
    const existentes = new Set((columnas || []).map((fila) => fila.column_name));
    const faltantes = [
        ['monto_cuotas_financiadas', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
        ['monto_enganche_pendiente', 'DECIMAL(12,2) NOT NULL DEFAULT 0']
    ].filter(([nombre]) => !existentes.has(nombre));
    for (const [nombre, definicion] of faltantes) {
        await queryAsync(`ALTER TABLE convenio_pagos ADD COLUMN ${nombre} ${definicion}`);
    }
};

const obtenerDeudaElegibleConvenio = async (idContrato) => {
    const rows = await queryAsync(`
        SELECT
            c.id_contrato,
            c.monto_total,
            COALESCE(c.enganche, 0) AS enganche,
            COALESCE(c.interes_porcentaje, 0) AS interes_porcentaje,
            COALESCE(NULLIF(c.cuotas_pactadas, 0), NULLIF(c.plazo_meses, 0), 1) AS cuotas_pactadas,
            COALESCE(SUM(CASE
                WHEN pd.tipo_concepto IN ('cuota_terreno', 'interes', 'abono_capital') THEN pd.subtotal
                ELSE 0
            END), 0) AS pagado_plan,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'enganche' THEN pd.subtotal ELSE 0 END), 0) AS enganche_pagado,
            COALESCE(COUNT(DISTINCT CASE
                WHEN pd.tipo_concepto = 'cuota_terreno' AND COALESCE(pd.numero_cuota_afectada, 0) > 0
                    THEN pd.numero_cuota_afectada
                ELSE NULL
            END), 0) AS cuotas_pagadas
        FROM contratos_residentes c
        LEFT JOIN pagos p
          ON p.id_contrato = c.id_contrato
         AND NOT EXISTS (
             SELECT 1 FROM facturas_historial fh
             WHERE fh.id_pago = p.id_pago
               AND UPPER(COALESCE(fh.estado_factura, '')) = 'ANULADA'
         )
        LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE c.id_contrato = ?
        GROUP BY c.id_contrato, c.monto_total, c.enganche, c.interes_porcentaje,
                 c.cuotas_pactadas, c.plazo_meses
        LIMIT 1
    `, [idContrato]);

    if (!rows.length) return null;
    const contrato = rows[0];
    const precio = Math.max(Number(contrato.monto_total || 0), 0);
    const enganche = Math.max(Number(contrato.enganche || 0), 0);
    const capitalFinanciado = Math.max(precio - enganche, 0);
    const cuotasPactadas = Math.max(parseInt(contrato.cuotas_pactadas || 1, 10), 1);
    const totalPlan = calcularTotalPlanPlano(capitalFinanciado, contrato.interes_porcentaje, cuotasPactadas);
    const cuotasFinanciadasPendientes = redondear2(Math.max(totalPlan - Number(contrato.pagado_plan || 0), 0));
    const enganchePendiente = redondear2(Math.max(enganche - Number(contrato.enganche_pagado || 0), 0));
    const totalPendienteConvenio = redondear2(cuotasFinanciadasPendientes + enganchePendiente);
    const cuotasPagadas = Math.max(Number(contrato.cuotas_pagadas || 0), 0);

    return {
        id_contrato: Number(contrato.id_contrato),
        cuotas_pactadas_contrato: cuotasPactadas,
        cuotas_pagadas: cuotasPagadas,
        proxima_cuota: Math.min(cuotasPagadas + 1, cuotasPactadas),
        cuotas_financiadas_pendientes: cuotasFinanciadasPendientes,
        enganche_pendiente: enganchePendiente,
        total_pendiente_convenio: totalPendienteConvenio
    };
};

const normalizarEstado = (estado) => {
    const value = String(estado || '').trim().toLowerCase();
    const permitidos = ['activo', 'pendiente', 'pagado', 'cumplido', 'incumplido', 'anulado'];
    return permitidos.includes(value) ? value : 'pendiente';
};

router.get('/', async (_req, res) => {
    try {
        await asegurarTablaConvenios();

        const rows = await queryAsync(`
            SELECT
                cp.*,
                c.codigo_contrato,
                c.estado AS estado_contrato,
                r.id_residente,
                r.nombre AS nombre_residente,
                r.numero_identificacion,
                r.dpi
            FROM convenio_pagos cp
            INNER JOIN contratos_residentes c ON c.id_contrato = cp.id_contrato
            LEFT JOIN residentes r ON r.id_residente = c.id_residente
            ORDER BY cp.id_convenio DESC
        `);

        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error al listar convenios:', error);
        return res.status(500).json({ message: 'No se pudieron cargar los convenios.' });
    }
});

router.get('/buscar-residente', async (req, res) => {
    try {
        await asegurarTablaConvenios();

        const criterio = String(req.query?.criterio || '').trim();
        if (!criterio) {
            return res.status(400).json({ message: 'Debe proporcionar un criterio de busqueda.' });
        }

        const searchTerm = `%${criterio}%`;
        const rows = await queryAsync(`
            SELECT
                r.id_residente,
                r.nombre,
                r.dpi,
                r.numero_identificacion,
                c.id_contrato,
                c.codigo_contrato,
                c.monto_total,
                c.monto_cuota,
                c.estado AS estado_contrato,
                tc.nombre_tipo_contrato
            FROM residentes r
            INNER JOIN contratos_residentes c ON c.id_residente = r.id_residente
            INNER JOIN tipos_contrato tc ON tc.id_tipo_contrato = c.id_tipo_contrato
            WHERE c.estado = 'activo'
              AND (
                r.nombre LIKE ?
                OR r.dpi LIKE ?
                OR r.numero_identificacion LIKE ?
                OR c.codigo_contrato LIKE ?
              )
            ORDER BY r.nombre ASC
            LIMIT 50
        `, [searchTerm, searchTerm, searchTerm, searchTerm]);

        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error al buscar cliente para convenio:', error);
        return res.status(500).json({ message: 'No se pudo realizar la búsqueda de clientes.' });
    }
});

router.get('/saldo-pendiente/:id_contrato', async (req, res) => {
    try {
        await asegurarTablaConvenios();
        const idContrato = Number(req.params?.id_contrato || 0);
        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(400).json({ message: 'Contrato invalido.' });
        }
        const deuda = await obtenerDeudaElegibleConvenio(idContrato);
        if (!deuda) return res.status(404).json({ message: 'El contrato no existe.' });
        return res.status(200).json(deuda);
    } catch (error) {
        console.error('Error calculando saldo para convenio:', error);
        return res.status(500).json({ message: 'No se pudo calcular el saldo pendiente del contrato.' });
    }
});

router.post('/crear', async (req, res) => {
    try {
        await asegurarTablaConvenios();

        const idContrato = Number(req.body?.id_contrato || 0);
        const fechaConvenio = String(req.body?.fecha_convenio || '').trim() || new Date().toISOString().slice(0, 10);
        const cuotasPactadas = Math.max(Number(req.body?.cuotas_pactadas || 1), 1);
        const fechaInicio = String(req.body?.fecha_inicio || '').trim() || null;
        const observaciones = String(req.body?.observaciones || '').trim() || null;
        const estado = normalizarEstado(req.body?.estado || 'activo');

        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(400).json({ message: 'Debe seleccionar un contrato valido.' });
        }

        const deuda = await obtenerDeudaElegibleConvenio(idContrato);
        if (!deuda) {
            return res.status(400).json({ message: 'El contrato seleccionado no existe.' });
        }
        const montoOriginal = deuda.total_pendiente_convenio;
        const saldoActual = montoOriginal;
        const montoCuota = Math.ceil(montoOriginal / cuotasPactadas);
        if (montoOriginal <= 0 || montoCuota <= 0) {
            return res.status(400).json({ message: 'El contrato no tiene cuotas financiadas ni enganche pendientes para convenio.' });
        }

        const activos = await queryAsync(`
            SELECT id_convenio FROM convenio_pagos
            WHERE id_contrato = ?
              AND LOWER(COALESCE(estado, 'activo')) IN ('activo', 'pendiente', 'incumplido')
            LIMIT 1
        `, [idContrato]);
        if (activos.length) {
            return res.status(400).json({ message: `El contrato ya tiene un convenio pendiente (#${activos[0].id_convenio}).` });
        }

        const insertResult = await queryAsync(
            `
                INSERT INTO convenio_pagos
                    (id_contrato, fecha_convenio, monto_original, saldo_actual, cuotas_pactadas, monto_cuota,
                     fecha_inicio, observaciones, estado, monto_cuotas_financiadas, monto_enganche_pendiente)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [idContrato, fechaConvenio, montoOriginal, saldoActual, cuotasPactadas, montoCuota,
                fechaInicio, observaciones, estado, deuda.cuotas_financiadas_pendientes, deuda.enganche_pendiente]
        );

        const nuevoId = Number(insertResult?.insertId || 0);
        if (!nuevoId) {
            return res.status(200).json({ message: 'Convenio registrado correctamente.' });
        }

        const detalle = await queryAsync(`
            SELECT
                cp.*,
                c.codigo_contrato,
                c.estado AS estado_contrato,
                r.id_residente,
                r.nombre AS nombre_residente,
                r.numero_identificacion,
                r.dpi
            FROM convenio_pagos cp
            INNER JOIN contratos_residentes c ON c.id_contrato = cp.id_contrato
            LEFT JOIN residentes r ON r.id_residente = c.id_residente
            WHERE cp.id_convenio = ?
            LIMIT 1
        `, [nuevoId]);

        const usuarioId = Number(req.header('x-user-id') || req.body?.id_usuario || 0) || null;
        const usuarioNombre = String(req.header('x-user-name') || req.body?.usuario || 'SISTEMA').trim();
        registrarAuditoria(
            usuarioId,
            usuarioNombre,
            'CREAR_CONVENIO',
            'convenio_pagos',
            `Convenio #${nuevoId} creado para contrato #${idContrato}`,
            obtenerIP(req),
            'exitoso'
        );

        return res.status(200).json({
            message: 'Convenio registrado correctamente.',
            id_convenio: nuevoId,
            detalle: detalle?.[0] || null
        });
    } catch (error) {
        console.error('Error al crear convenio:', error);
        return res.status(500).json({
            message: 'No se pudo crear el convenio de pago.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

router.put('/actualizar', async (req, res) => {
    try {
        await asegurarTablaConvenios();

        const idConvenio = Number(req.body?.id_convenio || 0);
        const idContrato = Number(req.body?.id_contrato || 0);
        const fechaConvenio = String(req.body?.fecha_convenio || '').trim() || new Date().toISOString().slice(0, 10);
        const montoOriginal = Number(req.body?.monto_original || 0);
        const saldoActual = Number(req.body?.saldo_actual || 0);
        const cuotasPactadas = Math.max(Number(req.body?.cuotas_pactadas || 1), 1);
        const montoCuota = Math.round(montoOriginal / cuotasPactadas);
        const fechaInicio = String(req.body?.fecha_inicio || '').trim() || null;
        const observaciones = String(req.body?.observaciones || '').trim() || null;
        const estado = normalizarEstado(req.body?.estado || 'activo');

        if (!Number.isInteger(idConvenio) || idConvenio <= 0) {
            return res.status(400).json({ message: 'ID de convenio invalido.' });
        }

        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(400).json({ message: 'Debe seleccionar un contrato valido.' });
        }

        const prevRows = await queryAsync('SELECT * FROM convenio_pagos WHERE id_convenio = ? LIMIT 1', [idConvenio]);
        if (!prevRows.length) {
            return res.status(404).json({ message: 'El convenio ya no existe.' });
        }

        await queryAsync(
            `
                UPDATE convenio_pagos
                SET id_contrato = ?,
                    fecha_convenio = ?,
                    monto_original = ?,
                    saldo_actual = ?,
                    cuotas_pactadas = ?,
                    monto_cuota = ?,
                    fecha_inicio = ?,
                    observaciones = ?,
                    estado = ?
                WHERE id_convenio = ?
            `,
            [idContrato, fechaConvenio, montoOriginal, saldoActual, cuotasPactadas, montoCuota, fechaInicio, observaciones, estado, idConvenio]
        );

        const nowRows = await queryAsync('SELECT * FROM convenio_pagos WHERE id_convenio = ? LIMIT 1', [idConvenio]);

        const usuarioId = Number(req.header('x-user-id') || req.body?.id_usuario || 0) || null;
        const usuarioNombre = String(req.header('x-user-name') || req.body?.usuario || 'SISTEMA').trim();
        registrarAuditoria(
            usuarioId,
            usuarioNombre,
            'ACTUALIZAR_CONVENIO',
            'convenio_pagos',
            `Convenio #${idConvenio} actualizado. Antes: ${JSON.stringify(prevRows[0] || {})} | Despues: ${JSON.stringify(nowRows[0] || {})}`,
            obtenerIP(req),
            'exitoso'
        );

        return res.status(200).json({ message: 'Convenio actualizado correctamente.' });
    } catch (error) {
        console.error('Error al actualizar convenio:', error);
        return res.status(500).json({
            message: 'No se pudo actualizar el convenio de pago.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

router.put('/cambiar-estado/:id_convenio', async (req, res) => {
    try {
        await asegurarTablaConvenios();

        const idConvenio = Number(req.params?.id_convenio || 0);
        const estado = normalizarEstado(req.body?.estado || 'activo');

        if (!Number.isInteger(idConvenio) || idConvenio <= 0) {
            return res.status(400).json({ message: 'ID de convenio invalido.' });
        }

        const prevRows = await queryAsync('SELECT * FROM convenio_pagos WHERE id_convenio = ? LIMIT 1', [idConvenio]);
        if (!prevRows.length) {
            return res.status(404).json({ message: 'El convenio ya no existe.' });
        }

        await queryAsync('UPDATE convenio_pagos SET estado = ? WHERE id_convenio = ?', [estado, idConvenio]);

        const nowRows = await queryAsync('SELECT * FROM convenio_pagos WHERE id_convenio = ? LIMIT 1', [idConvenio]);

        const usuarioId = Number(req.header('x-user-id') || req.body?.id_usuario || 0) || null;
        const usuarioNombre = String(req.header('x-user-name') || req.body?.usuario || 'SISTEMA').trim();
        registrarAuditoria(
            usuarioId,
            usuarioNombre,
            'CAMBIAR_ESTADO_CONVENIO',
            'convenio_pagos',
            `Estado de convenio #${idConvenio} cambiado a ${estado}`,
            obtenerIP(req),
            'exitoso'
        );

        return res.status(200).json({ message: 'Estado actualizado correctamente.' });
    } catch (error) {
        console.error('Error al cambiar estado de convenio:', error);
        return res.status(500).json({
            message: 'No se pudo cambiar el estado del convenio.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

router.delete('/eliminar/:id_convenio', async (req, res) => {
    try {
        await asegurarTablaConvenios();

        const idConvenio = Number(req.params?.id_convenio || 0);
        if (!Number.isInteger(idConvenio) || idConvenio <= 0) {
            return res.status(400).json({ message: 'ID de convenio invalido.' });
        }

        const prevRows = await queryAsync('SELECT * FROM convenio_pagos WHERE id_convenio = ? LIMIT 1', [idConvenio]);
        if (!prevRows.length) {
            return res.status(404).json({ message: 'El convenio ya no existe.' });
        }

        await queryAsync('DELETE FROM convenio_pagos WHERE id_convenio = ?', [idConvenio]);

        const usuarioId = Number(req.header('x-user-id') || req.body?.id_usuario || 0) || null;
        const usuarioNombre = String(req.header('x-user-name') || req.body?.usuario || 'SISTEMA').trim();
        registrarAuditoria(
            usuarioId,
            usuarioNombre,
            'ELIMINAR_CONVENIO',
            'convenio_pagos',
            `Convenio #${idConvenio} eliminado. Datos previos: ${JSON.stringify(prevRows[0] || {})}`,
            obtenerIP(req),
            'exitoso'
        );

        return res.status(200).json({ message: 'Convenio eliminado correctamente.' });
    } catch (error) {
        console.error('Error al eliminar convenio:', error);
        return res.status(500).json({
            message: 'No se pudo eliminar el convenio.',
            detail: error?.sqlMessage || error?.message || 'Error desconocido'
        });
    }
});

module.exports = router;
