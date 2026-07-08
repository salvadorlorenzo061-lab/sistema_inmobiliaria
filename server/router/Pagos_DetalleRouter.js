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