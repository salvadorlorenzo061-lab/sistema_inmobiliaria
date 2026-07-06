const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ limit: '10mb', extended: true }));

const ensureResidentesTableExists = (callback) => {
    db.query(
        `
            SELECT COUNT(*) AS total
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'residentes'
        `,
        (tableErr, tableRows) => {
            if (tableErr) {
                console.error('Error verificando existencia de tabla residentes:', tableErr);
                return callback(false);
            }
            return callback((tableRows?.[0]?.total || 0) > 0);
        }
    );
};

const ensureColumnInResidentes = (columnName, columnDefinition) => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'residentes'
          AND COLUMN_NAME = ?
    `;

    db.query(checkColumnQuery, [columnName], (checkErr, checkResult) => {
        if (checkErr) {
            console.error(`Error verificando columna ${columnName}:`, checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) {
            return;
        }

        ensureResidentesTableExists((tableExists) => {
            if (!tableExists) {
                console.warn(`La tabla residentes no existe en esta base de datos. Se omite migracion de ${columnName}.`);
                return;
            }

            const alterQuery = `ALTER TABLE residentes ADD COLUMN ${columnName} ${columnDefinition}`;
            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error(`Error agregando columna ${columnName}:`, alterErr);
                    return;
                }
                console.log(`Columna ${columnName} creada en residentes.`);
            });
        });
    });
};

const ensureFormatoPreferidoColumn = () => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'residentes'
          AND COLUMN_NAME = 'formato_contrato_preferido'
    `;

    db.query(checkColumnQuery, (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error verificando columna formato_contrato_preferido:', checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) {
            return;
        }

        ensureResidentesTableExists((tableExists) => {
            if (!tableExists) {
                console.warn('La tabla residentes no existe en esta base de datos. Se omite migracion de formato_contrato_preferido.');
                return;
            }

            const alterQuery = `
                ALTER TABLE residentes
                ADD COLUMN formato_contrato_preferido VARCHAR(20) NULL DEFAULT 'FORMATO_01'
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error('Error agregando columna formato_contrato_preferido:', alterErr);
                    return;
                }
                console.log('Columna formato_contrato_preferido creada en residentes.');
            });
        });
    });
};

// Inicializaciones de bases de datos y migraciones automáticas
ensureFormatoPreferidoColumn();
ensureColumnInResidentes('estado_civil', "VARCHAR(50) NULL DEFAULT 'soltero'");
ensureColumnInResidentes('profesion', "VARCHAR(100) NULL DEFAULT ''");
ensureColumnInResidentes('nacionalidad', "VARCHAR(80) NULL DEFAULT 'guatemalteco'");
ensureColumnInResidentes('fecha_nacimiento', "DATE NULL DEFAULT NULL"); // ✅ NUEVA COLUMNA AUTOMÁTICA

const generarNumeroIdentificacion = () => {
    const fecha = new Date();
    const fechaClave = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}`;
    const aleatorio = Math.floor(100000 + Math.random() * 900000);
    return `RES-${fechaClave}-${aleatorio}`;
};

const generarNumeroIdentificacionUnico = (callback) => {
    const intentar = (intento) => {
        const numero = generarNumeroIdentificacion();
        db.query('SELECT id_residente FROM residentes WHERE numero_identificacion = ?', [numero], (err, result) => {
            if (err) return callback(err);
            if (result.length === 0) return callback(null, numero);
            if (intento < 5) return intentar(intento + 1);
            callback(new Error('No se pudo generar un número de identificación único'));
        });
    };
    intentar(1);
};

// === LISTAR RESIDENTES ===
router.get("/", (req, res) => {
    db.query('SELECT * FROM residentes', (err, result) => {
        if (err) {
            console.error("Error al obtener residentes:", err);
            return res.status(500).send("Error al obtener residentes");
        }
        res.status(200).send(result);
    });
});

// === CREAR RESIDENTE ===
router.post("/crear", (req, res) => {
    const {
        id_empresa,
        nombre,
        dpi,
        nit,
        telefono,
        correo,
        fecha_nacimiento, // ✅ CAPTURADO
        estado_civil,
        profesion,
        nacionalidad,
        direccion_notificacion,
        direccion_residencia,
        foto,
        estado,
        formato_contrato_preferido
    } = req.body;
    const nitNormalizado = nit && String(nit).trim() ? String(nit).trim() : 'C/F';

    db.query('SELECT * FROM residentes WHERE dpi = ?', [dpi], (err, result) => {
        if (err) {
            console.error("Error en validación de DPI:", err);
            return res.status(500).send("Error interno del servidor");
        }

        if (result.length > 0) {
            return res.status(400).send({ message: "El DPI ya se encuentra registrado en el sistema" });
        }

        generarNumeroIdentificacionUnico((numeroErr, numeroIdentificacion) => {
            if (numeroErr) {
                console.error("Error al generar número de identificación:", numeroErr);
                return res.status(500).send({ message: "No se pudo generar el número de identificación" });
            }

            // ✅ INYECTADA FECHA NACIMIENTO EN QUERY
            const queryInsert = 'INSERT INTO residentes (id_empresa, nombre, dpi, nit, telefono, correo, fecha_nacimiento, estado_civil, profesion, nacionalidad, direccion_notificacion, direccion_residencia, foto, estado, formato_contrato_preferido, numero_identificacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
            db.query(queryInsert, [
                id_empresa,
                nombre,
                dpi,
                nitNormalizado,
                telefono,
                correo,
                fecha_nacimiento || null, // ✅ ENVIADO (O null si viene vacío)
                estado_civil || 'soltero',
                profesion || '',
                nacionalidad || 'guatemalteco',
                direccion_notificacion,
                direccion_residencia,
                foto,
                estado,
                formato_contrato_preferido || 'FORMATO_01',
                numeroIdentificacion
            ], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error("Error al insertar residente:", insertErr);
                    return res.status(500).send("Error al registrar el residente");
                }
                res.status(200).json({
                    message: "Residente registrado con éxito!!!",
                    numero_identificacion: numeroIdentificacion,
                    id_residente: insertResult.insertId
                });
            });
        });
    });
});

// === ACTUALIZAR RESIDENTE ===
router.put("/actualizar", (req, res) => {
    const {
        id_residente,
        id_empresa,
        nombre,
        dpi,
        nit,
        telefono,
        correo,
        fecha_nacimiento, // ✅ CAPTURADO
        estado_civil,
        profesion,
        nacionalidad,
        direccion_notificacion,
        direccion_residencia,
        foto,
        estado,
        numero_identificacion,
        formato_contrato_preferido
    } = req.body;
    const nitNormalizado = nit && String(nit).trim() ? String(nit).trim() : 'C/F';
    const identificador = String(numero_identificacion || '').trim() || null;
    
    // ✅ INYECTADA FECHA NACIMIENTO EN EL SET
    const queryUpdate = 'UPDATE residentes SET id_empresa=?, nombre=?, dpi=?, nit=?, telefono=?, correo=?, fecha_nacimiento=?, estado_civil=?, profesion=?, nacionalidad=?, direccion_notificacion=?, direccion_residencia=?, foto=?, estado=?, numero_identificacion=COALESCE(?, numero_identificacion), formato_contrato_preferido=? WHERE id_residente=?';
    
    db.query(queryUpdate, [
        id_empresa,
        nombre,
        dpi,
        nitNormalizado,
        telefono,
        correo,
        fecha_nacimiento || null, // ✅ ENVIADO
        estado_civil || 'soltero',
        profesion || '',
        nacionalidad || 'guatemalteco',
        direccion_notificacion,
        direccion_residencia,
        foto,
        estado,
        identificador,
        formato_contrato_preferido || 'FORMATO_01',
        id_residente
    ], (err, result) => {
        if (err) {
            console.error("Error al actualizar residente:", err);
            return res.status(500).send("Error al actualizar el residente");
        }
        res.status(200).send("Residente actualizado correctamente");
    });
});

// === ELIMINAR RESIDENTE ===
router.delete("/delete/:id_residente", (req, res) => {
    const { id_residente } = req.params; 
    db.query('DELETE FROM residentes WHERE id_residente=?', [id_residente], (err, result) => {
        if (err) {
            console.error("Error al eliminar residente:", err);
            return res.status(500).send("Error al eliminar el residente");
        }
        res.status(200).send("Residente eliminado correctamente"); 
    });
});

// === ASIGNAR NÚMERO DE IDENTIFICACIÓN A RESIDENTE EXISTENTE ===
router.post("/asignar-identificacion/:id", (req, res) => {
    const { id } = req.params;
    generarNumeroIdentificacionUnico((err, numeroIdentificacion) => {
        if (err) return res.status(500).send({ message: 'No se pudo generar el número de identificación' });
        db.query('UPDATE residentes SET numero_identificacion = ? WHERE id_residente = ? AND (numero_identificacion IS NULL OR numero_identificacion = "")',
            [numeroIdentificacion, id],
            (updateErr, result) => {
                if (updateErr) return res.status(500).send({ message: 'Error al guardar el número de identificación' });
                if (result.affectedRows === 0) return res.status(400).send({ message: 'El residente ya tiene un número de identificación asignado' });
                res.status(200).json({ message: 'Número asignado correctamente', numero_identificacion: numeroIdentificacion });
            }
        );
    });
});

module.exports = router;

