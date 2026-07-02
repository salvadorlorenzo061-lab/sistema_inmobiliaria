const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

const ensurePermisosColumn = () => {
    db.query("SHOW COLUMNS FROM usuarios LIKE 'permisos'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna permisos en usuarios:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE usuarios ADD COLUMN permisos TEXT NULL', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna permisos en usuarios:', alterErr.message);
                }
            });
        }
    });
};

ensurePermisosColumn();

const ensureFotoPerfilColumn = () => {
    db.query("SHOW COLUMNS FROM usuarios LIKE 'foto_perfil'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna foto_perfil en usuarios:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE usuarios ADD COLUMN foto_perfil LONGTEXT NULL', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna foto_perfil en usuarios:', alterErr.message);
                }
            });
        }
    });
};

ensureFotoPerfilColumn();

// === LOGIN USUARIO ===
router.post('/login', (req, res) => {
    const { correo, clave } = req.body || {};

    if (!correo || !clave) {
        return res.status(400).send({ message: 'Correo y contraseña son obligatorios.' });
    }

    const query = `
        SELECT u.id_usuario, u.nombre, u.correo, u.clave, u.id_rol, u.estado, u.permisos, u.foto_perfil, r.nombre_rol
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
        WHERE u.correo = ?
        LIMIT 1
    `;

    db.query(query, [correo], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send({ message: 'Error interno del servidor.' });
        }

        if (!result || result.length === 0) {
            return res.status(401).send({ message: 'Credenciales inválidas.' });
        }

        const usuario = result[0];
        if (String(usuario.estado || '').toLowerCase() !== 'activo') {
            return res.status(403).send({ message: 'Usuario inactivo. Contacta al administrador.' });
        }

        if (String(usuario.clave) !== String(clave)) {
            return res.status(401).send({ message: 'Credenciales inválidas.' });
        }

        let permisos = [];
        try {
            permisos = usuario.permisos ? JSON.parse(usuario.permisos) : [];
        } catch {
            permisos = [];
        }

        return res.status(200).send({
            id_usuario: usuario.id_usuario,
            nombre_usuario: usuario.nombre,
            nombre: usuario.nombre,
            correo: usuario.correo,
            id_rol: usuario.id_rol,
            nombre_rol: usuario.nombre_rol,
            estado: usuario.estado,
            permisos,
            foto_perfil: usuario.foto_perfil || null
        });
    });
});

const sincronizarPermisosComoRoles = (permisos, callback) => {
    const rolesSolicitados = Array.isArray(permisos)
        ? [...new Set(permisos.map((item) => String(item).trim()).filter(Boolean))]
        : [];

    const procesarSiguiente = (indice) => {
        if (indice >= rolesSolicitados.length) {
            callback(null);
            return;
        }

        const nombreRol = rolesSolicitados[indice];

        db.query('SELECT id_rol FROM roles WHERE nombre_rol = ?', [nombreRol], (err, result) => {
            if (err) {
                callback(err);
                return;
            }

            if (!result || result.length === 0) {
                db.query(
                    'INSERT INTO roles (nombre_rol, descripcion) VALUES (?, ?)',
                    [nombreRol, 'Rol agregado automáticamente desde permisos seleccionados'],
                    (insertErr) => {
                        if (insertErr) {
                            callback(insertErr);
                            return;
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
};

// === CREAR USUARIO ===
router.post("/crear", (req, res) => {
    // CAMBIO: Ahora recibimos id_rol en lugar de rol (texto)
    const { nombre, correo, clave, id_rol, estado, permisos, foto_perfil, id_usuario_actual, nombre_usuario_actual } = req.body;
    const permisosSerializados = JSON.stringify(Array.isArray(permisos) ? permisos : []);

    db.query('SELECT * FROM usuarios WHERE correo = ?', [correo], (err, result) => {
        if (err) {
            console.log(err);
            registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'CREATE', 'Usuarios', `Error: ${err.message}`, '127.0.0.1', 'error');
            return res.status(500).send("Error interno del servidor");
        }

        if (result.length > 0) {
            registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'CREATE', 'Usuarios', `Intento de crear usuario con correo duplicado: ${correo}`, '127.0.0.1', 'advertencia');
            return res.status(400).send({ message: "El correo electrónico ya se encuentra registrado" });
        }

        sincronizarPermisosComoRoles(permisos, (syncErr) => {
            if (syncErr) {
                console.log(syncErr);
                registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'CREATE', 'Usuarios', `Error al sincronizar roles: ${syncErr.message}`, '127.0.0.1', 'error');
                return res.status(500).send("Error al registrar el usuario");
            }

            // CAMBIO: Insertamos id_rol en la columna correspondiente
            db.query(
                'INSERT INTO usuarios(nombre, correo, clave, id_rol, estado, permisos, foto_perfil) VALUES (?,?,?,?,?,?,?)',
                [nombre, correo, clave, id_rol, estado, permisosSerializados, foto_perfil || null],
                (insertErr, insertResult) => {
                    if (insertErr) {
                        console.log(insertErr);
                        registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'CREATE', 'Usuarios', `Error al insertar: ${insertErr.message}`, '127.0.0.1', 'error');
                        return res.status(500).send("Error al registrar el usuario");
                    } else {
                        registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'CREATE', 'Usuarios', `Usuario creado: ${nombre} (Correo: ${correo})`, '127.0.0.1', 'exitoso');
                        res.status(200).send("Usuario registrado con éxito!!!");
                    }
                }
            );
        });
    });
});

// === LISTAR USUARIOS (CON INNER JOIN) ===
router.get("/", (req, res) => {
    // CAMBIO: Traemos el nombre_rol desde la tabla roles para que el frontend lo use fácilmente
    const query = `
        SELECT u.id_usuario, u.nombre, u.correo, u.clave, u.id_rol, u.estado, u.permisos, u.foto_perfil, r.nombre_rol 
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
    `;
    db.query(query, (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error al obtener usuarios");
        } else {
            res.send(result);
        }
    });
});

// === ACTUALIZAR USUARIO ===
router.put("/actualizar", (req, res) => {
    // CAMBIO: Cambiamos rol por id_rol
    const { id_usuario, nombre, correo, clave, id_rol, estado, permisos, foto_perfil, id_usuario_actual, nombre_usuario_actual } = req.body;
    const permisosSerializados = JSON.stringify(Array.isArray(permisos) ? permisos : []);
    
    sincronizarPermisosComoRoles(permisos, (syncErr) => {
        if (syncErr) {
            console.log(syncErr);
            registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'UPDATE', 'Usuarios', `Error al sincronizar roles: ${syncErr.message}`, '127.0.0.1', 'error');
            return res.status(500).send("Error al actualizar");
        }

        db.query(
            'UPDATE usuarios SET nombre=?, correo=?, clave=?, id_rol=?, estado=?, permisos=?, foto_perfil=? WHERE id_usuario=?',
            [nombre, correo, clave, id_rol, estado, permisosSerializados, foto_perfil || null, id_usuario],
            (err, result) => {
                if (err) {
                    console.log(err);
                    registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'UPDATE', 'Usuarios', `Error al actualizar usuario ${id_usuario}: ${err.message}`, '127.0.0.1', 'error');
                    res.status(500).send("Error al actualizar");
                } else {
                    registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'UPDATE', 'Usuarios', `Usuario actualizado: ${nombre} (ID: ${id_usuario})`, '127.0.0.1', 'exitoso');
                    res.status(200).send("Usuario actualizado correctamente");
                }
            }
        );
    });
});

// === ELIMINAR USUARIO ===
router.delete("/delete/:id_usuario", (req, res) => {
    const { id_usuario } = req.params;
    const { id_usuario_actual, nombre_usuario_actual } = req.body || {};
    
    db.query('DELETE FROM usuarios WHERE id_usuario=?', [id_usuario], (err, result) => {
        if (err) {
            console.log(err);
            registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'DELETE', 'Usuarios', `Error al eliminar usuario ${id_usuario}: ${err.message}`, '127.0.0.1', 'error');
            res.status(500).send("Error al eliminar");
        } else {
            registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'DELETE', 'Usuarios', `Usuario eliminado (ID: ${id_usuario})`, '127.0.0.1', 'exitoso');
            res.status(200).send("Usuario eliminado correctamente"); 
        }
    });
});

module.exports = router;