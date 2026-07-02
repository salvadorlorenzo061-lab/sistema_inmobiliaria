const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

// === 1. LISTAR PAGOS ===
router.get("/", (req, res) => {
    const query = `
        SELECT
            p.*,
            u.nombre AS nombre_usuario,
            c.codigo_contrato,
            tc.nombre_tipo_contrato AS nombre_contrato,
            r.nombre AS nombre_residente,
            r.numero_identificacion,
            r.dpi,
            r.nit,
            r.direccion_notificacion,
            e.nombre_empresa,
            e.logo,
            e.nit AS nit_empresa,
            e.pais,
            e.moneda
        FROM pagos p
        LEFT JOIN usuarios u ON p.id_usuario = u.id_usuario
        LEFT JOIN contratos_residentes c ON p.id_contrato = c.id_contrato
        LEFT JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        LEFT JOIN residentes r ON c.id_residente = r.id_residente
        LEFT JOIN empresas e ON e.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
        ORDER BY p.id_pago DESC
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error al obtener los pagos");
        } else {
            res.send(result);
        }
    });
});

// === 2. CREAR PAGO ===
router.post("/crear", (req, res) => {
    const { id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia } = req.body;

    db.query(
        'INSERT INTO pagos (id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia) VALUES (?, ?, ?, ?, ?)',
        [id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error al procesar la inserción de pago maestro");
            } else {
                res.status(200).send("Pago registrado exitosamente");
            }
        }
    );
});

// === 3. ACTUALIZAR PAGO ===
router.put("/actualizar", (req, res) => {
    const { id_pago, id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia } = req.body;

    db.query(
        'UPDATE pagos SET id_contrato = ?, id_usuario = ?, monto_total_pagado = ?, forma_pago = ?, no_referencia = ? WHERE id_pago = ?',
        [id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia, id_pago],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error al actualizar la cabecera de pago");
            } else {
                res.status(200).send("Registro actualizado correctamente");
            }
        }
    );
});

// === 4. ELIMINAR PAGO ===
router.delete("/delete/:id_pago", (req, res) => {
    const { id_pago } = req.params;

    db.query('DELETE FROM pagos WHERE id_pago = ?', [id_pago], (err, result) => {
        if (err) {
            if (err.errno === 1451) {
                return res.status(400).send({ 
                    message: "Restricción de integridad: No se puede eliminar el pago porque tiene desgloses en su detalle." 
                });
            }
            console.error(err);
            res.status(500).send("Error al borrar el registro de pago");
        } else {
            res.status(200).send("Pago maestro removido");
        }
    });
});

module.exports = router;