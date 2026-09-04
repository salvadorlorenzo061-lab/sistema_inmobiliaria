const express = require("express");
const db = require('../Conexion'); 
const router = express.Router();
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());

const ensureColumnInAnulacion = (columnName, sqlType) => {
    const checkSql = `
        SELECT COUNT(*) AS existe
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'anulacion_deuda'
          AND COLUMN_NAME = ?
    `;

    db.query(checkSql, [columnName], (checkErr, rows) => {
        if (checkErr) return;

        const exists = rows?.[0]?.existe > 0;
        if (exists) return;

        db.query(
            `
                SELECT COUNT(*) AS existe
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'anulacion_deuda'
            `,
            (tableErr, tableRows) => {
                if (tableErr) return;

                const tableExists = tableRows?.[0]?.existe > 0;
                if (!tableExists) {
                    console.warn('La tabla anulacion_deuda no existe en esta base de datos. Se omite migracion de columnas.');
                    return;
                }

                db.query(`ALTER TABLE anulacion_deuda ADD COLUMN ${columnName} ${sqlType}`, (alterErr) => {
                    if (alterErr) {
                        console.error(`No se pudo crear columna ${columnName} en anulacion_deuda:`, alterErr.message);
                    }
                });
            }
        );
    });
};

ensureColumnInAnulacion('id_pago', 'INT NULL');
ensureColumnInAnulacion('correlativo', 'VARCHAR(80) NULL');
ensureColumnInAnulacion('estado_factura', 'VARCHAR(20) NOT NULL DEFAULT "EMITIDA"');

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
            INDEX idx_historial_correlativo (correlativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(sql, (err) => {
        if (err) {
            console.error('Error asegurando tabla facturas_historial en anulacion:', err.message);
        }
    });
};

const ensureFacturasHistorialRolColumn = () => {
    db.query("SHOW COLUMNS FROM facturas_historial LIKE 'rol_usuario_emisor'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna rol_usuario_emisor en facturas_historial (anulacion):', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE facturas_historial ADD COLUMN rol_usuario_emisor VARCHAR(80) NULL AFTER id_usuario', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna rol_usuario_emisor en facturas_historial (anulacion):', alterErr.message);
                }
            });
        }
    });
};

ensureFacturasHistorialTable();
ensureFacturasHistorialRolColumn();

const ensureAnulacionDeudaTable = () => {
    db.query("SHOW TABLES LIKE 'anulacion_deuda'", (showErr, rows) => {
        if (showErr) {
            console.error('Error verificando tabla anulacion_deuda:', showErr.message);
            return;
        }

        if (rows && rows.length > 0) {
            const ensureColumns = () => {
                const columnsToAdd = [
                    ['id_pago', 'INT NULL'],
                    ['correlativo', 'VARCHAR(80) NULL'],
                    ['estado_factura', 'VARCHAR(20) NOT NULL DEFAULT "EMITIDA"']
                ];

                columnsToAdd.forEach(([columnName, sqlType]) => {
                    db.query(
                        `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'anulacion_deuda' AND COLUMN_NAME = ?`,
                        [columnName],
                        (checkErr, columnRows) => {
                            if (checkErr) return;
                            if (Number(columnRows?.[0]?.existe || 0) > 0) return;

                            db.query(`ALTER TABLE anulacion_deuda ADD COLUMN ${columnName} ${sqlType}`, (alterErr) => {
                                if (alterErr) {
                                    console.error(`No se pudo crear columna ${columnName} en anulacion_deuda:`, alterErr.message);
                                }
                            });
                        }
                    );
                });
            };

            ensureColumns();
            return;
        }

        db.query(`
            CREATE TABLE IF NOT EXISTS anulacion_deuda (
                id_anulacion BIGINT NOT NULL AUTO_INCREMENT,
                id_morosidad INT NULL,
                id_contrato INT NULL,
                id_usuario_autoriza INT NULL,
                monto_anulado DECIMAL(12,2) NOT NULL DEFAULT 0,
                motivo LONGTEXT NULL,
                id_pago INT NULL,
                correlativo VARCHAR(80) NULL,
                estado_factura VARCHAR(20) NOT NULL DEFAULT 'ANULADA',
                fecha_anulacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id_anulacion),
                INDEX idx_anulacion_pago (id_pago),
                INDEX idx_anulacion_contrato (id_contrato),
                INDEX idx_anulacion_correlativo (correlativo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `, (createErr) => {
            if (createErr) {
                console.error('No se pudo crear anulacion_deuda:', createErr.message);
            }
        });
    });
};

ensureAnulacionDeudaTable();

const registrarHistorialAnulacion = ({
    pago,
    correlativoFinal,
    idUsuarioAutoriza,
    motivo,
    callback
}) => {
    const detalle = Array.isArray(pago?.detalle_cobro) ? pago.detalle_cobro : [];
    const rows = detalle.map((item) => {
        const evidencia = JSON.stringify({
            accion: 'ANULACION',
            id_pago: Number(pago?.id_pago || 0),
            correlativo: correlativoFinal,
            metodo_pago: pago?.forma_pago || null,
            banco_pago: pago?.banco_pago || null,
            fecha_operacion: pago?.fecha_operacion || null,
            boleta_referencia: pago?.boleta_referencia || pago?.no_referencia || correlativoFinal,
            id_usuario_cobro: Number(pago?.id_usuario || 0),
            rol_usuario_emisor: pago?.rol_usuario_emisor || null,
            nombre_usuario_cobro: pago?.nombre_usuario_cobro || null,
            id_usuario_autoriza: Number(idUsuarioAutoriza || 0),
            motivo_anulacion: motivo,
            detalle_original: item
        });

        return [
            Number(pago?.id_pago || 0),
            Number(item?.id_pago_detalle || 0) || null,
            Number(pago?.id_contrato || 0) || null,
            Number(pago?.id_residente || 0) || null,
            Number(pago?.id_usuario || 0) || null,
            String(pago?.rol_usuario_emisor || '').trim() || null,
            correlativoFinal,
            'ANULADA',
            String(item?.tipo_concepto || ''),
            item?.id_concepto_servicio == null ? null : Number(item.id_concepto_servicio),
            String(item?.concepto || ''),
            String(item?.mes_pagado || ''),
            item?.numero_cuota_afectada == null ? null : Number(item.numero_cuota_afectada),
            Number(item?.subtotal || 0),
            evidencia
        ];
    });

    if (!rows.length) {
        const evidencia = JSON.stringify({
            accion: 'ANULACION',
            id_pago: Number(pago?.id_pago || 0),
            correlativo: correlativoFinal,
            metodo_pago: pago?.forma_pago || null,
            banco_pago: pago?.banco_pago || null,
            fecha_operacion: pago?.fecha_operacion || null,
            boleta_referencia: pago?.boleta_referencia || pago?.no_referencia || correlativoFinal,
            id_usuario_cobro: Number(pago?.id_usuario || 0),
            rol_usuario_emisor: pago?.rol_usuario_emisor || null,
            id_usuario_autoriza: Number(idUsuarioAutoriza || 0),
            motivo_anulacion: motivo,
            detalle_original: []
        });

        rows.push([
            Number(pago?.id_pago || 0),
            null,
            Number(pago?.id_contrato || 0) || null,
            Number(pago?.id_residente || 0) || null,
            Number(pago?.id_usuario || 0) || null,
            String(pago?.rol_usuario_emisor || '').trim() || null,
            correlativoFinal,
            'ANULADA',
            'anulacion_cobro',
            null,
            'Anulacion de cobro',
            '',
            null,
            Number(pago?.principal_pagado || 0),
            evidencia
        ]);
    }

    const sql = `
        INSERT INTO facturas_historial (
            id_pago, id_pago_detalle, id_contrato, id_residente, id_usuario,
            rol_usuario_emisor,
            correlativo, estado_factura, tipo_concepto, id_concepto_servicio,
            nombre_concepto, mes_pagado, numero_cuota_afectada, subtotal, evidencia_json
        ) VALUES ?
    `;

    db.query(sql, [rows], (err) => callback(err));
};

const resolverPagoPorCorrelativo = (correlativo, callback) => {
    const valor = String(correlativo || '').trim();
    if (!valor) {
        return callback(new Error('Debe proporcionar un número de correlativo.'));
    }

    const esNumerico = /^#?\d+$/.test(valor);
    const correlativoLimpio = valor.replace('#', '');
    const correlativoNumero = Number(correlativoLimpio || 0);

    const whereSql = esNumerico
        ? "(p.id_pago = ? OR UPPER(COALESCE(p.no_referencia, '')) = UPPER(?) OR CAST(SUBSTRING_INDEX(COALESCE(p.no_referencia, ''), '-', -1) AS UNSIGNED) = ?)"
        : "UPPER(COALESCE(p.no_referencia, '')) = UPPER(?)";

    const params = esNumerico
        ? [Number(correlativoLimpio), correlativoLimpio, correlativoNumero]
        : [correlativoLimpio];

    const sql = `
        SELECT
            p.id_pago,
            p.id_contrato,
            p.id_usuario,
            u.nombre AS nombre_usuario_cobro,
            u.correo AS correo_usuario_cobro,
                        ru.nombre_rol AS rol_usuario_cobro_actual,
                        (
                                SELECT fhh.rol_usuario_emisor
                                FROM facturas_historial fhh
                                WHERE fhh.id_pago = p.id_pago
                                    AND fhh.estado_factura = 'EMITIDA'
                                ORDER BY fhh.id_historial ASC
                                LIMIT 1
                        ) AS rol_usuario_emisor_historico,
            p.fecha_pago,
            p.monto_total_pagado,
            p.forma_pago,
            p.no_referencia,
            c.codigo_contrato,
            c.id_residente,
            c.mes_inicio_pagos,
            c.anio_inicio_pagos,
            r.nombre AS nombre_residente,
            COALESCE(SUM(pd.subtotal), 0) AS principal_pagado,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'cuota_terreno' THEN pd.subtotal ELSE 0 END), 0) AS principal_terreno,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'enganche' THEN pd.subtotal ELSE 0 END), 0) AS principal_enganche,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'abono_capital' THEN pd.subtotal ELSE 0 END), 0) AS principal_abono_capital,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'servicio' THEN pd.subtotal ELSE 0 END), 0) AS principal_servicios,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'mora' THEN pd.subtotal ELSE 0 END), 0) AS principal_mora,
            GROUP_CONCAT(DISTINCT pd.mes_pagado ORDER BY pd.mes_pagado SEPARATOR ', ') AS meses_pagados
        FROM pagos p
        INNER JOIN contratos_residentes c ON c.id_contrato = p.id_contrato
        LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
        LEFT JOIN roles ru ON ru.id_rol = u.id_rol
        LEFT JOIN residentes r ON r.id_residente = c.id_residente
        LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE ${whereSql}
        GROUP BY p.id_pago, p.id_contrato, p.id_usuario, u.nombre, u.correo, ru.nombre_rol, p.fecha_pago, p.monto_total_pagado, p.forma_pago, p.no_referencia, c.codigo_contrato, c.id_residente, c.mes_inicio_pagos, c.anio_inicio_pagos, r.nombre
        ORDER BY p.id_pago DESC
        LIMIT 1
    `;

    db.query(sql, params, (err, rows) => {
        if (err) return callback(err);
        if (!rows || !rows.length) {
            const whereAnulacionSql = esNumerico
                ? "(UPPER(COALESCE(ad.correlativo, '')) = UPPER(?) OR CAST(SUBSTRING_INDEX(COALESCE(ad.correlativo, ''), '-', -1) AS UNSIGNED) = ?)"
                : "UPPER(COALESCE(ad.correlativo, '')) = UPPER(?)";

            const paramsAnulacion = esNumerico
                ? [correlativoLimpio, correlativoNumero]
                : [correlativoLimpio];

            const sqlAnulacion = `
                SELECT
                    ad.id_anulacion,
                    ad.id_pago,
                    ad.id_contrato,
                    ad.id_usuario_autoriza,
                    ad.monto_anulado,
                    ad.motivo,
                    ad.correlativo,
                    ad.fecha_anulacion,
                    u.nombre AS nombre_usuario_autoriza,
                    fh.id_usuario AS id_usuario_cobro,
                    fh.rol_usuario_emisor AS rol_usuario_emisor,
                    uc.nombre AS nombre_usuario_cobro,
                    r.nombre AS nombre_residente
                FROM anulacion_deuda ad
                LEFT JOIN usuarios u ON u.id_usuario = ad.id_usuario_autoriza
                LEFT JOIN facturas_historial fh ON fh.id_pago = ad.id_pago AND fh.estado_factura = 'EMITIDA'
                LEFT JOIN usuarios uc ON uc.id_usuario = fh.id_usuario
                LEFT JOIN residentes r ON r.id_residente = fh.id_residente
                WHERE ${whereAnulacionSql}
                ORDER BY ad.id_anulacion DESC
                LIMIT 1
            `;

            return db.query(sqlAnulacion, paramsAnulacion, (anulErr, anulRows) => {
                if (anulErr) return callback(anulErr);

                if (!anulRows || !anulRows.length) {
                    return callback(null, null);
                }

                const anulacion = anulRows[0];
                return callback(null, {
                    ya_anulado: true,
                    id_anulacion: Number(anulacion.id_anulacion || 0),
                    id_pago: Number(anulacion.id_pago || 0),
                    id_contrato: Number(anulacion.id_contrato || 0),
                    correlativo: anulacion.correlativo || correlativoLimpio,
                    monto_anulado: Number(anulacion.monto_anulado || 0),
                    fecha_anulacion: anulacion.fecha_anulacion,
                    motivo_anulacion: anulacion.motivo || '',
                    id_usuario_autoriza: Number(anulacion.id_usuario_autoriza || 0),
                    nombre_usuario_autoriza: anulacion.nombre_usuario_autoriza || null,
                    id_usuario_cobro: anulacion.id_usuario_cobro ? Number(anulacion.id_usuario_cobro) : null,
                    rol_usuario_emisor: anulacion.rol_usuario_emisor || null,
                    nombre_usuario_cobro: anulacion.nombre_usuario_cobro || null,
                    nombre_residente: anulacion.nombre_residente || null
                });
            });
        }

        const pago = rows[0];
        const obtenerDetalleDeFacturaEmitida = (onDetalle) => {
            db.query(
                `
                    SELECT
                        fh.id_historial AS id_pago_detalle,
                        fh.tipo_concepto,
                        fh.id_concepto_servicio,
                        fh.mes_pagado,
                        fh.numero_cuota_afectada,
                        fh.subtotal,
                        fh.nombre_concepto,
                        fh.evidencia_json
                    FROM facturas_historial fh
                    WHERE fh.id_pago = ?
                      AND COALESCE(fh.estado_factura, 'EMITIDA') = 'EMITIDA'
                    ORDER BY fh.id_historial ASC
                `,
                [pago.id_pago],
                (detailErr, facturasEmitidas) => {
                    if (detailErr) {
                        return onDetalle(detailErr, null);
                    }

                    if (facturasEmitidas && facturasEmitidas.length) {
                        return onDetalle(null, facturasEmitidas);
                    }

                    db.query(
                        `
                            SELECT
                                pd.id_pago_detalle,
                                pd.tipo_concepto,
                                pd.id_concepto_servicio,
                                pd.mes_pagado,
                                pd.numero_cuota_afectada,
                                pd.subtotal,
                                s.nombre_servicio
                            FROM pagos_detalle pd
                            LEFT JOIN servicios s ON s.id_servicio = pd.id_concepto_servicio
                            WHERE pd.id_pago = ?
                            ORDER BY pd.id_pago_detalle ASC
                        `,
                        [pago.id_pago],
                        (fallbackErr, fallbackRows) => onDetalle(fallbackErr, fallbackRows || [])
                    );
                }
            );
        };

        obtenerDetalleDeFacturaEmitida((detailErr, detailRows) => {
            if (detailErr) return callback(detailErr);

            const sqlExtrasHistorial = `
                SELECT evidencia_json
                FROM facturas_historial
                WHERE id_pago = ?
                  AND estado_factura = 'EMITIDA'
                  AND tipo_concepto = 'extraordinario'
                ORDER BY id_historial ASC
            `;

            db.query(sqlExtrasHistorial, [pago.id_pago], (histErr, histRows) => {
                if (histErr && String(histErr?.code || '').toUpperCase() !== 'ER_NO_SUCH_TABLE') {
                    return callback(histErr);
                }

                const extrasHistorialIds = (histRows || []).map((row) => {
                    try {
                        const evidencia = JSON.parse(row.evidencia_json || '{}');
                        const idExtra = Number(
                            evidencia?.detalle?.id_pago_extra
                            || evidencia?.detalle?.id_concepto_servicio
                            || 0
                        );
                        return Number.isInteger(idExtra) && idExtra > 0 ? idExtra : null;
                    } catch {
                        return null;
                    }
                }).filter((value) => value != null);

                let idxExtraHistorial = 0;
                const obtenerCuotaFinanciadaCorrecta = (mesPagado, numeroGuardado) => {
                    const mesInicio = Number(pago.mes_inicio_pagos || 0);
                    const anioInicio = Number(pago.anio_inicio_pagos || 0);
                    const match = String(mesPagado || '').trim().match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
                    if (!match || mesInicio < 1 || mesInicio > 12 || anioInicio < 1900) {
                        return numeroGuardado ? Number(numeroGuardado) : null;
                    }

                    const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                    const nombreMes = match[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    const indiceMes = nombres.indexOf(nombreMes);
                    if (indiceMes < 0) return numeroGuardado ? Number(numeroGuardado) : null;

                    const diferencia = ((Number(match[2]) - anioInicio) * 12) + (indiceMes - (mesInicio - 1));
                    return diferencia >= 0 ? diferencia + 1 : (numeroGuardado ? Number(numeroGuardado) : null);
                };

                const detalle_cobro = (detailRows || []).map((row) => {
                    const tipoConcepto = String(row.tipo_concepto || '').toLowerCase();
                    const esCuotaCeroEnganche = tipoConcepto === 'cuota_terreno' && Number(row.numero_cuota_afectada || 0) <= 0;
                    const tipoConceptoNormalizado = esCuotaCeroEnganche ? 'enganche' : tipoConcepto;
                    let idConceptoServicio = row.id_concepto_servicio ? Number(row.id_concepto_servicio) : null;
                    const numeroCuotaCorregido = tipoConceptoNormalizado === 'cuota_terreno'
                        ? obtenerCuotaFinanciadaCorrecta(row.mes_pagado, row.numero_cuota_afectada)
                        : (row.numero_cuota_afectada ? Number(row.numero_cuota_afectada) : null);

                    if (tipoConcepto === 'extraordinario' && !idConceptoServicio) {
                        idConceptoServicio = extrasHistorialIds[idxExtraHistorial] || null;
                        idxExtraHistorial += 1;
                    }

                    const nombreConcepto = String(row.nombre_concepto || '').trim();
                    const conceptoBase = tipoConceptoNormalizado === 'cuota_terreno'
                        ? `Cuota de Terreno No. ${numeroCuotaCorregido || ''}`.trim()
                        : tipoConceptoNormalizado === 'enganche'
                            ? 'Enganche'
                        : tipoConceptoNormalizado === 'abono_capital'
                            ? 'Abono a capital (sin interes)'
                        : tipoConceptoNormalizado === 'mora'
                            ? `Mora ${row.mes_pagado || ''}`.trim()
                        : tipoConceptoNormalizado === 'extraordinario'
                            ? 'Cargo extraordinario'
                        : (nombreConcepto || `Servicio: ${row.nombre_servicio || `ID ${idConceptoServicio || 'N/A'}`}`);

                    return {
                        id_pago_detalle: Number(row.id_pago_detalle),
                        tipo_concepto: tipoConceptoNormalizado,
                        id_concepto_servicio: idConceptoServicio,
                        mes_pagado: row.mes_pagado || '',
                        numero_cuota_afectada: numeroCuotaCorregido,
                        subtotal: Number(row.subtotal || 0),
                        concepto: conceptoBase
                    };
                });

                const mesesUnicos = [];
                detalle_cobro.forEach((item) => {
                    const mes = String(item.mes_pagado || '').trim();
                    if (mes && !mesesUnicos.includes(mes)) {
                        mesesUnicos.push(mes);
                    }
                });

                return callback(null, {
                    ...pago,
                    rol_usuario_emisor: pago.rol_usuario_emisor_historico || pago.rol_usuario_cobro_actual || null,
                    meses_pagados: mesesUnicos.join(', '),
                    detalle_cobro
                });
            });
        });
    });
};

router.get("/", (req, res) => {
    db.query('SELECT * FROM anulacion_deuda ORDER BY id_anulacion DESC', (err, result) => {
        if (err) res.status(500).send("Error de servidor");
        else res.send(result);
    });
});

router.get('/buscar-correlativo/:correlativo', (req, res) => {
    resolverPagoPorCorrelativo(req.params.correlativo, (err, pago) => {
        if (err) {
            return res.status(400).send({ message: err.message });
        }

        if (!pago) {
            return res.status(404).send({ message: 'No se encontró un cobro con ese correlativo.' });
        }

        if (pago.ya_anulado) {
            return res.status(409).send({
                message: `El correlativo ya fue anulado (anulación #${pago.id_anulacion}).`,
                ...pago
            });
        }

        return res.status(200).send(pago);
    });
});

router.post('/anular-por-correlativo', (req, res) => {
    const { correlativo, id_pago, id_usuario_autoriza, motivo } = req.body;

    if ((!correlativo && !id_pago) || !id_usuario_autoriza || !String(motivo || '').trim()) {
        return res.status(400).send({ message: 'Debe enviar correlativo, usuario que autoriza y motivo.' });
    }

    const criterioBusqueda = Number.isInteger(Number(id_pago)) && Number(id_pago) > 0
        ? String(Number(id_pago))
        : correlativo;

    resolverPagoPorCorrelativo(criterioBusqueda, (resolveErr, pago) => {
        if (resolveErr) {
            return res.status(400).send({ message: resolveErr.message });
        }

        if (!pago) {
            return res.status(404).send({ message: 'No se encontró el cobro a anular.' });
        }

        if (pago.ya_anulado) {
            return res.status(409).send({ message: `El correlativo ya fue anulado (anulación #${pago.id_anulacion}).` });
        }

        const principalAnular = parseFloat(pago.principal_pagado || 0);
        const principalTerreno = parseFloat(pago.principal_terreno || 0);
        const principalEnganche = parseFloat(pago.principal_enganche || 0);
        const principalAbonoCapital = parseFloat(pago.principal_abono_capital || 0);
        const cuotasTerrenoAfectadas = [...new Set(
            (Array.isArray(pago?.detalle_cobro) ? pago.detalle_cobro : [])
                .filter((item) => String(item?.tipo_concepto || '').toLowerCase() === 'cuota_terreno')
                .map((item) => Number(item?.numero_cuota_afectada || 0))
                .filter((numero) => Number.isInteger(numero) && numero > 0)
        )];
        const cuotasRevertidas = cuotasTerrenoAfectadas.length
            ? cuotasTerrenoAfectadas.length
            : (() => {
                const mesList = (Array.isArray(pago?.meses_pagados) ? pago.meses_pagados : String(pago?.meses_pagados || '').split(','));
                const mesesUnicos = [...new Set(mesList.map((mes) => String(mes || '').trim()).filter(Boolean))];
                return mesesUnicos.length;
            })();
        const capitalRestaurar = parseFloat(
            (Array.isArray(pago?.detalle_cobro) ? pago.detalle_cobro : [])
                .filter((item) => {
                    const tipo = String(item?.tipo_concepto || '').toLowerCase();
                    return ['cuota_terreno', 'interes', 'abono_capital'].includes(tipo);
                })
                .reduce((sum, item) => sum + Number(item?.subtotal || 0), 0)
                .toFixed(2)
        );
        const correlativoFinal = String(pago.no_referencia || correlativo || '').trim();
        if (!Number.isFinite(principalAnular) || principalAnular <= 0) {
            return res.status(400).send({ message: 'El correlativo no tiene detalle válido para reversar el cargo.' });
        }

        const validarDuplicadoAnulacion = (finalCallback) => {
            db.query("SHOW TABLES LIKE 'anulacion_deuda'", (showErr, tablas) => {
                if (showErr || !tablas || !tablas.length) {
                    return finalCallback(null, []);
                }

                db.query(
                    `SELECT id_anulacion, id_pago, estado_factura
                     FROM anulacion_deuda
                     WHERE UPPER(COALESCE(correlativo, '')) = UPPER(?)
                       AND COALESCE(estado_factura, 'ANULADA') = 'ANULADA'
                     LIMIT 1`,
                    [correlativoFinal],
                    (duplicadoErr, duplicadoRows) => {
                        if (duplicadoErr) {
                            const codigo = String(duplicadoErr?.code || '').toUpperCase();
                            if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_COLUMN'].includes(codigo)) {
                                return finalCallback(null, []);
                            }
                            return finalCallback(duplicadoErr, null);
                        }

                        return finalCallback(null, duplicadoRows || []);
                    }
                );
            });
        };

        const continuarTrasValidacion = () => {
            db.beginTransaction((txErr) => {
                if (txErr) return res.status(500).send({ message: 'Error de transacción al anular cobro.' });

                const recalcularContratoTrasAnulacion = (finishCallback) => {
                    const sqlRecalculo = `
                        UPDATE contratos_residentes c
                        LEFT JOIN (
                            SELECT p.id_contrato,
                                   COALESCE(SUM(CASE WHEN pd.tipo_concepto IN ('cuota_terreno', 'interes', 'abono_capital') THEN pd.subtotal ELSE 0 END), 0) AS total_pagado
                            FROM pagos p
                            INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                            GROUP BY p.id_contrato
                        ) pagos ON pagos.id_contrato = c.id_contrato
                        SET c.saldo_pendiente = GREATEST(
                                COALESCE(c.monto_total, 0) - COALESCE(c.enganche, 0) - COALESCE(pagos.total_pagado, 0),
                                0
                            ),
                            c.cuotas_pagadas = COALESCE(
                                (
                                    SELECT COUNT(DISTINCT CASE
                                        WHEN COALESCE(pd.numero_cuota_afectada, 0) > 0 THEN pd.numero_cuota_afectada
                                        ELSE NULL
                                    END)
                                    FROM pagos p
                                    INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                                    WHERE p.id_contrato = c.id_contrato
                                      AND pd.tipo_concepto = 'cuota_terreno'
                                ),
                                0
                            )
                        WHERE c.id_contrato = ?
                    `;

                    db.query(sqlRecalculo, [pago.id_contrato], (saldoErr) => {
                        if (saldoErr) {
                            return db.rollback(() => res.status(500).send({ message: 'No se pudo restaurar el saldo del contrato.' }));
                        }

                        db.query(
                            `
                                UPDATE contratos_residentes c
                                SET c.cuotas_pagadas = COALESCE(
                                    (
                                        SELECT COUNT(DISTINCT CASE
                                            WHEN COALESCE(pd.numero_cuota_afectada, 0) > 0 THEN pd.numero_cuota_afectada
                                            ELSE NULL
                                        END)
                                        FROM pagos p
                                        INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                                        WHERE p.id_contrato = c.id_contrato
                                          AND pd.tipo_concepto = 'cuota_terreno'
                                    ),
                                    0
                                )
                                WHERE c.id_contrato = ?
                            `,
                            [pago.id_contrato],
                            (syncErr) => {
                                if (syncErr) {
                                    return db.rollback(() => res.status(500).send({ message: 'No se pudo recalcular las cuotas pagadas del contrato.' }));
                                }
                                return finishCallback();
                            }
                        );
                    });
                };

                const restaurarConvenio = (callbackRestore) => {
                    if (!Number.isFinite(capitalRestaurar) || capitalRestaurar <= 0) {
                        return callbackRestore();
                    }

                    const sqlConvenioActivo = `
                        SELECT id_convenio, monto_original, saldo_actual, estado
                        FROM convenio_pagos
                        WHERE id_contrato = ?
                          AND LOWER(COALESCE(estado, 'activo')) IN ('activo', 'cumplido', 'incumplido')
                        ORDER BY id_convenio DESC
                        LIMIT 1
                    `;

                    db.query(sqlConvenioActivo, [pago.id_contrato], (convErr, convRows) => {
                        if (convErr) {
                            if (String(convErr?.code || '').toUpperCase() === 'ER_NO_SUCH_TABLE') {
                                return callbackRestore();
                            }
                            return db.rollback(() => res.status(500).send({ message: 'No se pudo restaurar el saldo del convenio.' }));
                        }

                        if (!convRows || !convRows.length) {
                            return callbackRestore();
                        }

                        const convenio = convRows[0];
                        const montoOriginalConvenio = Number(convenio.monto_original || 0);
                        const saldoActualConvenio = Number(convenio.saldo_actual || 0);
                        const saldoRestaurado = Math.min(
                            saldoActualConvenio + capitalRestaurar,
                            montoOriginalConvenio > 0 ? montoOriginalConvenio : saldoActualConvenio + capitalRestaurar
                        );
                        const estadoRestaurado = saldoRestaurado > 0 ? 'activo' : String(convenio.estado || 'activo');

                        db.query(
                            'UPDATE convenio_pagos SET saldo_actual = ?, estado = ? WHERE id_convenio = ?',
                            [saldoRestaurado, estadoRestaurado, convenio.id_convenio],
                            (updConvErr) => {
                                if (updConvErr) {
                                    return db.rollback(() => res.status(500).send({ message: 'No se pudo actualizar convenio al anular cobro.' }));
                                }
                                return callbackRestore();
                            }
                        );
                    });
                };

                const idsPagoExtraRevertir = [...new Set((pago.detalle_cobro || [])
                    .filter((item) => String(item?.tipo_concepto || '').toLowerCase() === 'extraordinario')
                    .map((item) => Number(item?.id_concepto_servicio || 0))
                    .filter((id) => Number.isInteger(id) && id > 0))];

                const mesesRevertirMorosidad = [...new Set((pago.detalle_cobro || [])
                    .filter((item) => String(item?.tipo_concepto || '').toLowerCase() === 'mora')
                    .map((item) => String(item?.mes_pagado || '').trim())
                    .filter((mes) => mes))];

                const mesesBaseMorosidad = [...new Set(
                    mesesRevertirMorosidad
                        .map((mes) => String(mes || '').trim().split(/\s+/)[0] || '')
                        .map((mes) => mes.toLowerCase())
                        .filter(Boolean)
                )];

                const continuarTrasExtras = () => {
                    const detalleMeses = pago.meses_pagados ? ` | Meses: ${pago.meses_pagados}` : '';
                    const motivoCompleto = `${motivo} | Correlativo: ${correlativoFinal} | Pago #${pago.id_pago}${detalleMeses}`;

                    registrarHistorialAnulacion({
                        pago,
                        correlativoFinal,
                        idUsuarioAutoriza: id_usuario_autoriza,
                        motivo: motivoCompleto,
                        callback: (histErr) => {
                            if (histErr) {
                                return db.rollback(() => res.status(500).send({ message: 'No se pudo guardar la evidencia historica de anulacion.' }));
                            }

                            db.query(
                                'INSERT INTO anulacion_deuda (id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo, id_pago, correlativo, estado_factura) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                [null, pago.id_contrato, id_usuario_autoriza, principalAnular, motivoCompleto, pago.id_pago, correlativoFinal, 'ANULADA'],
                                (insertErr, insertResult) => {
                                    if (insertErr) {
                                        return db.rollback(() => res.status(500).send({ message: 'No se pudo registrar la anulación de deuda.' }));
                                    }

                                    db.commit((commitErr) => {
                                        if (commitErr) {
                                            return db.rollback(() => res.status(500).send({ message: 'No se pudo confirmar la anulación.' }));
                                        }

                                        registrarAuditoria(
                                            id_usuario_autoriza,
                                            req.body?.nombre_usuario || req.headers['x-user-name'] || 'DESCONOCIDO',
                                            'ANULADO',
                                            'anulacion_deuda',
                                            `Cobro anulado por correlativo ${correlativoFinal} (Pago #${pago.id_pago}) | Contrato #${pago.id_contrato} | Monto anulado Q${principalAnular.toFixed(2)} | Capital restaurado Q${capitalRestaurar.toFixed(2)} (terreno Q${principalTerreno.toFixed(2)}, enganche Q${principalEnganche.toFixed(2)}, abono Q${principalAbonoCapital.toFixed(2)})`,
                                            obtenerIP(req),
                                            'exitoso'
                                        );

                                        return res.status(200).send({
                                            message: 'Cobro anulado correctamente por correlativo.',
                                            id_anulacion: insertResult.insertId,
                                            id_pago_anulado: pago.id_pago,
                                            id_contrato: pago.id_contrato,
                                            correlativo: correlativoFinal,
                                            monto_restaurado: principalAnular,
                                            monto_restaurado_capital: capitalRestaurar,
                                            monto_restaurado_terreno: principalTerreno,
                                            monto_restaurado_enganche: principalEnganche,
                                            monto_restaurado_abono_capital: principalAbonoCapital,
                                            monto_revertido_servicios: parseFloat(pago.principal_servicios || 0),
                                            residente: pago.nombre_residente || 'N/A',
                                            meses: pago.meses_pagados || '',
                                            detalle_cobro: pago.detalle_cobro || []
                                        });
                                    });
                                }
                            );
                        }
                    });
                };

                const revertirExtras = (callbackExtras) => {
                    if (!idsPagoExtraRevertir.length) {
                        return callbackExtras();
                    }

                    const placeholdersExtra = idsPagoExtraRevertir.map(() => '?').join(', ');
                    const sqlExtra = `
                        UPDATE pagos_extraordinarios
                        SET estado = 'pendiente', fecha_pago = NULL
                        WHERE id_contrato = ?
                          AND id_pago_extra IN (${placeholdersExtra})
                    `;

                    db.query(sqlExtra, [pago.id_contrato, ...idsPagoExtraRevertir], (extraErr) => {
                        if (extraErr) {
                            const codigoError = String(extraErr?.code || '').toUpperCase();
                            console.warn('[anulacion] No se pudo restaurar cargo extraordinario; se continúa con la anulacion.', {
                                id_contrato: pago.id_contrato,
                                idsPagoExtraRevertir,
                                codigoError,
                                mensaje: extraErr?.message || ''
                            });
                            return callbackExtras();
                        }

                        return callbackExtras();
                    });
                };

                const restaurarMorosidad = (callbackMora) => {
                    if (!mesesRevertirMorosidad.length) {
                        return callbackMora();
                    }

                    const condicionesMes = [];
                    const paramsMes = [pago.id_contrato];

                    if (mesesRevertirMorosidad.length) {
                        const placeholdersMeses = mesesRevertirMorosidad.map(() => '?').join(', ');
                        condicionesMes.push(`mes_atrasado IN (${placeholdersMeses})`);
                        paramsMes.push(...mesesRevertirMorosidad);
                    }

                    if (mesesBaseMorosidad.length) {
                        const placeholdersMesBase = mesesBaseMorosidad.map(() => '?').join(', ');
                        condicionesMes.push(`LOWER(TRIM(SUBSTRING_INDEX(mes_atrasado, ' ', 1))) IN (${placeholdersMesBase})`);
                        paramsMes.push(...mesesBaseMorosidad);
                    }

                    const sqlMorosidad = `
                        UPDATE morosidad
                        SET estado = 'pendiente'
                        WHERE id_contrato = ?
                          AND estado = 'pagado'
                          ${condicionesMes.length ? `AND (${condicionesMes.join(' OR ')})` : ''}
                    `;

                    db.query(sqlMorosidad, paramsMes, (moraErr) => {
                        if (moraErr && String(moraErr?.code || '').toUpperCase() !== 'ER_NO_SUCH_TABLE') {
                            return db.rollback(() => res.status(500).send({ message: 'No se pudo restaurar el estado de morosidad al anular.' }));
                        }

                        return callbackMora();
                    });
                };

                restaurarConvenio(() => {
                    db.query('DELETE FROM pagos_detalle WHERE id_pago = ?', [pago.id_pago], (delDetalleErr) => {
                        if (delDetalleErr) {
                            return db.rollback(() => res.status(500).send({ message: 'No se pudo eliminar el detalle del cobro.' }));
                        }

                        db.query('DELETE FROM pagos WHERE id_pago = ?', [pago.id_pago], (delPagoErr) => {
                            if (delPagoErr) {
                                return db.rollback(() => res.status(500).send({ message: 'No se pudo eliminar el cobro principal.' }));
                            }

                            recalcularContratoTrasAnulacion(() => {
                                revertirExtras(() => {
                                    restaurarMorosidad(() => continuarTrasExtras());
                                });
                            });
                        });
                    });
                });
            });
        };

        validarDuplicadoAnulacion((duplicadoErr, duplicadoRows) => {
            if (duplicadoErr) {
                return res.status(500).send({ message: 'No se pudo validar si el correlativo ya fue anulado.' });
            }

            if (duplicadoRows && duplicadoRows.length) {
                return res.status(409).send({
                    message: `El correlativo ${correlativoFinal} ya fue anulado (anulación #${duplicadoRows[0].id_anulacion}).`
                });
            }

            db.query('SELECT id_anulacion FROM anulacion_deuda WHERE id_pago = ? AND COALESCE(estado_factura, "ANULADA") = "ANULADA" LIMIT 1', [pago.id_pago], (checkErr, checkRows) => {
                if (checkErr) {
                    const codigo = String(checkErr?.code || '').toUpperCase();
                    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_COLUMN'].includes(codigo)) {
                        return continuarTrasValidacion();
                    }
                    return res.status(500).send({ message: 'No fue posible validar si el correlativo ya fue anulado.' });
                }

                if (checkRows && checkRows.length) {
                    return res.status(409).send({ message: `El correlativo ya fue anulado (anulación #${checkRows[0].id_anulacion}).` });
                }

                return continuarTrasValidacion();
            });
        });
    });
});

router.post("/crear", (req, res) => {
    const { id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo } = req.body;
    db.query(
        'INSERT INTO anulacion_deuda (id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo) VALUES (?, ?, ?, ?, ?)',
        [id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo],
        (err, result) => {
            if (err) res.status(500).send("Error al registrar");
            else res.status(200).send("Registrado");
        }
    );
});

router.put("/actualizar", (req, res) => {
    const { id_anulacion, id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo } = req.body;
    db.query(
        'UPDATE anulacion_deuda SET id_morosidad=?, id_contrato=?, id_usuario_autoriza=?, monto_anulado=?, motivo=? WHERE id_anulacion=?',
        [id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo, id_anulacion],
        (err, result) => {
            if (err) res.status(500).send("Error al actualizar");
            else res.status(200).send("Actualizado");
        }
    );
});

router.delete("/delete/:id_anulacion", (req, res) => {
    db.query('DELETE FROM anulacion_deuda WHERE id_anulacion = ?', [req.params.id_anulacion], (err, result) => {
        if (err) res.status(500).send("Error al eliminar");
        else res.status(200).send("Eliminado");
    });
});

module.exports = router;
