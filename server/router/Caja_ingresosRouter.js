const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

// === 1. LISTAR INGRESOS DE CAJA ===
router.get("/", (req, res) => {
    db.query('SELECT * FROM caja_ingresos ORDER BY id_ingreso DESC', (err, result) => {
        if (err) {
            console.error("Error SQL GET Caja Ingresos:", err);
            res.status(500).send("Error interno del servidor al obtener datos.");
        } else {
            res.send(result);
        }
    });
});

// === 2. REGISTRAR INGRESO (Cobro Manual) ===
router.post("/crear", (req, res) => {
    const { numero_recibo, fecha_pago, monto_pagado, monto_mora, metodo_pago, observaciones, id_residente, id_tipo_contrato } = req.body;
    
    db.query(
        'INSERT INTO caja_ingresos (numero_recibo, fecha_pago, monto_pagado, monto_mora, metodo_pago, observaciones, id_residente, id_tipo_contrato) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [numero_recibo, fecha_pago, monto_pagado, monto_mora, metodo_pago, observaciones, id_residente, id_tipo_contrato],
        (err, result) => {
            if (err) {
                // 🟢 CORREGIDO: Imprimir el error real en la terminal del backend
                console.error("🔴 ERROR CRÍTICO SQL EN CAJA_INGRESOS POST:", err);
                
                // Enviar el mensaje de error específico al frontend (ej: violación de Foreign Key)
                return res.status(500).send("Error de Base de Datos: " + err.message);
            }
            res.status(200).send("Ingreso creado exitosamente en caja.");
        }
    );
});

// === 3. ELIMINAR/REVERTIR INGRESO ===
router.delete("/delete/:id", (req, res) => {
    db.query('DELETE FROM caja_ingresos WHERE id_ingreso = ?', [req.params.id], (err, result) => {
        if (err) {
            console.error("Error SQL DELETE Caja Ingresos:", err);
            res.status(500).send("Error al intentar eliminar el registro.");
        } else {
            res.status(200).send("Registro eliminado correctamente.");
        }
    });
});

module.exports = router;