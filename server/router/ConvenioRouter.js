const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

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
        console.error('Error al buscar residente para convenio:', error);
        return res.status(500).json({ message: 'No se pudo realizar la busqueda de residentes.' });
    }
});

router.post('/crear', async (req, res) => {
    try {
        await asegurarTablaConvenios();

        const idContrato = Number(req.body?.id_contrato || 0);
        const fechaConvenio = String(req.body?.fecha_convenio || '').trim() || new Date().toISOString().slice(0, 10);
        const montoOriginal = Number(req.body?.monto_original || 0);
        const saldoActual = Number(req.body?.saldo_actual || 0);
        const cuotasPactadas = Math.max(Number(req.body?.cuotas_pactadas || 1), 1);
        const montoCuota = Number(req.body?.monto_cuota || 0);
        const fechaInicio = String(req.body?.fecha_inicio || '').trim() || null;
        const observaciones = String(req.body?.observaciones || '').trim() || null;
        const estado = normalizarEstado(req.body?.estado || 'activo');

        if (!Number.isInteger(idContrato) || idContrato <= 0) {
            return res.status(400).json({ message: 'Debe seleccionar un contrato valido.' });
        }

        if (montoOriginal <= 0 || saldoActual < 0 || montoCuota <= 0) {
            return res.status(400).json({ message: 'Los montos del convenio no son validos.' });
        }

        const contratoRows = await queryAsync(
            'SELECT id_contrato FROM contratos_residentes WHERE id_contrato = ? LIMIT 1',
            [idContrato]
        );

        if (!contratoRows.length) {
            return res.status(400).json({ message: 'El contrato seleccionado no existe.' });
        }

        const insertResult = await queryAsync(
            `
                INSERT INTO convenio_pagos
                    (id_contrato, fecha_convenio, monto_original, saldo_actual, cuotas_pactadas, monto_cuota, fecha_inicio, observaciones, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [idContrato, fechaConvenio, montoOriginal, saldoActual, cuotasPactadas, montoCuota, fechaInicio, observaciones, estado]
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
        const montoCuota = Number(req.body?.monto_cuota || 0);
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
