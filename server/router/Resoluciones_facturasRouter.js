const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

// === CREAR RESOLUCIÓN ===
router.post("/crear", (req, res) => {
    // 🔴 Se eliminó 'rol' de aquí
    const { id_empresa, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado } = req.body;

    // --- VALIDACIÓN DE PROTECCIÓN EN EL BACKEND ---
    const rInicial = Number(rango_inicial);
    const rFinal = Number(rango_final);
    const cActual = Number(correlativo_actual);

    if (rInicial > rFinal) {
        return res.status(400).send({ message: "El rango inicial no puede ser mayor al rango final" });
    }

    if (cActual < rInicial || cActual > rFinal) {
        return res.status(400).send({ message: `El correlativo actual (${cActual}) está fuera del rango autorizado (${rInicial} - ${rFinal})` });
    }
    // ---------------------------------------------

    db.query('SELECT * FROM resoluciones_facturas WHERE numero_resolucion = ?', [numero_resolucion], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).send("Error interno del servidor");
        }

        if (result.length > 0) {
            return res.status(400).send({ message: "La resolución ya se encuentra registrada" });
        }

        // 🔴 Se quitó 'rol' de las columnas y del VALUES
        const sqlInsert = 'INSERT INTO resoluciones_facturas (id_empresa, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const values = [id_empresa, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado];

        db.query(sqlInsert, values, (insertErr, insertResult) => {
            if (insertErr) {
                console.log(insertErr);
                return res.status(500).send("Error al registrar la resolución");
            } else {
                return res.status(200).send("Resolución registrada con éxito!!!");
            }
        });
    });
});

// === LISTAR RESOLUCIONES ===
router.get("/", (req, res) => {
    db.query('SELECT * FROM resoluciones_facturas', (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error al obtener las resoluciones");
        } else {
            res.send(result);
        }
    });
});

// === ACTUALIZAR RESOLUCIÓN ===
router.put("/actualizar", (req, res) => {
    // 🔴 Se eliminó 'rol' de aquí
    const { id_resolucion, id_empresa, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado } = req.body;
    
    // --- VALIDACIÓN DE PROTECCIÓN EN EL BACKEND ---
    const rInicial = Number(rango_inicial);
    const rFinal = Number(rango_final);
    const cActual = Number(correlativo_actual);

    if (rInicial > rFinal) {
        return res.status(400).send({ message: "El rango inicial no puede ser mayor al rango final" });
    }

    if (cActual < rInicial || cActual > rFinal) {
        return res.status(400).send({ message: `El correlativo actual (${cActual}) está fuera del rango autorizado (${rInicial} - ${rFinal})` });
    }
    // ---------------------------------------------

    // 🔴 Se quitó 'rol = ?' de la consulta SQL
    const sqlUpdate = `UPDATE resoluciones_facturas SET 
        id_empresa = ?, 
        numero_resolucion = ?, 
        serie = ?, 
        rango_inicial = ?, 
        rango_final = ?, 
        correlativo_actual = ?, 
        fecha_autorizacion = ?, 
        fecha_vencimiento = ?, 
        estado = ? 
        WHERE id_resolucion = ?`;

    const values = [id_empresa, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, fecha_autorizacion, fecha_vencimiento, estado, id_resolucion];

    db.query(sqlUpdate, values, (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error al actualizar");
        } else {
            res.status(200).send("Resolución actualizada correctamente");
        }
    });
});

// === ELIMINAR RESOLUCIÓN ===
router.delete("/delete/:id_resolucion", (req, res) => {
    const { id_resolucion } = req.params; 
    
    db.query('DELETE FROM resoluciones_facturas WHERE id_resolucion = ?', [id_resolucion], (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error al eliminar");
        } else {
            res.status(200).send("Resolución eliminada correctamente"); 
        }
    });
});

module.exports = router;