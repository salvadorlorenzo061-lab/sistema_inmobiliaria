const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');
router.use(cors());
router.use(express.json());

router.get("/", (req, res) => {
    db.query('SELECT * FROM pagos_detalle ORDER BY id_pago_detalle DESC', (err, result) => {
        if (err) { console.error(err); res.status(500).send("Error de carga"); }
        else res.send(result);
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