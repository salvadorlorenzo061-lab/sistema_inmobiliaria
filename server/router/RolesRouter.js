const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

// === 1. LISTAR ROLES ===
router.get("/", (req, res) => {
    db.query('SELECT * FROM roles ORDER BY id_rol ASC', (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error al obtener los roles");
        } else {
            res.send(result);
        }
    });
});

// === 2. CREAR ROL ===
router.post("/crear", (req, res) => {
    const { nombre_rol, descripcion } = req.body;

    // Validar que no se duplique el nombre del rol
    db.query('SELECT * FROM roles WHERE nombre_rol = ?', [nombre_rol], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error interno del servidor");
        }

        if (result.length > 0) {
            return res.status(400).send({ message: "Ese nombre de rol ya existe" });
        }

        db.query(
            'INSERT INTO roles (nombre_rol, descripcion) VALUES (?, ?)',
            [nombre_rol, descripcion],
            (insertErr, insertResult) => {
                if (insertErr) {
                    console.error(insertErr);
                    return res.status(500).send("Error al registrar el rol");
                } else {
                    res.status(200).send("Rol registrado con éxito");
                }
            }
        );
    });
});

// === 2B. SINCRONIZAR ROLES DESDE CHECKS ===
router.post("/sincronizar", (req, res) => {
    const { nombres_rol } = req.body;
    const rolesSolicitados = Array.isArray(nombres_rol)
        ? [...new Set(nombres_rol.map((item) => String(item).trim()).filter(Boolean))]
        : [];

    if (rolesSolicitados.length === 0) {
        return res.status(200).send({ message: "Sin roles para sincronizar", insertados: 0 });
    }

    let insertados = 0;

    const procesarSiguiente = (indice) => {
        if (indice >= rolesSolicitados.length) {
            return res.status(200).send({
                message: "Roles sincronizados correctamente",
                insertados
            });
        }

        const nombreRol = rolesSolicitados[indice];

        db.query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [nombreRol], (err, result) => {
            if (err) {
                console.error(err);
                return procesarSiguiente(indice + 1);
            }

            if (!result || result.length === 0) {
                db.query(
                    'INSERT INTO roles (nombre_rol, descripcion) VALUES (?, ?)',
                    [nombreRol, 'Rol agregado automáticamente desde los permisos seleccionados'],
                    (insertErr) => {
                        if (!insertErr) {
                            insertados += 1;
                        } else {
                            console.error(insertErr);
                        }

                        procesarSiguiente(indice + 1);
                    }
                );
                return;
            }

            procesarSiguiente(indice + 1);
        });
    };

    procesarSiguiente(0);
});

// === 3. ACTUALIZAR ROL ===
router.put("/actualizar", (req, res) => {
    const { id_rol, nombre_rol, descripcion } = req.body;
    
    db.query(
        'UPDATE roles SET nombre_rol = ?, descripcion = ? WHERE id_rol = ?',
        [nombre_rol, descripcion, id_rol],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error al actualizar el rol");
            } else {
                res.status(200).send("Rol actualizado correctamente");
            }
        }
    );
});

// === 4. ELIMINAR ROL (Controlando restricción de llave foránea) ===
router.delete("/delete/:id_rol", (req, res) => {
    const { id_rol } = req.params; 
    
    db.query('DELETE FROM roles WHERE id_rol = ?', [id_rol], (err, result) => {
        if (err) {
            // Código de error de MySQL para restricción de llave foránea en cascada/restrict
            if (err.errno === 1451) {
                return res.status(400).send({ 
                    message: "No se puede eliminar el rol porque está asignado a usuarios activos." 
                });
            }
            console.error(err);
            res.status(500).send("Error al eliminar el rol");
        } else {
            res.status(200).send("Rol eliminado correctamente"); 
        }
    });
});

module.exports = router;