const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

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
            rol_usuario_emisor VARCHAR(80) NULL,
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
            INDEX idx_historial_contrato (id_contrato)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(sql, (err) => {
        if (err) {
            console.error('Error asegurando tabla facturas_historial en estado_cuenta:', err.message);
        }
    });
};

ensureFacturasHistorialTable();

// === BUSCAR RESIDENTE PARA ESTADO DE CUENTA ===
router.get("/buscar-residente", (req, res) => {
    const { criterio } = req.query;

    if (!criterio) {
        return res.status(400).send("Debe proporcionar un criterio de búsqueda.");
    }

    const query = `
        SELECT 
            r.id_residente, r.nombre, r.dpi, r.numero_identificacion, r.telefono, r.direccion_notificacion,
            c.id_contrato, c.codigo_contrato, c.fecha_firma, c.monto_total, c.estado AS estado_contrato,
            c.monto_cuota, c.cuotas_pactadas, tc.nombre_tipo_contrato
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        WHERE (
            r.nombre LIKE ? 
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
        ORDER BY CASE WHEN LOWER(TRIM(COALESCE(c.estado, ''))) = 'activo' THEN 0 ELSE 1 END, c.fecha_firma DESC
        LIMIT 50
    `;

    const searchTerm = `%${criterio}%`;
    const queryParams = [searchTerm, searchTerm, searchTerm, searchTerm];

    db.query(query, queryParams, (err, result) => {
        if (err) {
            console.error("Error en la consulta:", err.message);
            return res.status(500).send("No se pudo consultar el cliente en este momento.");
        }
        if (result.length === 0) return res.status(404).send("No se encontraron clientes.");
        
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
            r.id_residente, r.numero_identificacion, r.nombre, r.dpi, r.telefono, r.direccion_notificacion,
            c.id_contrato, c.codigo_contrato, c.fecha_firma, c.monto_total, c.monto_cuota,
            c.fecha_compra, c.enganche, c.interes_porcentaje, c.plazo_meses, c.cuotas_pactadas,
            c.formato_contrato, c.id_proyecto, c.mes_inicio_pagos, c.anio_inicio_pagos,
            c.dia_inicio_pagos, c.dia_pago_limite,
            tc.nombre_tipo_contrato,
            p.nombre AS nombre_proyecto,
            vp.id_lote AS lote,
            CASE WHEN JSON_VALID(vp.observaciones) THEN JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.manzana')) ELSE NULL END AS manzana,
            CASE WHEN JSON_VALID(vp.observaciones) THEN JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.numero_finca')) ELSE NULL END AS numero_finca,
            CASE WHEN JSON_VALID(vp.observaciones) THEN JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.folio')) ELSE NULL END AS folio,
            CASE WHEN JSON_VALID(vp.observaciones) THEN JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.libro')) ELSE NULL END AS libro,
            CASE WHEN JSON_VALID(vp.observaciones) THEN JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.area')) ELSE NULL END AS area,
            COALESCE(ep.logo, em.logo, er.logo) AS logo_proyecto,
            COALESCE(em.logo, er.logo, ep.logo) AS logo_empresa_pdf
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        LEFT JOIN proyecto p ON p.id_proyecto = c.id_proyecto
        LEFT JOIN ventas_propiedad vp ON vp.id_contrato = c.id_contrato
        LEFT JOIN empresas em ON em.id_empresa = c.id_empresa_marca
        LEFT JOIN empresas ep ON ep.id_empresa = p.id_empresa
        LEFT JOIN empresas er ON er.id_empresa = r.id_empresa
        WHERE c.id_contrato = ?
    `;

    db.query(queryContrato, [id_contrato], (err, contractResult) => {
        if (err) {
            console.error("Error al obtener contrato:", err.message);
            return res.status(500).send("No se pudo obtener el estado de cuenta en este momento.");
        }

        if (err || contractResult.length === 0) {
            return res.status(404).send("Contrato no encontrado");
        }

        const contract = contractResult[0];

        // Obtener servicios activos del contrato (directos + por proyecto) para marcar D/T/E/C en estado de cuenta.
        const queryServiciosContrato = `
            SELECT GROUP_CONCAT(DISTINCT base.nombre_servicio ORDER BY base.nombre_servicio SEPARATOR ', ') AS servicios_activos_nombres
            FROM (
                SELECT s.nombre_servicio
                FROM contratos_servicios cs
                INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
                WHERE cs.id_contrato = ?
                  AND cs.estado = 'activo'
                  AND s.estado = 'activo'

                UNION

                SELECT s.nombre_servicio
                FROM contratos_residentes c2
                INNER JOIN proyecto_servicios ps ON ps.id_proyecto = c2.id_proyecto
                INNER JOIN servicios s ON s.id_servicio = ps.id_servicio
                WHERE c2.id_contrato = ?
                  AND ps.estado = 'activo'
                  AND s.estado = 'activo'
            ) base
        `;

        db.query(queryServiciosContrato, [id_contrato, id_contrato], (servErr, servRows) => {
            if (servErr) {
                console.error('Error al obtener servicios del contrato para estado de cuenta:', servErr.message);
            }

            contract.servicios_activos_nombres = servRows?.[0]?.servicios_activos_nombres || '';

            // Obtener todos los pagos realizados
            const queryPagos = `
            SELECT
                p.id_pago,
                MIN(p.fecha_pago) AS fecha_pago,
                SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT p.forma_pago ORDER BY p.id_pago DESC SEPARATOR ', '), ',', 1) AS forma_pago,
                SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT p.no_referencia ORDER BY p.id_pago DESC SEPARATOR ', '), ',', 1) AS no_referencia,
                (SELECT MAX(fh.correlativo) FROM facturas_historial fh WHERE fh.id_pago = p.id_pago AND fh.estado_factura = 'EMITIDA') AS correlativo,
                SUM(pd.subtotal) AS total_cobrado,
                COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'mora' THEN pd.subtotal ELSE 0 END), 0) AS monto_mora,
                GROUP_CONCAT(DISTINCT pd.mes_pagado ORDER BY pd.mes_pagado SEPARATOR ', ') AS meses_pagados,
                GROUP_CONCAT(DISTINCT pd.tipo_concepto ORDER BY pd.tipo_concepto SEPARATOR ', ') AS tipos_concepto,
                COUNT(DISTINCT pd.id_pago_detalle) AS cantidad_conceptos
            FROM pagos p
            INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
            WHERE p.id_contrato = ?
              AND NOT EXISTS (SELECT 1 FROM facturas_historial fa WHERE fa.id_pago = p.id_pago AND fa.estado_factura = 'ANULADA')
              AND p.id_pago IS NOT NULL
            GROUP BY p.id_pago
            ORDER BY fecha_pago DESC, p.id_pago DESC
        `;

            // Agregar filtro de fechas si se proporcionan
            let queryPagosParams = [id_contrato];
            let filtroFechas = '';

            if (fecha_inicio && fecha_fin) {
                filtroFechas = 'AND DATE(p.fecha_pago) BETWEEN ? AND ?';
                queryPagosParams = [id_contrato, fecha_inicio, fecha_fin];
            }

            const queryPagosFiltered = queryPagos.replace("AND p.id_pago IS NOT NULL", `${filtroFechas} AND p.id_pago IS NOT NULL`);

            db.query(queryPagosFiltered, queryPagosParams, (err, pagosResult) => {
                if (err) {
                    console.error("Error al obtener pagos:", err.message);
                    return res.status(500).send("No se pudo obtener el historial de pagos.");
                }

                // Obtener meses pendientes
                                const queryMesesPendientes = `
                                SELECT DISTINCT pd.mes_pagado
                                FROM pagos p
                                INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                                WHERE p.id_contrato = ?
                                    AND NOT EXISTS (SELECT 1 FROM facturas_historial fa WHERE fa.id_pago = p.id_pago AND fa.estado_factura = 'ANULADA')
                                    ${filtroFechas}
                                ORDER BY pd.mes_pagado
                        `;

                db.query(queryMesesPendientes, queryPagosParams, (err, mesesResult) => {
                    if (err) {
                        console.error("Error al obtener meses:", err.message);
                        return res.status(500).send("No se pudo obtener los meses pagados.");
                    }

                    const responderEstadoCuenta = (detalleCuotasResult = []) => {
                        const totalPagado = pagosResult.reduce((sum, pago) => sum + parseFloat(pago.total_cobrado || 0), 0);
                        const capitalFinanciado = Math.max(Number(contract.monto_total || 0) - Number(contract.enganche || 0), 0);
                        const cuotasContrato = Math.max(Number(contract.cuotas_pactadas || contract.plazo_meses || 0), 0);
                        const totalConIntereses = capitalFinanciado + Number(contract.enganche || 0)
                            + (capitalFinanciado * (Math.max(Number(contract.interes_porcentaje || 0), 0) / 100) * (cuotasContrato / 12));
                        const saldoPendiente = totalConIntereses - totalPagado;

                        return res.status(200).json({
                            contrato: contract,
                            pagos: pagosResult,
                            cuotasDetalle: detalleCuotasResult,
                            mesesPagados: mesesResult.map(m => m.mes_pagado),
                            totalPagado: totalPagado,
                            totalConIntereses: Number(totalConIntereses.toFixed(2)),
                            saldoPendiente: Math.max(0, saldoPendiente),
                            fecha_inicio: fecha_inicio || contract.fecha_firma,
                            fecha_fin: fecha_fin || null,
                            cuotas_pactadas: contract.cuotas_pactadas
                        });
                    };

                    const queryDetalleCuotas = `
                    SELECT
                        COALESCE(
                            NULLIF(pd.numero_cuota_afectada, 0),
                            (SELECT MAX(fh.numero_cuota_afectada)
                             FROM facturas_historial fh
                             WHERE fh.id_pago = p.id_pago AND fh.estado_factura = 'EMITIDA'),
                            0
                        ) AS numero_cuota,
                        p.fecha_pago,
                        p.forma_pago,
                        p.no_referencia,
                        (SELECT MAX(fh.correlativo) FROM facturas_historial fh WHERE fh.id_pago = p.id_pago AND fh.estado_factura = 'EMITIDA') AS correlativo,
                        p.id_pago,
                        CASE WHEN pd.tipo_concepto = 'cuota_terreno' THEN pd.subtotal ELSE 0 END AS monto_cuota,
                        0 AS monto_mora,
                        pd.subtotal AS monto_total_detalle,
                        pd.mes_pagado AS meses_pagados,
                        pd.tipo_concepto AS tipos_concepto,
                        NULL AS servicios_nombres
                    FROM pagos p
                    INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                    WHERE p.id_contrato = ?
                      AND NOT EXISTS (SELECT 1 FROM facturas_historial fa WHERE fa.id_pago = p.id_pago AND fa.estado_factura = 'ANULADA')
                      ${filtroFechas}
                      AND pd.tipo_concepto IN ('enganche', 'cuota_terreno')
                    ORDER BY CASE WHEN COALESCE(pd.numero_cuota_afectada, 0) = 0 AND pd.tipo_concepto = 'enganche' THEN 0 ELSE COALESCE(pd.numero_cuota_afectada, 0) END ASC,
                             p.id_pago ASC
                    `;

                    db.query(queryDetalleCuotas, queryPagosParams, (detalleErr, detalleCuotasResult) => {
                        if (detalleErr) {
                            console.error("Error al obtener detalle de cuotas:", detalleErr.message);
                            return responderEstadoCuenta([]);
                        }

                        return responderEstadoCuenta(detalleCuotasResult);
                    });
                });
            });
        });
    });
});

module.exports = router;
