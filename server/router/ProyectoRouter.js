const express = require('express');
const db = require('../Conexion');
const cors = require('cors');

const router = express.Router();

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
        }
    });
};

ensureTablaProyecto();

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
