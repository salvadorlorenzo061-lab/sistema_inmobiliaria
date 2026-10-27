const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

const ensureRolColumn = () => {
    db.query("SHOW COLUMNS FROM resoluciones_facturas LIKE 'rol'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna rol en resoluciones_facturas:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query("ALTER TABLE resoluciones_facturas ADD COLUMN rol VARCHAR(30) NOT NULL DEFAULT 'caja'", (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna rol en resoluciones_facturas:', alterErr.message);
                }
            });
        }
    });
};

ensureRolColumn();

const ensureIdUsuarioColumn = () => {
    db.query("SHOW COLUMNS FROM resoluciones_facturas LIKE 'id_usuario'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna id_usuario en resoluciones_facturas:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE resoluciones_facturas ADD COLUMN id_usuario INT NULL AFTER id_empresa', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna id_usuario en resoluciones_facturas:', alterErr.message);
                }
            });
        }
    });
};

ensureIdUsuarioColumn();

// Sin filas = la resolucion aplica a todos los proyectos de la empresa.
db.query(`CREATE TABLE IF NOT EXISTS resoluciones_facturas_proyectos (
    id_resolucion INT NOT NULL,
    id_proyecto INT NOT NULL,
    PRIMARY KEY (id_resolucion, id_proyecto)
)`, (err) => {
    if (err) console.error('Error creando resoluciones_facturas_proyectos:', err.message);
});

// proyectosIds undefined = no modificar la asignacion actual.
const guardarProyectosResolucion = (idResolucion, idEmpresa, proyectosIds, callback) => {
    if (!Array.isArray(proyectosIds)) return callback(null);
    const ids = [...new Set(proyectosIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

    db.query('DELETE FROM resoluciones_facturas_proyectos WHERE id_resolucion = ?', [idResolucion], (delErr) => {
        if (delErr) return callback(delErr);
        if (!ids.length) return callback(null);

        db.query(
            `INSERT INTO resoluciones_facturas_proyectos (id_resolucion, id_proyecto)
             SELECT ?, p.id_proyecto FROM proyecto p WHERE p.id_empresa = ? AND p.id_proyecto IN (?)`,
            [idResolucion, idEmpresa, ids],
            callback
        );
    });
};

const validarUsuario = (idUsuario, callback) => {
    const id = Number(idUsuario);
    if (!Number.isInteger(id) || id <= 0) {
        callback(new Error('Debe enviar un id_usuario válido.'));
        return;
    }

    db.query('SELECT id_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', [id], (err, rows) => {
        if (err) {
            callback(err);
            return;
        }

        if (!rows || rows.length === 0) {
            callback(new Error('El usuario seleccionado no existe.'));
            return;
        }

        callback(null, id);
    });
};

// === CREAR RESOLUCIÓN ===
router.post("/crear", (req, res) => {
    const { id_empresa, id_usuario, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado } = req.body;
    const numeroResolucionNormalizado = String(numero_resolucion || '').trim().toUpperCase();
    const serieNormalizada = String(serie || '').trim().toUpperCase();
    const rol = String(req.body?.rol || 'caja').trim().toLowerCase() || 'caja';

    // --- VALIDACIÓN DE PROTECCIÓN EN EL BACKEND ---
    const rInicial = Number(rango_inicial);
    const rFinal = Number(rango_final);
    const cActual = Number(correlativo_actual);

    if (rInicial > rFinal) {
        return res.status(400).send({ message: "El rango inicial no puede ser mayor al rango final" });
    }

    if (cActual < rInicial || cActual > rFinal) {
        return res.status(400).send({ message: `El correlativo actual (${cActual}) está fuera del rango autorizado (${rInicial} - ${rFinal})` });
    }

    if (!numeroResolucionNormalizado || !serieNormalizada) {
        return res.status(400).send({ message: 'Debe enviar número de resolución y serie válidos.' });
    }
    // ---------------------------------------------

    validarUsuario(id_usuario, (userErr, idUsuarioValido) => {
        if (userErr) {
            return res.status(400).send({ message: userErr.message || 'Usuario inválido.' });
        }

                const existeAsignacionQuery = `
                        SELECT rf.id_resolucion
                        FROM resoluciones_facturas rf
                        WHERE rf.id_usuario = ?
                            AND rf.id_empresa = ?
                            AND UPPER(TRIM(rf.numero_resolucion)) = ?
                            AND UPPER(TRIM(rf.serie)) = ?
                        ORDER BY rf.id_resolucion DESC
                        LIMIT 1
                `;

        db.query(
            existeAsignacionQuery,
            [idUsuarioValido, id_empresa, numeroResolucionNormalizado, serieNormalizada],
            (existsErr, existsRows) => {
                if (existsErr) {
                    console.log(existsErr);
                    return res.status(500).send("Error interno del servidor");
                }

                const idResolucionExistente = existsRows && existsRows.length
                    ? Number(existsRows[0].id_resolucion)
                    : null;

                                const overlapQuery = `
                                    SELECT rf.id_resolucion
                                    FROM resoluciones_facturas rf
                                    WHERE rf.id_empresa = ?
                                        AND UPPER(TRIM(rf.numero_resolucion)) = ?
                                        AND UPPER(TRIM(rf.serie)) = ?
                                        ${idResolucionExistente ? 'AND rf.id_resolucion <> ?' : ''}
                                        AND (
                                            (? BETWEEN rf.rango_inicial AND rf.rango_final)
                                            OR (? BETWEEN rf.rango_inicial AND rf.rango_final)
                                            OR (rf.rango_inicial BETWEEN ? AND ?)
                                            OR (rf.rango_final BETWEEN ? AND ?)
                                            )
                                    LIMIT 1
                                `;

                const overlapParams = idResolucionExistente
                    ? [id_empresa, numeroResolucionNormalizado, serieNormalizada, idResolucionExistente, rInicial, rFinal, rInicial, rFinal, rInicial, rFinal]
                    : [id_empresa, numeroResolucionNormalizado, serieNormalizada, rInicial, rFinal, rInicial, rFinal, rInicial, rFinal];

                db.query(
                    overlapQuery,
                    overlapParams,
                    (overlapErr, overlapRows) => {
                        if (overlapErr) {
                            console.log(overlapErr);
                            return res.status(500).send("Error interno del servidor");
                        }

                        if (overlapRows && overlapRows.length) {
                            return res.status(409).send({ message: 'Ya existe un tramo de esta misma resolución que se traslapa con el rango indicado.' });
                        }

                        if (idResolucionExistente) {
                            const sqlUpdate = `UPDATE resoluciones_facturas SET
                                id_empresa = ?,
                                rango_inicial = ?,
                                rango_final = ?,
                                correlativo_actual = ?,
                                fecha_autorizacion = ?,
                                fecha_vencimiento = ?,
                                estado = ?,
                                rol = ?
                                WHERE id_resolucion = ?`;

                            const updateValues = [
                                id_empresa,
                                rango_inicial,
                                rango_final,
                                correlativo_actual,
                                fecha_autorizacion,
                                fecha_vencimiento,
                                estado,
                                rol,
                                idResolucionExistente
                            ];

                            return db.query(sqlUpdate, updateValues, (updateErr) => {
                                if (updateErr) {
                                    console.log(updateErr);
                                    return res.status(500).send("Error al actualizar la resolución existente");
                                }

                                return guardarProyectosResolucion(idResolucionExistente, id_empresa, req.body?.proyectos_ids, (proyErr) => {
                                    if (proyErr) {
                                        console.log(proyErr);
                                        return res.status(500).send("Error al guardar los proyectos de la resolución");
                                    }
                                    return res.status(200).send("Resolución existente actualizada correctamente");
                                });
                            });
                        }

                        const sqlInsert = 'INSERT INTO resoluciones_facturas (id_empresa, id_usuario, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado, rol) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                        const values = [id_empresa, idUsuarioValido, numeroResolucionNormalizado, serieNormalizada, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado, rol];

                        db.query(sqlInsert, values, (insertErr, insertResult) => {
                            if (insertErr) {
                                console.log(insertErr);
                                return res.status(500).send("Error al registrar la resolución");
                            }

                            return guardarProyectosResolucion(insertResult.insertId, id_empresa, req.body?.proyectos_ids, (proyErr) => {
                                if (proyErr) {
                                    console.log(proyErr);
                                    return res.status(500).send("Error al guardar los proyectos de la resolución");
                                }
                                return res.status(200).send("Resolución registrada con éxito!!!");
                            });
                        });
                    }
                );
            }
        );
    });
});

// === LISTAR RESOLUCIONES ===
router.get("/", (req, res) => {
    const query = `
        SELECT
            rf.*, 
            u.nombre AS nombre_usuario,
            u.correo AS correo_usuario,
            (SELECT GROUP_CONCAT(rfp.id_proyecto) FROM resoluciones_facturas_proyectos rfp WHERE rfp.id_resolucion = rf.id_resolucion) AS proyectos_ids
        FROM resoluciones_facturas rf
        LEFT JOIN usuarios u ON u.id_usuario = rf.id_usuario
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error al obtener las resoluciones");
        } else {
            res.send(result);
        }
    });
});

// === ACTUALIZAR RESOLUCIÓN ===
router.put("/actualizar", (req, res) => {
    const { id_resolucion, id_empresa, id_usuario, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado } = req.body;
    const numeroResolucionNormalizado = String(numero_resolucion || '').trim().toUpperCase();
    const serieNormalizada = String(serie || '').trim().toUpperCase();
    const rol = String(req.body?.rol || 'caja').trim().toLowerCase() || 'caja';
    
    // --- VALIDACIÓN DE PROTECCIÓN EN EL BACKEND ---
    const rInicial = Number(rango_inicial);
    const rFinal = Number(rango_final);
    const cActual = Number(correlativo_actual);

    if (rInicial > rFinal) {
        return res.status(400).send({ message: "El rango inicial no puede ser mayor al rango final" });
    }

    if (cActual < rInicial || cActual > rFinal) {
        return res.status(400).send({ message: `El correlativo actual (${cActual}) está fuera del rango autorizado (${rInicial} - ${rFinal})` });
    }

    if (!numeroResolucionNormalizado || !serieNormalizada) {
        return res.status(400).send({ message: 'Debe enviar número de resolución y serie válidos.' });
    }
    // ---------------------------------------------

    validarUsuario(id_usuario, (userErr, idUsuarioValido) => {
        if (userErr) {
            return res.status(400).send({ message: userErr.message || 'Usuario inválido.' });
        }

                const overlapQuery = `
                        SELECT rf.id_resolucion
                        FROM resoluciones_facturas rf
                        WHERE (
                                        rf.id_empresa = ?
                                    )
                            AND UPPER(TRIM(rf.numero_resolucion)) = ?
                            AND UPPER(TRIM(rf.serie)) = ?
                            AND rf.id_resolucion <> ?
                            AND (
                                        (? BETWEEN rf.rango_inicial AND rf.rango_final)
                                        OR (? BETWEEN rf.rango_inicial AND rf.rango_final)
                                        OR (rf.rango_inicial BETWEEN ? AND ?)
                                        OR (rf.rango_final BETWEEN ? AND ?)
                                    )
                        LIMIT 1
                `;

        db.query(
            overlapQuery,
            [id_empresa, numeroResolucionNormalizado, serieNormalizada, id_resolucion, rInicial, rFinal, rInicial, rFinal, rInicial, rFinal],
            (overlapErr, overlapRows) => {
                if (overlapErr) {
                    console.log(overlapErr);
                    return res.status(500).send("Error al actualizar");
                }

                if (overlapRows && overlapRows.length) {
                    return res.status(409).send({ message: 'El rango se traslapa con otro tramo de la misma resolución.' });
                }

                const sqlUpdate = `UPDATE resoluciones_facturas SET 
                    id_empresa = ?, 
                    id_usuario = ?,
                    numero_resolucion = ?, 
                    serie = ?, 
                    rango_inicial = ?, 
                    rango_final = ?, 
                    correlativo_actual = ?, 
                    fecha_autorizacion = ?, 
                    fecha_vencimiento = ?, 
                    estado = ?,
                    rol = ? 
                    WHERE id_resolucion = ?`;

                const values = [id_empresa, idUsuarioValido, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado, rol, id_resolucion];
                const valuesNormalizados = [id_empresa, idUsuarioValido, numeroResolucionNormalizado, serieNormalizada, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado, rol, id_resolucion];

                db.query(sqlUpdate, valuesNormalizados, (err, result) => {
                    if (err) {
                        console.log(err);
                        return res.status(500).send("Error al actualizar");
                    }

                    guardarProyectosResolucion(id_resolucion, id_empresa, req.body?.proyectos_ids, (proyErr) => {
                        if (proyErr) {
                            console.log(proyErr);
                            return res.status(500).send("Error al guardar los proyectos de la resolución");
                        }
                        res.status(200).send("Resolución actualizada correctamente");
                    });
                });
            }
        );
    });
});

// === ELIMINAR RESOLUCIÓN ===
router.delete("/delete/:id_resolucion", (req, res) => {
    const { id_resolucion } = req.params; 
    
    db.query('DELETE FROM resoluciones_facturas WHERE id_resolucion = ?', [id_resolucion], (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error al eliminar");
        } else {
            db.query('DELETE FROM resoluciones_facturas_proyectos WHERE id_resolucion = ?', [id_resolucion], () => {});
            res.status(200).send("Resolución eliminada correctamente"); 
        }
    });
});

module.exports = router;