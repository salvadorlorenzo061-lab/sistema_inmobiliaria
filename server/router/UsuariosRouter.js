const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const crypto = require('crypto');
const { promisify } = require('util');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

const scryptAsync = promisify(crypto.scrypt);
const HASH_PREFIX = 'scrypt';

const esClaveEncriptada = (clave = '') => String(clave).startsWith(`${HASH_PREFIX}$`);
const encriptarClave = async (clave) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scryptAsync(String(clave), salt, 64);
    return `${HASH_PREFIX}$${salt}$${hash.toString('hex')}`;
};
const verificarClave = async (clave, almacenada) => {
    if (!esClaveEncriptada(almacenada)) return String(clave) === String(almacenada);
    const [, salt, hashHex] = String(almacenada).split('$');
    if (!salt || !hashHex) return false;
    const hashIngresado = await scryptAsync(String(clave), salt, 64);
    const hashGuardado = Buffer.from(hashHex, 'hex');
    return hashGuardado.length === hashIngresado.length && crypto.timingSafeEqual(hashGuardado, hashIngresado);
};

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

// Los hashes scrypt necesitan más espacio que las claves antiguas.
db.query("ALTER TABLE usuarios MODIFY COLUMN clave VARCHAR(255) NOT NULL", (err) => {
    if (err) {
        console.error('No se pudo ampliar la columna clave:', err.message);
        return;
    }
    db.query('SELECT id_usuario, clave FROM usuarios', async (selectErr, usuarios) => {
        if (selectErr) return console.error('No se pudieron revisar las claves existentes:', selectErr.message);
        for (const usuario of (usuarios || [])) {
            if (!usuario.clave || esClaveEncriptada(usuario.clave)) continue;
            try {
                const hash = await encriptarClave(usuario.clave);
                db.query('UPDATE usuarios SET clave = ? WHERE id_usuario = ?', [hash, usuario.id_usuario]);
            } catch (hashErr) {
                console.error(`No se pudo proteger la clave del usuario ${usuario.id_usuario}:`, hashErr.message);
            }
        }
    });
});

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

    db.query(query, [correo], async (err, result) => {
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

        if (!(await verificarClave(clave, usuario.clave))) {
            return res.status(401).send({ message: 'Credenciales inválidas.' });
        }

        // Migración transparente: una clave histórica en texto plano se protege
        // después del primer inicio de sesión correcto.
        if (!esClaveEncriptada(usuario.clave)) {
            encriptarClave(clave)
                .then((hash) => db.query('UPDATE usuarios SET clave = ? WHERE id_usuario = ?', [hash, usuario.id_usuario]))
                .catch((hashErr) => console.error('No se pudo migrar la clave del usuario:', hashErr.message));
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
    // Los permisos son accesos a módulos, no roles. Se mantienen separados
    // para evitar crear registros duplicados en el catálogo de roles.
    callback(null);
};

// === CREAR USUARIO ===
router.post("/crear", async (req, res) => {
    // CAMBIO: Ahora recibimos id_rol en lugar de rol (texto)
    const { nombre, correo, clave, id_rol, estado, permisos, foto_perfil, id_usuario_actual, nombre_usuario_actual } = req.body;
    const permisosSerializados = JSON.stringify(Array.isArray(permisos) ? permisos : []);
    if (!String(clave || '').trim()) return res.status(400).send({ message: 'La clave es obligatoria.' });
    const claveProtegida = await encriptarClave(clave);

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
                [nombre, correo, claveProtegida, id_rol, estado, permisosSerializados, foto_perfil || null],
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
        SELECT u.id_usuario, u.nombre, u.correo, u.id_rol, u.estado, u.permisos, u.foto_perfil, r.nombre_rol,
               1 AS clave_protegida
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
router.put("/actualizar", async (req, res) => {
    // CAMBIO: Cambiamos rol por id_rol
    const { id_usuario, nombre, correo, clave, id_rol, estado, permisos, foto_perfil, id_usuario_actual, nombre_usuario_actual } = req.body;
    const permisosSerializados = JSON.stringify(Array.isArray(permisos) ? permisos : []);
    const claveProtegida = String(clave || '').trim() ? await encriptarClave(clave) : null;
    
    sincronizarPermisosComoRoles(permisos, (syncErr) => {
        if (syncErr) {
            console.log(syncErr);
            registrarAuditoria(id_usuario_actual, nombre_usuario_actual, 'UPDATE', 'Usuarios', `Error al sincronizar roles: ${syncErr.message}`, '127.0.0.1', 'error');
            return res.status(500).send("Error al actualizar");
        }

        const sqlActualizar = claveProtegida
            ? 'UPDATE usuarios SET nombre=?, correo=?, clave=?, id_rol=?, estado=?, permisos=?, foto_perfil=? WHERE id_usuario=?'
            : 'UPDATE usuarios SET nombre=?, correo=?, id_rol=?, estado=?, permisos=?, foto_perfil=? WHERE id_usuario=?';
        const paramsActualizar = claveProtegida
            ? [nombre, correo, claveProtegida, id_rol, estado, permisosSerializados, foto_perfil || null, id_usuario]
            : [nombre, correo, id_rol, estado, permisosSerializados, foto_perfil || null, id_usuario];
        db.query(
            sqlActualizar,
            paramsActualizar,
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
