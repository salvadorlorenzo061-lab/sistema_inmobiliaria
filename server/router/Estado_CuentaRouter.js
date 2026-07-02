const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

// === BUSCAR RESIDENTE PARA ESTADO DE CUENTA ===
router.get("/buscar-residente", (req, res) => {
    const { criterio } = req.query;

    if (!criterio) {
        return res.status(400).send("Debe proporcionar un criterio de búsqueda.");
    }

    const query = `
        SELECT 
            r.id_residente, r.nombre, r.dpi, r.numero_identificacion,
            c.id_contrato, c.codigo_contrato, c.fecha_firma, c.monto_total,
            c.monto_cuota, c.cuotas_pactadas, tc.nombre_tipo_contrato
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        WHERE c.estado = 'activo' AND (
            r.nombre LIKE ? 
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
        LIMIT 50
    `;

    const searchTerm = `%${criterio}%`;
    const queryParams = [searchTerm, searchTerm, searchTerm, searchTerm];

    db.query(query, queryParams, (err, result) => {
        if (err) {
            console.error("Error en la consulta:", err.message);
            return res.status(500).send("Error al consultar el residente: " + err.message);
        }
        if (result.length === 0) return res.status(404).send("No se encontraron residentes.");
        
        res.status(200).json(result);
    });
});

// === OBTENER ESTADO DE CUENTA ===
router.get("/estado-cuenta/:id_contrato", (req, res) => {
    const { id_contrato } = req.params;
    const { fecha_inicio, fecha_fin } = req.query;

    // Obtener información del contrato
    const queryContrato = `
        SELECT 
            r.nombre, r.dpi,
            c.id_contrato, c.codigo_contrato, c.fecha_firma, c.monto_total, c.monto_cuota,
            c.cuotas_pactadas, tc.nombre_tipo_contrato
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        WHERE c.id_contrato = ?
    `;

    db.query(queryContrato, [id_contrato], (err, contractResult) => {
        if (err || contractResult.length === 0) {
            return res.status(404).send("Contrato no encontrado");
        }

        const contract = contractResult[0];
        
        // Obtener todos los pagos realizados
        const queryPagos = `
            SELECT 
                p.id_pago,
                p.fecha_pago,
                p.monto_total_pagado AS total_cobrado,
                GROUP_CONCAT(DISTINCT pd.mes_pagado SEPARATOR ', ') as meses_pagados,
                COUNT(DISTINCT pd.id_pago_detalle) as cantidad_conceptos
            FROM pagos p
            INNER JOIN pagos_detalle pd ON p.id_pago = pd.id_pago
            WHERE p.id_contrato = ?
            GROUP BY p.id_pago
            ORDER BY p.fecha_pago DESC
        `;

        // Agregar filtro de fechas si se proporcionan
        let queryPagosParams = [id_contrato];
        let filtroFechas = '';
        
        if (fecha_inicio && fecha_fin) {
            filtroFechas = 'AND p.fecha_pago BETWEEN ? AND ?';
            queryPagosParams = [id_contrato, fecha_inicio, fecha_fin];
        }
        
        const queryPagosFiltered = queryPagos.replace('WHERE p.id_contrato = ?', `WHERE p.id_contrato = ? ${filtroFechas}`);
        
        db.query(queryPagosFiltered, queryPagosParams, (err, pagosResult) => {
            if (err) {
                console.error("Error al obtener pagos:", err.message);
                return res.status(500).send("Error al obtener pagos");
            }

            // Obtener meses pendientes
            const queryMesesPendientes = `
                SELECT DISTINCT pd.mes_pagado
                FROM pagos_detalle pd
                INNER JOIN pagos p ON pd.id_pago = p.id_pago
                WHERE p.id_contrato = ?
                ORDER BY pd.mes_pagado
            `;

            db.query(queryMesesPendientes, [id_contrato], (err, mesesResult) => {
                if (err) {
                    console.error("Error al obtener meses:", err.message);
                    return res.status(500).send("Error al obtener meses");
                }

                // Calcular saldo
                const totalPagado = pagosResult.reduce((sum, pago) => sum + parseFloat(pago.total_cobrado || 0), 0);
                const saldoPendiente = parseFloat(contract.monto_total) - totalPagado;

                res.status(200).json({
                    contrato: contract,
                    pagos: pagosResult,
                    mesesPagados: mesesResult.map(m => m.mes_pagado),
                    totalPagado: totalPagado,
                    saldoPendiente: Math.max(0, saldoPendiente),
                    fecha_inicio: contract.fecha_firma,
                    cuotas_pactadas: contract.cuotas_pactadas
                });
            });
        });
    });
});

module.exports = router;
