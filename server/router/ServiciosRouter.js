const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

const ensureContratosServiciosTable = () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS contratos_servicios (
            id_contrato_servicio INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_contrato INT NOT NULL,
            id_servicio INT NOT NULL,
            monto_servicio DECIMAL(12,2) NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'activo',
            fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_contrato_servicio (id_contrato, id_servicio),
            INDEX idx_cs_contrato (id_contrato),
            INDEX idx_cs_servicio (id_servicio),
            CONSTRAINT fk_cs_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_residentes(id_contrato) ON DELETE CASCADE,
            CONSTRAINT fk_cs_servicio FOREIGN KEY (id_servicio) REFERENCES servicios(id_servicio) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('Error asegurando tabla contratos_servicios:', err.message);
        }
    });
};

const REGLAS_AUTOASIGNACION_SERVICIOS = [
    'agua',
    'agua potable',
    'drenaje',
    'mantenimiento'
];

const esServicioBase = (nombreServicio = '') => {
    const n = String(nombreServicio || '').trim().toLowerCase();
    return REGLAS_AUTOASIGNACION_SERVICIOS.some((regla) => n.includes(regla));
};

const asignarServicioABaseActiva = (idServicio, montoServicio, callback) => {
    const insertMasivo = `
        INSERT INTO contratos_servicios (id_contrato, id_servicio, monto_servicio, estado)
        SELECT c.id_contrato, ?, ?, 'activo'
        FROM contratos_residentes c
        LEFT JOIN contratos_servicios cs ON cs.id_contrato = c.id_contrato AND cs.id_servicio = ?
        WHERE c.estado = 'activo' AND cs.id_contrato_servicio IS NULL
    `;

    db.query(insertMasivo, [idServicio, montoServicio, idServicio], (err, result) => {
        if (err) {
            return callback(err);
        }
        return callback(null, result?.affectedRows || 0);
    });
};

const ensureEstadoColumn = () => {
    db.query("SHOW COLUMNS FROM servicios LIKE 'estado'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna estado en servicios:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query("ALTER TABLE servicios ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'activo'", (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna estado en servicios:', alterErr.message);
                }
            });
        }
    });
};

ensureEstadoColumn();
ensureContratosServiciosTable();

const resolverColumnaCosto = (callback) => {
    db.query("SHOW COLUMNS FROM servicios LIKE 'costo_servicio'", (errCostoServicio, rowsCostoServicio) => {
        if (errCostoServicio) {
            return callback(errCostoServicio);
        }

        if (rowsCostoServicio && rowsCostoServicio.length > 0) {
            return callback(null, 'costo_servicio');
        }

        db.query("SHOW COLUMNS FROM servicios LIKE 'costo'", (errCosto, rowsCosto) => {
            if (errCosto) {
                return callback(errCosto);
            }

            if (rowsCosto && rowsCosto.length > 0) {
                return callback(null, 'costo');
            }

            db.query("ALTER TABLE servicios ADD COLUMN costo_servicio DECIMAL(12,2) NOT NULL DEFAULT 0", (alterErr) => {
                if (alterErr) {
                    return callback(alterErr);
                }
                return callback(null, 'costo_servicio');
            });
        });
    });
};

router.get("/", (req, res) => {
    resolverColumnaCosto((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: 'No se pudo resolver columna de costo en servicios.' });
        }

        db.query(`SELECT id_servicio, nombre_servicio, ${columnaCosto} AS costo_servicio, estado FROM servicios ORDER BY id_servicio DESC`, (err, result) => {
            if (err) {
                return res.status(500).send({ message: err.sqlMessage || 'Error al obtener servicios.' });
            }
            return res.send(result);
        });
    });
});

router.post("/crear", (req, res) => {
    const body = req.body || {};
    const nombreServicio = String(body.nombre_servicio || '').trim();
    const estadoServicio = String(body.estado || 'activo').trim().toLowerCase();
    const costoServicio = Number(body.costo_servicio);

    if (!nombreServicio) {
        return res.status(400).send({ message: 'El nombre del servicio es obligatorio.' });
    }

    if (!Number.isFinite(costoServicio) || costoServicio < 0) {
        return res.status(400).send({ message: 'El costo del servicio debe ser un numero valido mayor o igual a 0.' });
    }

    if (!['activo', 'inactivo'].includes(estadoServicio)) {
        return res.status(400).send({ message: 'El estado del servicio es invalido.' });
    }

    resolverColumnaCosto((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: `Error al insertar: ${colErr.sqlMessage || colErr.message}` });
        }

        db.query(
            `INSERT INTO servicios (nombre_servicio, ${columnaCosto}, estado) VALUES (?, ?, ?)`,
            [nombreServicio, costoServicio, estadoServicio],
            (err, insertResult) => {
                if (err) {
                    console.error('Error al insertar servicio:', err);
                    return res.status(500).send({ message: `Error al insertar: ${err.sqlMessage || err.message}` });
                }

                if (!esServicioBase(nombreServicio) || estadoServicio !== 'activo') {
                    return res.status(200).send("Servicio registrado");
                }

                const idServicioCreado = insertResult?.insertId;
                if (!idServicioCreado) {
                    return res.status(200).send("Servicio registrado");
                }

                asignarServicioABaseActiva(idServicioCreado, costoServicio, (asignErr) => {
                    if (asignErr) {
                        console.error('Servicio creado pero sin asignacion masiva:', asignErr.message);
                        return res.status(200).send({
                            message: 'Servicio registrado, pero no se pudo asignar automaticamente a contratos activos.'
                        });
                    }

                    return res.status(200).send({
                        message: 'Servicio registrado y asignado automaticamente a contratos activos.'
                    });
                });
            }
        );
    });
});

router.put("/actualizar", (req, res) => {
    const { id_servicio } = req.body || {};
    const nombreServicio = String(req.body?.nombre_servicio || '').trim();
    const estadoServicio = String(req.body?.estado || 'activo').trim().toLowerCase();
    const costoServicio = Number(req.body?.costo_servicio);

    if (!id_servicio) {
        return res.status(400).send({ message: 'El ID del servicio es obligatorio.' });
    }

    if (!nombreServicio) {
        return res.status(400).send({ message: 'El nombre del servicio es obligatorio.' });
    }

    if (!Number.isFinite(costoServicio) || costoServicio < 0) {
        return res.status(400).send({ message: 'El costo del servicio debe ser un numero valido mayor o igual a 0.' });
    }

    if (!['activo', 'inactivo'].includes(estadoServicio)) {
        return res.status(400).send({ message: 'El estado del servicio es invalido.' });
    }

    resolverColumnaCosto((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: `Error al actualizar: ${colErr.sqlMessage || colErr.message}` });
        }

        db.query(`UPDATE servicios SET nombre_servicio=?, ${columnaCosto}=?, estado=? WHERE id_servicio=?`, [nombreServicio, costoServicio, estadoServicio, id_servicio], (err) => {
            if (err) {
                console.error('Error al actualizar servicio:', err);
                return res.status(500).send({ message: `Error al actualizar: ${err.sqlMessage || err.message}` });
            }
            return res.status(200).send("Servicio actualizado");
        });
    });
});

router.delete("/delete/:id", (req, res) => {
    db.query('DELETE FROM servicios WHERE id_servicio = ?', [req.params.id], (err) => {
        if (err) {
            if (err.errno === 1451) return res.status(400).send({ message: "No se puede eliminar, este servicio ya está asignado en detalles de pagos." });
            return res.status(500).send("Error");
        }
        res.status(200).send("Eliminado");
    });
});

module.exports = router;