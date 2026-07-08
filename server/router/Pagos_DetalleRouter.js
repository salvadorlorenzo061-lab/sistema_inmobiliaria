const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');
router.use(cors());
router.use(express.json());

router.get("/", (req, res) => {
    const emitidasQuery = `
        SELECT
            pd.*,
            p.no_referencia AS correlativo,
            p.fecha_pago AS fecha_evento,
            'EMITIDA' AS estado_factura,
            NULL AS motivo_anulacion
        FROM pagos_detalle pd
        LEFT JOIN pagos p ON p.id_pago = pd.id_pago
        ORDER BY pd.id_pago_detalle DESC
    `;

    db.query(emitidasQuery, (emitErr, emitidasRows) => {
        if (emitErr) {
            console.error(emitErr);
            return res.status(500).send("Error de carga");
        }

        const anuladasQuery = `
            SELECT
                ad.id_anulacion,
                ad.id_pago,
                ad.monto_anulado,
                ad.motivo,
                ad.correlativo
            FROM anulacion_deuda ad
            WHERE ad.id_pago IS NOT NULL
            ORDER BY ad.id_anulacion DESC
        `;

        db.query(anuladasQuery, (anulErr, anulRows) => {
            if (anulErr) {
                console.error(anulErr);
                return res.status(500).send("Error de carga");
            }

            const anuladas = (anulRows || []).map((row) => ({
                id_pago_detalle: -Number(row.id_anulacion || 0),
                id_pago: row.id_pago,
                tipo_concepto: 'anulacion_cobro',
                id_concepto_servicio: null,
                mes_pagado: '',
                numero_cuota_afectada: null,
                subtotal: Number(row.monto_anulado || 0),
                correlativo: row.correlativo || null,
                fecha_evento: null,
                estado_factura: 'ANULADA',
                motivo_anulacion: row.motivo || ''
            }));

            const combined = [...(emitidasRows || []), ...anuladas].sort((a, b) => {
                const aKey = Number(a?.id_pago_detalle || 0);
                const bKey = Number(b?.id_pago_detalle || 0);
                return bKey - aKey;
            });

            return res.send(combined);
        });
    });
});

router.post("/crear", (req, res) => {
    const { id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal } = req.body;
    db.query(
        'INSERT INTO pagos_detalle (id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal],
        (err, result) => {
            if (err) { console.error(err); res.status(500).send("Error al insertar el rubro"); }
            else res.status(200).send("Detalle guardado con éxito");
        }
    );
});

router.put("/actualizar", (req, res) => {
    const { id_pago_detalle, id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal } = req.body;
    db.query(
        'UPDATE pagos_detalle SET id_pago=?, tipo_concepto=?, id_concepto_servicio=?, mes_pagado=?, numero_cuota_afectada=?, subtotal=? WHERE id_pago_detalle=?',
        [id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal, id_pago_detalle],
        (err, result) => {
            if (err) { console.error(err); res.status(500).send("Error al actualizar"); }
            else res.status(200).send("Actualizado");
        }
    );
});

router.delete("/delete/:id_pago_detalle", (req, res) => {
    db.query('DELETE FROM pagos_detalle WHERE id_pago_detalle = ?', [req.params.id_pago_detalle], (err, result) => {
        if (err) res.status(500).send("Error");
        else res.status(200).send("Eliminado");
    });
});

module.exports = router;