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

ensureFacturasHistorialTable();

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
            u.nombre AS usuario_cobro,
            CASE
                WHEN fh.estado_factura = 'ANULADA' THEN 'Documento anulado (evidencia historica)'
                ELSE NULL
            END AS motivo_anulacion
        FROM facturas_historial fh
        LEFT JOIN usuarios u ON u.id_usuario = fh.id_usuario
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
            u.nombre AS usuario_cobro,
            r.nombre AS nombre_residente,
            r.numero_identificacion,
            r.dpi,
            r.nit,
            r.direccion_notificacion,
            c.codigo_contrato,
            tc.nombre_tipo_contrato AS nombre_contrato,
            p.forma_pago,
            p.no_referencia,
            p.fecha_pago,
            COALESCE(em.nombre_empresa, er.nombre_empresa, ep.nombre_empresa, 'Inmobiliaria') AS nombre_empresa,
            COALESCE(em.logo, er.logo, ep.logo) AS logo_empresa,
            COALESCE(em.nit, ep.nit, er.nit, 'N/A') AS nit_empresa,
            COALESCE(em.pais, ep.pais, er.pais, 'Guatemala') AS pais_empresa,
            COALESCE(em.moneda, ep.moneda, er.moneda, 'GTQ') AS moneda_empresa
        FROM facturas_historial fh
        LEFT JOIN usuarios u ON u.id_usuario = fh.id_usuario
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

        const emitidas = rows.filter((row) => String(row.estado_factura || '').toUpperCase() === 'EMITIDA');
        const detallesBase = emitidas.length ? emitidas : rows;
        const base = detallesBase[0];

        let evidenciaCabecera = {};
        try {
            evidenciaCabecera = JSON.parse(base.evidencia_json || '{}');
        } catch {
            evidenciaCabecera = {};
        }

        const estadoDocumento = rows.some((row) => String(row.estado_factura || '').toUpperCase() === 'ANULADA')
            ? 'ANULADA'
            : 'EMITIDA';

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

        return res.status(200).send({
            id_pago: base.id_pago,
            correlativo: base.correlativo || base.no_referencia || evidenciaCabecera?.no_referencia || `REC-${base.id_pago}`,
            estado_factura: estadoDocumento,
            fecha_evento: base.fecha_evento || base.fecha_pago || null,
            metodo_pago: base.forma_pago || evidenciaCabecera?.metodo_pago || 'N/A',
            usuario_cobro: base.usuario_cobro || `Usuario #${base.id_usuario || 'N/A'}`,
            cliente: {
                nombre_residente: base.nombre_residente || 'N/A',
                numero_identificacion: base.numero_identificacion || 'N/A',
                dpi: base.dpi || 'N/A',
                nit: base.nit || 'CF',
                direccion_notificacion: base.direccion_notificacion || 'N/A'
            },
            contrato: {
                codigo_contrato: base.codigo_contrato || 'N/A',
                nombre_contrato: base.nombre_contrato || 'N/A'
            },
            empresa: {
                nombre_empresa: base.nombre_empresa || 'Inmobiliaria',
                logo_empresa: base.logo_empresa || null,
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