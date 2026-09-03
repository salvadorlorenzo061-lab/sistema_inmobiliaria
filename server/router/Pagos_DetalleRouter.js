const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');
router.use(cors());
router.use(express.json());

const ensureFacturasHistorialTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS facturas_historial (
            id_historial BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_pago INT NULL,
            id_pago_detalle INT NULL,
            id_contrato INT NULL,
            id_residente INT NULL,
            id_usuario INT NULL,
            rol_usuario_emisor VARCHAR(80) NULL,
            correlativo VARCHAR(80) NULL,
            estado_factura VARCHAR(20) NOT NULL DEFAULT 'EMITIDA',
            tipo_concepto VARCHAR(60) NULL,
            id_concepto_servicio INT NULL,
            nombre_concepto VARCHAR(255) NULL,
            mes_pagado VARCHAR(80) NULL,
            numero_cuota_afectada INT NULL,
            subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
            fecha_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            evidencia_json LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_historial_pago (id_pago),
            INDEX idx_historial_estado (estado_factura),
            INDEX idx_historial_correlativo (correlativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(sql, (err) => {
        if (err) {
            console.error('Error asegurando tabla facturas_historial en pagos_detalle:', err.message);
        }
    });
};

const ensureFacturasHistorialRolColumn = () => {
    db.query("SHOW COLUMNS FROM facturas_historial LIKE 'rol_usuario_emisor'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna rol_usuario_emisor en facturas_historial (detalle):', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE facturas_historial ADD COLUMN rol_usuario_emisor VARCHAR(80) NULL AFTER id_usuario', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna rol_usuario_emisor en facturas_historial (detalle):', alterErr.message);
                }
            });
        }
    });
};

ensureFacturasHistorialTable();
ensureFacturasHistorialRolColumn();

router.get('/reporte-facturas', (req, res) => {
    const criterio = String(req.query?.criterio || '').trim();
    const fechaInicio = String(req.query?.fecha_inicio || '').trim();
    const fechaFin = String(req.query?.fecha_fin || '').trim();
    const estado = String(req.query?.estado || 'TODAS').trim().toUpperCase();
    const params = [];
    const whereClauses = ['fh.id_pago IS NOT NULL'];

    if (fechaInicio) {
        whereClauses.push('DATE(fh.fecha_evento) >= ?');
        params.push(fechaInicio);
    }

    if (fechaFin) {
        whereClauses.push('DATE(fh.fecha_evento) <= ?');
        params.push(fechaFin);
    }

    if (estado && estado !== 'TODAS') {
        whereClauses.push('UPPER(fh.estado_factura) = ?');
        params.push(estado);
    }

    if (criterio) {
        const filtro = `%${criterio}%`;
        whereClauses.push(`(
            CAST(fh.id_pago AS CHAR) LIKE ?
            OR CAST(fh.id_residente AS CHAR) LIKE ?
            OR CAST(fh.id_contrato AS CHAR) LIKE ?
            OR COALESCE(fh.correlativo, '') LIKE ?
            OR COALESCE(r.nombre, '') LIKE ?
            OR COALESCE(r.numero_identificacion, '') LIKE ?
            OR COALESCE(r.dpi, '') LIKE ?
            OR COALESCE(c.codigo_contrato, '') LIKE ?
        )`);
        params.push(filtro, filtro, filtro, filtro, filtro, filtro, filtro, filtro);
    }

    const query = `
        SELECT
            fh.id_pago,
            fh.estado_factura,
            MAX(fh.correlativo) AS correlativo,
            MIN(fh.fecha_evento) AS fecha_evento,
            fh.id_residente,
            fh.id_contrato,
            r.nombre AS nombre_residente,
            r.numero_identificacion,
            r.dpi,
            c.codigo_contrato,
            GROUP_CONCAT(DISTINCT NULLIF(TRIM(fh.mes_pagado), '') ORDER BY fh.numero_cuota_afectada ASC SEPARATOR ', ') AS meses_pagados,
            MIN(CASE WHEN fh.numero_cuota_afectada > 0 THEN fh.numero_cuota_afectada END) AS cuota_inicio,
            MAX(CASE WHEN fh.numero_cuota_afectada > 0 THEN fh.numero_cuota_afectada END) AS cuota_fin,
            SUM(fh.subtotal) AS total_documento
        FROM facturas_historial fh
        LEFT JOIN residentes r ON r.id_residente = fh.id_residente
        LEFT JOIN contratos_residentes c ON c.id_contrato = fh.id_contrato
        WHERE ${whereClauses.join(' AND ')}
        GROUP BY
            fh.id_pago, fh.estado_factura, fh.id_residente, fh.id_contrato,
            r.nombre, r.numero_identificacion, r.dpi, c.codigo_contrato
        ORDER BY COALESCE(MIN(CASE WHEN fh.numero_cuota_afectada >= 0 THEN fh.numero_cuota_afectada END), 0) ASC,
            MIN(fh.fecha_evento) ASC, fh.id_pago ASC,
            CASE WHEN fh.estado_factura = 'EMITIDA' THEN 0 ELSE 1 END ASC
        LIMIT 500
    `;

    db.query(query, params, (err, rows) => {
        if (err) {
            console.error('Error al obtener reportería de facturas:', err.message);
            console.error('SQL report:', query);
            return res.status(500).send({ message: 'No se pudo obtener la reportería de facturas.' });
        }
        return res.status(200).json(rows || []);
    });
});

router.get("/", (req, res) => {
    const query = `
        SELECT
            fh.id_historial AS id_pago_detalle,
            fh.id_pago,
            fh.tipo_concepto,
            fh.id_concepto_servicio,
            fh.nombre_concepto,
            fh.mes_pagado,
            fh.numero_cuota_afectada,
            fh.subtotal,
            fh.correlativo,
            fh.fecha_evento,
            fh.estado_factura,
            fh.id_usuario,
            fh.rol_usuario_emisor,
            u.nombre AS usuario_cobro,
            COALESCE(fh.rol_usuario_emisor, rc.nombre_rol) AS rol_usuario_cobro,
            CASE
                WHEN fh.estado_factura = 'ANULADA' THEN 'Documento anulado (evidencia historica)'
                ELSE NULL
            END AS motivo_anulacion
        FROM facturas_historial fh
        LEFT JOIN usuarios u ON u.id_usuario = fh.id_usuario
        LEFT JOIN roles rc ON rc.id_rol = u.id_rol
        ORDER BY fh.id_historial DESC
    `;

    db.query(query, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error de carga");
        }
        return res.send(rows || []);
    });
});

router.get('/documento/:id_pago', (req, res) => {
    const idPago = Number(req.params.id_pago || 0);
    const estadoSolicitado = String(req.query?.estado_factura || '').trim().toUpperCase();
    if (!Number.isInteger(idPago) || idPago <= 0) {
        return res.status(400).send({ message: 'ID de pago invalido.' });
    }

    const query = `
        SELECT
            fh.id_historial,
            fh.id_pago,
            fh.id_contrato,
            fh.id_residente,
            fh.id_usuario,
            fh.correlativo,
            fh.estado_factura,
            fh.tipo_concepto,
            fh.id_concepto_servicio,
            fh.nombre_concepto,
            fh.mes_pagado,
            fh.numero_cuota_afectada,
            fh.subtotal,
            fh.fecha_evento,
            fh.evidencia_json,
            fh.rol_usuario_emisor,
            u.nombre AS usuario_cobro,
            rc.nombre_rol AS rol_usuario_cobro,
            r.nombre AS nombre_residente,
            r.numero_identificacion,
            r.dpi,
            r.nit,
            r.direccion_notificacion,
            c.codigo_contrato,
            c.enganche AS enganche_contrato,
            tc.nombre_tipo_contrato AS nombre_contrato,
            p.forma_pago,
            p.no_referencia,
            p.fecha_pago,
            COALESCE(ep.logo, em.logo, er.logo) AS logo_proyecto,
            COALESCE(pr.nombre, ep.nombre_empresa, em.nombre_empresa, er.nombre_empresa) AS nombre_proyecto,
            COALESCE(em.nombre_empresa, er.nombre_empresa, ep.nombre_empresa, 'Inmobiliaria') AS nombre_empresa,
            COALESCE(em.logo, er.logo, ep.logo) AS logo_empresa,
            COALESCE(em.nit, ep.nit, er.nit, 'N/A') AS nit_empresa,
            COALESCE(em.pais, ep.pais, er.pais, 'Guatemala') AS pais_empresa,
            COALESCE(em.moneda, ep.moneda, er.moneda, 'GTQ') AS moneda_empresa
        FROM facturas_historial fh
        LEFT JOIN usuarios u ON u.id_usuario = fh.id_usuario
        LEFT JOIN roles rc ON rc.id_rol = u.id_rol
        LEFT JOIN residentes r ON r.id_residente = fh.id_residente
        LEFT JOIN contratos_residentes c ON c.id_contrato = fh.id_contrato
        LEFT JOIN tipos_contrato tc ON tc.id_tipo_contrato = c.id_tipo_contrato
        LEFT JOIN proyecto pr ON pr.id_proyecto = c.id_proyecto
        LEFT JOIN empresas em ON em.id_empresa = c.id_empresa_marca
        LEFT JOIN empresas ep ON ep.id_empresa = pr.id_empresa
        LEFT JOIN empresas er ON er.id_empresa = r.id_empresa
        LEFT JOIN pagos p ON p.id_pago = fh.id_pago
        WHERE fh.id_pago = ?
        ORDER BY fh.id_historial ASC
    `;

    db.query(query, [idPago], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: 'Error al obtener documento historico.' });
        }

        if (!rows || !rows.length) {
            return res.status(404).send({ message: 'No existe evidencia historica para ese pago.' });
        }

        const rowsSeleccionadas = estadoSolicitado
            ? rows.filter((row) => String(row.estado_factura || '').toUpperCase() === estadoSolicitado)
            : rows;

        const detallesBase = rowsSeleccionadas.length ? rowsSeleccionadas : rows;
        const base = detallesBase[0];

        let evidenciaCabecera = {};
        let evidenciaEmitidaCabecera = {};
        try {
            evidenciaCabecera = JSON.parse(base.evidencia_json || '{}');
        } catch {
            evidenciaCabecera = {};
        }

        const baseEmitida = rows.find((row) => String(row.estado_factura || '').toUpperCase() === 'EMITIDA');
        if (baseEmitida?.evidencia_json) {
            try {
                evidenciaEmitidaCabecera = JSON.parse(baseEmitida.evidencia_json || '{}');
            } catch {
                evidenciaEmitidaCabecera = {};
            }
        }

        const estadoDocumento = estadoSolicitado
            || (rows.some((row) => String(row.estado_factura || '').toUpperCase() === 'ANULADA')
                ? 'ANULADA'
                : 'EMITIDA');

        const detalles = detallesBase.map((item) => {
            let evidenciaDetalle = {};
            try {
                evidenciaDetalle = JSON.parse(item.evidencia_json || '{}');
            } catch {
                evidenciaDetalle = {};
            }

            return {
                tipo_concepto: item.tipo_concepto,
                id_concepto_servicio: item.id_concepto_servicio,
                nombre_concepto: item.nombre_concepto || evidenciaDetalle?.detalle?.nombre_concepto || item.tipo_concepto,
                mes_pagado: item.mes_pagado || evidenciaDetalle?.detalle?.mes_pagado || '',
                numero_cuota_afectada: item.numero_cuota_afectada,
                subtotal: Number(item.subtotal || 0)
            };
        });

        const existeDetalleMora = detalles.some((d) => String(d?.tipo_concepto || '').toLowerCase() === 'mora');
        const montoMoraCabecera = detalles
            .filter((d) => String(d?.tipo_concepto || '').toLowerCase() === 'mora')
            .reduce((acc, item) => acc + Number(item?.subtotal || 0), 0);
        if (!existeDetalleMora && montoMoraCabecera > 0) {
            detalles.push({
                tipo_concepto: 'mora',
                id_concepto_servicio: null,
                nombre_concepto: 'Mora',
                mes_pagado: '',
                numero_cuota_afectada: null,
                subtotal: montoMoraCabecera
            });
        }

        return res.status(200).send({
            id_pago: base.id_pago,
            correlativo: base.correlativo || base.no_referencia || evidenciaCabecera?.no_referencia || `REC-${base.id_pago}`,
            estado_factura: estadoDocumento,
            fecha_evento: base.fecha_evento || base.fecha_pago || null,
            metodo_pago: base.forma_pago || evidenciaCabecera?.metodo_pago || evidenciaEmitidaCabecera?.metodo_pago || 'N/A',
            banco_pago: evidenciaCabecera?.banco_pago || evidenciaEmitidaCabecera?.banco_pago || null,
            fecha_operacion: evidenciaCabecera?.fecha_operacion || evidenciaEmitidaCabecera?.fecha_operacion || null,
            boleta_referencia: evidenciaCabecera?.boleta_referencia || evidenciaEmitidaCabecera?.boleta_referencia || null,
            usuario_cobro: base.usuario_cobro || `Usuario #${base.id_usuario || 'N/A'}`,
            rol_usuario_cobro: base.rol_usuario_emisor || evidenciaCabecera?.rol_usuario_emisor || base.rol_usuario_cobro || null,
            monto_mora: montoMoraCabecera,
            cliente: {
                nombre_residente: base.nombre_residente || 'N/A',
                numero_identificacion: base.numero_identificacion || 'N/A',
                dpi: base.dpi || 'N/A',
                nit: base.nit || 'CF',
                direccion_notificacion: base.direccion_notificacion || 'N/A'
            },
            contrato: {
                codigo_contrato: base.codigo_contrato || 'N/A',
                nombre_contrato: base.nombre_contrato || 'N/A',
                enganche: Number(base.enganche_contrato || 0)
            },
            empresa: {
                nombre_empresa: base.nombre_empresa || 'Inmobiliaria',
                logo_empresa: base.logo_empresa || null,
                logo_proyecto: base.logo_proyecto || null,
                nombre_proyecto: base.nombre_proyecto || null,
                nit_empresa: base.nit_empresa || 'N/A',
                pais: base.pais_empresa || 'Guatemala',
                moneda: base.moneda_empresa || 'GTQ'
            },
            detalles
        });
    });
});

router.post("/crear", (req, res) => {
    return res.status(403).send({ message: 'El detalle de facturas es historico e inmutable. No se permite crear registros manuales.' });
});

router.put("/actualizar", (req, res) => {
    return res.status(403).send({ message: 'El detalle de facturas es historico e inmutable. No se permite editar registros.' });
});

router.delete("/delete/:id_pago_detalle", (req, res) => {
    return res.status(403).send({ message: 'El detalle de facturas es historico e inmutable. No se permite eliminar registros.' });
});

module.exports = router;