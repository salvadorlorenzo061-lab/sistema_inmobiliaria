const db = require('./Conexion');

const normalizarEstadoAuditoria = (estado = 'exitoso') => {
    const valor = String(estado || '').toLowerCase();
    if (['fallido', 'error', 'advertencia', 'warning', 'failed'].includes(valor)) {
        return 'fallido';
    }
    return 'exitoso';
};

const normalizarIdUsuario = (idUsuario) => {
    const id = Number(idUsuario);
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }
    return id;
};

/**
 * Registra una acción en la Bitácora del sistema
 * @param {number} id_usuario - ID del usuario (puede ser null si es anónimo)
 * @param {string} nombre_usuario - Nombre del usuario
 * @param {string} accion - Acción realizada (CREATE, UPDATE, DELETE, READ, etc.)
 * @param {string} modulo - Módulo/tabla afectada (Empresas, Usuarios, Pagos, etc.)
 * @param {string} descripcion - Descripción detallada de la acción
 * @param {string} ip_direccion - IP del cliente
 * @param {string} estado - Estado (éxitoso, advertencia, error)
 */
const registrarAuditoria = (id_usuario, nombre_usuario, accion, modulo, descripcion, ip_direccion, estado = 'exitoso') => {
    try {
        const ahora = new Date();
        const fechaHora = ahora.toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:mm:ss
        const fecha = ahora.toISOString().slice(0, 10); // YYYY-MM-DD
        const nombreUsuarioSeguro = nombre_usuario || 'DESCONOCIDO';
        const idUsuarioSeguro = normalizarIdUsuario(id_usuario);

        const query = `
            INSERT INTO bitacora 
            (id_usuario, nombre_usuario, usuario_nombre, accion, descripcion, ip_direccion, fecha_hora, estado, fecha_registro) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const insertarBitacora = (idParaInsertar) => {
            db.query(
                query,
                [
                    idParaInsertar,
                    nombreUsuarioSeguro,
                    nombreUsuarioSeguro,
                    accion,
                    descripcion,
                    ip_direccion || '0.0.0.0',
                    fechaHora,
                    normalizarEstadoAuditoria(estado),
                    fecha
                ],
                (err) => {
                    if (err) {
                        if (err.code === 'ER_NO_REFERENCED_ROW_2' && idParaInsertar !== null) {
                            return insertarBitacora(null);
                        }
                        console.error('❌ ERROR AL REGISTRAR AUDITORÍA:', err);
                    } else {
                        console.log(`✅ AUDITORÍA REGISTRADA: ${accion} - ${modulo}`);
                    }
                }
            );
        };

        insertarBitacora(idUsuarioSeguro);
    } catch (error) {
        console.error('❌ ERROR EN registrarAuditoria():', error);
    }
};

/**
 * Middleware global para registrar automáticamente acciones HTTP mutables.
 * Registra POST/PUT/PATCH/DELETE al finalizar la respuesta.
 */
const auditRequestMiddleware = (req, res, next) => {
    const method = (req.method || '').toUpperCase();
    const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!shouldAudit) {
        return next();
    }

    // Evitar ruido por auto-registro del propio módulo de bitácora.
    if ((req.originalUrl || '').startsWith('/api/bitacora')) {
        return next();
    }

    const startedAt = Date.now();

    res.on('finish', () => {
        try {
            const statusCode = res.statusCode || 0;
            const estado = statusCode >= 400 ? 'fallido' : 'exitoso';
            const idUsuario = normalizarIdUsuario(req.body?.id_usuario || req.headers['x-user-id']);
            const nombreUsuario = req.body?.nombre_usuario || req.headers['x-user-name'] || 'DESCONOCIDO';
            const ip = obtenerIP(req);

            const basePath = (req.baseUrl || '').replace('/api/', '') || 'sistema';
            const accion = method;
            const duracionMs = Date.now() - startedAt;
            const descripcion = `Ruta: ${req.originalUrl} | Modulo: ${basePath} | Estado HTTP: ${statusCode} | Duracion: ${duracionMs}ms`;

            registrarAuditoria(idUsuario, nombreUsuario, accion, basePath, descripcion, ip, estado);
        } catch (auditErr) {
            console.error('❌ ERROR EN auditRequestMiddleware:', auditErr);
        }
    });

    next();
};

/**
 * Middleware Express para extraer IP del cliente
 */
const obtenerIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           req.ip || 
           '127.0.0.1';
};

module.exports = {
    registrarAuditoria,
    obtenerIP,
    auditRequestMiddleware
};
