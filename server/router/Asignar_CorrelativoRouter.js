const express = require('express');
const cors = require('cors');
const db = require('../Conexion');

const router = express.Router();

router.use(cors());
router.use(express.json());

const padCorrelativo = (value) => String(Number(value) || 0).padStart(8, '0');

const ensureAsignacionesTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS asignar_correlativos (
            id_asignacion INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_usuario INT NOT NULL,
            id_resolucion INT NOT NULL,
            id_empresa INT NULL,
            serie VARCHAR(50) NOT NULL,
            correlativo_inicio INT NOT NULL,
            correlativo_fin INT NOT NULL,
            correlativo_actual INT NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'activo',
            observaciones TEXT NULL,
            fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            fecha_cierre DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    db.query(sql, (err) => {
        if (err) {
            console.error('Error asegurando tabla asignar_correlativos:', err.message);
        }
    });
};

ensureAsignacionesTable();

router.get('/', (req, res) => {
    const query = `
        SELECT
            ac.*,
            u.nombre AS nombre_usuario,
            u.correo,
            r.nombre_rol,
            e.nombre_empresa,
            rf.numero_resolucion,
            CONCAT(ac.serie, '-', LPAD(ac.correlativo_inicio, 8, '0')) AS correlativo_inicio_display,
            CONCAT(ac.serie, '-', LPAD(ac.correlativo_fin, 8, '0')) AS correlativo_fin_display,
            CASE
                WHEN ac.correlativo_actual <= ac.correlativo_fin THEN CONCAT(ac.serie, '-', LPAD(ac.correlativo_actual, 8, '0'))
                ELSE NULL
            END AS correlativo_actual_display,
            GREATEST((ac.correlativo_fin - ac.correlativo_actual) + 1, 0) AS correlativos_disponibles
        FROM asignar_correlativos ac
        INNER JOIN usuarios u ON u.id_usuario = ac.id_usuario
        LEFT JOIN roles r ON r.id_rol = u.id_rol
        INNER JOIN resoluciones_facturas rf ON rf.id_resolucion = ac.id_resolucion
        LEFT JOIN empresas e ON e.id_empresa = ac.id_empresa
        ORDER BY ac.id_asignacion DESC
    `;

    db.query(query, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ message: 'No se pudieron obtener las asignaciones de correlativos.' });
        }

        return res.send(rows);
    });
});

router.get('/estado-usuario', (req, res) => {
    const idUsuario = Number(req.query?.id_usuario || 0);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        return res.status(400).send({ message: 'Debe enviar un id_usuario válido.' });
    }

    const asignacionQuery = `
            SELECT
                ac.id_asignacion,
                ac.serie,
                ac.correlativo_inicio,
                ac.correlativo_actual,
                ac.correlativo_fin,
                ac.id_empresa,
                e.nombre_empresa,
                CONCAT(ac.serie, '-', LPAD(ac.correlativo_inicio, 8, '0')) AS correlativo_inicio_display,
                CONCAT(ac.serie, '-', LPAD(ac.correlativo_actual, 8, '0')) AS correlativo_actual_display
            FROM asignar_correlativos ac
            LEFT JOIN empresas e ON e.id_empresa = ac.id_empresa
            WHERE ac.id_usuario = ?
              AND ac.estado = 'activo'
              AND ac.correlativo_actual <= ac.correlativo_fin
            ORDER BY ac.fecha_asignacion ASC, ac.id_asignacion ASC
            LIMIT 1
        `;

    db.query(asignacionQuery, [idUsuario], (asignErr, asignRows) => {
        if (asignErr) {
            console.error(asignErr);
            return res.status(500).send({ message: 'No se pudo consultar el estado de correlativos del usuario.' });
        }

        if (asignRows && asignRows.length) {
            const asignacion = asignRows[0];
            return res.send({
                disponible: true,
                origen: 'asignado',
                correlativo_inicio: asignacion.correlativo_inicio_display,
                correlativo: asignacion.correlativo_actual_display,
                correlativo_fin: `${asignacion.serie}-${padCorrelativo(asignacion.correlativo_fin)}`,
                id_asignacion: asignacion.id_asignacion,
                id_empresa: asignacion.id_empresa,
                nombre_empresa: asignacion.nombre_empresa || null,
                mensaje: 'Tienes correlativos asignados disponibles para cobrar.'
            });
        }

        const resolucionUsuarioQuery = `
            SELECT
                rf.id_resolucion,
                rf.id_empresa,
                rf.serie,
                rf.correlativo_actual,
                rf.rango_final,
                e.nombre_empresa
            FROM resoluciones_facturas rf
            LEFT JOIN empresas e ON e.id_empresa = rf.id_empresa
            WHERE rf.id_usuario = ?
              AND rf.estado = 'activo'
              AND rf.correlativo_actual BETWEEN rf.rango_inicial AND rf.rango_final
              AND (rf.fecha_vencimiento IS NULL OR rf.fecha_vencimiento >= CURDATE())
            ORDER BY rf.fecha_vencimiento ASC, rf.id_resolucion ASC
            LIMIT 1
        `;

        db.query(resolucionUsuarioQuery, [idUsuario], (resErr, resRows) => {
            if (resErr) {
                console.error(resErr);
                return res.status(500).send({ message: 'No se pudo consultar resolución asignada al usuario.' });
            }

            if (resRows && resRows.length) {
                const resolucion = resRows[0];
                return res.send({
                    disponible: true,
                    origen: 'resolucion_usuario',
                    correlativo_inicio: `${resolucion.serie}-${padCorrelativo(resolucion.correlativo_actual)}`,
                    correlativo: `${resolucion.serie}-${padCorrelativo(resolucion.correlativo_actual)}`,
                    correlativo_fin: `${resolucion.serie}-${padCorrelativo(resolucion.rango_final)}`,
                    id_asignacion: null,
                    id_empresa: resolucion.id_empresa,
                    nombre_empresa: resolucion.nombre_empresa || null,
                    mensaje: 'Tienes resolución asignada directamente con correlativos disponibles.'
                });
            }

            return res.send({
                disponible: false,
                origen: null,
                correlativo_inicio: null,
                correlativo: null,
                correlativo_fin: null,
                id_asignacion: null,
                id_empresa: null,
                nombre_empresa: null,
                mensaje: 'No tienes correlativos asignados.'
            });
        });
    });
});

router.get('/siguiente-correlativo', (req, res) => {
    const idUsuario = Number(req.query?.id_usuario || 0);
    const idContrato = Number(req.query?.id_contrato || 0);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !Number.isInteger(idContrato) || idContrato <= 0) {
        return res.status(400).send({ message: 'Debe enviar id_usuario e id_contrato válidos.' });
    }

    const empresaQuery = `
        SELECT
            COALESCE(c.id_empresa_marca, r.id_empresa) AS id_empresa_facturacion
        FROM contratos_residentes c
        LEFT JOIN residentes r ON r.id_residente = c.id_residente
        WHERE c.id_contrato = ?
        LIMIT 1
    `;

    db.query(empresaQuery, [idContrato], (empresaErr, empresaRows) => {
        if (empresaErr) {
            console.error(empresaErr);
            return res.status(500).send({ message: 'No se pudo obtener la empresa del contrato.' });
        }

        const idEmpresaRaw = Number(empresaRows?.[0]?.id_empresa_facturacion || 0);
        const idEmpresa = idEmpresaRaw > 0 ? idEmpresaRaw : null;

        const asignacionQuery = `
                SELECT
                    ac.id_asignacion,
                    ac.id_empresa,
                    ac.serie,
                    ac.correlativo_actual,
                    ac.correlativo_fin,
                    CONCAT(ac.serie, '-', LPAD(ac.correlativo_actual, 8, '0')) AS correlativo_actual_display
                FROM asignar_correlativos ac
                WHERE ac.id_usuario = ?
                  AND ac.estado = 'activo'
                  AND ac.correlativo_actual <= ac.correlativo_fin
                ORDER BY CASE
                            WHEN ? IS NOT NULL AND ac.id_empresa = ? THEN 0
                            ELSE 1
                         END ASC,
                         ac.fecha_asignacion ASC,
                         ac.id_asignacion ASC
                LIMIT 1
            `;

        db.query(asignacionQuery, [idUsuario, idEmpresa, idEmpresa], (asignErr, asignRows) => {
            if (asignErr) {
                console.error(asignErr);
                return res.status(500).send({ message: 'No se pudo consultar el correlativo asignado.' });
            }

            if (asignRows && asignRows.length) {
                const asignacion = asignRows[0];
                const empresaCoincide = idEmpresa && Number(asignacion.id_empresa || 0) === idEmpresa;
                return res.send({
                    disponible: true,
                    origen: 'asignado',
                    correlativo: asignacion.correlativo_actual_display,
                    id_asignacion: asignacion.id_asignacion,
                    correlativo_fin: `${asignacion.serie}-${padCorrelativo(asignacion.correlativo_fin)}`,
                    mensaje: empresaCoincide
                        ? 'Este correlativo asignado será usado al generar el cobro.'
                        : 'Se usará tu correlativo activo disponible para este cobro.'
                });
            }

            const resolucionUsuarioQuery = `
                SELECT id_empresa, serie, correlativo_actual, rango_final
                FROM resoluciones_facturas
                WHERE id_usuario = ?
                  AND estado = 'activo'
                  AND correlativo_actual BETWEEN rango_inicial AND rango_final
                  AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURDATE())
                ORDER BY CASE
                            WHEN ? IS NOT NULL AND id_empresa = ? THEN 0
                            ELSE 1
                         END ASC,
                         fecha_vencimiento ASC,
                         id_resolucion ASC
                LIMIT 1
            `;

            db.query(resolucionUsuarioQuery, [idUsuario, idEmpresa, idEmpresa], (resErr, resRows) => {
                if (resErr) {
                    console.error(resErr);
                    return res.status(500).send({ message: 'No se pudo consultar resolución asignada al usuario.' });
                }

                if (resRows && resRows.length) {
                    const resolucion = resRows[0];
                    const empresaCoincide = idEmpresa && Number(resolucion.id_empresa || 0) === idEmpresa;
                    return res.send({
                        disponible: true,
                        origen: 'resolucion_usuario',
                        correlativo: `${resolucion.serie}-${padCorrelativo(resolucion.correlativo_actual)}`,
                        id_asignacion: null,
                        correlativo_fin: `${resolucion.serie}-${padCorrelativo(resolucion.rango_final)}`,
                        mensaje: empresaCoincide
                            ? 'Este correlativo de tu resolución asignada será usado al generar el cobro.'
                            : 'Se usará tu resolución activa disponible para este cobro.'
                    });
                }

                return res.send({
                    disponible: false,
                    origen: null,
                    correlativo: null,
                    id_asignacion: null,
                    mensaje: 'Este usuario no tiene correlativos asignados para este contrato.'
                });
            });
        });
    });
});

router.post('/crear', (req, res) => {
    const { id_empresa, id_usuario, id_resolucion, cantidad, observaciones } = req.body || {};
    const idEmpresaSeleccionada = Number(id_empresa || 0) || null;
    const cantidadNumerica = Number(cantidad);

    if (!id_usuario || !id_resolucion || !Number.isInteger(cantidadNumerica) || cantidadNumerica <= 0) {
        return res.status(400).send({ message: 'Debe enviar usuario, resolución y una cantidad válida de correlativos.' });
    }

    db.beginTransaction((txErr) => {
        if (txErr) {
            return res.status(500).send({ message: 'No se pudo iniciar la transacción.' });
        }

        const rollback = (status, message, error) => db.rollback(() => {
            if (error) {
                console.error(error);
            }
            res.status(status).send({ message });
        });

        db.query('SELECT u.id_usuario, u.nombre, r.nombre_rol FROM usuarios u LEFT JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = ? LIMIT 1', [id_usuario], (userErr, userRows) => {
            if (userErr) {
                return rollback(500, 'No se pudo validar el usuario.', userErr);
            }

            if (!userRows || !userRows.length) {
                return rollback(404, 'El usuario seleccionado no existe.');
            }

            const activeAssignQuery = `
                SELECT id_asignacion
                FROM asignar_correlativos
                WHERE id_usuario = ?
                  AND id_resolucion = ?
                  AND estado = 'activo'
                  AND correlativo_actual <= correlativo_fin
                LIMIT 1
                FOR UPDATE
            `;

            db.query(activeAssignQuery, [id_usuario, id_resolucion], (checkErr, activeRows) => {
                if (checkErr) {
                    return rollback(500, 'No se pudo validar la asignación activa del usuario.', checkErr);
                }

                if (activeRows && activeRows.length) {
                    return rollback(409, 'El usuario ya tiene un lote activo pendiente de consumir para esta resolución.');
                }

                const resolucionQuery = `
                    SELECT id_resolucion, id_empresa, numero_resolucion, serie, rango_inicial, rango_final, correlativo_actual, estado, fecha_vencimiento, rol
                    FROM resoluciones_facturas
                    WHERE id_resolucion = ?
                    LIMIT 1
                    FOR UPDATE
                `;

                db.query(resolucionQuery, [id_resolucion], (resErr, resRows) => {
                    if (resErr) {
                        return rollback(500, 'No se pudo leer la resolución seleccionada.', resErr);
                    }

                    if (!resRows || !resRows.length) {
                        return rollback(404, 'La resolución seleccionada no existe.');
                    }

                    const resolucion = resRows[0];
                    const correlativoInicio = Number(resolucion.correlativo_actual || 0);
                    const correlativoFin = correlativoInicio + cantidadNumerica - 1;
                    const rangoFinal = Number(resolucion.rango_final || 0);
                    const rangoInicial = Number(resolucion.rango_inicial || 0);
                    const rolUsuario = String(userRows?.[0]?.nombre_rol || '')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    const rolResolucion = String(resolucion.rol || 'caja')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    const esAdminOGerente = rolUsuario.includes('admin') || rolUsuario.includes('gerente');
                    const usuarioEsCaja = rolUsuario.includes('caja') || rolUsuario.includes('cobro');
                    const usuarioEsJuridico = rolUsuario.includes('jurid') || rolUsuario.includes('legal');
                    const rolCompatible = rolResolucion === 'ambos'
                        || (rolResolucion === 'caja' && usuarioEsCaja)
                        || (rolResolucion === 'juridico' && usuarioEsJuridico)
                        || esAdminOGerente;

                    if (String(resolucion.estado || '').toLowerCase() !== 'activo') {
                        return rollback(400, 'La resolución no está activa.');
                    }

                    if (idEmpresaSeleccionada && Number(resolucion.id_empresa || 0) !== idEmpresaSeleccionada) {
                        return rollback(400, 'La empresa seleccionada no coincide con la empresa de la resolución.');
                    }

                    if (!rolCompatible) {
                        return rollback(400, `La resolución está configurada para rol ${resolucion.rol || 'caja'} y el usuario no coincide con ese rol.`);
                    }

                    if (resolucion.fecha_vencimiento && new Date(resolucion.fecha_vencimiento) < new Date()) {
                        return rollback(400, 'La resolución seleccionada ya está vencida.');
                    }

                    if (!Number.isFinite(correlativoInicio) || correlativoInicio < rangoInicial || correlativoInicio > rangoFinal) {
                        return rollback(400, 'La resolución no tiene un correlativo actual válido para asignar.');
                    }

                    if (correlativoFin > rangoFinal) {
                        return rollback(400, `La resolución no tiene suficiente rango disponible. Solo llega hasta ${resolucion.serie}-${padCorrelativo(rangoFinal)}.`);
                    }

                    const overlapQuery = `
                        SELECT id_asignacion
                        FROM asignar_correlativos
                        WHERE id_resolucion = ?
                          AND (
                                (? BETWEEN correlativo_inicio AND correlativo_fin)
                                OR (? BETWEEN correlativo_inicio AND correlativo_fin)
                                OR (correlativo_inicio BETWEEN ? AND ?)
                                OR (correlativo_fin BETWEEN ? AND ?)
                              )
                        LIMIT 1
                        FOR UPDATE
                    `;

                    db.query(
                        overlapQuery,
                        [id_resolucion, correlativoInicio, correlativoFin, correlativoInicio, correlativoFin, correlativoInicio, correlativoFin],
                        (overlapErr, overlapRows) => {
                            if (overlapErr) {
                                return rollback(500, 'No se pudo validar la unicidad de correlativos.', overlapErr);
                            }

                            if (overlapRows && overlapRows.length) {
                                return rollback(409, 'El rango de correlativos ya fue asignado previamente. Actualiza la resolución e intenta de nuevo.');
                            }

                            const insertQuery = `
                                INSERT INTO asignar_correlativos
                                (id_usuario, id_resolucion, id_empresa, serie, correlativo_inicio, correlativo_fin, correlativo_actual, estado, observaciones)
                                VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', ?)
                            `;

                            db.query(
                                insertQuery,
                                [id_usuario, id_resolucion, resolucion.id_empresa || null, resolucion.serie, correlativoInicio, correlativoFin, correlativoInicio, observaciones || null],
                                (insertErr, insertResult) => {
                                    if (insertErr) {
                                        return rollback(500, 'No se pudo guardar la asignación de correlativos.', insertErr);
                                    }

                                    db.query(
                                        'UPDATE resoluciones_facturas SET correlativo_actual = ? WHERE id_resolucion = ?',
                                        [correlativoFin + 1, id_resolucion],
                                        (updateErr) => {
                                            if (updateErr) {
                                                return rollback(500, 'No se pudo reservar el rango en la resolución.', updateErr);
                                            }

                                            db.commit((commitErr) => {
                                                if (commitErr) {
                                                    return rollback(500, 'No se pudo confirmar la asignación.', commitErr);
                                                }

                                                return res.status(200).send({
                                                    message: 'Lote de correlativos asignado correctamente.',
                                                    id_asignacion: insertResult.insertId,
                                                    correlativo_inicio: `${resolucion.serie}-${padCorrelativo(correlativoInicio)}`,
                                                    correlativo_fin: `${resolucion.serie}-${padCorrelativo(correlativoFin)}`
                                                });
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                });
            });
        });
    });
});

router.put('/cerrar/:id_asignacion', (req, res) => {
    const { id_asignacion } = req.params;

    db.query(
        "UPDATE asignar_correlativos SET estado = 'cerrado', fecha_cierre = NOW() WHERE id_asignacion = ? AND estado = 'activo'",
        [id_asignacion],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ message: 'No se pudo cerrar la asignación.' });
            }

            if (!result || result.affectedRows === 0) {
                return res.status(404).send({ message: 'No se encontró una asignación activa para cerrar.' });
            }

            return res.send({ message: 'Asignación cerrada correctamente.' });
        }
    );
});

const getPeriodoConfig = (scope, query) => {
    if (scope === 'dia') {
        const fecha = String(query.fecha || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return { error: 'Debe enviar una fecha válida en formato YYYY-MM-DD.' };
        }

        return {
            label: fecha,
            whereSql: 'DATE(p.fecha_pago) = ?',
            params: [fecha]
        };
    }

    const periodo = String(query.periodo || '').trim();
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
        return { error: 'Debe enviar un período válido en formato YYYY-MM.' };
    }

    return {
        label: periodo,
        whereSql: "DATE_FORMAT(p.fecha_pago, '%Y-%m') = ?",
        params: [periodo]
    };
};

const obtenerCuadre = (scope) => (req, res) => {
    const periodo = getPeriodoConfig(scope, req.query || {});
    if (periodo.error) {
        return res.status(400).send({ message: periodo.error });
    }

    const detalleBase = `
        SELECT
            p.id_pago,
            p.id_usuario,
            u.nombre AS nombre_usuario,
            p.no_referencia,
            p.forma_pago,
            p.fecha_pago,
            COALESCE(SUM(pd.subtotal), 0) AS subtotal,
            COALESCE(SUM(ROUND(pd.subtotal * 0.12, 2)), 0) AS iva_total,
            p.monto_total_pagado AS total_cobrado,
            GREATEST(p.monto_total_pagado - (COALESCE(SUM(pd.subtotal), 0) + COALESCE(SUM(ROUND(pd.subtotal * 0.12, 2)), 0)), 0) AS monto_mora
        FROM pagos p
        LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
        WHERE ${periodo.whereSql}
        GROUP BY p.id_pago, p.id_usuario, u.nombre, p.no_referencia, p.forma_pago, p.fecha_pago, p.monto_total_pagado
    `;

    const resumenUsuariosQuery = `
        SELECT
            base.id_usuario,
            base.nombre_usuario,
            COUNT(*) AS total_facturas,
            MIN(CASE WHEN base.no_referencia NOT LIKE 'TMP-%' THEN base.no_referencia END) AS correlativo_inicial,
            MAX(CASE WHEN base.no_referencia NOT LIKE 'TMP-%' THEN base.no_referencia END) AS correlativo_final,
            ROUND(SUM(base.subtotal), 2) AS subtotal,
            ROUND(SUM(base.iva_total), 2) AS iva_total,
            ROUND(SUM(base.monto_mora), 2) AS monto_mora,
            ROUND(SUM(base.total_cobrado), 2) AS total_cobrado
        FROM (${detalleBase}) base
        GROUP BY base.id_usuario, base.nombre_usuario
        ORDER BY total_cobrado DESC, base.nombre_usuario ASC
    `;

    const totalGeneralQuery = `
        SELECT
            COUNT(*) AS total_facturas,
            MIN(CASE WHEN base.no_referencia NOT LIKE 'TMP-%' THEN base.no_referencia END) AS correlativo_inicial,
            MAX(CASE WHEN base.no_referencia NOT LIKE 'TMP-%' THEN base.no_referencia END) AS correlativo_final,
            ROUND(SUM(base.subtotal), 2) AS subtotal,
            ROUND(SUM(base.iva_total), 2) AS iva_total,
            ROUND(SUM(base.monto_mora), 2) AS monto_mora,
            ROUND(SUM(base.total_cobrado), 2) AS total_cobrado
        FROM (${detalleBase}) base
    `;

    const detalleFacturasQuery = `
        SELECT
            base.id_pago,
            base.nombre_usuario,
            base.no_referencia,
            base.forma_pago,
            base.fecha_pago,
            ROUND(base.subtotal, 2) AS subtotal,
            ROUND(base.iva_total, 2) AS iva_total,
            ROUND(base.monto_mora, 2) AS monto_mora,
            ROUND(base.total_cobrado, 2) AS total_cobrado
        FROM (${detalleBase}) base
        ORDER BY base.fecha_pago ASC, base.id_pago ASC
    `;

    db.query(resumenUsuariosQuery, periodo.params, (userErr, rowsUsuarios) => {
        if (userErr) {
            console.error(userErr);
            return res.status(500).send({ message: 'No se pudo generar el resumen por usuario.' });
        }

        db.query(totalGeneralQuery, periodo.params, (totalErr, rowsTotales) => {
            if (totalErr) {
                console.error(totalErr);
                return res.status(500).send({ message: 'No se pudo generar el total general.' });
            }

            db.query(detalleFacturasQuery, periodo.params, (detailErr, rowsDetalle) => {
                if (detailErr) {
                    console.error(detailErr);
                    return res.status(500).send({ message: 'No se pudo generar el detalle de facturas.' });
                }

                return res.send({
                    scope,
                    periodo: periodo.label,
                    resumen_por_usuario: rowsUsuarios || [],
                    total_general: rowsTotales?.[0] || {
                        total_facturas: 0,
                        correlativo_inicial: null,
                        correlativo_final: null,
                        subtotal: 0,
                        iva_total: 0,
                        monto_mora: 0,
                        total_cobrado: 0
                    },
                    detalle_facturas: rowsDetalle || []
                });
            });
        });
    });
};

router.get('/cuadre-dia', obtenerCuadre('dia'));
router.get('/cuadre-mes', obtenerCuadre('mes'));

module.exports = router;