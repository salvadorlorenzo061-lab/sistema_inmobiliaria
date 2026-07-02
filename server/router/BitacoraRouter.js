const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

// === 1. OBTENER TODA LA BITÁCORA DEL SISTEMA ===
router.get("/", (req, res) => {
    // 🟢 CORREGIDO: Usando tus campos reales 'b.nombre_usuario' y 'b.fecha_hora'
    const query = `
        SELECT 
            b.id_bitacora, 
            b.id_usuario, 
            b.nombre_usuario, 
            b.accion, 
            b.descripcion, 
            b.ip_direccion, 
            b.fecha_hora AS fecha, 
            b.estado, 
            r.nombre_rol
        FROM bitacora b
        LEFT JOIN usuarios u ON b.id_usuario = u.id_usuario
        LEFT JOIN roles r ON u.id_rol = r.id_rol
        ORDER BY b.id_bitacora DESC
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error("🔴 ERROR CRÍTICO SQL EN BITÁCORA ROUTER:", err);
            return res.status(500).send("Error de Base de Datos al consultar bitácora: " + err.message);
        }
        res.status(200).send(result);
    });
});

// === 2. REGISTRAR ACCIÓN EN BITÁCORA ===
router.post("/crear", (req, res) => {
    const { id_usuario, nombre_usuario, accion, descripcion, ip_direccion, estado } = req.body;
    
    // Obtener marcas de tiempo en los formatos de tus columnas
    const ahora = new Date();
    const formatoFechaHora = ahora.toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:mm:ss
    const formatoFechaRegistro = ahora.toISOString().slice(0, 10); // YYYY-MM-DD

    // 🟢 CORREGIDO: Insertando en las columnas reales de tu estructura
    const query = `
        INSERT INTO bitacora (id_usuario, nombre_usuario, usuario_nombre, accion, descripcion, ip_direccion, fecha_hora, estado, fecha_registro) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        query, 
        [id_usuario, nombre_usuario, nombre_usuario, accion, descripcion, ip_direccion, formatoFechaHora, estado || 'exitoso', formatoFechaRegistro], 
        (err, result) => {
            if (err) {
                console.error("🔴 ERROR AL ESCRIBIR EN BITÁCORA:", err);
                return res.status(500).send("Error al guardar registro en la bitácora.");
            }
            res.status(200).send("Acción registrada en bitácora con éxito.");
        }
    );
});

module.exports = router;