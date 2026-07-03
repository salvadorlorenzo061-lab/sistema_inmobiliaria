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

const resolverPagoPorCorrelativo = (correlativo, callback) => {
    const valor = String(correlativo || '').trim();
    if (!valor) {
        return callback(new Error('Debe proporcionar un número de correlativo.'));
    }

    const esNumerico = /^#?\d+$/.test(valor);
    const correlativoLimpio = valor.replace('#', '');

    const whereSql = esNumerico
        ? '(p.id_pago = ? OR UPPER(COALESCE(p.no_referencia, "")) = UPPER(?))'
        : 'UPPER(COALESCE(p.no_referencia, "")) = UPPER(?)';

    const params = esNumerico
        ? [Number(correlativoLimpio), correlativoLimpio]
        : [correlativoLimpio];

    const sql = `
        SELECT
            p.id_pago,
            p.id_contrato,
            p.id_usuario,
            p.fecha_pago,
            p.monto_total_pagado,
            p.forma_pago,
            p.no_referencia,
            c.codigo_contrato,
            c.id_residente,
            r.nombre AS nombre_residente,
            COALESCE(SUM(pd.subtotal), 0) AS principal_pagado,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'cuota_terreno' THEN pd.subtotal ELSE 0 END), 0) AS principal_terreno,
            COALESCE(SUM(CASE WHEN pd.tipo_concepto = 'servicio' THEN pd.subtotal ELSE 0 END), 0) AS principal_servicios,
            GROUP_CONCAT(DISTINCT pd.mes_pagado ORDER BY pd.mes_pagado SEPARATOR ', ') AS meses_pagados
        FROM pagos p
        INNER JOIN contratos_residentes c ON c.id_contrato = p.id_contrato
        LEFT JOIN residentes r ON r.id_residente = c.id_residente
        LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE ${whereSql}
        GROUP BY p.id_pago, p.id_contrato, p.id_usuario, p.fecha_pago, p.monto_total_pagado, p.forma_pago, p.no_referencia, c.codigo_contrato, c.id_residente, r.nombre
        ORDER BY p.id_pago DESC
        LIMIT 1
    `;

    db.query(sql, params, (err, rows) => {
        if (err) return callback(err);
        if (!rows || !rows.length) return callback(null, null);

        const pago = rows[0];
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
            (detailErr, detailRows) => {
                if (detailErr) return callback(detailErr);

                const detalle_cobro = (detailRows || []).map((row) => ({
                    id_pago_detalle: Number(row.id_pago_detalle),
                    tipo_concepto: row.tipo_concepto,
                    id_concepto_servicio: row.id_concepto_servicio ? Number(row.id_concepto_servicio) : null,
                    mes_pagado: row.mes_pagado || '',
                    numero_cuota_afectada: row.numero_cuota_afectada ? Number(row.numero_cuota_afectada) : null,
                    subtotal: Number(row.subtotal || 0),
                    concepto: row.tipo_concepto === 'cuota_terreno'
                        ? `Cuota de Terreno No. ${row.numero_cuota_afectada || ''}`.trim()
                        : `Servicio: ${row.nombre_servicio || `ID ${row.id_concepto_servicio || 'N/A'}`}`
                }));

                const mesesUnicos = [];
                detalle_cobro.forEach((item) => {
                    const mes = String(item.mes_pagado || '').trim();
                    if (mes && !mesesUnicos.includes(mes)) {
                        mesesUnicos.push(mes);
                    }
                });

                return callback(null, {
                    ...pago,
                    meses_pagados: mesesUnicos.join(', '),
                    detalle_cobro
                });
            }
        );
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

        return res.status(200).send(pago);
    });
});

router.post('/anular-por-correlativo', (req, res) => {
    const { correlativo, id_usuario_autoriza, motivo } = req.body;

    if (!correlativo || !id_usuario_autoriza || !String(motivo || '').trim()) {
        return res.status(400).send({ message: 'Debe enviar correlativo, usuario que autoriza y motivo.' });
    }

    resolverPagoPorCorrelativo(correlativo, (resolveErr, pago) => {
        if (resolveErr) {
            return res.status(400).send({ message: resolveErr.message });
        }

        if (!pago) {
            return res.status(404).send({ message: 'No se encontró el cobro a anular.' });
        }

        const principalAnular = parseFloat(pago.principal_pagado || 0);
        const principalTerreno = parseFloat(pago.principal_terreno || 0);
        if (!Number.isFinite(principalAnular) || principalAnular <= 0) {
            return res.status(400).send({ message: 'El correlativo no tiene detalle válido para reversar el cargo.' });
        }

        db.query('SELECT id_anulacion FROM anulacion_deuda WHERE id_pago = ? LIMIT 1', [pago.id_pago], (checkErr, checkRows) => {
            if (checkErr) {
                return res.status(500).send({ message: 'No fue posible validar si el correlativo ya fue anulado.' });
            }

            if (checkRows && checkRows.length) {
                return res.status(409).send({ message: `El correlativo ya fue anulado (anulación #${checkRows[0].id_anulacion}).` });
            }

            db.beginTransaction((txErr) => {
                if (txErr) return res.status(500).send({ message: 'Error de transacción al anular cobro.' });

                db.query(
                    'UPDATE contratos_residentes SET monto_total = monto_total + ? WHERE id_contrato = ?',
                    [principalTerreno, pago.id_contrato],
                    (saldoErr) => {
                        if (saldoErr) {
                            return db.rollback(() => res.status(500).send({ message: 'No se pudo restaurar el saldo del contrato.' }));
                        }

                        db.query('DELETE FROM pagos_detalle WHERE id_pago = ?', [pago.id_pago], (delDetalleErr) => {
                            if (delDetalleErr) {
                                return db.rollback(() => res.status(500).send({ message: 'No se pudo eliminar el detalle del cobro.' }));
                            }

                            db.query('DELETE FROM pagos WHERE id_pago = ?', [pago.id_pago], (delPagoErr) => {
                                if (delPagoErr) {
                                    return db.rollback(() => res.status(500).send({ message: 'No se pudo eliminar el cobro principal.' }));
                                }

                                const correlativoFinal = pago.no_referencia || `PAGO-${pago.id_pago}`;
                                const detalleMeses = pago.meses_pagados ? ` | Meses: ${pago.meses_pagados}` : '';
                                const motivoCompleto = `${motivo} | Correlativo: ${correlativoFinal} | Pago #${pago.id_pago}${detalleMeses}`;

                                db.query(
                                    'INSERT INTO anulacion_deuda (id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo, id_pago, correlativo) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                    [null, pago.id_contrato, id_usuario_autoriza, principalAnular, motivoCompleto, pago.id_pago, correlativoFinal],
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
                                                `Cobro anulado por correlativo ${correlativoFinal} (Pago #${pago.id_pago}) | Contrato #${pago.id_contrato} | Monto restaurado Q${principalAnular.toFixed(2)}`,
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
                                                monto_restaurado_terreno: principalTerreno,
                                                monto_revertido_servicios: parseFloat(pago.principal_servicios || 0),
                                                residente: pago.nombre_residente || 'N/A',
                                                meses: pago.meses_pagados || '',
                                                detalle_cobro: pago.detalle_cobro || []
                                            });
                                        });
                                    }
                                );
                            });
                        });
                    }
                );
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