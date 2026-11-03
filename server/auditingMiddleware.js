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

const decodificarEncabezado = (valor) => {
    try {
        return decodeURIComponent(String(valor || ''));
    } catch (error) {
        return String(valor || '');
    }
};

const NOMBRES_MODULO = {
    caja: 'Caja',
    anulacion_deuda: 'Anular Cobro',
    contratos_residentes: 'Contratos',
    residentes: 'Residentes',
    morosidad: 'Mora y Atrasos',
    convenio: 'Convenio de Pagos',
    pagos: 'Pagos',
    pagos_detalle: 'Detalle de Pagos',
    pagos_extraordinarios: 'Cobros Extra',
    usuarios: 'Usuarios',
    empresas: 'Empresas',
    proyectos: 'Proyectos',
    empresa_proyecto: 'Empresa-Proyecto',
    resoluciones_facturas: 'Resoluciones de Factura',
    asignar_correlativo: 'Asignar Correlativo',
    caja_ingresos: 'Caja Ingresos Manual',
    servicios: 'Servicios',
    roles: 'Roles',
    estado_cuenta: 'Estado de Cuenta',
    cuenta_estado: 'Tabla de Amortizacion',
    cuadre_fact: 'Cuadre de Facturacion'
};

const VERBOS = { POST: 'registró', PUT: 'actualizó', PATCH: 'actualizó', DELETE: 'eliminó' };

// Convierte una peticion HTTP en una frase entendible, ej.
// "Jorge anuló la factura con correlativo A-00000012".
const describirAccion = ({ method, url, body, respuesta, nombreUsuario, modulo, statusCode }) => {
    const quien = String(nombreUsuario || 'Un usuario desconocido').trim();
    const ruta = String(url || '').split('?')[0];
    const dato = (valor) => (valor === undefined || valor === null || valor === '' ? null : String(valor));
    const motivo = dato(body?.motivo);
    const conMotivo = motivo ? `. Motivo: ${motivo}` : '';
    const fallo = statusCode >= 400 ? ' (la operación no se completó)' : '';

    if (/\/caja\/procesar-pago/.test(ruta)) {
        const recibo = dato(respuesta?.numero_recibo);
        const contrato = dato(body?.id_contrato);
        return `${quien} registró un cobro${recibo ? ` con correlativo ${recibo}` : ''}${contrato ? ` del contrato #${contrato}` : ''}${fallo}`;
    }
    if (/\/anulacion_deuda\/anular-por-correlativo/.test(ruta)) {
        const correlativo = dato(body?.correlativo) || (dato(body?.id_pago) ? `del pago #${body.id_pago}` : '');
        return `${quien} anuló la factura con correlativo ${correlativo}${conMotivo}${fallo}`;
    }
    if (/\/caja\/exonerar-moras/.test(ruta)) {
        return `${quien} exoneró mora del contrato #${dato(body?.id_contrato) || '?'}${conMotivo}${fallo}`;
    }
    if (/\/caja\/restablecer-exoneracion/.test(ruta)) {
        return `${quien} restableció una mora exonerada del contrato #${dato(body?.id_contrato) || '?'}${fallo}`;
    }
    if (/\/contratos_residentes\/crear/.test(ruta)) {
        return `${quien} creó el contrato ${dato(body?.codigo_contrato) || ''} para el cliente #${dato(body?.id_residente) || '?'}${fallo}`.replace(/\s+/g, ' ');
    }
    if (/\/contratos_residentes\/actualizar/.test(ruta)) {
        return `${quien} actualizó el contrato ${dato(body?.codigo_contrato) || `#${dato(body?.id_contrato) || '?'}`}${fallo}`;
    }
    if (/\/contratos_residentes\/delete\//.test(ruta)) {
        return `${quien} eliminó el contrato #${ruta.split('/').pop()}${fallo}`;
    }
    if (/\/contratos_residentes\/subir-word/.test(ruta)) {
        return `${quien} subió el documento del contrato #${ruta.split('/').pop()}${fallo}`;
    }
    if (/\/contratos_residentes\/subir-finiquito/.test(ruta)) {
        return `${quien} subió el finiquito del contrato #${ruta.split('/').pop()}${fallo}`;
    }
    if (/\/morosidad\/actualizar-estado/.test(ruta)) {
        return `${quien} actualizó el estado de una mora${dato(body?.estado) ? ` a ${body.estado}` : ''}${conMotivo}${fallo}`;
    }
    if (/\/morosidad\/generar-automatico/.test(ruta)) {
        return `${quien} generó la mora automática${fallo}`;
    }
    if (/\/convenio/.test(ruta)) {
        return `${quien} ${VERBOS[method] || 'modificó'} un convenio de pagos${fallo}`;
    }
    if (/\/usuarios\/login/.test(ruta)) {
        return `${dato(body?.correo) || quien} inició sesión${fallo}`;
    }

    const nombreModulo = NOMBRES_MODULO[modulo] || modulo;
    return `${quien} ${VERBOS[method] || 'modificó'} información en el módulo ${nombreModulo}${fallo}`;
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

    // Se conserva la respuesta JSON para poder citar datos generados por el servidor (ej. correlativo).
    let respuestaJson = null;
    const jsonOriginal = res.json.bind(res);
    res.json = (payload) => {
        respuestaJson = payload;
        return jsonOriginal(payload);
    };

    res.on('finish', () => {
        try {
            const statusCode = res.statusCode || 0;
            const estado = statusCode >= 400 ? 'fallido' : 'exitoso';
            const idUsuario = normalizarIdUsuario(req.body?.id_usuario || req.headers['x-user-id']);
            const nombreUsuario = req.body?.nombre_usuario
                || decodificarEncabezado(req.headers['x-user-name'])
                || 'DESCONOCIDO';
            const ip = obtenerIP(req);

            const basePath = (req.baseUrl || '').replace('/api/', '') || 'sistema';
            const accion = method;
            const descripcion = describirAccion({
                method,
                url: req.originalUrl,
                body: req.body,
                respuesta: respuestaJson,
                nombreUsuario,
                modulo: basePath,
                statusCode
            }).slice(0, 250);

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
