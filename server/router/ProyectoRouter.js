const express = require('express');
const db = require('../Conexion');
const cors = require('cors');

const router = express.Router();

router.use(cors());
router.use(express.json());

const resolverColumnaCostoServicios = (callback) => {
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

const normalizarNitNumerico = (nitRaw) => {
    const limpio = String(nitRaw ?? '').replace(/\D/g, '');
    return limpio || '0';
};

const ensureTablaProyecto = () => {
    const createTableSql = `
        CREATE TABLE IF NOT EXISTS proyecto (
            id_proyecto INT NOT NULL AUTO_INCREMENT,
            nombre VARCHAR(100) NOT NULL,
            nit INT NOT NULL,
            estado VARCHAR(100) NOT NULL,
            id_empresa INT NOT NULL,
            PRIMARY KEY (id_proyecto),
            KEY idx_proyecto_empresa (id_empresa),
            KEY idx_proyecto_nit (nit),
            CONSTRAINT fk_proyecto_empresa
                FOREIGN KEY (id_empresa)
                REFERENCES empresas(id_empresa)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    db.query(createTableSql, (createErr) => {
        if (createErr) {
            console.error('Error al crear tabla proyecto:', createErr);
        }
    });
};

ensureTablaProyecto();

const ensureProyectoServiciosTable = () => {
    const sql = `
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    db.query(sql, (err) => {
        if (err) {
            console.error('Error al crear tabla proyecto_servicios:', err.message);
        }
    });
};

ensureProyectoServiciosTable();

router.get('/servicios/:id_proyecto', (req, res) => {
    const idProyecto = Number(req.params.id_proyecto);

    if (!Number.isInteger(idProyecto) || idProyecto <= 0) {
        return res.status(400).send({ message: 'ID de proyecto inválido.' });
    }

    resolverColumnaCostoServicios((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: 'No se pudo obtener costos de servicios.' });
        }

        const sql = `
            SELECT
                ps.id_servicio,
                s.nombre_servicio,
                COALESCE(ps.monto_servicio, s.${columnaCosto}, 0) AS costo_servicio
            FROM proyecto_servicios ps
            INNER JOIN servicios s ON s.id_servicio = ps.id_servicio
            WHERE ps.id_proyecto = ?
              AND ps.estado = 'activo'
              AND s.estado = 'activo'
            ORDER BY s.nombre_servicio ASC
        `;

        db.query(sql, [idProyecto], (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ message: 'Error al obtener servicios del proyecto.' });
            }

            return res.send({
                id_proyecto: idProyecto,
                servicios: (rows || []).map((row) => ({
                    id_servicio: Number(row.id_servicio),
                    nombre_servicio: row.nombre_servicio,
                    costo_servicio: Number(row.costo_servicio || 0)
                }))
            });
        });
    });
});

router.put('/servicios/:id_proyecto', (req, res) => {
    const idProyecto = Number(req.params.id_proyecto);
    const servicios = Array.isArray(req.body?.servicios) ? req.body.servicios : [];

    if (!Number.isInteger(idProyecto) || idProyecto <= 0) {
        return res.status(400).send({ message: 'ID de proyecto inválido.' });
    }

    const idsServicios = [...new Set(servicios
        .map((item) => Number(item?.id_servicio ?? item))
        .filter((id) => Number.isInteger(id) && id > 0))];

    resolverColumnaCostoServicios((colErr, columnaCosto) => {
        if (colErr) {
            console.error('Error resolviendo columna de costo en servicios:', colErr.message);
            return res.status(500).send({ message: 'No se pudo preparar actualización de servicios del proyecto.' });
        }

        db.query('SELECT id_proyecto FROM proyecto WHERE id_proyecto = ? LIMIT 1', [idProyecto], (errProyecto, rowsProyecto) => {
            if (errProyecto) {
                console.error(errProyecto);
                return res.status(500).send({ message: 'Error al validar proyecto.' });
            }

            if (!rowsProyecto || !rowsProyecto.length) {
                return res.status(404).send({ message: 'Proyecto no encontrado.' });
            }

            const completar = () => {
                return res.send({ message: 'Servicios del proyecto actualizados correctamente.' });
            };

            if (!idsServicios.length) {
                db.query('DELETE FROM proyecto_servicios WHERE id_proyecto = ?', [idProyecto], (delErr) => {
                    if (delErr) {
                        console.error(delErr);
                        return res.status(500).send({ message: 'No se pudieron limpiar servicios del proyecto.' });
                    }
                    return completar();
                });
                return;
            }

            const placeholders = idsServicios.map(() => '?').join(',');
            const validSql = `SELECT id_servicio, ${columnaCosto} AS costo_servicio FROM servicios WHERE id_servicio IN (${placeholders})`;

            db.query(validSql, idsServicios, (errValid, validRows) => {
                if (errValid) {
                    console.error(errValid);
                    return res.status(500).send({ message: 'No se pudo validar el catálogo de servicios.' });
                }

                const serviciosValidos = validRows || [];
                if (!serviciosValidos.length) {
                    db.query('DELETE FROM proyecto_servicios WHERE id_proyecto = ?', [idProyecto], (delErr) => {
                        if (delErr) {
                            console.error(delErr);
                            return res.status(500).send({ message: 'No se pudieron limpiar servicios del proyecto.' });
                        }
                        return completar();
                    });
                    return;
                }

                const idsValidos = serviciosValidos.map((row) => Number(row.id_servicio));
                const placeholdersValidos = idsValidos.map(() => '?').join(',');

                db.query(
                    `DELETE FROM proyecto_servicios WHERE id_proyecto = ? AND id_servicio NOT IN (${placeholdersValidos})`,
                    [idProyecto, ...idsValidos],
                    (delErr) => {
                        if (delErr) {
                            console.error(delErr);
                            return res.status(500).send({ message: 'No se pudieron sincronizar servicios del proyecto.' });
                        }

                        if (!serviciosValidos.length) {
                            return completar();
                        }

                        const values = serviciosValidos.map((row) => [
                            idProyecto,
                            Number(row.id_servicio),
                            Number(row.costo_servicio || 0),
                            'activo'
                        ]);

                        const upsertSql = `
                            INSERT INTO proyecto_servicios (id_proyecto, id_servicio, monto_servicio, estado)
                            VALUES ?
                            ON DUPLICATE KEY UPDATE
                                monto_servicio = VALUES(monto_servicio),
                                estado = 'activo'
                        `;

                        db.query(upsertSql, [values], (upsertErr) => {
                            if (upsertErr) {
                                console.error(upsertErr);
                                return res.status(500).send({ message: 'No se pudieron guardar servicios del proyecto.' });
                            }

                            return completar();
                        });
                    }
                );
            });
        });
    });
});

router.get('/catalogo', (req, res) => {
    const sqlEmpresas = `
        SELECT id_empresa, nombre_empresa, CAST(nit AS CHAR) AS nit
        FROM empresas
        WHERE id_empresa_matriz IS NULL
        ORDER BY nombre_empresa ASC
    `;

    db.query(sqlEmpresas, (err, empresas) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: 'Error al obtener empresas' });
        }

        return res.send({ empresas: empresas || [] });
    });
});

router.get('/', (req, res) => {
    const sql = `
        SELECT
            p.id_proyecto,
            p.nombre,
            CAST(p.nit AS CHAR) AS nit,
            p.estado,
            p.id_empresa,
            e.nombre_empresa
        FROM proyecto p
        LEFT JOIN empresas e ON e.id_empresa = p.id_empresa
        ORDER BY p.id_proyecto DESC
    `;

    db.query(sql, (err, proyectos) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: 'Error al obtener proyectos' });
        }

        return res.send(proyectos || []);
    });
});

router.post('/crear', (req, res) => {
    const { nombre, nit, estado, id_empresa } = req.body;

    if (!nombre || !String(nombre).trim() || !id_empresa) {
        return res.status(400).send({ message: 'Nombre e ID de empresa son obligatorios' });
    }

    const nombreProyecto = String(nombre).trim();
    const estadoProyecto = estado && String(estado).trim() ? String(estado).trim() : 'activo';
    const idEmpresa = Number(id_empresa);

    db.query(
        'SELECT id_empresa, nit FROM empresas WHERE id_empresa = ? AND id_empresa_matriz IS NULL',
        [idEmpresa],
        (errEmpresa, rowsEmpresa) => {
            if (errEmpresa) {
                console.error(errEmpresa);
                return res.status(500).send({ message: 'Error al validar empresa' });
            }

            if (!rowsEmpresa || rowsEmpresa.length === 0) {
                return res.status(400).send({ message: 'Empresa no válida para asociar proyecto' });
            }

            const nitProyecto = normalizarNitNumerico(nit || rowsEmpresa[0].nit);

            db.query(
                'SELECT id_proyecto FROM proyecto WHERE UPPER(nombre) = UPPER(?) AND id_empresa = ?',
                [nombreProyecto, idEmpresa],
                (errExists, rowsExists) => {
                    if (errExists) {
                        console.error(errExists);
                        return res.status(500).send({ message: 'Error al validar duplicados' });
                    }

                    if (rowsExists && rowsExists.length > 0) {
                        return res.status(400).send({ message: 'Ya existe un proyecto con ese nombre para esta empresa' });
                    }

                    db.query(
                        'INSERT INTO proyecto (nombre, nit, estado, id_empresa) VALUES (?, ?, ?, ?)',
                        [nombreProyecto, nitProyecto, estadoProyecto, idEmpresa],
                        (errInsert, resultInsert) => {
                            if (errInsert) {
                                console.error(errInsert);
                                return res.status(500).send({ message: 'No se pudo crear el proyecto' });
                            }

                            return res.status(201).send({
                                message: 'Proyecto creado correctamente',
                                id_proyecto: resultInsert.insertId
                            });
                        }
                    );
                }
            );
        }
    );
});

router.put('/actualizar/:id_proyecto', (req, res) => {
    const { id_proyecto } = req.params;
    const { nombre, nit, estado, id_empresa } = req.body;

    if (!nombre || !String(nombre).trim() || !id_empresa) {
        return res.status(400).send({ message: 'Nombre e ID de empresa son obligatorios' });
    }

    const idProyecto = Number(id_proyecto);
    const idEmpresa = Number(id_empresa);
    const nombreProyecto = String(nombre).trim();
    const estadoProyecto = estado && String(estado).trim() ? String(estado).trim() : 'activo';

    db.query(
        'SELECT id_empresa, nit FROM empresas WHERE id_empresa = ? AND id_empresa_matriz IS NULL',
        [idEmpresa],
        (errEmpresa, rowsEmpresa) => {
            if (errEmpresa) {
                console.error(errEmpresa);
                return res.status(500).send({ message: 'Error al validar empresa' });
            }

            if (!rowsEmpresa || rowsEmpresa.length === 0) {
                return res.status(400).send({ message: 'Empresa no válida para asociar proyecto' });
            }

            const nitProyecto = normalizarNitNumerico(nit || rowsEmpresa[0].nit);

            db.query(
                'UPDATE proyecto SET nombre = ?, nit = ?, estado = ?, id_empresa = ? WHERE id_proyecto = ?',
                [nombreProyecto, nitProyecto, estadoProyecto, idEmpresa, idProyecto],
                (errUpdate, resultUpdate) => {
                    if (errUpdate) {
                        console.error(errUpdate);
                        return res.status(500).send({ message: 'No se pudo actualizar el proyecto' });
                    }

                    if (!resultUpdate.affectedRows) {
                        return res.status(404).send({ message: 'Proyecto no encontrado' });
                    }

                    return res.send({ message: 'Proyecto actualizado correctamente' });
                }
            );
        }
    );
});

router.delete('/delete/:id_proyecto', (req, res) => {
    const { id_proyecto } = req.params;

    db.query('DELETE FROM proyecto WHERE id_proyecto = ?', [Number(id_proyecto)], (errDelete, resultDelete) => {
        if (errDelete) {
            if (errDelete.errno === 1451) {
                return res.status(400).send({ message: 'No se puede eliminar el proyecto porque tiene registros relacionados' });
            }
            console.error(errDelete);
            return res.status(500).send({ message: 'No se pudo eliminar el proyecto' });
        }

        if (!resultDelete.affectedRows) {
            return res.status(404).send({ message: 'Proyecto no encontrado' });
        }

        return res.send({ message: 'Proyecto eliminado correctamente' });
    });
});

module.exports = router;
