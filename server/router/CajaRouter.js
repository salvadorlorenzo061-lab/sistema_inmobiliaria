const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

const normalizeText = (value = '') => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const sincronizarCorrelativoResolucionesEquivalentes = ({ idResolucionBase, idUsuario, numeroResolucion, serie, correlativoActual }, callback) => {
    const idRes = Number(idResolucionBase || 0);
    const idUsr = Number(idUsuario || 0);
    const corr = Number(correlativoActual || 0);
    const numeroNorm = String(numeroResolucion || '').trim().toUpperCase();
    const serieNorm = String(serie || '').trim().toUpperCase();

    if (!Number.isInteger(idRes) || idRes <= 0 || !Number.isInteger(idUsr) || idUsr <= 0 || !Number.isFinite(corr) || corr <= 0 || !numeroNorm || !serieNorm) {
        return callback();
    }

    const sql = `
        UPDATE resoluciones_facturas rf_target
        INNER JOIN resoluciones_facturas rf_base ON rf_base.id_resolucion = ?
        LEFT JOIN empresas e_target ON e_target.id_empresa = rf_target.id_empresa
        LEFT JOIN empresas e_base ON e_base.id_empresa = rf_base.id_empresa
        SET rf_target.correlativo_actual = ?
        WHERE rf_target.id_usuario = ?
          AND UPPER(TRIM(COALESCE(rf_target.numero_resolucion, ''))) = ?
          AND UPPER(TRIM(COALESCE(rf_target.serie, ''))) = ?
          AND (
                rf_target.id_empresa = rf_base.id_empresa
                OR UPPER(TRIM(COALESCE(e_target.nombre_empresa, ''))) = UPPER(TRIM(COALESCE(e_base.nombre_empresa, '')))
              )
          AND rf_target.id_resolucion <> rf_base.id_resolucion
          AND rf_target.correlativo_actual < ?
    `;

    db.query(sql, [idRes, corr, idUsr, numeroNorm, serieNorm, corr], (err) => {
        if (err) {
            return callback(err);
        }
        return callback();
    });
};

const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const obtenerIndiceMes = (mesTexto = '') => {
    const objetivo = normalizeText(mesTexto);
    if (!objetivo) return -1;
    return NOMBRES_MESES.findIndex((nombre) => normalizeText(nombre) === objetivo);
};

const parsearEtiquetaMes = (mesTexto = '') => {
    const limpio = String(mesTexto || '').trim().replace(/\s+/g, ' ');
    if (!limpio) return null;

    const conAnio = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
    if (conAnio) {
        const indiceMes = obtenerIndiceMes(conAnio[1]);
        const anio = Number(conAnio[2]);
        if (indiceMes >= 0 && Number.isInteger(anio)) {
            return new Date(anio, indiceMes, 1);
        }
    }

    const soloMes = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)$/);
    if (soloMes) {
        const indiceMes = obtenerIndiceMes(soloMes[1]);
        if (indiceMes >= 0) {
            return { indiceMes };
        }
    }

    return null;
};

const etiquetaMesDesdeFecha = (fecha) => `${NOMBRES_MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;

const obtenerNumeroCuotaDesdeFechas = (fechaInicioContrato, fechaMes) => {
    if (!(fechaInicioContrato instanceof Date) || Number.isNaN(fechaInicioContrato.getTime())) return null;
    if (!(fechaMes instanceof Date) || Number.isNaN(fechaMes.getTime())) return null;

    const inicio = new Date(fechaInicioContrato.getFullYear(), fechaInicioContrato.getMonth(), 1);
    const mes = new Date(fechaMes.getFullYear(), fechaMes.getMonth(), 1);

    const diferenciaMeses = ((mes.getFullYear() - inicio.getFullYear()) * 12) + (mes.getMonth() - inicio.getMonth());
    return Math.max(diferenciaMeses + 1, 1);
};

const esServicioCobroUnico = (periodicidad = '', nombreServicio = '') => {
    const periodicidadNormalizada = normalizeText(periodicidad);
    if (periodicidadNormalizada === 'unico') {
        return true;
    }
    if (periodicidadNormalizada === 'mensual') {
        return false;
    }

    const nombre = normalizeText(nombreServicio);
    return ['derecho', 'paja', 'instalacion', 'conexion', 'matricula', 'inscripcion']
        .some((fragmento) => nombre.includes(fragmento));
};

const calcularComponentesFiscalmente = (total = 0) => {
    const montoTotal = parseFloat(Number(total || 0).toFixed(2));
    const iva = 0;
    const subtotal = montoTotal;

    return {
        subtotal,
        iva,
        total: montoTotal
    };
};

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
            console.error('Error asegurando tabla facturas_historial:', err.message);
        }
    });
};

const ensureFacturasHistorialRolColumn = () => {
    db.query("SHOW COLUMNS FROM facturas_historial LIKE 'rol_usuario_emisor'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna rol_usuario_emisor en facturas_historial:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE facturas_historial ADD COLUMN rol_usuario_emisor VARCHAR(80) NULL AFTER id_usuario', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna rol_usuario_emisor en facturas_historial:', alterErr.message);
                }
            });
        }
    });
};

const ensureInteresPorcentajeContratoColumn = () => {
    db.query("SHOW COLUMNS FROM contratos_residentes LIKE 'interes_porcentaje'", (err, rows) => {
        if (err) {
            console.error('Error verificando columna interes_porcentaje en contratos_residentes:', err.message);
            return;
        }

        if (!rows || rows.length === 0) {
            db.query('ALTER TABLE contratos_residentes ADD COLUMN interes_porcentaje DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER monto_cuota', (alterErr) => {
                if (alterErr) {
                    console.error('Error creando columna interes_porcentaje en contratos_residentes:', alterErr.message);
                }
            });
        }
    });
};

const registrarHistorialFactura = ({
    idPago,
    idContrato,
    idResidente,
    idUsuario,
    correlativo,
    detalleValues,
    serviciosSolicitados,
    serviciosMesInicial,
    numeroRecibo,
    metodoPago,
    observaciones,
    mesesPagados,
    totalTransaccion,
    montoMora,
    callback
}) => {
    const rolSql = `
        SELECT r.nombre_rol
        FROM usuarios u
        LEFT JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ?
        LIMIT 1
    `;

    db.query(rolSql, [idUsuario], (rolErr, rolRows) => {
        if (rolErr) {
            return callback(rolErr);
        }

        const rolUsuarioEmisor = String(rolRows?.[0]?.nombre_rol || '').trim() || null;

        const serviciosPorId = new Map();
        const extraordinariosPorIdPagoExtra = new Map();
        [...(serviciosSolicitados || []), ...(serviciosMesInicial || [])].forEach((servicio) => {
            const id = Number(servicio?.id_servicio);
            if (Number.isInteger(id) && id !== 0) {
                serviciosPorId.set(id, String(servicio?.nombre_servicio || `Servicio #${id}`));
            }

            const idPagoExtra = Number(servicio?.id_pago_extra);
            if (servicio?.es_extraordinario && Number.isInteger(idPagoExtra) && idPagoExtra > 0) {
                extraordinariosPorIdPagoExtra.set(idPagoExtra, String(servicio?.nombre_servicio || `Cargo extraordinario #${idPagoExtra}`));
            }
        });

        const rows = (detalleValues || []).map((detalle) => {
            const tipoConcepto = String(detalle?.[1] || 'concepto');
            const idConceptoServicio = detalle?.[2] == null ? null : Number(detalle[2]);
            const mesPagado = String(detalle?.[3] || '');
            const numeroCuota = detalle?.[4] == null ? null : Number(detalle[4]);
            const subtotal = Number(detalle?.[5] || 0);
            const idPagoExtra = detalle?.[6] == null ? null : Number(detalle[6]);

            let nombreConcepto = tipoConcepto;
            if (tipoConcepto === 'cuota_terreno') {
                nombreConcepto = `Cuota de Terreno No. ${numeroCuota || ''}`.trim();
            } else if (tipoConcepto === 'mora') {
                nombreConcepto = `Mora ${mesPagado || ''}`.trim();
            } else if (tipoConcepto === 'servicio') {
                nombreConcepto = serviciosPorId.get(idConceptoServicio) || `Servicio #${idConceptoServicio || 'N/A'}`;
            } else if (tipoConcepto === 'extraordinario') {
                nombreConcepto = extraordinariosPorIdPagoExtra.get(idPagoExtra)
                    || serviciosPorId.get(idConceptoServicio)
                    || `Cargo extraordinario #${idPagoExtra || 'N/A'}`;
            }

            const evidencia = JSON.stringify({
                numero_recibo: numeroRecibo,
                no_referencia: correlativo,
                metodo_pago: metodoPago,
                observaciones: observaciones || '',
                rol_usuario_emisor: rolUsuarioEmisor,
                monto_total_pagado: Number(totalTransaccion || 0),
                monto_mora: Number(montoMora || 0),
                meses_pagados: mesesPagados || [],
                detalle: {
                    tipo_concepto: tipoConcepto,
                    nombre_concepto: nombreConcepto,
                    id_concepto_servicio: idConceptoServicio,
                    id_pago_extra: idPagoExtra,
                    mes_pagado: mesPagado,
                    numero_cuota_afectada: numeroCuota,
                    subtotal
                }
            });

            return [
                idPago,
                null,
                idContrato,
                idResidente,
                idUsuario,
                rolUsuarioEmisor,
                correlativo,
                'EMITIDA',
                tipoConcepto,
                idConceptoServicio,
                nombreConcepto,
                mesPagado,
                numeroCuota,
                subtotal,
                evidencia
            ];
        });

        if (!rows.length) {
            return callback();
        }

        const sql = `
            INSERT INTO facturas_historial (
                id_pago, id_pago_detalle, id_contrato, id_residente, id_usuario,
                rol_usuario_emisor, correlativo, estado_factura, tipo_concepto, id_concepto_servicio,
                nombre_concepto, mes_pagado, numero_cuota_afectada, subtotal, evidencia_json
            ) VALUES ?
        `;

        db.query(sql, [rows], (err) => callback(err));
    });
};

const reservarCorrelativoAsignado = (idUsuario, idEmpresa, callback) => {
    if (!idUsuario) {
        return callback(null, null);
    }

    const query = `
        SELECT ac.id_asignacion, ac.id_resolucion, ac.id_empresa, ac.serie,
               COALESCE(ac.correlativo_actual, ac.correlativo_inicio) AS correlativo_actual,
               ac.correlativo_fin
                FROM asignar_correlativos ac
                INNER JOIN resoluciones_facturas rf_ac ON rf_ac.id_resolucion = ac.id_resolucion
                LEFT JOIN empresas e_req ON e_req.id_empresa = ?
        WHERE ac.id_usuario = ?
                    AND (
                                ? IS NULL
                                OR EXISTS (
                                        SELECT 1
                                        FROM resoluciones_facturas rf_match
                                        LEFT JOIN empresas e_match ON e_match.id_empresa = rf_match.id_empresa
                                        WHERE rf_match.id_usuario = ac.id_usuario
                                            AND LOWER(TRIM(COALESCE(rf_match.estado, 'activo'))) = 'activo'
                                            AND UPPER(TRIM(COALESCE(rf_match.numero_resolucion, ''))) = UPPER(TRIM(COALESCE(rf_ac.numero_resolucion, '')))
                                            AND UPPER(TRIM(COALESCE(rf_match.serie, ''))) = UPPER(TRIM(COALESCE(rf_ac.serie, '')))
                                            AND (
                                                rf_match.id_empresa = ?
                                                OR UPPER(TRIM(COALESCE(e_match.nombre_empresa, ''))) = UPPER(TRIM(COALESCE(e_req.nombre_empresa, '')))
                                            )
                                )
                            )
                    AND ac.estado = 'activo'
                    AND COALESCE(ac.correlativo_actual, ac.correlativo_inicio) <= ac.correlativo_fin
                ORDER BY ac.fecha_asignacion ASC,
                                 ac.id_asignacion ASC
        LIMIT 1
    `;

    const idEmpresaNormalizado = idEmpresa ? Number(idEmpresa) : null;

    db.query(query, [idEmpresaNormalizado, idUsuario, idEmpresaNormalizado, idEmpresaNormalizado], (err, rows) => {
        if (err) {
            return callback(err);
        }

        if (!rows || !rows.length) {
            return callback(null, null);
        }

        const asignacion = rows[0];
        const correlativoNumero = Number(asignacion.correlativo_actual || 0);
        const correlativoFin = Number(asignacion.correlativo_fin || 0);
        const correlativoTexto = `${asignacion.serie}-${String(correlativoNumero).padStart(8, '0')}`;
        const siguienteCorrelativo = correlativoNumero + 1;
        const nuevoEstado = siguienteCorrelativo > correlativoFin ? 'agotado' : 'activo';

        db.query(
            'UPDATE asignar_correlativos SET correlativo_actual = ?, estado = ?, fecha_cierre = CASE WHEN ? = \"agotado\" THEN NOW() ELSE fecha_cierre END WHERE id_asignacion = ?',
            [siguienteCorrelativo, nuevoEstado, nuevoEstado, asignacion.id_asignacion],
            (updateErr) => {
                if (updateErr) {
                    return callback(updateErr);
                }

                return callback(null, {
                    correlativo: correlativoTexto,
                    id_resolucion: asignacion.id_resolucion,
                    id_asignacion: asignacion.id_asignacion,
                    id_empresa: asignacion.id_empresa ? Number(asignacion.id_empresa) : null
                });
            }
        );
    });
};

const ensureContratosServiciosTable = () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS contratos_servicios (
            id_contrato_servicio INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_contrato INT NOT NULL,
            id_servicio INT NOT NULL,
            monto_servicio DECIMAL(12,2) NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'activo',
            fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_contrato_servicio (id_contrato, id_servicio),
            INDEX idx_cs_contrato (id_contrato),
            INDEX idx_cs_servicio (id_servicio),
            CONSTRAINT fk_cs_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_residentes(id_contrato) ON DELETE CASCADE,
            CONSTRAINT fk_cs_servicio FOREIGN KEY (id_servicio) REFERENCES servicios(id_servicio) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('Error asegurando tabla contratos_servicios:', err.message);
        }
    });
};

const resolverColumnaCostoServicios = (callback) => {
    db.query("SHOW COLUMNS FROM servicios LIKE 'costo_servicio'", (errCostoServicio, rowsCostoServicio) => {
        if (errCostoServicio) {
            return callback(errCostoServicio);
        }

        if (rowsCostoServicio && rowsCostoServicio.length > 0) {
            return callback(null, 'costo_servicio');
        }

        db.query("SHOW COLUMNS FROM servicios LIKE 'costo'", (errCosto, rowsCosto) => {
            if (errCosto) {
                return callback(errCosto);
            }

            if (rowsCosto && rowsCosto.length > 0) {
                return callback(null, 'costo');
            }

            db.query("ALTER TABLE servicios ADD COLUMN costo_servicio DECIMAL(12,2) NOT NULL DEFAULT 0", (alterErr) => {
                if (alterErr) {
                    return callback(alterErr);
                }
                return callback(null, 'costo_servicio');
            });
        });
    });
};

ensureContratosServiciosTable();
ensureFacturasHistorialTable();
ensureFacturasHistorialRolColumn();
ensureInteresPorcentajeContratoColumn();

const resolverIdUsuarioValido = (idUsuario, callback) => {
    const id = Number(idUsuario);
    if (!Number.isInteger(id) || id <= 0) {
        return db.query('SELECT id_usuario FROM usuarios ORDER BY id_usuario ASC LIMIT 1', (fallbackErr, fallbackRows) => {
            if (fallbackErr) {
                return callback(fallbackErr);
            }
            if (!fallbackRows || !fallbackRows.length) {
                return callback(null, null);
            }
            return callback(null, Number(fallbackRows[0].id_usuario));
        });
    }

    db.query('SELECT id_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', [id], (err, rows) => {
        if (err) {
            return callback(err);
        }
        if (!rows || !rows.length) {
            return db.query('SELECT id_usuario FROM usuarios ORDER BY id_usuario ASC LIMIT 1', (fallbackErr, fallbackRows) => {
                if (fallbackErr) {
                    return callback(fallbackErr);
                }
                if (!fallbackRows || !fallbackRows.length) {
                    return callback(null, null);
                }
                return callback(null, Number(fallbackRows[0].id_usuario));
            });
        }
        return callback(null, id);
    });
};

const obtenerContextoPermisosCaja = (idUsuario, callback) => {
    const id = Number(idUsuario || 0);
    if (!Number.isInteger(id) || id <= 0) {
        return callback(null, {
            idUsuario: null,
            esAdminOGerente: false,
            filtrarPorPermiso: false
        });
    }

    const sql = `
        SELECT
            u.id_usuario,
            COALESCE(r.nombre_rol, '') AS nombre_rol
        FROM usuarios u
        LEFT JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ?
        LIMIT 1
    `;

    db.query(sql, [id], (err, rows) => {
        if (err) {
            return callback(err);
        }

        if (!rows || !rows.length) {
            return callback(null, {
                idUsuario: id,
                esAdminOGerente: false,
                filtrarPorPermiso: true
            });
        }

        const rol = normalizeText(rows[0].nombre_rol || '');
        const esAdminOGerente = rol.includes('admin') || rol.includes('gerente');

        return callback(null, {
            idUsuario: id,
            esAdminOGerente,
            // Regla operativa: cualquier usuario autenticado (incluyendo admin/gerencia)
            // solo debe cobrar dentro de sus empresas asignadas por correlativo/resolucion.
            filtrarPorPermiso: true
        });
    });
};

// === OBTENER LISTA INICIAL DE RESIDENTES (PENDIENTES Y SOLVENTES) ===
router.get("/residentes-pendientes", (req, res) => {
    const idUsuario = Number(req.query?.id_usuario || 0);

    obtenerContextoPermisosCaja(idUsuario, (ctxErr, contextoPermisos) => {
        if (ctxErr) {
            console.error('Error validando permisos de Caja:', ctxErr.message);
            return res.status(500).send('Error validando permisos de Caja.');
        }

        const filtrarPorPermiso = Boolean(contextoPermisos?.filtrarPorPermiso);
        const permisoSelect = '1';
        const filtroPermisos = filtrarPorPermiso
            ? `
                AND (
                    EXISTS (
                        SELECT 1
                        FROM asignar_correlativos ac
                        INNER JOIN resoluciones_facturas rf_ac ON rf_ac.id_resolucion = ac.id_resolucion
                        WHERE ac.id_usuario = ?
                          AND ac.estado = 'activo'
                          AND COALESCE(ac.correlativo_actual, ac.correlativo_inicio) <= ac.correlativo_fin
                          AND LOWER(TRIM(COALESCE(rf_ac.estado, 'activo'))) = 'activo'
                          AND rf_ac.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM resoluciones_facturas rf_directa
                        WHERE rf_directa.id_usuario = ?
                          AND LOWER(TRIM(COALESCE(rf_directa.estado, 'activo'))) = 'activo'
                          AND rf_directa.correlativo_actual BETWEEN rf_directa.rango_inicial AND rf_directa.rango_final
                          AND (rf_directa.fecha_vencimiento IS NULL OR rf_directa.fecha_vencimiento >= CURDATE())
                          AND rf_directa.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                    )
                )
                AND COALESCE(p.id_empresa, COALESCE(c.id_empresa_marca, r.id_empresa)) = COALESCE(c.id_empresa_marca, r.id_empresa)
            `
            : '';

        const query = `
        SELECT 
            r.id_residente, r.nombre, r.dpi, r.nit, r.telefono, r.correo, r.direccion_notificacion, r.numero_identificacion,
            c.id_contrato, c.codigo_contrato, c.monto_total AS saldo_pendiente, 
            c.monto_cuota, c.cuotas_pactadas, c.interes_porcentaje, tc.id_tipo_contrato, 
            tc.nombre_tipo_contrato AS nombre_contrato,
            c.id_proyecto,
            COALESCE(c.id_empresa_marca, r.id_empresa) AS id_empresa_facturacion,
            ${permisoSelect} AS permiso_cobro_usuario,
            p.nombre AS nombre_proyecto,
            COALESCE(em.logo, er.logo) AS logo_empresa_pdf,
            COALESCE(ep.logo, em.logo, er.logo) AS logo_proyecto,
            COALESCE(em.nombre_empresa, er.nombre_empresa) AS nombre_marca_pdf,
            COALESCE(p.nombre, ep.nombre_empresa, em.nombre_empresa, er.nombre_empresa) AS nombre_proyecto_pdf,
            COALESCE((
                SELECT SUM(cs.monto_servicio)
                FROM contratos_servicios cs
                INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
                WHERE cs.id_contrato = c.id_contrato
                  AND cs.estado = 'activo'
                  AND s.estado = 'activo'
            ), 0) AS total_servicios_mensual
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        LEFT JOIN proyecto p ON p.id_proyecto = c.id_proyecto
        LEFT JOIN empresas em ON em.id_empresa = c.id_empresa_marca
        LEFT JOIN empresas ep ON ep.id_empresa = p.id_empresa
        LEFT JOIN empresas er ON er.id_empresa = r.id_empresa
        WHERE c.estado = 'activo'
        AND COALESCE(c.id_proyecto, 0) > 0
        AND COALESCE(c.id_empresa_marca, r.id_empresa, 0) > 0
        ${filtroPermisos}
        ORDER BY CASE WHEN c.monto_total > 0 THEN 0 ELSE 1 END, r.nombre ASC
        LIMIT 300
    `;

        const queryParams = filtrarPorPermiso ? [idUsuario, idUsuario] : [];

        db.query(query, queryParams, (err, result) => {
            if (err) {
                console.error("Error al obtener residentes pendientes:", err.message);
                return res.status(500).send("Error al obtener residentes: " + err.message);
            }

            return res.status(200).json(result || []);
        });
    });
});

// === BUSCAR RESIDENTE POR NOMBRE, APELLIDO, DPI O NUMERO DE CONTRATO ===
router.get("/buscar-residente", (req, res) => {
    const { criterio } = req.query;
    const idUsuario = Number(req.query?.id_usuario || 0);

    if (!criterio) {
        return res.status(400).send("Debe proporcionar un criterio de búsqueda.");
    }

    obtenerContextoPermisosCaja(idUsuario, (ctxErr, contextoPermisos) => {
        if (ctxErr) {
            console.error('Error validando permisos de Caja:', ctxErr.message);
            return res.status(500).send('Error validando permisos de Caja.');
        }

        const filtrarPorPermiso = Boolean(contextoPermisos?.filtrarPorPermiso);
        const permisoSelect = '1';
        const filtroPermisos = filtrarPorPermiso
            ? `
                AND (
                    EXISTS (
                        SELECT 1
                        FROM asignar_correlativos ac
                        INNER JOIN resoluciones_facturas rf_ac ON rf_ac.id_resolucion = ac.id_resolucion
                        WHERE ac.id_usuario = ?
                          AND ac.estado = 'activo'
                          AND COALESCE(ac.correlativo_actual, ac.correlativo_inicio) <= ac.correlativo_fin
                          AND LOWER(TRIM(COALESCE(rf_ac.estado, 'activo'))) = 'activo'
                          AND rf_ac.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM resoluciones_facturas rf_directa
                        WHERE rf_directa.id_usuario = ?
                          AND LOWER(TRIM(COALESCE(rf_directa.estado, 'activo'))) = 'activo'
                          AND rf_directa.correlativo_actual BETWEEN rf_directa.rango_inicial AND rf_directa.rango_final
                          AND (rf_directa.fecha_vencimiento IS NULL OR rf_directa.fecha_vencimiento >= CURDATE())
                          AND rf_directa.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                    )
                )
                AND COALESCE(p.id_empresa, COALESCE(c.id_empresa_marca, r.id_empresa)) = COALESCE(c.id_empresa_marca, r.id_empresa)
            `
            : '';

        const query = `
        SELECT 
            r.id_residente, r.nombre, r.dpi, r.nit, r.telefono, r.correo, r.direccion_notificacion, r.numero_identificacion,
            c.id_contrato, c.codigo_contrato, c.monto_total AS saldo_pendiente, 
            c.monto_cuota, c.cuotas_pactadas, c.interes_porcentaje, tc.id_tipo_contrato, 
            tc.nombre_tipo_contrato AS nombre_contrato,
            c.id_proyecto,
            COALESCE(c.id_empresa_marca, r.id_empresa) AS id_empresa_facturacion,
            ${permisoSelect} AS permiso_cobro_usuario,
            p.nombre AS nombre_proyecto,
            COALESCE(em.logo, er.logo) AS logo_empresa_pdf,
            COALESCE(ep.logo, em.logo, er.logo) AS logo_proyecto,
            COALESCE(em.nombre_empresa, er.nombre_empresa) AS nombre_marca_pdf,
            COALESCE(p.nombre, ep.nombre_empresa, em.nombre_empresa, er.nombre_empresa) AS nombre_proyecto_pdf
        FROM residentes r
        INNER JOIN contratos_residentes c ON r.id_residente = c.id_residente
        INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
        LEFT JOIN proyecto p ON p.id_proyecto = c.id_proyecto
        LEFT JOIN empresas em ON em.id_empresa = c.id_empresa_marca
        LEFT JOIN empresas ep ON ep.id_empresa = p.id_empresa
        LEFT JOIN empresas er ON er.id_empresa = r.id_empresa
        WHERE c.estado = 'activo'
        AND COALESCE(c.id_proyecto, 0) > 0
        AND COALESCE(c.id_empresa_marca, r.id_empresa, 0) > 0
        ${filtroPermisos}
        AND (
            r.nombre LIKE ? 
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
        ORDER BY CASE WHEN c.monto_total > 0 THEN 0 ELSE 1 END, r.nombre ASC
        LIMIT 50
    `;

        const searchTerm = `%${criterio}%`;
        const queryParams = filtrarPorPermiso
            ? [idUsuario, idUsuario, searchTerm, searchTerm, searchTerm, searchTerm]
            : [searchTerm, searchTerm, searchTerm, searchTerm];

        db.query(query, queryParams, (err, result) => {
            if (err) {
                console.error("Error en la consulta:", err.message);
                return res.status(500).send("Error al consultar el residente: " + err.message);
            }
            if (result.length === 0) return res.status(404).send("No se encontraron residentes con contratos activos bajo ese criterio.");
            
            return res.status(200).json(result);
        });
    });
});

// === OBTENER MESES PENDIENTES ===
router.get("/meses-pendientes", (req, res) => {
    const { id_contrato } = req.query;

    if (!id_contrato) {
        const hoy = new Date();
        const etiqueta = etiquetaMesDesdeFecha(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
        return res.status(200).json({
            meses: [etiqueta],
            meses_detalle: [{ mes: etiqueta, numero_cuota: 1 }],
            meses_pagados: [],
            total_cuotas: 1,
            cuotas_pagadas: 0,
            cuotas_pendientes: 1,
            siguiente_mes_pendiente: etiqueta
        });
    }

    // Traer datos de contrato para calcular todos los meses cobrables del contrato
    db.query('SELECT fecha_compra, fecha_fin, fecha_firma, cuotas_pactadas, monto_total, monto_cuota FROM contratos_residentes WHERE id_contrato = ?', [id_contrato], (err, contratoResult) => {
        if (err || !contratoResult.length) {
            console.error('Error al obtener contrato:', err?.message);
            return res.status(500).send('Error al consultar el contrato');
        }

        // Calcular meses objetivo del contrato.
        // Prioridad solicitada: fecha_compra -> fecha_fin.
        // Fallback: fecha_firma + cuotas/meses transcurridos.
        const fechaCompraRaw = contratoResult[0].fecha_compra;
        const fechaFinRaw = contratoResult[0].fecha_fin;
        const fechaFirmaRaw = contratoResult[0].fecha_firma;

        const parseFechaValida = (value) => {
            const parsed = value ? new Date(value) : null;
            return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
        };

        const fechaCompra = parseFechaValida(fechaCompraRaw);
        const fechaFin = parseFechaValida(fechaFinRaw);
        const fechaFirma = parseFechaValida(fechaFirmaRaw);

        const fechaInicioBase = fechaCompra || fechaFirma || new Date();
        const hoy = new Date();
        const candidatos = [];
        const cuotasPactadas = Number(contratoResult[0].cuotas_pactadas || 0);
        const saldoPendiente = Number(contratoResult[0].monto_total || 0);
        const montoCuota = Number(contratoResult[0].monto_cuota || 0);

        let cursor = new Date(fechaInicioBase.getFullYear(), fechaInicioBase.getMonth(), 1);

        const fechaInicio = new Date(fechaInicioBase.getFullYear(), fechaInicioBase.getMonth(), 1);
        const fechaLimite = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const mesesTranscurridos = Math.max(
            ((fechaLimite.getFullYear() - fechaInicio.getFullYear()) * 12) +
            (fechaLimite.getMonth() - fechaInicio.getMonth()) + 1,
            1
        );

        const fechaFinMes = (fechaFin && fechaFin >= fechaInicio)
            ? new Date(fechaFin.getFullYear(), fechaFin.getMonth(), 1)
            : null;

        const candidatosMeta = [];

        const registrarCandidato = (fechaMes) => {
            const etiqueta = etiquetaMesDesdeFecha(fechaMes);
            candidatosMeta.push({
                mes: etiqueta,
                numero_cuota: obtenerNumeroCuotaDesdeFechas(fechaInicio, fechaMes) || (candidatosMeta.length + 1),
                fecha: new Date(fechaMes.getFullYear(), fechaMes.getMonth(), 1)
            });
            candidatos.push(etiqueta);
        };

        if (fechaFinMes) {
            while (cursor <= fechaFinMes) {
                registrarCandidato(cursor);
                cursor.setMonth(cursor.getMonth() + 1);
            }
        } else {
            const totalMesesObjetivo = Math.max(
                Number.isInteger(cuotasPactadas) && cuotasPactadas > 0 ? cuotasPactadas : 0,
                mesesTranscurridos
            );

            for (let i = 0; i < totalMesesObjetivo; i += 1) {
                registrarCandidato(cursor);
                cursor.setMonth(cursor.getMonth() + 1);
            }
        }

        // Traer SOLO meses ya pagados exactos de esta forma: "Mes Año"
        const query = `
            SELECT DISTINCT pd.mes_pagado
            FROM pagos p
            INNER JOIN pagos_detalle pd ON p.id_pago = pd.id_pago
                        WHERE p.id_contrato = ?
                            AND pd.tipo_concepto = 'cuota_terreno'
                            AND pd.mes_pagado IS NOT NULL
                            AND pd.mes_pagado != ''
        `;

        db.query(query, [id_contrato], (err2, result) => {
            if (err2) {
                console.error('Error al obtener meses pagados:', err2.message);
                return res.status(500).send('Error al consultar meses pendientes');
            }

            // Crear un Set con meses pagados de cuota de terreno
            const mesesPagadosSet = new Set();
            const legacySoloMes = [];

            (result || []).forEach(row => {
                const bruto = String(row?.mes_pagado || '').trim();
                if (!bruto) return;

                const parsed = parsearEtiquetaMes(bruto);
                if (parsed instanceof Date) {
                    mesesPagadosSet.add(etiquetaMesDesdeFecha(new Date(parsed.getFullYear(), parsed.getMonth(), 1)));
                    return;
                }

                if (parsed && Number.isInteger(parsed.indiceMes)) {
                    legacySoloMes.push(parsed.indiceMes);
                }
            });

            // Compatibilidad con datos historicos guardados solo como "Mes" sin año.
            // Se asigna cada mes legado a la primera ocurrencia cronologica no marcada.
            if (legacySoloMes.length) {
                const usados = new Set(mesesPagadosSet);
                legacySoloMes.forEach((indiceMesLegacy) => {
                    const match = candidatosMeta.find((item) => item.fecha.getMonth() === indiceMesLegacy && !usados.has(item.mes));
                    if (match) {
                        usados.add(match.mes);
                        mesesPagadosSet.add(match.mes);
                    }
                });
            }

            // Filtrar: solo retornar meses que NO estén en pagados
            let pendientesMeta = candidatosMeta.filter((item) => !mesesPagadosSet.has(item.mes));

            // Si hay saldo pendiente, asegurar que existan meses pendientes suficientes para poder cobrar.
            const cuotasRestantesPorSaldo = (montoCuota > 0 && saldoPendiente > 0)
                ? Math.ceil(saldoPendiente / montoCuota)
                : 0;

            if (cuotasRestantesPorSaldo > 0 && pendientesMeta.length < cuotasRestantesPorSaldo) {
                const pendientesSet = new Set(pendientesMeta.map((item) => item.mes));
                const base = fechaFinMes
                    ? new Date(fechaFinMes.getFullYear(), fechaFinMes.getMonth(), 1)
                    : new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
                let offset = fechaFinMes ? 1 : candidatos.length;

                while (pendientesMeta.length < cuotasRestantesPorSaldo) {
                    const extra = new Date(base.getFullYear(), base.getMonth(), 1);
                    extra.setMonth(extra.getMonth() + offset);
                    const etiqueta = etiquetaMesDesdeFecha(extra);
                    if (!mesesPagadosSet.has(etiqueta) && !pendientesSet.has(etiqueta)) {
                        pendientesSet.add(etiqueta);
                        pendientesMeta.push({
                            mes: etiqueta,
                            numero_cuota: obtenerNumeroCuotaDesdeFechas(fechaInicio, extra) || (candidatosMeta.length + pendientesMeta.length + 1),
                            fecha: new Date(extra.getFullYear(), extra.getMonth(), 1)
                        });
                    }
                    offset += 1;
                }
            }

            pendientesMeta = pendientesMeta.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
            const mesesPendientes = pendientesMeta.map((item) => item.mes);

            const mesesPagadosOrdenados = candidatosMeta
                .filter((item) => mesesPagadosSet.has(item.mes))
                .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
                .map((item) => item.mes);

            const totalCuotasContrato = (Number.isInteger(cuotasPactadas) && cuotasPactadas > 0)
                ? cuotasPactadas
                : Math.max(candidatosMeta.length, mesesPagadosOrdenados.length + mesesPendientes.length, 1);

            const cuotasPagadasContrato = Math.min(mesesPagadosOrdenados.length, totalCuotasContrato);
            const cuotasPendientesContrato = Math.max(totalCuotasContrato - cuotasPagadasContrato, 0);

            return res.status(200).json({
                meses: mesesPendientes,
                meses_detalle: pendientesMeta.map((item) => ({ mes: item.mes, numero_cuota: item.numero_cuota })),
                meses_pagados: mesesPagadosOrdenados,
                total_cuotas: totalCuotasContrato,
                cuotas_pagadas: cuotasPagadasContrato,
                cuotas_pendientes: cuotasPendientesContrato,
                siguiente_mes_pendiente: mesesPendientes[0] || null
            });
        });
    });
});

router.get('/servicios-contrato/:id_contrato', (req, res) => {
    const { id_contrato } = req.params;
    const mes = String(req.query?.mes || '').trim();

    if (!id_contrato) {
        return res.status(400).send('Debe proporcionar el id del contrato.');
    }

    const query = `
        SELECT DISTINCT
            base.id_servicio,
            base.nombre_servicio,
            base.monto_servicio,
            base.periodicidad,
            CASE
                WHEN ? != '' AND EXISTS (
                    SELECT 1
                    FROM pagos_detalle pd
                    INNER JOIN pagos p ON p.id_pago = pd.id_pago
                    WHERE p.id_contrato = ?
                      AND pd.tipo_concepto = 'servicio'
                      AND pd.id_concepto_servicio = base.id_servicio
                      AND pd.mes_pagado = ?
                ) THEN 1
                ELSE 0
            END AS ya_pagado_mes,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM pagos_detalle pd
                    INNER JOIN pagos p ON p.id_pago = pd.id_pago
                    WHERE p.id_contrato = ?
                      AND pd.tipo_concepto = 'servicio'
                      AND pd.id_concepto_servicio = base.id_servicio
                ) THEN 1
                ELSE 0
            END AS ya_pagado_alguna_vez
            ,CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM pagos_detalle pd
                    INNER JOIN pagos p ON p.id_pago = pd.id_pago
                    INNER JOIN servicios s_pagado ON s_pagado.id_servicio = pd.id_concepto_servicio
                    WHERE p.id_contrato = ?
                      AND pd.tipo_concepto = 'servicio'
                      AND LOWER(TRIM(s_pagado.nombre_servicio)) = LOWER(TRIM(base.nombre_servicio))
                ) THEN 1
                ELSE 0
            END AS ya_pagado_por_nombre
        FROM (
            SELECT
                cs.id_servicio,
                s.nombre_servicio,
                cs.monto_servicio,
                COALESCE(s.periodicidad, 'mensual') AS periodicidad
            FROM contratos_servicios cs
            INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
            WHERE cs.id_contrato = ?
              AND cs.estado = 'activo'
              AND s.estado = 'activo'

            UNION

            SELECT
                ps.id_servicio,
                s.nombre_servicio,
                ps.monto_servicio,
                COALESCE(s.periodicidad, 'mensual') AS periodicidad
            FROM contratos_residentes c
            INNER JOIN proyecto_servicios ps ON ps.id_proyecto = c.id_proyecto
            INNER JOIN servicios s ON s.id_servicio = ps.id_servicio
            WHERE c.id_contrato = ?
              AND ps.estado = 'activo'
              AND s.estado = 'activo'
        ) AS base
        ORDER BY base.nombre_servicio ASC
    `;

    db.query(query, [mes, id_contrato, mes, id_contrato, id_contrato, id_contrato, id_contrato], (err, rows) => {
        if (err) {
            console.error('Error al obtener servicios del contrato:', err.message);
            return res.status(500).send('Error al obtener servicios del contrato.');
        }

        const serviciosBase = (rows || [])
            .map((row) => {
                const nombreServicio = String(row.nombre_servicio || '').trim();
                const periodicidad = String(row.periodicidad || 'mensual').trim().toLowerCase();
                const esCobroUnico = esServicioCobroUnico(periodicidad, nombreServicio);
                const yaPagadoAlgunaVez = Number(row.ya_pagado_alguna_vez || 0) === 1;
                const yaPagadoPorNombre = Number(row.ya_pagado_por_nombre || 0) === 1;
                const solventeContrato = yaPagadoAlgunaVez || yaPagadoPorNombre;

                return {
                    id_servicio: Number(row.id_servicio),
                    nombre_servicio: nombreServicio,
                    costo_servicio: Number(row.monto_servicio || 0),
                    periodicidad,
                    es_extraordinario: false,
                    id_pago_extra: null,
                    es_cobro_unico: esCobroUnico,
                    ya_pagado_mes: esCobroUnico ? solventeContrato : Number(row.ya_pagado_mes || 0) === 1,
                    ya_pagado_alguna_vez: solventeContrato
                };
            })
            .filter((servicio) => !(servicio.es_cobro_unico && servicio.ya_pagado_alguna_vez));

        const extrasQuery = `
            SELECT id_pago_extra, concepto, monto
            FROM pagos_extraordinarios
            WHERE id_contrato = ?
              AND LOWER(COALESCE(estado, 'pendiente')) = 'pendiente'
            ORDER BY id_pago_extra ASC
        `;

        db.query(extrasQuery, [id_contrato], (extraErr, extraRows) => {
            if (extraErr) {
                console.error('Error al obtener cargos extraordinarios pendientes:', extraErr.message);
                return res.status(500).send('Error al obtener cargos extraordinarios pendientes.');
            }

            const serviciosExtra = (extraRows || []).map((extra) => ({
                id_servicio: -Number(extra.id_pago_extra || 0),
                nombre_servicio: `Cargo extraordinario: ${String(extra.concepto || 'Concepto').trim()}`,
                costo_servicio: Number(extra.monto || 0),
                periodicidad: 'unico',
                es_extraordinario: true,
                id_pago_extra: Number(extra.id_pago_extra || 0),
                es_cobro_unico: true,
                ya_pagado_mes: false,
                ya_pagado_alguna_vez: false
            })).filter((item) => Number.isFinite(item.costo_servicio) && item.costo_servicio > 0);

            return res.status(200).json({
                id_contrato: Number(id_contrato),
                mes_consulta: mes,
                servicios: [...serviciosBase, ...serviciosExtra]
            });
        });
    });
});

router.get('/moras-pendientes/:id_contrato', (req, res) => {
    const idContrato = Number(req.params.id_contrato || 0);

    if (!Number.isInteger(idContrato) || idContrato <= 0) {
        return res.status(400).send({ message: 'ID de contrato invalido.' });
    }

    const sql = `
        SELECT id_morosidad, id_contrato, mes_atrasado, dias_retraso, monto_mora, estado
        FROM morosidad
        WHERE id_contrato = ?
          AND LOWER(TRIM(COALESCE(estado, 'pendiente'))) = 'pendiente'
        ORDER BY id_morosidad ASC
    `;

    db.query(sql, [idContrato], (err, rows) => {
        if (err) {
            if (String(err?.code || '').toUpperCase() === 'ER_NO_SUCH_TABLE') {
                return res.status(200).json({ id_contrato: idContrato, total_mora_pendiente: 0, moras: [] });
            }
            console.error('Error al obtener moras pendientes del contrato:', err.message);
            return res.status(500).send({ message: 'No se pudieron obtener las moras pendientes.' });
        }

        const moras = (rows || []).map((row) => ({
            id_morosidad: Number(row.id_morosidad || 0),
            id_contrato: Number(row.id_contrato || 0),
            mes_atrasado: String(row.mes_atrasado || ''),
            dias_retraso: Number(row.dias_retraso || 0),
            monto_mora: Number(row.monto_mora || 0),
            estado: String(row.estado || 'pendiente')
        }));

        const totalMoraPendiente = moras.reduce((sum, mora) => sum + Number(mora.monto_mora || 0), 0);

        return res.status(200).json({
            id_contrato: idContrato,
            total_mora_pendiente: Number(totalMoraPendiente.toFixed(2)),
            moras
        });
    });
});

// === PROCESAR COBRO ===
router.post("/procesar-pago", (req, res) => {
    const { 
        id_residente, id_contrato, id_tipo_contrato, id_usuario,
        monto_pagar, monto_terreno_pagar, monto_interes, monto_mora, metodo_pago, no_referencia, observaciones,
        mes_pagado, meses_pagados, numero_cuota, servicios_pagados, moras_aplicadas
    } = req.body;

    // Normalizar etiquetas de mes preservando el año enviado por la UI.
    // Si llega un mes sin año (dato legacy), se mantiene para no inventar años incorrectos.
    const normalizarMeses = (meses) => {
        return (meses || [])
            .map((mes) => String(mes || '').trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .map((mes) => {
                const parsed = parsearEtiquetaMes(mes);
                if (parsed instanceof Date) {
                    return etiquetaMesDesdeFecha(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
                }

                const soloMes = String(mes || '').match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)$/);
                if (soloMes) {
                    const idx = obtenerIndiceMes(soloMes[1]);
                    return idx >= 0 ? NOMBRES_MESES[idx] : mes;
                }

                return mes;
            });
    };

    const meses = Array.isArray(meses_pagados) && meses_pagados.length ? meses_pagados : (mes_pagado ? [mes_pagado] : []);
    const mesesAProcesar = normalizarMeses(meses.length ? meses : ['Enero']);
    const cantidadMeses = Math.max(mesesAProcesar.length, 1);

    let serviciosSolicitados = Array.isArray(servicios_pagados)
        ? servicios_pagados
            .map((item) => ({
                id_servicio: Number(item?.id_servicio),
                id_pago_extra: Number(item?.id_pago_extra || 0),
                es_extraordinario: Boolean(item?.es_extraordinario),
                subtotal: Number(item?.subtotal),
                nombre_servicio: String(item?.nombre_servicio || '').trim(),
                periodicidad: String(item?.periodicidad || '').trim().toLowerCase(),
                es_cobro_unico: Boolean(item?.es_cobro_unico) || esServicioCobroUnico(item?.periodicidad || '', item?.nombre_servicio || '')
            }))
            .filter((item) => {
                if (!Number.isFinite(item.subtotal) || item.subtotal <= 0) {
                    return false;
                }

                if (item.es_extraordinario && Number.isInteger(item.id_pago_extra) && item.id_pago_extra > 0) {
                    return true;
                }

                return Number.isInteger(item.id_servicio) && item.id_servicio > 0;
            })
        : [];

    const morasAplicadas = Array.isArray(moras_aplicadas)
        ? moras_aplicadas
            .map((item) => ({
                id_morosidad: Number(item?.id_morosidad || 0),
                mes_atrasado: String(item?.mes_atrasado || '').trim(),
                monto_mora: Number(item?.monto_mora || 0)
            }))
            .filter((item) => Number.isFinite(item.monto_mora) && item.monto_mora > 0)
        : [];

    const moraTotalSeleccionada = parseFloat(
        morasAplicadas.reduce((sum, item) => sum + Number(item?.monto_mora || 0), 0).toFixed(2)
    );

    let serviciosMesInicial = [];

    const montoSolicitado = parseFloat(monto_pagar || 0);
    const montoTerrenoSolicitado = parseFloat(monto_terreno_pagar);
    const montoInteresSolicitado = parseFloat(monto_interes || 0);
    const montoTerrenoTotalBase = Number.isFinite(montoTerrenoSolicitado)
        ? parseFloat(Math.max(montoTerrenoSolicitado, 0).toFixed(2))
        : parseFloat(Math.max((Number.isFinite(montoSolicitado) ? montoSolicitado : 0), 0).toFixed(2));

    let montoTerrenoTotal = montoTerrenoTotalBase;
    let montoServiciosMensual = 0;
    let montoServiciosMesInicial = 0;
    let montoServiciosTotal = 0;
    let montoPrincipalTotal = 0;
    let montoInteresTotal = 0;
    let montoPorMesTerreno = 0;
    let ivaTotal = 0;
    let ivaPorMes = 0;

    const recalcularTotales = () => {
        const serviciosMensuales = serviciosSolicitados.filter((item) => !item.es_cobro_unico);
        const serviciosUnicos = serviciosSolicitados.filter((item) => item.es_cobro_unico);

        montoServiciosMensual = serviciosMensuales.reduce((sum, item) => sum + Number(item?.subtotal || 0), 0);
        const montoServiciosUnicos = serviciosUnicos.reduce((sum, item) => sum + Number(item?.subtotal || 0), 0);
        montoServiciosMesInicial = serviciosMesInicial.reduce((sum, item) => sum + Number(item?.subtotal || 0), 0);
        montoServiciosTotal = parseFloat(((montoServiciosMensual * cantidadMeses) + montoServiciosUnicos + montoServiciosMesInicial).toFixed(2));

        if (!Number.isFinite(montoTerrenoSolicitado)) {
            montoTerrenoTotal = parseFloat(Math.max((Number.isFinite(montoSolicitado) ? montoSolicitado : 0) - montoServiciosTotal, 0).toFixed(2));
        }

        montoPrincipalTotal = parseFloat((montoTerrenoTotal + montoServiciosTotal).toFixed(2));
        montoPorMesTerreno = parseFloat((montoTerrenoTotal / cantidadMeses).toFixed(2));
        ivaTotal = 0;
        ivaPorMes = 0;
    };

    recalcularTotales();

    const numero_recibo = "REC-" + Math.floor(100000 + Math.random() * 900000);

    if (!id_contrato || !id_residente) {
        return res.status(400).send('Datos incompletos para procesar el cobro.');
    }

    if (!Number.isFinite(montoPrincipalTotal) || montoPrincipalTotal <= 0) {
        return res.status(400).send('Debe cobrar al menos un concepto valido (terreno o servicios).');
    }

    resolverIdUsuarioValido(id_usuario, (usuarioErr, idUsuarioSeguro) => {
        if (usuarioErr) {
            return res.status(500).send('Error validando usuario que procesa el cobro.');
        }
        if (!idUsuarioSeguro) {
            return res.status(400).send('No hay usuarios registrados para asociar el cobro. Crea al menos un usuario activo.');
        }

        db.beginTransaction((err) => {
            if (err) return res.status(500).send("Error de transacción.");

            const sqlContratoCobro = `
                SELECT
                    c.monto_total,
                    c.fecha_compra,
                    c.fecha_firma,
                    c.cuotas_pactadas,
                    c.monto_cuota,
                    c.interes_porcentaje,
                    c.id_proyecto,
                    COALESCE(c.id_empresa_marca, r.id_empresa) AS id_empresa_facturacion
                FROM contratos_residentes c
                LEFT JOIN residentes r ON r.id_residente = c.id_residente
                WHERE c.id_contrato = ?
                LIMIT 1
            `;

            db.query(sqlContratoCobro, [id_contrato], (saldoErr, saldoRows) => {
            if (saldoErr) {
                return db.rollback(() => res.status(500).send('Error al validar saldo pendiente: ' + saldoErr.message));
            }

            if (!saldoRows || !saldoRows.length) {
                return db.rollback(() => res.status(404).send('No se encontró el contrato para aplicar el cobro.'));
            }

            const idProyectoContrato = Number(saldoRows[0]?.id_proyecto || 0);
            const idEmpresaFacturacionContrato = Number(saldoRows[0]?.id_empresa_facturacion || 0);

            if (!Number.isInteger(idProyectoContrato) || idProyectoContrato <= 0 || !Number.isInteger(idEmpresaFacturacionContrato) || idEmpresaFacturacionContrato <= 0) {
                return db.rollback(() => res.status(400).send('No se puede generar cobro: el contrato no tiene empresa y/o proyecto asignado.'));
            }

                        const sqlPermisoCobroContrato = `
                                SELECT 1
                                FROM contratos_residentes c
                                LEFT JOIN residentes r ON r.id_residente = c.id_residente
                                LEFT JOIN proyecto p ON p.id_proyecto = c.id_proyecto
                                WHERE c.id_contrato = ?
                                    AND COALESCE(c.id_proyecto, 0) > 0
                                    AND COALESCE(c.id_empresa_marca, r.id_empresa, 0) > 0
                                    AND COALESCE(p.id_empresa, COALESCE(c.id_empresa_marca, r.id_empresa)) = COALESCE(c.id_empresa_marca, r.id_empresa)
                                    AND (
                                        EXISTS (
                                                SELECT 1
                                                FROM asignar_correlativos ac
                                                INNER JOIN resoluciones_facturas rf_ac ON rf_ac.id_resolucion = ac.id_resolucion
                                                WHERE ac.id_usuario = ?
                                                    AND ac.estado = 'activo'
                                                    AND COALESCE(ac.correlativo_actual, ac.correlativo_inicio) <= ac.correlativo_fin
                                                    AND LOWER(TRIM(COALESCE(rf_ac.estado, 'activo'))) = 'activo'
                                                    AND rf_ac.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                                        )
                                        OR EXISTS (
                                                SELECT 1
                                                FROM resoluciones_facturas rf_directa
                                                WHERE rf_directa.id_usuario = ?
                                                    AND LOWER(TRIM(COALESCE(rf_directa.estado, 'activo'))) = 'activo'
                                                    AND rf_directa.correlativo_actual BETWEEN rf_directa.rango_inicial AND rf_directa.rango_final
                                                    AND (rf_directa.fecha_vencimiento IS NULL OR rf_directa.fecha_vencimiento >= CURDATE())
                                                    AND rf_directa.id_empresa = COALESCE(c.id_empresa_marca, r.id_empresa)
                                        )
                                    )
                                LIMIT 1
                        `;

                        return db.query(sqlPermisoCobroContrato, [id_contrato, idUsuarioSeguro, idUsuarioSeguro], (permisoErr, permisoRows) => {
                                if (permisoErr) {
                                        return db.rollback(() => res.status(500).send('Error validando permisos de cobro del usuario: ' + permisoErr.message));
                                }

                                if (!permisoRows || !permisoRows.length) {
                                        return db.rollback(() => res.status(403).send('No se puede generar cobro: este contrato no pertenece a tus empresas/proyectos con correlativos activos asignados.'));
                                }

                        const saldoActual = parseFloat(saldoRows[0].monto_total || 0);
            const fechaCompraContrato = saldoRows[0]?.fecha_compra ? new Date(saldoRows[0].fecha_compra) : null;
            const fechaFirmaContrato = saldoRows[0]?.fecha_firma ? new Date(saldoRows[0].fecha_firma) : null;
            const cuotasPactadasContrato = Number(saldoRows[0]?.cuotas_pactadas || 0);
            const montoCuotaContratoRaw = Number(saldoRows[0]?.monto_cuota || 0);
            const interesPorcentajeContrato = Math.max(Number(saldoRows[0]?.interes_porcentaje || 0), 0);
            const montoCuotaBaseEntera = Number.isFinite(montoCuotaContratoRaw) && montoCuotaContratoRaw > 0
                ? Math.floor(montoCuotaContratoRaw)
                : 0;
            const fechaInicioContrato = (fechaCompraContrato && !Number.isNaN(fechaCompraContrato.getTime()))
                ? new Date(fechaCompraContrato.getFullYear(), fechaCompraContrato.getMonth(), 1)
                : ((fechaFirmaContrato && !Number.isNaN(fechaFirmaContrato.getTime()))
                    ? new Date(fechaFirmaContrato.getFullYear(), fechaFirmaContrato.getMonth(), 1)
                    : null);

            const redondear2 = (valor) => Number(Number(valor || 0).toFixed(2));

            const cuotasRestantesContrato = (montoCuotaContratoRaw > 0 && saldoActual > 0)
                ? Math.max(Math.ceil(saldoActual / montoCuotaContratoRaw), 1)
                : Math.max(mesesAProcesar.length, 1);
            const cuotasBaseInteres = Number.isInteger(cuotasPactadasContrato) && cuotasPactadasContrato > 0
                ? cuotasPactadasContrato
                : Math.max(mesesAProcesar.length, 1);
            const capitalBaseContrato = (montoCuotaContratoRaw > 0 && cuotasBaseInteres > 0)
                ? redondear2(montoCuotaContratoRaw * cuotasBaseInteres)
                : redondear2(Math.max(saldoActual, 0));
            const interesTotalContrato = redondear2((capitalBaseContrato * interesPorcentajeContrato) / 100);
            const interesPorMesContrato = cuotasBaseInteres > 0
                ? redondear2(interesTotalContrato / cuotasBaseInteres)
                : 0;
            const mesesInteresSolicitados = montoTerrenoTotal > 0
                ? Math.min(mesesAProcesar.length, cuotasRestantesContrato)
                : 0;
            const interesCalculadoContrato = redondear2(interesPorMesContrato * mesesInteresSolicitados);

            // Priorizar cálculo de backend para consistencia; usar payload solo como respaldo.
            montoInteresTotal = interesCalculadoContrato > 0
                ? interesCalculadoContrato
                : redondear2(Math.max(montoInteresSolicitado, 0));

            const obtenerNumeroCuotaParaMes = (mesTexto = '', fallbackIndex = 0) => {
                const parsed = parsearEtiquetaMes(mesTexto);
                if (parsed instanceof Date && fechaInicioContrato) {
                    const cuotaCalculada = obtenerNumeroCuotaDesdeFechas(fechaInicioContrato, parsed);
                    if (Number.isInteger(cuotaCalculada) && cuotaCalculada > 0) {
                        return cuotaCalculada;
                    }
                }

                const cuotaBasePayload = Number.parseInt(numero_cuota, 10);
                const base = Number.isInteger(cuotaBasePayload) && cuotaBasePayload > 0 ? cuotaBasePayload : 1;
                return base + fallbackIndex;
            };

            const distribuirTerrenoPorMes = (mesesLista = [], cuotasLista = [], montoTerreno = 0) => {
                const montos = [];
                let restante = redondear2(Math.max(Number(montoTerreno || 0), 0));

                for (let idx = 0; idx < mesesLista.length; idx += 1) {
                    if (restante <= 0) {
                        montos.push(0);
                        continue;
                    }

                    const cuotaNumero = Number(cuotasLista[idx] || 0);
                    const esUltimaCuotaContrato = Number.isInteger(cuotasPactadasContrato)
                        && cuotasPactadasContrato > 0
                        && cuotaNumero >= cuotasPactadasContrato;
                    const esUltimoMesSeleccionado = idx === (mesesLista.length - 1);

                    let montoAsignado = 0;
                    if (esUltimaCuotaContrato || esUltimoMesSeleccionado) {
                        montoAsignado = redondear2(restante);
                        restante = 0;
                    } else {
                        const sugerido = montoCuotaBaseEntera > 0
                            ? montoCuotaBaseEntera
                            : redondear2(Number(montoTerreno || 0) / Math.max(mesesLista.length, 1));
                        montoAsignado = redondear2(Math.min(sugerido, restante));
                        restante = redondear2(restante - montoAsignado);
                    }

                    montos.push(montoAsignado);
                }

                if (restante > 0 && montos.length > 0) {
                    montos[montos.length - 1] = redondear2(montos[montos.length - 1] + restante);
                }

                return montos;
            };

            const distribuirInteresPorMes = (mesesLista = [], montoInteres = 0) => {
                if (!Array.isArray(mesesLista) || !mesesLista.length) return [];

                const total = redondear2(Math.max(Number(montoInteres || 0), 0));
                if (total <= 0) {
                    return mesesLista.map(() => 0);
                }

                const base = redondear2(total / mesesLista.length);
                const montos = mesesLista.map(() => base);
                const acumuladoBase = redondear2(base * mesesLista.length);
                const ajusteFinal = redondear2(total - acumuladoBase);
                montos[montos.length - 1] = redondear2(montos[montos.length - 1] + ajusteFinal);
                return montos;
            };

            if (montoTerrenoTotal > 0) {
                if (!Number.isFinite(saldoActual) || saldoActual <= 0) {
                    return db.rollback(() => res.status(400).send('Este contrato ya está totalmente pagado para cuota de terreno.'));
                }

                if (montoTerrenoTotal > saldoActual) {
                    return db.rollback(() => res.status(400).send(`El monto de terreno excede el saldo pendiente actual (Q${saldoActual.toFixed(2)}).`));
                }
            }

            const prepararServiciosMesInicial = (callbackPreparar) => {
                const fechaCompraRaw = saldoRows[0]?.fecha_compra;
                const fechaFirmaRaw = saldoRows[0]?.fecha_firma;
                const fechaCompra = fechaCompraRaw ? new Date(fechaCompraRaw) : null;
                const fechaFirma = fechaFirmaRaw ? new Date(fechaFirmaRaw) : null;
                const fechaInicio = (fechaCompra && !Number.isNaN(fechaCompra.getTime()))
                    ? fechaCompra
                    : ((fechaFirma && !Number.isNaN(fechaFirma.getTime())) ? fechaFirma : null);

                if (!fechaInicio || montoTerrenoTotal <= 0) {
                    return callbackPreparar();
                }

                const mesInicialContrato = etiquetaMesDesdeFecha(new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1));
                if (!mesesAProcesar.includes(mesInicialContrato)) {
                    return callbackPreparar();
                }

                const mesesOrdenados = [...mesesAProcesar]
                    .map((item) => {
                        const parsed = parsearEtiquetaMes(item);
                        return {
                            etiqueta: item,
                            fecha: parsed instanceof Date ? parsed : null
                        };
                    })
                    .filter((item) => item.fecha instanceof Date)
                    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

                const primerMesCobrado = mesesOrdenados.length ? mesesOrdenados[0].etiqueta : mesesAProcesar[0];
                if (primerMesCobrado !== mesInicialContrato) {
                    return callbackPreparar();
                }

                const idsServiciosMensuales = new Set(serviciosSolicitados.map((s) => Number(s.id_servicio)));

                const sqlServiciosIniciales = `
                    SELECT
                        cs.id_servicio,
                        s.nombre_servicio,
                        cs.monto_servicio,
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM pagos_detalle pd
                                INNER JOIN pagos p ON p.id_pago = pd.id_pago
                                WHERE p.id_contrato = cs.id_contrato
                                  AND pd.tipo_concepto = 'servicio'
                                  AND pd.id_concepto_servicio = cs.id_servicio
                                  AND pd.mes_pagado = ?
                            ) THEN 1
                            ELSE 0
                        END AS ya_cobrado
                    FROM contratos_servicios cs
                    INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
                    WHERE cs.id_contrato = ?
                      AND cs.estado = 'activo'
                      AND s.estado = 'activo'
                `;

                db.query(sqlServiciosIniciales, [mesInicialContrato, id_contrato], (autoErr, autoRows) => {
                    if (autoErr) {
                        return db.rollback(() => res.status(500).send('Error preparando cobro de servicios del mes inicial: ' + autoErr.message));
                    }

                    serviciosMesInicial = (autoRows || [])
                        .filter((row) => Number(row.ya_cobrado || 0) !== 1)
                        .filter((row) => !idsServiciosMensuales.has(Number(row.id_servicio)))
                        .map((row) => ({
                            id_servicio: Number(row.id_servicio),
                            nombre_servicio: String(row.nombre_servicio || '').trim(),
                            periodicidad: String(row.periodicidad || 'mensual').trim().toLowerCase(),
                            subtotal: Number(row.monto_servicio || 0)
                        }))
                        .filter((item) => Number.isFinite(item.subtotal) && item.subtotal > 0);

                    recalcularTotales();
                    return callbackPreparar();
                });
            };

            prepararServiciosMesInicial(() => {

            const validarServiciosYContinuar = () => {
                const serviciosExtraordinarios = serviciosSolicitados.filter((s) => s.es_extraordinario && Number.isInteger(s.id_pago_extra) && s.id_pago_extra > 0);
                const idsPagoExtra = [...new Set(serviciosExtraordinarios.map((s) => Number(s.id_pago_extra)).filter((id) => Number.isInteger(id) && id > 0))];

                if (!idsPagoExtra.length) {
                    return procesarCobroPrincipal();
                }

                const placeholdersExtra = idsPagoExtra.map(() => '?').join(',');
                const sqlExtra = `
                    SELECT id_pago_extra, estado
                    FROM pagos_extraordinarios
                    WHERE id_contrato = ?
                      AND id_pago_extra IN (${placeholdersExtra})
                    FOR UPDATE
                `;

                return db.query(sqlExtra, [id_contrato, ...idsPagoExtra], (extraErr, extraRows) => {
                    if (extraErr) {
                        return db.rollback(() => res.status(500).send('Error validando cargos extraordinarios pendientes: ' + extraErr.message));
                    }

                    const idsEncontrados = new Set((extraRows || []).map((row) => Number(row.id_pago_extra)));
                    const faltantes = idsPagoExtra.filter((id) => !idsEncontrados.has(id));
                    if (faltantes.length) {
                        return db.rollback(() => res.status(400).send('Algunos cargos extraordinarios ya no existen para este contrato.'));
                    }

                    const invalidos = (extraRows || []).filter((row) => String(row.estado || '').toLowerCase() !== 'pendiente');
                    if (invalidos.length) {
                        return db.rollback(() => res.status(400).send('Hay cargos extraordinarios que ya no están pendientes y no pueden cobrarse.'));
                    }

                    return procesarCobroPrincipal();
                });
            };

            const procesarCobroPrincipal = () => {
                const sqlCaja = `
                    INSERT INTO caja_ingresos 
                    (numero_recibo, fecha_pago, monto_pagado, monto_mora, metodo_pago, observaciones, id_residente, id_tipo_contrato) 
                    VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?)
                `;

                const montoCajaSinMora = redondear2(montoPrincipalTotal + montoInteresTotal);

                return db.query(sqlCaja, [numero_recibo, montoCajaSinMora, moraTotalSeleccionada, metodo_pago, observaciones, id_residente, id_tipo_contrato], (errCaja) => {
                    if (errCaja) {
                        return db.rollback(() => res.status(500).send('Error en caja_ingresos: ' + errCaja.message));
                    }

                    const sqlEmpresaContrato = `
                        SELECT COALESCE(c.id_empresa_marca, r.id_empresa) AS id_empresa_facturacion
                        FROM contratos_residentes c
                        LEFT JOIN residentes r ON r.id_residente = c.id_residente
                        WHERE c.id_contrato = ?
                        LIMIT 1
                    `;

                    return db.query(sqlEmpresaContrato, [id_contrato], (empresaErr, empresaRows) => {
                        if (empresaErr) {
                            return db.rollback(() => res.status(500).send('Error al obtener empresa del contrato: ' + empresaErr.message));
                        }

                        const idEmpresaFacturacion = empresaRows?.[0]?.id_empresa_facturacion || null;

                        const obtenerMesInicialContrato = () => {
                            const fechaCompra = saldoRows[0]?.fecha_compra ? new Date(saldoRows[0].fecha_compra) : null;
                            const fechaFirma = saldoRows[0]?.fecha_firma ? new Date(saldoRows[0].fecha_firma) : null;
                            const fechaInicioValida = (fechaCompra && !Number.isNaN(fechaCompra.getTime()))
                                ? fechaCompra
                                : ((fechaFirma && !Number.isNaN(fechaFirma.getTime())) ? fechaFirma : null);
                            return fechaInicioValida
                                ? etiquetaMesDesdeFecha(new Date(fechaInicioValida.getFullYear(), fechaInicioValida.getMonth(), 1))
                                : (mesesAProcesar[0] || '');
                        };

                        const construirDetalleValues = (lastIdPago, moraTotal) => {
                            const detalleValues = [];
                            const cuotasTerrenoCalculadas = montoTerrenoTotal > 0
                                ? mesesAProcesar.map((mes, index) => obtenerNumeroCuotaParaMes(mes, index))
                                : [];
                            const montosTerrenoPorMes = montoTerrenoTotal > 0
                                ? distribuirTerrenoPorMes(mesesAProcesar, cuotasTerrenoCalculadas, montoTerrenoTotal)
                                : [];
                            const mesesConTerreno = montoTerrenoTotal > 0
                                ? mesesAProcesar.filter((_, index) => Number(montosTerrenoPorMes[index] || 0) > 0)
                                : [];
                            const montosInteresPorMes = montoInteresTotal > 0
                                ? distribuirInteresPorMes(mesesConTerreno, montoInteresTotal)
                                : [];

                            if (montoTerrenoTotal > 0) {
                                mesesAProcesar.forEach((mes, index) => {
                                    detalleValues.push([
                                        lastIdPago,
                                        'cuota_terreno',
                                        null,
                                        mes,
                                        cuotasTerrenoCalculadas[index] || null,
                                        redondear2(montosTerrenoPorMes[index] || 0),
                                        null
                                    ]);
                                });
                            }

                            if (montoInteresTotal > 0 && mesesConTerreno.length) {
                                mesesConTerreno.forEach((mes, index) => {
                                    detalleValues.push([
                                        lastIdPago,
                                        'interes',
                                        null,
                                        mes,
                                        null,
                                        redondear2(montosInteresPorMes[index] || 0),
                                        null
                                    ]);
                                });
                            }

                            if (serviciosSolicitados.length > 0) {
                                const serviciosNormales = serviciosSolicitados.filter((servicio) => !servicio.es_extraordinario);
                                const serviciosExtra = serviciosSolicitados.filter((servicio) => servicio.es_extraordinario);
                                const serviciosMensuales = serviciosNormales.filter((servicio) => !servicio.es_cobro_unico);
                                const serviciosUnicos = serviciosNormales.filter((servicio) => servicio.es_cobro_unico);

                                mesesAProcesar.forEach((mes) => {
                                    serviciosMensuales.forEach((servicio) => {
                                        detalleValues.push([lastIdPago, 'servicio', servicio.id_servicio, mes, null, redondear2(servicio.subtotal), null]);
                                    });
                                });

                                serviciosUnicos.forEach((servicio) => {
                                    detalleValues.push([lastIdPago, 'servicio', servicio.id_servicio, mesesAProcesar[0], null, redondear2(servicio.subtotal), null]);
                                });

                                serviciosExtra.forEach((servicio) => {
                                    detalleValues.push([lastIdPago, 'extraordinario', null, mesesAProcesar[0], null, redondear2(servicio.subtotal), servicio.id_pago_extra || null]);
                                });
                            }

                            if (serviciosMesInicial.length > 0) {
                                const mesInicialContrato = obtenerMesInicialContrato();
                                serviciosMesInicial.forEach((servicio) => {
                                    detalleValues.push([lastIdPago, 'servicio', servicio.id_servicio, mesInicialContrato, null, redondear2(servicio.subtotal), null]);
                                });
                            }

                            if (moraTotal > 0) {
                                if (morasAplicadas.length) {
                                    morasAplicadas.forEach((mora) => {
                                        detalleValues.push([
                                            lastIdPago,
                                            'mora',
                                            null,
                                            mora.mes_atrasado || (mesesAProcesar[0] || ''),
                                            null,
                                            redondear2(Number(mora.monto_mora || 0)),
                                            null
                                        ]);
                                    });
                                } else {
                                    detalleValues.push([lastIdPago, 'mora', null, mesesAProcesar[0] || '', null, redondear2(moraTotal), null]);
                                }
                            }

                            return {
                                detalleValues,
                                cuotasTerrenoCalculadas,
                                montosTerrenoPorMes,
                                mesesConTerreno,
                                montosInteresPorMes
                            };
                        };

                        const finalizarRespuesta = ({
                            lastIdPago,
                            correlativoFinal,
                            idResolucionUsada,
                            correlativoMeta,
                            totalTransaccion,
                            moraTotal,
                            cuotasTerrenoCalculadas,
                            montosTerrenoPorMes,
                            mesesConTerreno,
                            montosInteresPorMes
                        }) => {
                            const empresaQuery = `
                                SELECT
                                    COALESCE(em.nombre_empresa, er.nombre_empresa) AS nombre_empresa,
                                    COALESCE(em.logo, er.logo) AS logo_empresa,
                                    COALESCE(ep.logo, em.logo, er.logo) AS logo_proyecto,
                                    COALESCE(em.logo, er.logo) AS logo,
                                    COALESCE(em.nit, ep.nit, er.nit, 'N/A') AS nit,
                                    COALESCE(em.pais, ep.pais, er.pais, 'Guatemala') AS pais,
                                    COALESCE(em.moneda, ep.moneda, er.moneda, 'GTQ') AS moneda,
                                    COALESCE(p.nombre, ep.nombre_empresa, em.nombre_empresa, er.nombre_empresa) AS nombre_proyecto
                                FROM contratos_residentes c
                                LEFT JOIN residentes r ON r.id_residente = c.id_residente
                                LEFT JOIN proyecto p ON p.id_proyecto = c.id_proyecto
                                LEFT JOIN empresas em ON em.id_empresa = c.id_empresa_marca
                                LEFT JOIN empresas ep ON ep.id_empresa = p.id_empresa
                                LEFT JOIN empresas er ON er.id_empresa = r.id_empresa
                                WHERE c.id_contrato = ?
                                LIMIT 1
                            `;

                            return db.query(empresaQuery, [id_contrato], (_empresaErr, resEmpresa) => {
                                const empresa = resEmpresa?.[0] || { nombre_empresa: 'INMOBILIARIA ALFA S.A.', logo: null, nit: 'N/A', pais: 'Guatemala', moneda: 'GTQ' };
                                const detalleCobro = [];
                                const numeroCuotaInicio = cuotasTerrenoCalculadas.length ? cuotasTerrenoCalculadas[0] : null;
                                const numeroCuotaFin = cuotasTerrenoCalculadas.length ? cuotasTerrenoCalculadas[cuotasTerrenoCalculadas.length - 1] : null;
                                const cantidadCuotasPagadas = cuotasTerrenoCalculadas.length;
                                const totalCuotaNormal = redondear2(montosTerrenoPorMes.reduce((sum, item) => sum + Number(item || 0), 0));
                                const totalInteres = redondear2(montosInteresPorMes.reduce((sum, item) => sum + Number(item || 0), 0));

                                mesesAProcesar.forEach((mes, index) => {
                                    if (Number(montosTerrenoPorMes[index] || 0) > 0) {
                                        const montoTerrenoConcepto = redondear2(montosTerrenoPorMes[index]);
                                        const desgloseTerreno = calcularComponentesFiscalmente(montoTerrenoConcepto);
                                        detalleCobro.push({
                                            concepto: `Cuota de Terreno No. ${cuotasTerrenoCalculadas[index] || (index + 1)}`,
                                            mes,
                                            monto_base: desgloseTerreno.subtotal,
                                            iva: desgloseTerreno.iva,
                                            total: desgloseTerreno.total
                                        });
                                    }

                                    serviciosSolicitados
                                        .filter((servicio) => !servicio.es_cobro_unico)
                                        .forEach((servicio) => {
                                            const desgloseServicio = calcularComponentesFiscalmente(Number(servicio?.subtotal || 0));
                                            detalleCobro.push({
                                                concepto: `Servicio: ${servicio?.nombre_servicio || `ID ${servicio?.id_servicio || 'N/A'}`}`,
                                                mes,
                                                monto_base: desgloseServicio.subtotal,
                                                iva: desgloseServicio.iva,
                                                total: desgloseServicio.total
                                            });
                                        });
                                });

                                if (montoInteresTotal > 0 && mesesConTerreno.length) {
                                    mesesConTerreno.forEach((mes, index) => {
                                        const montoInteresConcepto = redondear2(montosInteresPorMes[index] || 0);
                                        if (montoInteresConcepto <= 0) return;
                                        detalleCobro.push({
                                            concepto: `Interés ${interesPorcentajeContrato.toFixed(2)}%`,
                                            mes,
                                            monto_base: montoInteresConcepto,
                                            iva: 0,
                                            total: montoInteresConcepto
                                        });
                                    });
                                }

                                serviciosSolicitados
                                    .filter((servicio) => servicio.es_cobro_unico)
                                    .forEach((servicio) => {
                                        const desgloseServicio = calcularComponentesFiscalmente(Number(servicio?.subtotal || 0));
                                        detalleCobro.push({
                                            concepto: `Servicio: ${servicio?.nombre_servicio || `ID ${servicio?.id_servicio || 'N/A'}`}`,
                                            mes: mesesAProcesar[0],
                                            monto_base: desgloseServicio.subtotal,
                                            iva: desgloseServicio.iva,
                                            total: desgloseServicio.total
                                        });
                                    });

                                if (serviciosMesInicial.length > 0) {
                                    const mesInicialContrato = obtenerMesInicialContrato();
                                    serviciosMesInicial.forEach((servicio) => {
                                        const desgloseServicio = calcularComponentesFiscalmente(Number(servicio?.subtotal || 0));
                                        detalleCobro.push({
                                            concepto: `Servicio inicial: ${servicio?.nombre_servicio || `ID ${servicio?.id_servicio || 'N/A'}`}`,
                                            mes: mesInicialContrato,
                                            monto_base: desgloseServicio.subtotal,
                                            iva: desgloseServicio.iva,
                                            total: desgloseServicio.total
                                        });
                                    });
                                }

                                if (moraTotal > 0) {
                                    if (morasAplicadas.length) {
                                        morasAplicadas.forEach((mora) => {
                                            const desgloseMora = calcularComponentesFiscalmente(Number(mora?.monto_mora || 0));
                                            detalleCobro.push({
                                                concepto: `Mora ${mora?.mes_atrasado || ''}`.trim(),
                                                mes: mora?.mes_atrasado || (mesesAProcesar[0] || ''),
                                                monto_base: desgloseMora.subtotal,
                                                iva: desgloseMora.iva,
                                                total: desgloseMora.total
                                            });
                                        });
                                    } else {
                                        const desgloseMora = calcularComponentesFiscalmente(moraTotal);
                                        detalleCobro.push({
                                            concepto: 'Mora',
                                            mes: mesesAProcesar[0] || '',
                                            monto_base: desgloseMora.subtotal,
                                            iva: desgloseMora.iva,
                                            total: desgloseMora.total
                                        });
                                    }
                                }

                                return res.status(200).json({
                                    success: true,
                                    numero_recibo,
                                    fecha: new Date().toLocaleDateString(),
                                    monto_pagado: redondear2(montoPrincipalTotal + montoInteresTotal),
                                    monto_terreno_pagado: montoTerrenoTotal,
                                    monto_interes_pagado: montoInteresTotal,
                                    monto_servicios_pagado: montoServiciosTotal,
                                    monto_servicios_mes_inicial: montoServiciosMesInicial,
                                    servicios_cobrados: serviciosSolicitados,
                                    servicios_cobrados_mes_inicial: serviciosMesInicial,
                                    monto_mora: moraTotal,
                                    moras_aplicadas: morasAplicadas,
                                    iva_total: ivaTotal,
                                    iva_por_mes: ivaPorMes,
                                    monto_por_mes: montoPorMesTerreno,
                                    monto_cuota_base_entera: montoCuotaBaseEntera,
                                    total_cobrado: totalTransaccion,
                                    mes_pagado: mesesAProcesar[0],
                                    meses_pagados: mesesAProcesar,
                                    detalle_cobro: detalleCobro,
                                    desglose_totales: {
                                        capital_total: totalCuotaNormal,
                                        interes_total: totalInteres,
                                        cuota_normal_total: totalCuotaNormal,
                                        mora_total: moraTotal,
                                        total_final: totalTransaccion
                                    },
                                    numero_cuota: numeroCuotaInicio,
                                    numero_cuota_inicio: numeroCuotaInicio,
                                    numero_cuota_fin: numeroCuotaFin,
                                    cantidad_cuotas_pagadas: cantidadCuotasPagadas,
                                    metodo_pago,
                                    no_referencia: correlativoFinal,
                                    id_pago: lastIdPago,
                                    id_resolucion_usada: idResolucionUsada,
                                    id_asignacion_correlativo: correlativoMeta?.id_asignacion || null,
                                    origen_correlativo: correlativoMeta?.origen || null,
                                    empresa: {
                                        nombre: empresa.nombre_empresa,
                                        nit: empresa.nit,
                                        logo: empresa.logo,
                                        pais: empresa.pais,
                                        moneda: empresa.moneda
                                    }
                                });
                            });
                        };

                        const reservarResolucionDirecta = (callback) => {
                            const sqlResolucionUsuario = `
                                SELECT rf.id_resolucion, rf.id_empresa, rf.numero_resolucion, rf.serie, rf.correlativo_actual, rf.rango_final
                                FROM resoluciones_facturas rf
                                WHERE rf.id_usuario = ?
                                  AND LOWER(TRIM(COALESCE(rf.estado, 'activo'))) = 'activo'
                                  AND rf.correlativo_actual BETWEEN rf.rango_inicial AND rf.rango_final
                                  AND (rf.fecha_vencimiento IS NULL OR rf.fecha_vencimiento >= CURDATE())
                                  AND (? IS NULL OR rf.id_empresa = ?)
                                ORDER BY rf.fecha_vencimiento ASC, rf.id_resolucion ASC
                                LIMIT 1
                            `;

                            return db.query(sqlResolucionUsuario, [idUsuarioSeguro, idEmpresaFacturacion, idEmpresaFacturacion], (resErr, resRows) => {
                                if (resErr) {
                                    return callback(resErr);
                                }

                                if (!resRows || !resRows.length) {
                                    return callback(null, null);
                                }

                                const resolucion = resRows[0];
                                const correlativoNumero = Number(resolucion.correlativo_actual || 0);
                                const rangoFinal = Number(resolucion.rango_final || 0);

                                if (!Number.isFinite(correlativoNumero) || correlativoNumero <= 0 || correlativoNumero > rangoFinal) {
                                    return callback(null, null);
                                }

                                const correlativoGenerado = `${resolucion.serie}-${String(correlativoNumero).padStart(8, '0')}`;
                                const siguienteCorrelativo = correlativoNumero + 1;

                                return db.query(
                                    'UPDATE resoluciones_facturas SET correlativo_actual = ? WHERE id_resolucion = ?',
                                    [siguienteCorrelativo, resolucion.id_resolucion],
                                    (updErr) => {
                                        if (updErr) {
                                            return callback(updErr);
                                        }

                                        return sincronizarCorrelativoResolucionesEquivalentes({
                                            idResolucionBase: resolucion.id_resolucion,
                                            idUsuario: idUsuarioSeguro,
                                            numeroResolucion: resolucion.numero_resolucion,
                                            serie: resolucion.serie,
                                            correlativoActual: siguienteCorrelativo
                                        }, (syncErr) => {
                                            if (syncErr) {
                                                return callback(syncErr);
                                            }

                                            return callback(null, {
                                                correlativo: correlativoGenerado,
                                                id_resolucion: resolucion.id_resolucion,
                                                id_asignacion: null,
                                                origen: 'resolucion_usuario'
                                            });
                                        });
                                    }
                                );
                            });
                        };

                        const continuarConInsertPago = (correlativoAsignado, idResolucionUsada = null, correlativoMeta = {}) => {
                            const sqlPago = `
                                INSERT INTO pagos (id_contrato, id_usuario, fecha_pago, monto_total_pagado, forma_pago, no_referencia)
                                VALUES (?, ?, NOW(), ?, ?, ?)
                            `;
                            const moraTotal = moraTotalSeleccionada;
                            const totalTransaccion = redondear2(montoPrincipalTotal + montoInteresTotal + moraTotal);

                            return db.query(sqlPago, [id_contrato, idUsuarioSeguro, totalTransaccion, metodo_pago, correlativoAsignado], (errPago, resPago) => {
                                if (errPago) {
                                    return db.rollback(() => res.status(500).send('Error en tabla pagos: ' + errPago.message));
                                }

                                const lastIdPago = resPago.insertId;
                                const correlativoFinal = correlativoAsignado || `TMP-${String(lastIdPago).padStart(8, '0')}`;
                                const {
                                    detalleValues,
                                    cuotasTerrenoCalculadas,
                                    montosTerrenoPorMes,
                                    mesesConTerreno,
                                    montosInteresPorMes
                                } = construirDetalleValues(lastIdPago, moraTotal);

                                if (!detalleValues.length) {
                                    return db.rollback(() => res.status(400).send('No hay detalle válido para registrar el cobro.'));
                                }

                                const idsServiciosDetalle = [...new Set(
                                    detalleValues
                                        .map((detalle) => Number(detalle?.[2]))
                                        .filter((id) => Number.isInteger(id) && id > 0)
                                )];

                                const insertarDetalles = () => {
                                    const placeholders = detalleValues.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                                    const flatValues = detalleValues.map((detalle) => detalle.slice(0, 6)).flat();

                                    return db.query(
                                        `INSERT INTO pagos_detalle (id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal) VALUES ${placeholders}`,
                                        flatValues,
                                        (errDetalle) => {
                                            if (errDetalle) {
                                                return db.rollback(() => res.status(500).send('Error en pagos_detalle: ' + errDetalle.message));
                                            }

                                            const idsPagoExtraMarcados = [...new Set(
                                                (serviciosSolicitados || [])
                                                    .filter((s) => s.es_extraordinario && Number.isInteger(s.id_pago_extra) && s.id_pago_extra > 0)
                                                    .map((s) => Number(s.id_pago_extra))
                                            )];

                                            const continuarPostExtras = () => {
                                                registrarHistorialFactura({
                                                    idPago: lastIdPago,
                                                    idContrato: id_contrato,
                                                    idResidente: id_residente,
                                                    idUsuario: idUsuarioSeguro,
                                                    correlativo: correlativoFinal,
                                                    detalleValues,
                                                    serviciosSolicitados,
                                                    serviciosMesInicial,
                                                    numeroRecibo: numero_recibo,
                                                    metodoPago: metodo_pago,
                                                    observaciones,
                                                    mesesPagados: mesesAProcesar,
                                                    totalTransaccion,
                                                    montoMora: moraTotal,
                                                    callback: (histErr) => {
                                                        if (histErr) {
                                                            return db.rollback(() => res.status(500).send('No se pudo guardar evidencia fiscal inmutable del comprobante.'));
                                                        }

                                                        const idsMorosidad = [...new Set(
                                                            (morasAplicadas || [])
                                                                .map((item) => Number(item?.id_morosidad || 0))
                                                                .filter((id) => Number.isInteger(id) && id > 0)
                                                        )];

                                                        const actualizarSaldoYCommit = () => {
                                                            const commitFinal = () => db.commit((commitErr) => {
                                                                if (commitErr) {
                                                                    return db.rollback(() => res.status(500).send('Error al confirmar base de datos.'));
                                                                }

                                                                return finalizarRespuesta({
                                                                    lastIdPago,
                                                                    correlativoFinal,
                                                                    idResolucionUsada,
                                                                    correlativoMeta,
                                                                    totalTransaccion,
                                                                    moraTotal,
                                                                    cuotasTerrenoCalculadas,
                                                                    montosTerrenoPorMes,
                                                                    mesesConTerreno,
                                                                    montosInteresPorMes
                                                                });
                                                            });

                                                            if (montoTerrenoTotal > 0) {
                                                                return db.query(
                                                                    'UPDATE contratos_residentes SET monto_total = GREATEST(monto_total - ?, 0) WHERE id_contrato = ?',
                                                                    [montoTerrenoTotal, id_contrato],
                                                                    (saldoUpdErr) => {
                                                                        if (saldoUpdErr) {
                                                                            return db.rollback(() => res.status(500).send('Error al actualizar saldo: ' + saldoUpdErr.message));
                                                                        }
                                                                        return commitFinal();
                                                                    }
                                                                );
                                                            }

                                                            return commitFinal();
                                                        };

                                                        if (idsMorosidad.length) {
                                                            const placeholdersMora = idsMorosidad.map(() => '?').join(', ');
                                                            return db.query(
                                                                `UPDATE morosidad SET estado = 'pagado' WHERE id_contrato = ? AND estado = 'pendiente' AND id_morosidad IN (${placeholdersMora})`,
                                                                [id_contrato, ...idsMorosidad],
                                                                (moraErr) => {
                                                                    if (moraErr && String(moraErr?.code || '').toUpperCase() !== 'ER_NO_SUCH_TABLE') {
                                                                        return db.rollback(() => res.status(500).send('Error al actualizar estado de morosidad despues del cobro: ' + moraErr.message));
                                                                    }
                                                                    return actualizarSaldoYCommit();
                                                                }
                                                            );
                                                        }

                                                        return actualizarSaldoYCommit();
                                                    }
                                                });
                                            };

                                            if (idsPagoExtraMarcados.length) {
                                                const placeholdersExtra = idsPagoExtraMarcados.map(() => '?').join(',');
                                                return db.query(
                                                    `UPDATE pagos_extraordinarios SET estado = 'pagado', fecha_pago = CURDATE() WHERE id_contrato = ? AND id_pago_extra IN (${placeholdersExtra}) AND LOWER(COALESCE(estado, 'pendiente')) = 'pendiente'`,
                                                    [id_contrato, ...idsPagoExtraMarcados],
                                                    (extraUpdErr) => {
                                                        if (extraUpdErr) {
                                                            return db.rollback(() => res.status(500).send('No se pudieron actualizar los cargos extraordinarios cobrados.'));
                                                        }
                                                        return continuarPostExtras();
                                                    }
                                                );
                                            }

                                            return continuarPostExtras();
                                        }
                                    );
                                };

                                if (idsServiciosDetalle.length) {
                                    const placeholdersServicios = idsServiciosDetalle.map(() => '?').join(', ');
                                    return db.query(
                                        `SELECT id_servicio FROM servicios WHERE id_servicio IN (${placeholdersServicios})`,
                                        idsServiciosDetalle,
                                        (servCheckErr, servCheckRows) => {
                                            if (servCheckErr) {
                                                return db.rollback(() => res.status(500).send('Error validando conceptos de servicio antes de facturar: ' + servCheckErr.message));
                                            }

                                            const idsValidosDetalle = new Set((servCheckRows || []).map((row) => Number(row.id_servicio)));
                                            const idsInvalidosDetalle = idsServiciosDetalle.filter((id) => !idsValidosDetalle.has(id));
                                            if (idsInvalidosDetalle.length) {
                                                return db.rollback(() => res.status(400).send(`Hay servicios invalidos en el cobro: ${idsInvalidosDetalle.join(', ')}. Actualiza los servicios asignados del contrato antes de cobrar.`));
                                            }

                                            return insertarDetalles();
                                        }
                                    );
                                }

                                return insertarDetalles();
                            });
                        };

                        return reservarCorrelativoAsignado(idUsuarioSeguro, idEmpresaFacturacion, (asignErr, asignacionReservada) => {
                            if (asignErr) {
                                return db.rollback(() => res.status(500).send('Error al obtener correlativo asignado al usuario: ' + asignErr.message));
                            }

                            if (asignacionReservada?.correlativo) {
                                return continuarConInsertPago(asignacionReservada.correlativo, asignacionReservada.id_resolucion, {
                                    id_asignacion: asignacionReservada.id_asignacion,
                                    origen: 'asignado'
                                });
                            }

                            return reservarResolucionDirecta((reservaErr, resolucionReservada) => {
                                if (reservaErr) {
                                    return db.rollback(() => res.status(500).send('Error al obtener resolución asignada al usuario: ' + reservaErr.message));
                                }

                                if (!resolucionReservada?.correlativo) {
                                    return db.rollback(() => res.status(400).send('No hay correlativo fiscal disponible para este usuario. Asigna correlativos antes de registrar el cobro.'));
                                }

                                return continuarConInsertPago(resolucionReservada.correlativo, resolucionReservada.id_resolucion, {
                                    id_asignacion: null,
                                    origen: 'resolucion_usuario'
                                });
                            });
                        });
                    });
                });
            };

            return validarServiciosYContinuar();
            });
        });
    });
    });
});
});

module.exports = router;