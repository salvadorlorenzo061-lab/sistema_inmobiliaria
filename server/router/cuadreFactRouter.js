const express = require('express');
const db = require('../Conexion');

const router = express.Router();
router.use(express.json({ limit: '20mb' }));

db.query(`
    CREATE TABLE IF NOT EXISTS cuadre_fact_historial (
        id_cuadre BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        id_usuario_generador INT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        filtro_estado VARCHAR(20) NOT NULL DEFAULT 'todas',
        filtro_usuario INT NULL,
        reporte_json LONGTEXT NOT NULL,
        pdf_base64 LONGTEXT NOT NULL,
        fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cuadre_fact_fecha (fecha_generacion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`, (err) => {
    if (err) console.error('Error creando historial del cuadre de facturación:', err.message);
});

router.get('/reporte', (req, res) => {
    const inicio = String(req.query.fecha_inicio || '');
    const fin = String(req.query.fecha_fin || '');
    const estado = String(req.query.estado || 'todas').toLowerCase();
    const idUsuario = Number(req.query.id_usuario || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || inicio > fin) {
        return res.status(400).send({ message: 'Debe indicar un rango de fechas válido.' });
    }
    if (!['todas', 'emitida', 'anulada'].includes(estado)) {
        return res.status(400).send({ message: 'Estado de factura inválido.' });
    }

    const filtros = ['DATE(fh.fecha_evento) BETWEEN ? AND ?'];
    const params = [inicio, fin];
    if (estado !== 'todas') {
        filtros.push("UPPER(TRIM(fh.estado_factura)) = ?");
        params.push(estado.toUpperCase());
    } else {
        filtros.push("UPPER(TRIM(fh.estado_factura)) IN ('EMITIDA', 'ANULADA')");
    }
    if (idUsuario > 0) {
        filtros.push('COALESCE(fh.id_usuario, p_filtro.id_usuario) = ?');
        params.push(idUsuario);
    }

    // Estrategia compatible con ONLY_FULL_GROUP_BY: primero se consolida cada
    // factura en una tabla derivada (una fila por id_pago + estado), y luego se
    // une a pagos/usuarios (relacion 1:1) sin necesidad de agregar columnas del
    // JOIN. Asi se evita el error "Expression ... is not in GROUP BY clause".
    const sql = `
        SELECT
            doc.id_pago,
            doc.id_usuario,
            COALESCE(u.nombre, CONCAT('Usuario #', doc.id_usuario), 'Sin asignación') AS nombre_usuario,
            doc.estado_factura,
            doc.fecha_evento,
            COALESCE(NULLIF(doc.correlativo, ''), p.no_referencia, CONCAT('PAGO-', doc.id_pago)) AS correlativo,
            CASE WHEN doc.estado_factura = 'ANULADA' THEN 'ANULACION' ELSE COALESCE(p.forma_pago, 'N/A') END AS forma_pago,
            CASE WHEN doc.estado_factura = 'ANULADA'
                 THEN -COALESCE(NULLIF(p.monto_total_pagado, 0), doc.total_documento, 0)
                 ELSE COALESCE(NULLIF(p.monto_total_pagado, 0), doc.total_documento, 0)
            END AS total_cobrado
        FROM (
        
            SELECT
                fh.id_pago,
                COALESCE(MAX(fh.id_usuario), MAX(p_filtro.id_usuario)) AS id_usuario,
                UPPER(TRIM(MAX(fh.estado_factura))) AS estado_factura,
                MAX(fh.fecha_evento) AS fecha_evento,
                MAX(NULLIF(fh.correlativo, '')) AS correlativo,
                SUM(COALESCE(fh.subtotal, 0)) AS total_documento
            FROM facturas_historial fh
            LEFT JOIN pagos p_filtro ON p_filtro.id_pago = fh.id_pago
            WHERE ${filtros.join(' AND ')}
            GROUP BY fh.id_pago, UPPER(TRIM(fh.estado_factura))
        ) doc
        LEFT JOIN pagos p ON p.id_pago = doc.id_pago
        LEFT JOIN usuarios u ON u.id_usuario = doc.id_usuario
        WHERE COALESCE(NULLIF(doc.correlativo, ''), p.no_referencia, '') COLLATE utf8mb4_general_ci NOT LIKE 'TMP-%'
        ORDER BY doc.fecha_evento, doc.id_pago
    `;

    db.query(sql, params, (err, rows) => {
        if (err) {
            console.error('Error generando cuadre de facturación:', err.code, err.message);
            return res.status(500).send({
                message: 'No se pudo generar el cuadre de facturación.',
                detail: `${err.code || ''} ${err.message || ''}`.trim()
            });
        }
        const detalle = rows || [];
        const porUsuario = new Map();
        detalle.forEach((fila) => {
            const clave = Number(fila.id_usuario || 0);
            if (!porUsuario.has(clave)) porUsuario.set(clave, {
                id_usuario: clave, nombre_usuario: fila.nombre_usuario, emitidas: 0, anuladas: 0,
                total_emitido: 0, total_anulado: 0, neto: 0, correlativo_inicial: null, correlativo_final: null
            });
            const item = porUsuario.get(clave);
            if (fila.estado_factura === 'ANULADA') {
                item.anuladas += 1; item.total_anulado += Math.abs(Number(fila.total_cobrado || 0));
            } else {
                item.emitidas += 1; item.total_emitido += Number(fila.total_cobrado || 0);
            }
            item.neto += Number(fila.total_cobrado || 0);
            item.correlativo_inicial = item.correlativo_inicial || fila.correlativo;
            item.correlativo_final = fila.correlativo;
        });
        const resumen = Array.from(porUsuario.values()).map((item) => ({
            ...item,
            total_emitido: Number(item.total_emitido.toFixed(2)), total_anulado: Number(item.total_anulado.toFixed(2)), neto: Number(item.neto.toFixed(2))
        }));
        const totales = resumen.reduce((acc, item) => ({
            emitidas: acc.emitidas + item.emitidas, anuladas: acc.anuladas + item.anuladas,
            total_emitido: acc.total_emitido + item.total_emitido, total_anulado: acc.total_anulado + item.total_anulado,
            neto: acc.neto + item.neto
        }), { emitidas: 0, anuladas: 0, total_emitido: 0, total_anulado: 0, neto: 0 });
        return res.json({ fecha_inicio: inicio, fecha_fin: fin, resumen_usuarios: resumen, detalle, totales });
    });
});

router.get('/historial', (req, res) => {
    db.query(`SELECT h.id_cuadre, h.fecha_inicio, h.fecha_fin, h.filtro_estado, h.fecha_generacion,
                     COALESCE(u.nombre, 'Usuario no disponible') AS generado_por
              FROM cuadre_fact_historial h LEFT JOIN usuarios u ON u.id_usuario = h.id_usuario_generador
              ORDER BY h.fecha_generacion DESC, h.id_cuadre DESC LIMIT 100`, (err, rows) => {
        if (err) return res.status(500).send({ message: 'No se pudo consultar el historial.' });
        return res.json(rows || []);
    });
});

router.post('/historial', (req, res) => {
    const pdf = String(req.body.pdf_base64 || '').replace(/^data:application\/pdf;base64,/, '');
    if (!pdf || !req.body.reporte) return res.status(400).send({ message: 'El PDF y el reporte son obligatorios.' });
    db.query(`INSERT INTO cuadre_fact_historial
        (id_usuario_generador, fecha_inicio, fecha_fin, filtro_estado, filtro_usuario, reporte_json, pdf_base64)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [Number(req.body.id_usuario_generador) || null, req.body.fecha_inicio,
        req.body.fecha_fin, req.body.filtro_estado || 'todas', Number(req.body.filtro_usuario) || null,
        JSON.stringify(req.body.reporte), pdf], (err, result) => {
        if (err) return res.status(500).send({ message: 'No se pudo guardar el cuadre.' });
        return res.status(201).json({ id_cuadre: result.insertId });
    });
});

router.get('/historial/:id/pdf', (req, res) => {
    db.query('SELECT pdf_base64 FROM cuadre_fact_historial WHERE id_cuadre = ? LIMIT 1', [req.params.id], (err, rows) => {
        if (err) return res.status(500).send({ message: 'No se pudo recuperar el PDF.' });
        if (!rows?.[0]?.pdf_base64) return res.status(404).send({ message: 'PDF no disponible.' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="CuadreFacturacion_${req.params.id}.pdf"`);
        return res.send(Buffer.from(rows[0].pdf_base64, 'base64'));
    });
});

module.exports = router;
