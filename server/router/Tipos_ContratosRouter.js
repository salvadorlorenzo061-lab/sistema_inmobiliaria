const express = require("express");
const db = require('../Conexion'); 
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());

router.get("/", (req, res) => {
    db.query('SELECT *, nombre_tipo_contrato AS nombre_contrato FROM tipos_contrato ORDER BY id_tipo_contrato DESC', (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error");
        } else res.send(result);
    });
});

router.post("/crear", (req, res) => {
    const { nombre_contrato, descripcion, interes_moratorio, estado, imagen } = req.body;
    db.query(
        'INSERT INTO tipos_contrato (nombre_tipo_contrato, descripcion, interes_moratorio, estado, imagen) VALUES (?, ?, ?, ?, ?)',
        [nombre_contrato, descripcion, interes_moratorio || 0, estado || 'activo', imagen || null],
        (err) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error");
            } else res.status(200).send("Creado exitosamente");
        }
    );
});

router.put("/actualizar", (req, res) => {
    const { id_tipo_contrato, nombre_contrato, descripcion, interes_moratorio, estado, imagen } = req.body;
    db.query(
        'UPDATE tipos_contrato SET nombre_tipo_contrato=?, descripcion=?, interes_moratorio=?, estado=?, imagen=? WHERE id_tipo_contrato=?',
        [nombre_contrato, descripcion, interes_moratorio || 0, estado || 'activo', imagen || null, id_tipo_contrato],
        (err) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error");
            } else res.status(200).send("Actualizado");
        }
    );
});

router.delete("/delete/:id", (req, res) => {
    db.query('DELETE FROM tipos_contrato WHERE id_tipo_contrato = ?', [req.params.id], (err) => {
        if (err) res.status(400).send("No se puede borrar por integridad referencial");
        else res.status(200).send("Eliminado");
    });
});

module.exports = router;