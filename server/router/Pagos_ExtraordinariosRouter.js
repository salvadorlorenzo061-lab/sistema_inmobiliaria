const express = require("express");
const db = require('../Conexion'); 
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());

const ensureEstadoColumn = () => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'pagos_extraordinarios'
          AND COLUMN_NAME = 'estado'
    `;

    db.query(checkColumnQuery, (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error verificando columna estado en pagos_extraordinarios:', checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) {
            return;
        }

        const checkTableQuery = `
            SELECT COUNT(*) AS total
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pagos_extraordinarios'
        `;

        db.query(checkTableQuery, (tableErr, tableResult) => {
            if (tableErr) {
                console.error('Error verificando existencia de pagos_extraordinarios:', tableErr);
                return;
            }

            const tableExists = tableResult?.[0]?.total > 0;
            if (!tableExists) {
                console.warn('La tabla pagos_extraordinarios no existe en esta base de datos. Se omite migracion de columna estado.');
                return;
            }

            const alterQuery = `
                ALTER TABLE pagos_extraordinarios
                ADD COLUMN estado VARCHAR(20) NULL DEFAULT 'pendiente'
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error('Error agregando columna estado en pagos_extraordinarios:', alterErr);
                    return;
                }
                console.log('Columna estado creada en pagos_extraordinarios.');
            });
        });
    });
};

ensureEstadoColumn();

router.get("/", (req, res) => {
    const query = `
        SELECT 
            pe.*, 
            c.codigo_contrato,
            r.nombre AS nombre_residente,
            r.dpi,
            r.numero_identificacion,
            e.nombre_empresa,
            e.nit AS nit_empresa,
            e.pais,
            e.moneda,
            e.logo
        FROM pagos_extraordinarios pe
        LEFT JOIN contratos_residentes c ON pe.id_contrato = c.id_contrato
        LEFT JOIN residentes r ON c.id_residente = r.id_residente
        LEFT JOIN empresas e ON e.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
        ORDER BY pe.id_pago_extra DESC
    `;

    db.query(query, (err, result) => {
        if (err) res.status(500).send("Error de servidor");
        else res.send(result);
    });
});

router.get('/buscar-residente', (req, res) => {
    const { criterio } = req.query;

    if (!criterio) {
        return res.status(400).send('Debe proporcionar un criterio de búsqueda.');
    }

    const query = `
        SELECT 
            r.id_residente,
            r.nombre,
            r.dpi,
            r.numero_identificacion,
            c.id_contrato,
            c.codigo_contrato,
            tc.nombre_tipo_contrato
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        WHERE c.estado = 'activo' AND (
            r.nombre LIKE ?
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
        ORDER BY r.nombre ASC
        LIMIT 50
    `;

    const searchTerm = `%${criterio}%`;
    db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm], (err, result) => {
        if (err) {
            console.error('Error al buscar residente para pago extraordinario:', err.message);
            return res.status(500).send('Error al consultar residentes.');
        }

        if (!result.length) {
            return res.status(404).send('No se encontraron residentes con contratos activos.');
        }

        res.status(200).json(result);
    });
});

router.post("/crear", (req, res) => {
    const { id_contrato, concepto, monto, estado } = req.body;
    const fechaPago = new Date().toISOString().slice(0, 10);
    const estadoFinal = estado || 'pendiente';

    db.query(
        'INSERT INTO pagos_extraordinarios (id_contrato, concepto, monto, fecha_pago, estado) VALUES (?, ?, ?, ?, ?)',
        [id_contrato || null, concepto, monto, fechaPago, estadoFinal],
        (err, insertResult) => {
            if (err) {
                console.error('Error al crear pago extraordinario:', err);
                return res.status(500).send({ message: 'Error al guardar el cargo extraordinario', detail: err.message });
            }

            const detalleQuery = `
                SELECT 
                    pe.*, 
                    c.codigo_contrato,
                    r.nombre AS nombre_residente,
                    r.dpi,
                    r.numero_identificacion,
                    e.nombre_empresa,
                    e.nit AS nit_empresa,
                    e.pais,
                    e.moneda,
                    e.logo
                FROM pagos_extraordinarios pe
                LEFT JOIN contratos_residentes c ON pe.id_contrato = c.id_contrato
                LEFT JOIN residentes r ON c.id_residente = r.id_residente
                LEFT JOIN empresas e ON e.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                WHERE pe.id_pago_extra = ?
                LIMIT 1
            `;

            db.query(detalleQuery, [insertResult.insertId], (detailErr, detailResult) => {
                if (detailErr) {
                    console.error('Error obteniendo detalle de pago extraordinario:', detailErr);
                    return res.status(200).json({
                        message: 'Cargo extraordinario guardado',
                        id_pago_extra: insertResult.insertId
                    });
                }

                return res.status(200).json({
                    message: 'Cargo extraordinario guardado',
                    id_pago_extra: insertResult.insertId,
                    detalle: detailResult?.[0] || null
                });
            });
        }
    );
});

router.put("/actualizar", (req, res) => {
    const { id_pago_extra, id_contrato, concepto, monto, estado } = req.body;
    const fechaPago = new Date().toISOString().slice(0, 10);
    const estadoFinal = estado || 'pendiente';

    db.query(
        'UPDATE pagos_extraordinarios SET id_contrato=?, concepto=?, monto=?, fecha_pago=?, estado=? WHERE id_pago_extra=?',
        [id_contrato || null, concepto, monto, fechaPago, estadoFinal, id_pago_extra],
        (err) => {
            if (err) {
                console.error('Error al actualizar pago extraordinario:', err);
                return res.status(500).send({ message: 'Error al modificar el cargo extraordinario', detail: err.message });
            }
            return res.status(200).send("Modificado correctamente");
        }
    );
});

const cambiarEstadoHandler = (req, res) => {
    const { id_pago_extra } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['pendiente', 'pagado', 'anulado'];
    if (!estadosValidos.includes(String(estado || '').toLowerCase())) {
        return res.status(400).json({ message: 'Estado inválido. Use pendiente, pagado o anulado.' });
    }

    db.query(
        'UPDATE pagos_extraordinarios SET estado=? WHERE id_pago_extra=?',
        [estado.toLowerCase(), id_pago_extra],
        (err, result) => {
            if (err) {
                console.error('Error al cambiar estado de pago extraordinario:', err);
                return res.status(500).json({ message: 'Error al cambiar estado', detail: err.message });
            }

            if (!result.affectedRows) {
                return res.status(404).json({ message: 'No se encontró el cobro extraordinario.' });
            }

            return res.status(200).json({ message: 'Estado actualizado correctamente' });
        }
    );
};

router.put('/cambiar-estado/:id_pago_extra', cambiarEstadoHandler);
router.post('/cambiar-estado/:id_pago_extra', cambiarEstadoHandler);

module.exports = router;