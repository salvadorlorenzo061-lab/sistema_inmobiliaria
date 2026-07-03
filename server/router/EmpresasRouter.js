const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());

// ⚙️ CONFIGURACIÓN CRÍTICA: Aumentamos los límites para soportar las imágenes en Base64 sin problemas
router.use(express.json({ limit: '50mb' }));
router.use(express.urlencoded({ limit: '50mb', extended: true }));

const ensureEmpresasTableExists = (callback) => {
    db.query(
        `
            SELECT COUNT(*) AS total
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'empresas'
        `,
        (tableErr, tableRows) => {
            if (tableErr) {
                console.error('No se pudo verificar existencia de la tabla empresas:', tableErr.message);
                return callback(false);
            }
            return callback((tableRows?.[0]?.total || 0) > 0);
        }
    );
};

const ensureColumnInEmpresas = (columnName, definition) => {
    ensureEmpresasTableExists((tableExists) => {
        if (!tableExists) {
            console.warn(`La tabla empresas no existe en esta base de datos. Se omite migracion de ${columnName}.`);
            return;
        }

        db.query('SHOW COLUMNS FROM empresas LIKE ?', [columnName], (err, rows) => {
            if (err) {
                console.error(`No se pudo verificar columna ${columnName}:`, err.message);
                return;
            }
            if (!rows || rows.length === 0) {
                db.query(`ALTER TABLE empresas ADD COLUMN ${columnName} ${definition}`, (alterErr) => {
                    if (alterErr) {
                        console.error(`No se pudo crear columna ${columnName}:`, alterErr.message);
                    }
                });
            }
        });
    });
};

ensureColumnInEmpresas('nit', 'VARCHAR(50) NULL');
ensureColumnInEmpresas('id_empresa_matriz', 'INT NULL');
ensureColumnInEmpresas('mostrar_en_modulo', 'TINYINT(1) NOT NULL DEFAULT 0');

const seedModuloEmpresasVisibles = () => {
    ensureEmpresasTableExists((tableExists) => {
        if (!tableExists) {
            console.warn('La tabla empresas no existe en esta base de datos. Se omite semilla de mostrar_en_modulo.');
            return;
        }

        db.query('SELECT COUNT(*) AS total FROM empresas WHERE mostrar_en_modulo = 1', (countErr, countRows) => {
            if (countErr) {
                console.error('No se pudo validar semillas de mostrar_en_modulo:', countErr.message);
                return;
            }

            const totalVisibles = Number(countRows?.[0]?.total || 0);
            if (totalVisibles > 0) {
                return;
            }

            const sql = `
                UPDATE empresas
                SET mostrar_en_modulo = 1
                WHERE id_empresa_matriz IS NULL
                  AND (
                    UPPER(nombre_empresa) LIKE '%INVERSION INMOBILIARIA GT%'
                    OR UPPER(nombre_empresa) LIKE '%CORPORACION DE PROYECTOS Y VIVIENDAS%'
                    OR UPPER(nombre_empresa) LIKE '%NORSUR%'
                    OR UPPER(nombre_empresa) LIKE '%INVERSION REAL%'
                    OR UPPER(nombre_empresa) LIKE '%CORPORACION DE DESARROLLOS JW%'
                  )
            `;

            db.query(sql, (seedErr) => {
                if (seedErr) {
                    console.error('No se pudo sembrar mostrar_en_modulo:', seedErr.message);
                }
            });
        });
    });
};

setTimeout(seedModuloEmpresasVisibles, 1200);

// === 1. LISTAR EMPRESAS ===
router.get("/", (req, res) => {
    const { soloModulo, soloMatrices } = req.query;
    const condiciones = [];

    if (soloMatrices === '1' || soloModulo === '1') {
        condiciones.push('id_empresa_matriz IS NULL');
    }

    if (soloModulo === '1') {
        condiciones.push('mostrar_en_modulo = 1');
    }

    const whereClause = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
    const sql = `SELECT * FROM empresas${whereClause} ORDER BY id_empresa ASC`;

    // Al hacer SELECT *, automáticamente traerá la columna logo a la tabla de React
    db.query(sql, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error al obtener las empresas");
        } else {
            res.send(result);
        }
    });
});

// === 1.1 LISTAR RELACION MATRIZ -> PROYECTOS ===
router.get('/relaciones', (req, res) => {
    const sql = `
        SELECT
            matriz.id_empresa AS id_empresa_matriz,
            matriz.nombre_empresa AS nombre_empresa_matriz,
            matriz.nit AS nit_matriz,
            proyecto.id_empresa AS id_proyecto,
            proyecto.nombre_empresa AS nombre_proyecto
        FROM empresas matriz
        LEFT JOIN empresas proyecto ON proyecto.id_empresa_matriz = matriz.id_empresa
        WHERE matriz.id_empresa_matriz IS NULL
        ORDER BY matriz.nombre_empresa ASC, proyecto.nombre_empresa ASC
    `;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: 'Error al obtener relaciones de empresas' });
        }

        const grouped = [];
        const byId = new Map();

        rows.forEach((row) => {
            if (!byId.has(row.id_empresa_matriz)) {
                const item = {
                    id_empresa_matriz: row.id_empresa_matriz,
                    nombre_empresa_matriz: row.nombre_empresa_matriz,
                    nit_matriz: row.nit_matriz || 'C/F',
                    proyectos: []
                };
                byId.set(row.id_empresa_matriz, item);
                grouped.push(item);
            }

            if (row.id_proyecto) {
                byId.get(row.id_empresa_matriz).proyectos.push({
                    id_proyecto: row.id_proyecto,
                    nombre_proyecto: row.nombre_proyecto
                });
            }
        });

        res.send(grouped);
    });
});

// === 2. CREAR EMPRESA ===
router.post("/crear", (req, res) => {
    // 📸 AGREGADO: Extraemos 'logo' del cuerpo de la petición (req.body)
    const { nombre_empresa, pais, moneda, estado, nit, logo, id_empresa_matriz, id_usuario, nombre_usuario } = req.body;
    const idEmpresaMatriz = id_empresa_matriz ? Number(id_empresa_matriz) : null;

    // Validación para no duplicar nombres de empresa
    db.query('SELECT * FROM empresas WHERE nombre_empresa = ?', [nombre_empresa], (err, result) => {
        if (err) {
            console.error(err);
            registrarAuditoria(id_usuario, nombre_usuario, 'CREATE', 'Empresas', `Error: ${err.message}`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'error');
            return res.status(500).send("Error interno del servidor");
        }

        if (result.length > 0) {
            registrarAuditoria(id_usuario, nombre_usuario, 'CREATE', 'Empresas', `Intento de crear empresa duplicada: ${nombre_empresa}`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'advertencia');
            return res.status(400).send({ message: "Esta empresa ya se encuentra registrada" });
        }

        // 🔄 MODIFICADO: Agregada la columna y el valor para el logo y nit
        db.query(
            'INSERT INTO empresas (nombre_empresa, nit, pais, moneda, estado, logo, id_empresa_matriz) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nombre_empresa, nit, pais, moneda, estado, logo, idEmpresaMatriz],
            (insertErr, insertResult) => {
                if (insertErr) {
                    console.error(insertErr);
                    registrarAuditoria(id_usuario, nombre_usuario, 'CREATE', 'Empresas', `Error al insertar: ${insertErr.message}`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'error');
                    return res.status(500).send("Error al registrar la empresa");
                } else {
                    registrarAuditoria(id_usuario, nombre_usuario, 'CREATE', 'Empresas', `Empresa creada: ${nombre_empresa} (Pais: ${pais}, Moneda: ${moneda})`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'exitoso');
                    res.status(200).send("Empresa registrada con éxito");
                }
            }
        );
    });
});

// === 3. ACTUALIZAR EMPRESA ===
router.put("/actualizar", (req, res) => {
    // 📸 AGREGADO: Extraemos 'logo' para permitir la modificación de la imagen corporativa
    const { id_empresa, nombre_empresa, pais, moneda, estado, nit, logo, id_empresa_matriz, id_usuario, nombre_usuario } = req.body;
    const idEmpresaMatriz = id_empresa_matriz ? Number(id_empresa_matriz) : null;
    
    // 🔄 MODIFICADO: Agregado el seteo de 'logo = ?' y 'nit = ?' en la sentencia SQL
    db.query(
        'UPDATE empresas SET nombre_empresa = ?, nit = ?, pais = ?, moneda = ?, estado = ?, logo = ?, id_empresa_matriz = ? WHERE id_empresa = ?',
        [nombre_empresa, nit, pais, moneda, estado, logo, idEmpresaMatriz, id_empresa],
        (err, result) => {
            if (err) {
                console.error(err);
                registrarAuditoria(id_usuario, nombre_usuario, 'UPDATE', 'Empresas', `Error al actualizar empresa ${id_empresa}: ${err.message}`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'error');
                res.status(500).send("Error al actualizar la empresa");
            } else {
                registrarAuditoria(id_usuario, nombre_usuario, 'UPDATE', 'Empresas', `Empresa actualizada: ${nombre_empresa} (ID: ${id_empresa})`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'exitoso');
                res.status(200).send("Empresa actualizada correctamente");
            }
        }
    );
});

// === 4. ELIMINAR EMPRESA ===
router.delete("/delete/:id_empresa", (req, res) => {
    const { id_empresa } = req.params;
    const { id_usuario, nombre_usuario } = req.body || {};
    
    db.query('DELETE FROM empresas WHERE id_empresa = ?', [id_empresa], (err, result) => {
        if (err) {
            if (err.errno === 1451) {
                registrarAuditoria(id_usuario, nombre_usuario, 'DELETE', 'Empresas', `Intento de eliminar empresa ${id_empresa} con relaciones activas`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'advertencia');
                return res.status(400).send({ 
                    message: "No se puede eliminar la empresa porque tiene usuarios o lotes asociados." 
                });
            }
            console.error(err);
            registrarAuditoria(id_usuario, nombre_usuario, 'DELETE', 'Empresas', `Error al eliminar empresa ${id_empresa}: ${err.message}`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'error');
            res.status(500).send("Error al eliminar la empresa");
        } else {
            registrarAuditoria(id_usuario, nombre_usuario, 'DELETE', 'Empresas', `Empresa eliminada (ID: ${id_empresa})`, obtenerIP({headers: req.headers, connection: req.connection, socket: req.socket, ip: req.ip}), 'exitoso');
            res.status(200).send("EmpresaBase eliminada correctamente"); 
        }
    });
});

module.exports = router;