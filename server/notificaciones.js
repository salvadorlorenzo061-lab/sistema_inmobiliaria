const nodemailer = require('nodemailer');
const cron = require('node-cron');
const db = require('./Conexion');

// Configuracion por variables de entorno (nada de credenciales en el codigo):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ('true' para puerto 465)
//   MAIL_FROM (ej. "Inmobiliaria <no-reply@midominio.com>")
//   NOTIFICACIONES_ACTIVAS ('true' para enviar; por defecto desactivado)
//   NOTIFICACIONES_CRON (opcional, por defecto '0 8 * * *'), NOTIFICACIONES_TZ (por defecto America/Guatemala)
const activo = () => String(process.env.NOTIFICACIONES_ACTIVAS || '').toLowerCase() === 'true';
const smtpConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporte = null;
const obtenerTransporte = () => {
    if (transporte) return transporte;
    const puerto = Number(process.env.SMTP_PORT || 587);
    transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: puerto,
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || puerto === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    return transporte;
};

const consulta = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const dinero = (valor) => `Q ${Number(valor || 0).toFixed(2)}`;
const correoValido = (correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim());

let tablaLista = null;
const asegurarTablaLog = () => {
    if (!tablaLista) {
        tablaLista = consulta(`
            CREATE TABLE IF NOT EXISTS notificaciones_log (
                id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
                tipo VARCHAR(30) NOT NULL,
                id_residente INT NULL,
                referencia VARCHAR(120) NOT NULL,
                canal VARCHAR(20) NOT NULL DEFAULT 'correo',
                destino VARCHAR(190) NULL,
                estado VARCHAR(20) NOT NULL,
                error VARCHAR(500) NULL,
                fecha_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_notificacion (tipo, id_residente, referencia, canal)
            )
        `).catch((error) => {
            tablaLista = null;
            throw error;
        });
    }
    return tablaLista;
};

// Envia un correo una sola vez por (tipo, residente, referencia). Nunca lanza
// excepciones: un fallo de correo no debe afectar cobros ni facturas.
const enviarUnaVez = async ({ tipo, residente, referencia, asunto, html }) => {
    try {
        if (!activo()) return { enviado: false, motivo: 'notificaciones desactivadas' };
        if (!smtpConfigurado()) return { enviado: false, motivo: 'SMTP sin configurar' };

        const correo = String(residente?.correo || '').trim();
        const idResidente = residente?.id_residente || null;
        if (!correoValido(correo)) return { enviado: false, motivo: 'cliente sin correo valido' };

        await asegurarTablaLog();
        const ref = String(referencia).slice(0, 120);
        const reserva = await consulta(
            'INSERT IGNORE INTO notificaciones_log (tipo, id_residente, referencia, canal, destino, estado) VALUES (?, ?, ?, ?, ?, ?)',
            [tipo, idResidente, ref, 'correo', correo, 'PENDIENTE']
        );
        if (!reserva.affectedRows) return { enviado: false, motivo: 'ya notificado' };

        try {
            await obtenerTransporte().sendMail({
                from: process.env.MAIL_FROM || process.env.SMTP_USER,
                to: correo,
                subject: asunto,
                html
            });
            await consulta(
                'UPDATE notificaciones_log SET estado = ? WHERE id_residente <=> ? AND tipo = ? AND referencia = ? AND canal = ?',
                ['ENVIADO', idResidente, tipo, ref, 'correo']
            );
            return { enviado: true };
        } catch (errorEnvio) {
            // Se libera la reserva para reintentar en la siguiente corrida.
            await consulta(
                'DELETE FROM notificaciones_log WHERE id_residente <=> ? AND tipo = ? AND referencia = ? AND canal = ?',
                [idResidente, tipo, ref, 'correo']
            ).catch(() => {});
            console.error(`[notificaciones] Error enviando ${tipo} a ${correo}:`, errorEnvio.message);
            return { enviado: false, motivo: errorEnvio.message };
        }
    } catch (error) {
        console.error('[notificaciones] Error inesperado:', error.message);
        return { enviado: false, motivo: error.message };
    }
};

const plantilla = (titulo, cuerpo) => `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:#1d4ed8;color:#fff;padding:16px 20px"><h2 style="margin:0">${escapar(titulo)}</h2></div>
        <div style="padding:20px;color:#111827;line-height:1.5">${cuerpo}</div>
        <div style="background:#f3f4f6;color:#6b7280;padding:10px 20px;font-size:12px">Mensaje automatico, por favor no responder.</div>
    </div>`;

const notificarCumpleanios = async () => {
    const hoy = new Date();
    const residentes = await consulta(
        `SELECT id_residente, nombre, correo FROM residentes
         WHERE MONTH(fecha_nacimiento) = ? AND DAY(fecha_nacimiento) = ? AND estado = 'activo'`,
        [hoy.getMonth() + 1, hoy.getDate()]
    );
    let enviados = 0;
    for (const residente of residentes) {
        const resultado = await enviarUnaVez({
            tipo: 'CUMPLEANIOS',
            residente,
            referencia: String(hoy.getFullYear()),
            asunto: '¡Feliz Cumpleaños! 🎂🎉',
            html: plantilla('¡Feliz Cumpleaños!', `<p>Estimado(a) <strong>${escapar(residente.nombre)}</strong>,</p><p>Todo el equipo le desea un feliz cumpleaños y un excelente año. ¡Gracias por confiar en nosotros!</p>`)
        });
        if (resultado.enviado) enviados += 1;
    }
    return enviados;
};

const notificarPagosPendientes = async () => {
    const filas = await consulta(`
        SELECT m.id_contrato, m.mes_atrasado, m.monto_deuda_original, m.monto_mora,
               r.id_residente, r.nombre, r.correo, c.codigo_contrato
        FROM morosidad m
        INNER JOIN (
            SELECT id_contrato, mes_atrasado, MAX(id_morosidad) AS ultimo
            FROM morosidad GROUP BY id_contrato, mes_atrasado
        ) u ON u.ultimo = m.id_morosidad
        INNER JOIN contratos_residentes c ON c.id_contrato = m.id_contrato
        INNER JOIN residentes r ON r.id_residente = c.id_residente
        WHERE m.estado = 'pendiente' AND r.estado = 'activo'
    `);

    // Un solo aviso por contrato y dia, con todas las cuotas pendientes.
    const porContrato = new Map();
    filas.forEach((fila) => {
        if (!porContrato.has(fila.id_contrato)) porContrato.set(fila.id_contrato, { cliente: fila, meses: [] });
        porContrato.get(fila.id_contrato).meses.push(fila);
    });

    const dia = new Date().toISOString().slice(0, 10);
    let enviados = 0;
    for (const { cliente, meses } of porContrato.values()) {
        const total = meses.reduce((s, m) => s + Number(m.monto_deuda_original || 0) + Number(m.monto_mora || 0), 0);
        const lista = meses.map((m) => `<li>${escapar(m.mes_atrasado)}: ${dinero(Number(m.monto_deuda_original || 0) + Number(m.monto_mora || 0))}</li>`).join('');
        const resultado = await enviarUnaVez({
            tipo: 'PAGO_PENDIENTE',
            residente: cliente,
            referencia: `${cliente.id_contrato}:${dia}`,
            asunto: 'Recordatorio de pago pendiente',
            html: plantilla('Pago pendiente', `<p>Estimado(a) <strong>${escapar(cliente.nombre)}</strong>,</p><p>Nuestros registros muestran pagos pendientes del contrato <strong>${escapar(cliente.codigo_contrato)}</strong>:</p><ul>${lista}</ul><p><strong>Total pendiente: ${dinero(total)}</strong></p><p>Le invitamos a regularizar su cuenta a la brevedad.</p>`)
        });
        if (resultado.enviado) enviados += 1;
    }
    return enviados;
};

// Se invoca sin await desde Caja despues de confirmar el cobro.
const notificarFacturaEmitida = async ({ idContrato, correlativo, total }) => {
    try {
        if (!activo() || !correlativo || !idContrato) return;
        const filas = await consulta(
            `SELECT r.id_residente, r.nombre, r.correo, c.codigo_contrato
             FROM contratos_residentes c INNER JOIN residentes r ON r.id_residente = c.id_residente
             WHERE c.id_contrato = ? LIMIT 1`,
            [idContrato]
        );
        const cliente = filas[0];
        if (!cliente) return;
        await enviarUnaVez({
            tipo: 'FACTURA_EMITIDA',
            residente: cliente,
            referencia: String(correlativo),
            asunto: `Factura emitida ${correlativo}`,
            html: plantilla('Factura emitida', `<p>Estimado(a) <strong>${escapar(cliente.nombre)}</strong>,</p><p>Le informamos que se emitio la factura <strong>${escapar(correlativo)}</strong> por <strong>${dinero(total)}</strong> correspondiente al contrato <strong>${escapar(cliente.codigo_contrato)}</strong>.</p><p>Gracias por su pago.</p>`)
        });
    } catch (error) {
        console.error('[notificaciones] Factura emitida:', error.message);
    }
};

const ejecutarTareasDiarias = async () => {
    if (!activo()) return;
    try {
        const cumples = await notificarCumpleanios();
        const pendientes = await notificarPagosPendientes();
        console.log(`[notificaciones] Cumpleaños enviados: ${cumples}, avisos de pago pendiente: ${pendientes}`);
    } catch (error) {
        console.error('[notificaciones] Error en tareas diarias:', error.message);
    }
};

if (activo()) {
    cron.schedule(process.env.NOTIFICACIONES_CRON || '0 8 * * *', ejecutarTareasDiarias, {
        timezone: process.env.NOTIFICACIONES_TZ || 'America/Guatemala'
    });
    console.log(`[notificaciones] Activas. SMTP ${smtpConfigurado() ? 'configurado' : 'SIN configurar'}.`);
} else {
    console.log('[notificaciones] Desactivadas (NOTIFICACIONES_ACTIVAS != true).');
}

module.exports = { notificarFacturaEmitida, notificarCumpleanios, notificarPagosPendientes, ejecutarTareasDiarias };
