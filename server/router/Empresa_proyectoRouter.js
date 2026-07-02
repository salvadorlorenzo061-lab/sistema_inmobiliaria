const express = require('express');
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');

router.use(cors());
router.use(express.json());

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
            return;
        }

        const migrateLegacySql = `
            INSERT INTO proyecto (nombre, nit, estado, id_empresa)
            SELECT
                e.nombre_empresa,
                CASE
                    WHEN TRIM(COALESCE(m.nit, '')) REGEXP '^[0-9]+$' THEN CAST(TRIM(m.nit) AS UNSIGNED)
                    ELSE 0
                END AS nit,
                COALESCE(NULLIF(TRIM(e.estado), ''), 'activo') AS estado,
                m.id_empresa
            FROM empresas e
            INNER JOIN empresas m ON m.id_empresa = e.id_empresa_matriz
            WHERE e.id_empresa_matriz IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM proyecto p
                  WHERE UPPER(TRIM(p.nombre)) = UPPER(TRIM(e.nombre_empresa))
                    AND p.id_empresa = m.id_empresa
              )
        `;

        db.query(migrateLegacySql, (migrateErr) => {
            if (migrateErr) {
                console.error('Error al migrar proyectos legacy hacia tabla proyecto:', migrateErr);
            }
        });
    });
};

ensureTablaProyecto();

// Catalogo para formularios CRUD
router.get('/catalogo', (req, res) => {
    const sqlMatrices = `
        SELECT id_empresa, nombre_empresa, nit
        FROM empresas
        WHERE id_empresa_matriz IS NULL
        ORDER BY nombre_empresa ASC
    `;

    const sqlProyectos = `
        SELECT
            p.id_proyecto,
            p.nombre AS nombre_proyecto,
            CAST(p.nit AS CHAR) AS nit_empresa,
            p.estado,
            p.id_empresa AS id_empresa_matriz,
            m.nombre_empresa AS nombre_matriz
        FROM proyecto p
        LEFT JOIN empresas m ON m.id_empresa = p.id_empresa
        ORDER BY p.nombre ASC
    `;

    db.query(sqlMatrices, (errMatrices, matrices) => {
        if (errMatrices) {
            console.error(errMatrices);
            return res.status(500).send({ message: 'Error al obtener matrices' });
        }

        db.query(sqlProyectos, (errProyectos, proyectos) => {
            if (errProyectos) {
                console.error(errProyectos);
                return res.status(500).send({ message: 'Error al obtener proyectos' });
            }

            return res.send({
                matrices: matrices || [],
                proyectos: proyectos || []
            });
        });
    });
});

// Listado agrupado: empresa matriz -> proyectos
router.get('/', (req, res) => {
    const sql = `
        SELECT
            matriz.id_empresa,
            matriz.nombre_empresa,
            CAST(matriz.nit AS CHAR) AS nit,
            COUNT(proyecto.id_proyecto) AS total_proyectos,
            GROUP_CONCAT(proyecto.nombre ORDER BY proyecto.nombre SEPARATOR '||') AS proyectos
        FROM empresas matriz
        LEFT JOIN proyecto ON proyecto.id_empresa = matriz.id_empresa
        WHERE matriz.id_empresa_matriz IS NULL
        GROUP BY matriz.id_empresa, matriz.nombre_empresa, matriz.nit
        ORDER BY matriz.nombre_empresa ASC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: 'Error al obtener la relacion empresa-proyecto' });
        }

        const response = (result || []).map((row) => ({
            id_empresa: row.id_empresa,
            nombre_empresa: row.nombre_empresa,
            nit: row.nit || '0',
            total_proyectos: Number(row.total_proyectos || 0),
            proyectos: row.proyectos ? row.proyectos.split('||').filter(Boolean) : []
        }));

        return res.send(response);
    });
});

// Crear proyecto
router.post('/crear', (req, res) => {
    const { nombre_proyecto, nit, id_empresa_matriz, estado } = req.body;

    if (!nombre_proyecto || !String(nombre_proyecto).trim() || !id_empresa_matriz) {
        return res.status(400).send({ message: 'Nombre de proyecto y empresa matriz son obligatorios' });
    }

    const nombreProyecto = String(nombre_proyecto).trim();
    const estadoProyecto = estado && String(estado).trim() ? String(estado).trim() : 'activo';
    const idMatriz = Number(id_empresa_matriz);

    db.query(
        'SELECT id_empresa, nit FROM empresas WHERE id_empresa = ? AND id_empresa_matriz IS NULL',
        [idMatriz],
        (errMatriz, rowsMatriz) => {
            if (errMatriz) {
                console.error(errMatriz);
                return res.status(500).send({ message: 'Error al validar empresa matriz' });
            }

            if (!rowsMatriz || rowsMatriz.length === 0) {
                return res.status(400).send({ message: 'La empresa matriz seleccionada no es valida' });
            }

            const nitProyecto = normalizarNitNumerico(nit || rowsMatriz[0].nit);

            db.query(
                'SELECT id_proyecto FROM proyecto WHERE UPPER(nombre) = UPPER(?) AND id_empresa = ?',
                [nombreProyecto, idMatriz],
                (errExists, rowsExists) => {
                    if (errExists) {
                        console.error(errExists);
                        return res.status(500).send({ message: 'Error al validar proyecto existente' });
                    }

                    if (rowsExists && rowsExists.length > 0) {
                        return res.status(400).send({ message: 'Ya existe un proyecto con ese nombre para esta empresa' });
                    }

                    db.query(
                        'INSERT INTO proyecto (nombre, nit, estado, id_empresa) VALUES (?, ?, ?, ?)',
                        [nombreProyecto, nitProyecto, estadoProyecto, idMatriz],
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

// Actualizar proyecto
router.put('/actualizar/:id_proyecto', (req, res) => {
    const { id_proyecto } = req.params;
    const { nombre_proyecto, nit, id_empresa_matriz, estado } = req.body;

    if (!nombre_proyecto || !String(nombre_proyecto).trim() || !id_empresa_matriz) {
        return res.status(400).send({ message: 'Nombre de proyecto y empresa matriz son obligatorios' });
    }

    const idProyecto = Number(id_proyecto);
    const idMatriz = Number(id_empresa_matriz);
    const nombreProyecto = String(nombre_proyecto).trim();
    const estadoProyecto = estado && String(estado).trim() ? String(estado).trim() : 'activo';

    db.query(
        'SELECT id_empresa, nit FROM empresas WHERE id_empresa = ? AND id_empresa_matriz IS NULL',
        [idMatriz],
        (errMatriz, rowsMatriz) => {
            if (errMatriz) {
                console.error(errMatriz);
                return res.status(500).send({ message: 'Error al validar empresa matriz' });
            }

            if (!rowsMatriz || rowsMatriz.length === 0) {
                return res.status(400).send({ message: 'La empresa matriz seleccionada no es valida' });
            }

            const nitProyecto = normalizarNitNumerico(nit || rowsMatriz[0].nit);

            db.query(
                `UPDATE proyecto
                 SET nombre = ?, nit = ?, estado = ?, id_empresa = ?
                 WHERE id_proyecto = ?`,
                [nombreProyecto, nitProyecto, estadoProyecto, idMatriz, idProyecto],
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

// Eliminar proyecto
router.delete('/delete/:id_proyecto', (req, res) => {
    const { id_proyecto } = req.params;
    const idProyecto = Number(id_proyecto);

    db.query('DELETE FROM proyecto WHERE id_proyecto = ?', [idProyecto], (errDelete, resultDelete) => {
        if (errDelete) {
            if (errDelete.errno === 1451) {
                return res.status(400).send({ message: 'No se puede eliminar el proyecto porque tiene registros relacionados' });
            }
            console.error(errDelete);
            return res.status(500).send({ message: 'No se pudo eliminar el proyecto' });
        }

        if (!resultDelete.affectedRows) {
            return res.status(404).send({ message: 'Proyecto no encontrado o no eliminable' });
        }

        return res.send({ message: 'Proyecto eliminado correctamente' });
    });
});

module.exports = router;
