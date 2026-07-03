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

const ensureProyectoServiciosTable = () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS proyecto_servicios (
            id_proyecto_servicio INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_proyecto INT NOT NULL,
            id_servicio INT NOT NULL,
            monto_servicio DECIMAL(12,2) NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'activo',
            fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_proyecto_servicio (id_proyecto, id_servicio),
            INDEX idx_ps_proyecto (id_proyecto),
            INDEX idx_ps_servicio (id_servicio),
            CONSTRAINT fk_ps_proyecto FOREIGN KEY (id_proyecto) REFERENCES proyecto(id_proyecto) ON DELETE CASCADE,
            CONSTRAINT fk_ps_servicio FOREIGN KEY (id_servicio) REFERENCES servicios(id_servicio) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('Error asegurando tabla proyecto_servicios:', err.message);
        }
    });
};

const syncServicioContrato = (idServicio, idsContrato, montoServicio, callback) => {
    const contratos = [...new Set((Array.isArray(idsContrato) ? idsContrato : [])
        .map((item) => Number(item))
        .filter((id) => Number.isInteger(id) && id > 0))];

    if (!contratos.length) {
        db.query('DELETE FROM contratos_servicios WHERE id_servicio = ?', [idServicio], (deleteErr) => {
            if (deleteErr) {
                return callback(deleteErr);
            }
            return callback(null);
        });
        return;
    }

    const placeholders = contratos.map(() => '?').join(',');
    db.query(
        `SELECT id_contrato FROM contratos_residentes WHERE id_contrato IN (${placeholders})`,
        contratos,
        (validErr, validRows) => {
            if (validErr) {
                return callback(validErr);
            }

            const contratosValidos = (validRows || []).map((row) => Number(row.id_contrato));
            if (!contratosValidos.length) {
                db.query('DELETE FROM contratos_servicios WHERE id_servicio = ?', [idServicio], (deleteErr) => {
                    if (deleteErr) {
                        return callback(deleteErr);
                    }
                    return callback(null);
                });
                return;
            }

            const placeholdersValidos = contratosValidos.map(() => '?').join(',');
            db.query(
                `DELETE FROM contratos_servicios WHERE id_servicio = ? AND id_contrato NOT IN (${placeholdersValidos})`,
                [idServicio, ...contratosValidos],
                (deleteErr) => {
                    if (deleteErr) {
                        return callback(deleteErr);
                    }

                    const values = contratosValidos.map((idContrato) => [
                        idContrato,
                        idServicio,
                        Number.isFinite(Number(montoServicio)) ? Number(montoServicio) : 0,
                        'activo'
                    ]);

                    db.query(
                        `
                            INSERT INTO contratos_servicios (id_contrato, id_servicio, monto_servicio, estado)
                            VALUES ?
                            ON DUPLICATE KEY UPDATE
                                monto_servicio = VALUES(monto_servicio),
                                estado = 'activo'
                        `,
                        [values],
                        (upsertErr) => {
                            if (upsertErr) {
                                return callback(upsertErr);
                            }
                            return callback(null);
                        }
                    );
                }
            );
        }
    );
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

const normalizarTextoServicio = (valor = '') => String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const inferirPeriodicidadServicio = (nombreServicio = '') => {
    const nombre = normalizarTextoServicio(nombreServicio);
    const reglasCobroUnico = ['derecho', 'paja', 'instalacion', 'conexion', 'matricula', 'inscripcion'];
    return reglasCobroUnico.some((fragmento) => nombre.includes(fragmento)) ? 'unico' : 'mensual';
};

const ensurePeriodicidadColumn = () => {
    db.query("SHOW COLUMNS FROM servicios LIKE 'periodicidad'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna periodicidad en servicios:', err.message);
            return;
        }

        const aplicarHeuristica = () => {
            db.query('SELECT id_servicio, nombre_servicio, periodicidad FROM servicios', (selectErr, serviciosRows) => {
                if (selectErr) {
                    console.error('Error leyendo periodicidad de servicios:', selectErr.message);
                    return;
                }

                (serviciosRows || []).forEach((servicio) => {
                    const periodicidadActual = String(servicio.periodicidad || '').trim().toLowerCase();
                    const periodicidadInferida = inferirPeriodicidadServicio(servicio.nombre_servicio);

                    // Mantener lo que el usuario ya definió, salvo el caso de registros
                    // heredados que quedaron en el default mensual pero por nombre deben ser unicos.
                    if (periodicidadActual === 'unico' || (periodicidadActual === 'mensual' && periodicidadInferida === 'mensual')) {
                        return;
                    }

                    db.query('UPDATE servicios SET periodicidad = ? WHERE id_servicio = ?', [periodicidadInferida, servicio.id_servicio], (updateErr) => {
                        if (updateErr) {
                            console.error(`Error actualizando periodicidad del servicio ${servicio.id_servicio}:`, updateErr.message);
                        }
                    });
                });
            });
        };

        if (!rows || rows.length === 0) {
            db.query("ALTER TABLE servicios ADD COLUMN periodicidad VARCHAR(20) NOT NULL DEFAULT 'mensual'", (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna periodicidad en servicios:', alterErr.message);
                    return;
                }

                db.query("UPDATE servicios SET periodicidad = CASE WHEN LOWER(REPLACE(REPLACE(REPLACE(REPLACE(nombre_servicio, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O')) LIKE '%derecho%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(nombre_servicio, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O')) LIKE '%paja%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(nombre_servicio, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O')) LIKE '%instalacion%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(nombre_servicio, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O')) LIKE '%conexion%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(nombre_servicio, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O')) LIKE '%matricula%' OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(nombre_servicio, 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O')) LIKE '%inscripcion%' THEN 'unico' ELSE 'mensual' END", (seedErr) => {
                    if (seedErr) {
                        console.error('Error inicializando periodicidad en servicios:', seedErr.message);
                    }
                });
            });
            return;
        }

        aplicarHeuristica();
    });
};

ensureEstadoColumn();
ensurePeriodicidadColumn();
ensureContratosServiciosTable();
ensureProyectoServiciosTable();

const syncServicioProyecto = (idServicio, idsProyecto, montoServicio, callback) => {
    const proyectos = [...new Set((Array.isArray(idsProyecto) ? idsProyecto : [])
        .map((item) => Number(item))
        .filter((id) => Number.isInteger(id) && id > 0))];

    if (!proyectos.length) {
        db.query('DELETE FROM proyecto_servicios WHERE id_servicio = ?', [idServicio], (deleteErr) => {
            if (deleteErr) {
                return callback(deleteErr);
            }
            return callback(null);
        });
        return;
    }

    const placeholders = proyectos.map(() => '?').join(',');
    db.query(
        `SELECT id_proyecto FROM proyecto WHERE id_proyecto IN (${placeholders})`,
        proyectos,
        (validErr, validRows) => {
            if (validErr) {
                return callback(validErr);
            }

            const proyectosValidos = (validRows || []).map((row) => Number(row.id_proyecto));
            if (!proyectosValidos.length) {
                db.query('DELETE FROM proyecto_servicios WHERE id_servicio = ?', [idServicio], (deleteErr) => {
                    if (deleteErr) {
                        return callback(deleteErr);
                    }
                    return callback(null);
                });
                return;
            }

            const placeholdersValidos = proyectosValidos.map(() => '?').join(',');
            db.query(
                `DELETE FROM proyecto_servicios WHERE id_servicio = ? AND id_proyecto NOT IN (${placeholdersValidos})`,
                [idServicio, ...proyectosValidos],
                (deleteErr) => {
                    if (deleteErr) {
                        return callback(deleteErr);
                    }

                    const values = proyectosValidos.map((idProyecto) => [
                        idProyecto,
                        idServicio,
                        Number.isFinite(Number(montoServicio)) ? Number(montoServicio) : 0,
                        'activo'
                    ]);

                    db.query(
                        `
                            INSERT INTO proyecto_servicios (id_proyecto, id_servicio, monto_servicio, estado)
                            VALUES ?
                            ON DUPLICATE KEY UPDATE
                                monto_servicio = VALUES(monto_servicio),
                                estado = 'activo'
                        `,
                        [values],
                        (upsertErr) => {
                            if (upsertErr) {
                                return callback(upsertErr);
                            }
                            return callback(null);
                        }
                    );
                }
            );
        }
    );
};

router.get('/catalogo-proyectos', (_req, res) => {
    db.query(
        `
            SELECT p.id_proyecto, p.nombre, e.nombre_empresa
            FROM proyecto p
            LEFT JOIN empresas e ON e.id_empresa = p.id_empresa
            WHERE p.estado = 'activo'
            ORDER BY p.nombre ASC
        `,
        (err, rows) => {
            if (err) {
                console.error('Error obteniendo catalogo de proyectos:', err);
                return res.status(500).send({ message: 'No se pudo obtener catalogo de proyectos.' });
            }

            return res.send(Array.isArray(rows) ? rows : []);
        }
    );
});

router.get('/catalogo-contratos', (_req, res) => {
    db.query(
        `
            SELECT c.id_contrato, c.codigo_contrato, r.nombre AS nombre_residente
            FROM contratos_residentes c
            INNER JOIN residentes r ON r.id_residente = c.id_residente
            WHERE c.estado = 'activo'
            ORDER BY c.codigo_contrato ASC
        `,
        (err, rows) => {
            if (err) {
                console.error('Error obteniendo catalogo de contratos:', err);
                return res.status(500).send({ message: 'No se pudo obtener catalogo de contratos.' });
            }

            return res.send(Array.isArray(rows) ? rows : []);
        }
    );
});

router.get('/proyectos/:id_servicio', (req, res) => {
    const idServicio = Number(req.params.id_servicio);
    if (!Number.isInteger(idServicio) || idServicio <= 0) {
        return res.status(400).send({ message: 'ID de servicio invalido.' });
    }

    db.query(
        `
            SELECT id_proyecto
            FROM proyecto_servicios
            WHERE id_servicio = ?
              AND estado = 'activo'
        `,
        [idServicio],
        (err, rows) => {
            if (err) {
                console.error('Error obteniendo proyectos del servicio:', err);
                return res.status(500).send({ message: 'No se pudo obtener relacion del servicio con proyectos.' });
            }

            const proyectos = (rows || []).map((row) => Number(row.id_proyecto)).filter((id) => Number.isInteger(id) && id > 0);
            return res.send({ id_servicio: idServicio, proyectos });
        }
    );
});

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

        db.query(`SELECT id_servicio, nombre_servicio, ${columnaCosto} AS costo_servicio, estado, periodicidad FROM servicios ORDER BY id_servicio DESC`, (err, result) => {
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
    const periodicidadServicio = String(body.periodicidad || inferirPeriodicidadServicio(nombreServicio)).trim().toLowerCase();
    const costoServicio = Number(body.costo_servicio);
    const proyectosAsignados = Array.isArray(body.proyectos_asignados) ? body.proyectos_asignados : [];
    const contratosAsignados = Array.isArray(body.contratos_asignados) ? body.contratos_asignados : [];

    if (!nombreServicio) {
        return res.status(400).send({ message: 'El nombre del servicio es obligatorio.' });
    }

    if (!Number.isFinite(costoServicio) || costoServicio < 0) {
        return res.status(400).send({ message: 'El costo del servicio debe ser un numero valido mayor o igual a 0.' });
    }

    if (!['activo', 'inactivo'].includes(estadoServicio)) {
        return res.status(400).send({ message: 'El estado del servicio es invalido.' });
    }

    if (!['mensual', 'unico'].includes(periodicidadServicio)) {
        return res.status(400).send({ message: 'La periodicidad del servicio es invalida.' });
    }

    resolverColumnaCosto((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: `Error al insertar: ${colErr.sqlMessage || colErr.message}` });
        }

        db.query(
            `INSERT INTO servicios (nombre_servicio, ${columnaCosto}, estado, periodicidad) VALUES (?, ?, ?, ?)`,
            [nombreServicio, costoServicio, estadoServicio, periodicidadServicio],
            (err, insertResult) => {
                if (err) {
                    console.error('Error al insertar servicio:', err);
                    return res.status(500).send({ message: `Error al insertar: ${err.sqlMessage || err.message}` });
                }

                const idServicioCreado = insertResult?.insertId;
                if (!idServicioCreado) {
                    return res.status(200).send("Servicio registrado");
                }

                syncServicioProyecto(idServicioCreado, proyectosAsignados, costoServicio, (syncProyectoErr) => {
                    if (syncProyectoErr) {
                        console.error('Servicio creado pero sin sincronizar proyectos:', syncProyectoErr.message);
                    }

                    syncServicioContrato(idServicioCreado, contratosAsignados, costoServicio, (syncContratoErr) => {
                        if (syncContratoErr) {
                            console.error('Servicio creado pero sin sincronizar contratos:', syncContratoErr.message);
                        }

                        if (!esServicioBase(nombreServicio) || estadoServicio !== 'activo') {
                            return res.status(200).send({
                                message: (syncProyectoErr || syncContratoErr)
                                    ? 'Servicio registrado, pero no se pudo sincronizar por completo su asignacion.'
                                    : 'Servicio registrado'
                            });
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
    const periodicidadServicio = String(req.body?.periodicidad || inferirPeriodicidadServicio(nombreServicio)).trim().toLowerCase();
    const costoServicio = Number(req.body?.costo_servicio);
    const proyectosAsignados = Array.isArray(req.body?.proyectos_asignados) ? req.body.proyectos_asignados : [];
    const contratosAsignados = Array.isArray(req.body?.contratos_asignados) ? req.body.contratos_asignados : [];

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

    if (!['mensual', 'unico'].includes(periodicidadServicio)) {
        return res.status(400).send({ message: 'La periodicidad del servicio es invalida.' });
    }

    resolverColumnaCosto((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: `Error al actualizar: ${colErr.sqlMessage || colErr.message}` });
        }

        db.query(`UPDATE servicios SET nombre_servicio=?, ${columnaCosto}=?, estado=?, periodicidad=? WHERE id_servicio=?`, [nombreServicio, costoServicio, estadoServicio, periodicidadServicio, id_servicio], (err) => {
            if (err) {
                console.error('Error al actualizar servicio:', err);
                return res.status(500).send({ message: `Error al actualizar: ${err.sqlMessage || err.message}` });
            }

            syncServicioProyecto(id_servicio, proyectosAsignados, costoServicio, (syncProyectoErr) => {
                if (syncProyectoErr) {
                    console.error('Servicio actualizado pero sin sincronizar proyectos:', syncProyectoErr.message);
                }

                syncServicioContrato(id_servicio, contratosAsignados, costoServicio, (syncContratoErr) => {
                    if (syncContratoErr) {
                        console.error('Servicio actualizado pero sin sincronizar contratos:', syncContratoErr.message);
                    }

                    if (syncProyectoErr || syncContratoErr) {
                        return res.status(200).send({
                            message: 'Servicio actualizado, pero no se pudo sincronizar por completo su asignacion.'
                        });
                    }

                    return res.status(200).send("Servicio actualizado");
                });
            });
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