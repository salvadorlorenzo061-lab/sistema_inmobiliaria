const express = require("express");
const db = require('../Conexion');
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');
const { calcularTotalPlanPlano } = require('../utils/amortizacion');

router.use(cors());
router.use(express.json({ limit: '15mb' }));

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

db.query(`
    CREATE TABLE IF NOT EXISTS estado_cuenta_historial (
        id_estado_cuenta BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        id_contrato INT NOT NULL,
        id_usuario INT NULL,
        texto_manual TEXT NULL,
        cantidad_movimientos INT NOT NULL DEFAULT 5,
        pdf_base64 LONGTEXT NULL,
        datos_json LONGTEXT NULL,
        fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_estado_cuenta_contrato (id_contrato),
        INDEX idx_estado_cuenta_fecha (fecha_generacion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`, (err) => {
    if (err) console.error('Error asegurando historial de estados de cuenta:', err.message);
    else {
        db.query(`ALTER TABLE estado_cuenta_historial ADD COLUMN pdf_base64 LONGTEXT NULL`, (alterErr) => {
            if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') console.error('Error agregando PDF al historial:', alterErr.message);
        });
        db.query(`ALTER TABLE estado_cuenta_historial ADD COLUMN datos_json LONGTEXT NULL`, (alterErr) => {
            if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') console.error('Error agregando datos al historial:', alterErr.message);
        });
    }
});

router.get('/historial/:id_contrato', (req, res) => {
    db.query(`
        SELECT h.id_estado_cuenta, h.id_contrato, h.id_usuario, h.texto_manual,
               h.cantidad_movimientos, h.fecha_generacion,
               CASE WHEN h.pdf_base64 IS NULL OR h.pdf_base64 = '' THEN 0 ELSE 1 END AS tiene_pdf,
               COALESCE(u.nombre, 'Usuario no disponible') AS nombre_usuario
        FROM estado_cuenta_historial h
        LEFT JOIN usuarios u ON u.id_usuario = h.id_usuario
        WHERE h.id_contrato = ?
        ORDER BY h.fecha_generacion DESC, h.id_estado_cuenta DESC
    `, [req.params.id_contrato], (err, rows) => {
        if (err) return res.status(500).send({ message: 'No se pudo consultar el historial.' });
        return res.json(rows || []);
    });
});

router.get('/historial/:id_estado_cuenta/pdf', (req, res) => {
    db.query(`SELECT pdf_base64, id_contrato FROM estado_cuenta_historial WHERE id_estado_cuenta = ? LIMIT 1`,
        [req.params.id_estado_cuenta], (err, rows) => {
            if (err) return res.status(500).send({ message: 'No se pudo recuperar el PDF.' });
            const registro = rows?.[0];
            if (!registro?.pdf_base64) return res.status(404).send({ message: 'Este registro antiguo no contiene un PDF guardado.' });
            try {
                const pdf = Buffer.from(registro.pdf_base64, 'base64');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="EstadoCuenta_${registro.id_contrato}_${req.params.id_estado_cuenta}.pdf"`);
                return res.send(pdf);
            } catch (error) {
                return res.status(500).send({ message: 'El PDF guardado no es válido.' });
            }
        });
});

router.post('/historial', (req, res) => {
    const idContrato = Number(req.body?.id_contrato || 0);
    const idUsuario = Number(req.body?.id_usuario || 0) || null;
    const textoManual = String(req.body?.texto_manual || '').trim();
    const cantidadMovimientos = [5, 10].includes(Number(req.body?.cantidad_movimientos))
        ? Number(req.body.cantidad_movimientos) : 5;
    const pdfBase64 = String(req.body?.pdf_base64 || '').replace(/^data:application\/pdf;base64,/, '');
    const datosJson = req.body?.datos ? JSON.stringify(req.body.datos) : null;
    if (!idContrato) return res.status(400).send({ message: 'Contrato inválido.' });
    if (!textoManual) return res.status(400).send({ message: 'Debe ingresar el texto manual del estado de cuenta.' });
    db.query(`
        INSERT INTO estado_cuenta_historial
            (id_contrato, id_usuario, texto_manual, cantidad_movimientos, pdf_base64, datos_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [idContrato, idUsuario, textoManual, cantidadMovimientos, pdfBase64 || null, datosJson], (err, result) => {
        if (err) return res.status(500).send({ message: 'No se pudo guardar el estado de cuenta.' });
        return res.status(201).json({ id_estado_cuenta: result.insertId, message: 'Estado de cuenta registrado.' });
    });
});

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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');

    // Obtener información del contrato
    const queryContrato = `
        SELECT 
            r.id_residente, r.numero_identificacion, r.nombre, r.dpi, r.telefono, r.direccion_notificacion,
            c.id_contrato, c.codigo_contrato, c.fecha_firma, c.monto_total, c.monto_cuota,
            c.fecha_compra, c.enganche, c.interes_porcentaje, c.plazo_meses, c.cuotas_pactadas,
            c.formato_contrato, c.id_proyecto, c.mes_inicio_pagos, c.anio_inicio_pagos,
            c.dia_inicio_pagos, c.dia_pago_limite,
            tc.nombre_tipo_contrato,
            COALESCE(NULLIF(c.nombre_proyecto_propiedad, ''), p.nombre) AS nombre_proyecto,
            COALESCE(NULLIF(c.numero_lote, ''), NULLIF(CAST(vp.id_lote AS CHAR), '0')) AS lote,
            COALESCE(NULLIF(c.manzana, ''), CASE WHEN JSON_VALID(vp.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.manzana')), '') ELSE NULL END) AS manzana,
            COALESCE(NULLIF(c.numero_finca, ''), CASE WHEN JSON_VALID(vp.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.numero_finca')), '') ELSE NULL END) AS numero_finca,
            COALESCE(NULLIF(c.folio, ''), CASE WHEN JSON_VALID(vp.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.folio')), '') ELSE NULL END) AS folio,
            COALESCE(NULLIF(c.libro, ''), CASE WHEN JSON_VALID(vp.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.libro')), '') ELSE NULL END) AS libro,
            COALESCE(NULLIF(c.area_m2, ''), CASE WHEN JSON_VALID(vp.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vp.observaciones, '$.area')), '') ELSE NULL END) AS area,
            COALESCE((
                SELECT SUM(CASE WHEN pd_total.tipo_concepto = 'mora_exonerada' THEN 0 ELSE pd_total.subtotal END)
                FROM pagos p_total
                INNER JOIN pagos_detalle pd_total ON pd_total.id_pago = p_total.id_pago
                WHERE p_total.id_contrato = c.id_contrato
                  AND NOT EXISTS (
                      SELECT 1 FROM facturas_historial fa_total
                                            WHERE fa_total.id_pago = p_total.id_pago
                                                AND UPPER(TRIM(COALESCE(fa_total.estado_factura, ''))) = 'ANULADA'
                  )
            ), 0) AS total_pagado_real,
            COALESCE((
                SELECT SUM(mora_unica.monto_mora)
                FROM (
                    SELECT m.id_contrato, LOWER(TRIM(m.mes_atrasado)) AS mes_mora, MAX(m.monto_mora) AS monto_mora
                    FROM morosidad m
                    WHERE LOWER(TRIM(COALESCE(m.estado, 'pendiente'))) NOT IN ('pagado', 'exonerada', 'anulada')
                    GROUP BY m.id_contrato, LOWER(TRIM(m.mes_atrasado))
                ) mora_unica
                WHERE mora_unica.id_contrato = c.id_contrato
            ), 0) AS mora_registrada,
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
                SUM(CASE WHEN pd.tipo_concepto = 'mora_exonerada' THEN 0 ELSE pd.subtotal END) AS total_cobrado,
                COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'mora' THEN pd.subtotal ELSE 0 END), 0) AS monto_mora,
                GROUP_CONCAT(DISTINCT pd.mes_pagado ORDER BY pd.mes_pagado SEPARATOR ', ') AS meses_pagados,
                GROUP_CONCAT(DISTINCT pd.tipo_concepto ORDER BY pd.tipo_concepto SEPARATOR ', ') AS tipos_concepto,
                COUNT(DISTINCT pd.id_pago_detalle) AS cantidad_conceptos
            FROM pagos p
            INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
            WHERE p.id_contrato = ?
                            AND NOT EXISTS (
                                    SELECT 1 FROM facturas_historial fa
                                    WHERE fa.id_pago = p.id_pago
                                        AND UPPER(TRIM(COALESCE(fa.estado_factura, ''))) = 'ANULADA'
                            )
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
                                    AND NOT EXISTS (
                                            SELECT 1 FROM facturas_historial fa
                                            WHERE fa.id_pago = p.id_pago
                                                AND UPPER(TRIM(COALESCE(fa.estado_factura, ''))) = 'ANULADA'
                                    )
                                    ${filtroFechas}
                                ORDER BY pd.mes_pagado
                        `;

                db.query(queryMesesPendientes, queryPagosParams, (err, mesesResult) => {
                    if (err) {
                        console.error("Error al obtener meses:", err.message);
                        return res.status(500).send("No se pudo obtener los meses pagados.");
                    }

                    const responderEstadoCuenta = (detalleCuotasResult = [], otrosPagosResult = []) => {
                        const totalPagado = Number(contract.total_pagado_real || 0);
                        const capitalFinanciado = Math.max(Number(contract.monto_total || 0) - Number(contract.enganche || 0), 0);
                        const cuotasContrato = Math.max(Number(contract.cuotas_pactadas || contract.plazo_meses || 0), 0);
                        // Plan lineal: total = capital + interes fijo x numero de cuotas.
                        const totalConIntereses = calcularTotalPlanPlano(
                            capitalFinanciado,
                            Math.max(Number(contract.interes_porcentaje || 0), 0),
                            cuotasContrato
                        ) + Number(contract.enganche || 0);
                        const saldoPendiente = totalConIntereses - totalPagado;

                        return res.status(200).json({
                            contrato: contract,
                            pagos: pagosResult,
                            cuotasDetalle: detalleCuotasResult,
                            otrosPagos: otrosPagosResult,
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
                        p.banco_pago,
                        p.boleta_referencia,
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
                                            AND NOT EXISTS (
                                                    SELECT 1 FROM facturas_historial fa
                                                    WHERE fa.id_pago = p.id_pago
                                                        AND UPPER(TRIM(COALESCE(fa.estado_factura, ''))) = 'ANULADA'
                                            )
                      AND pd.tipo_concepto IN ('enganche', 'cuota_terreno')
                    ORDER BY CASE WHEN COALESCE(pd.numero_cuota_afectada, 0) = 0 AND pd.tipo_concepto = 'enganche' THEN 0 ELSE COALESCE(pd.numero_cuota_afectada, 0) END ASC,
                             p.id_pago ASC
                    `;

                    db.query(queryDetalleCuotas, [id_contrato], (detalleErr, detalleCuotasResult) => {
                        if (detalleErr) {
                            console.error("Error al obtener detalle de cuotas:", detalleErr.message);
                            return responderEstadoCuenta([]);
                        }

                        const queryOtrosPagos = `
                            SELECT
                                pd.id_pago_detalle,
                                p.id_pago,
                                p.fecha_pago,
                                p.forma_pago,
                                p.no_referencia,
                                CASE
                                    WHEN pd.tipo_concepto = 'mora' THEN CONCAT('Mora cobrada', IF(TRIM(COALESCE(pd.mes_pagado, '')) = '', '', CONCAT(' - ', pd.mes_pagado)))
                                    WHEN pd.tipo_concepto = 'mora_exonerada' THEN CONCAT('Mora exonerada', IF(TRIM(COALESCE(pd.mes_pagado, '')) = '', '', CONCAT(' - ', pd.mes_pagado)))
                                    ELSE COALESCE(
                                        NULLIF(TRIM(s.nombre_servicio), ''),
                                        NULLIF(TRIM(pd.tipo_concepto), ''),
                                        'Otro pago'
                                    )
                                END AS concepto,
                                pd.tipo_concepto,
                                pd.mes_pagado,
                                CASE
                                    WHEN pd.tipo_concepto = 'mora_exonerada' THEN COALESCE((
                                        SELECT MAX(fh_ref.subtotal)
                                        FROM facturas_historial fh_ref
                                        WHERE fh_ref.id_pago = p.id_pago
                                          AND fh_ref.estado_factura = 'EMITIDA'
                                          AND fh_ref.tipo_concepto = 'mora_exonerada'
                                          AND LOWER(TRIM(COALESCE(fh_ref.mes_pagado, ''))) = LOWER(TRIM(COALESCE(pd.mes_pagado, '')))
                                    ), 0)
                                    ELSE pd.subtotal
                                END AS monto,
                                (SELECT MAX(fh.correlativo)
                                 FROM facturas_historial fh
                                 WHERE fh.id_pago = p.id_pago AND fh.estado_factura = 'EMITIDA') AS correlativo
                            FROM pagos p
                            INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                            LEFT JOIN servicios s ON s.id_servicio = pd.id_concepto_servicio
                            WHERE p.id_contrato = ?
                              AND pd.tipo_concepto NOT IN ('enganche', 'cuota_terreno')
                              AND NOT EXISTS (
                                  SELECT 1 FROM facturas_historial fa
                                                                    WHERE fa.id_pago = p.id_pago
                                                                        AND UPPER(TRIM(COALESCE(fa.estado_factura, ''))) = 'ANULADA'
                              )
                              ${filtroFechas}
                            ORDER BY p.fecha_pago DESC, p.id_pago DESC, pd.id_pago_detalle ASC
                        `;

                        db.query(queryOtrosPagos, queryPagosParams, (otrosErr, otrosPagosResult) => {
                            if (otrosErr) {
                                console.error('Error al obtener mora y servicios:', otrosErr.message);
                                return responderEstadoCuenta(detalleCuotasResult, []);
                            }
                            const filtroExoneracion = fecha_inicio && fecha_fin
                                ? 'AND DATE(me.fecha_exoneracion) BETWEEN ? AND ?'
                                : '';
                            db.query(`
                                SELECT
                                    CONCAT('EX-', me.id_exoneracion) AS id_pago_detalle,
                                    NULL AS id_pago,
                                    me.fecha_exoneracion AS fecha_pago,
                                    'ADMINISTRATIVA' AS forma_pago,
                                    NULL AS no_referencia,
                                    CONCAT('Mora ', LOWER(me.estado), ' - ', me.mes_atrasado) AS concepto,
                                    CASE WHEN me.estado = 'EXONERADA' THEN 'mora_exonerada' ELSE 'mora_restablecida' END AS tipo_concepto,
                                    me.mes_atrasado AS mes_pagado,
                                    me.monto_exonerado AS monto,
                                    NULL AS correlativo
                                FROM morosidad_exoneraciones me
                                WHERE me.id_contrato = ? ${filtroExoneracion}
                                ORDER BY me.fecha_exoneracion DESC
                            `, queryPagosParams, (exonErr, exoneracionesResult) => {
                                if (exonErr && String(exonErr?.code || '').toUpperCase() !== 'ER_NO_SUCH_TABLE') {
                                    console.error('Error al obtener exoneraciones de mora:', exonErr.message);
                                }
                                return responderEstadoCuenta(
                                    detalleCuotasResult,
                                    [...(otrosPagosResult || []), ...(exoneracionesResult || [])]
                                );
                            });
                        });
                    });
                });
            });
        });
    });
});

module.exports = router;
