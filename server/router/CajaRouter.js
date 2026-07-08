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
    const iva = parseFloat((montoTotal * 0.12).toFixed(2));
    const subtotal = parseFloat((montoTotal - iva).toFixed(2));

    return {
        subtotal,
        iva,
        total: montoTotal
    };
};

const obtenerContextoUsuarioCobro = (idUsuario, callback) => {
    if (!idUsuario) {
        callback(null, { esAdmin: false, nombre_rol: '' });
        return;
    }

    const query = `
        SELECT u.id_usuario, r.nombre_rol
        FROM usuarios u
        LEFT JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = ?
        LIMIT 1
    `;

    db.query(query, [idUsuario], (err, rows) => {
        if (err) {
            callback(err);
            return;
        }

        const rolNormalizado = normalizeText(rows?.[0]?.nombre_rol || '');
        const esAdmin = rolNormalizado.includes('admin') || rolNormalizado.includes('administrador') || rolNormalizado.includes('superusuario');
        const roleType = rolNormalizado.includes('jurid') || rolNormalizado.includes('legal')
            ? 'juridico'
            : ((rolNormalizado.includes('caja') || rolNormalizado.includes('cobro')) ? 'caja' : null);
        callback(null, {
            esAdmin,
            nombre_rol: rows?.[0]?.nombre_rol || '',
            role_type: roleType
        });
    });
};

const reservarCorrelativoAsignado = (idUsuario, idEmpresa, callback) => {
    if (!idUsuario || !idEmpresa) {
        return callback(null, null);
    }

    const query = `
        SELECT id_asignacion, id_resolucion, serie, correlativo_actual, correlativo_fin
        FROM asignar_correlativos
        WHERE id_usuario = ?
          AND id_empresa = ?
          AND estado = 'activo'
          AND correlativo_actual <= correlativo_fin
        ORDER BY fecha_asignacion ASC, id_asignacion ASC
        LIMIT 1
    `;

    db.query(query, [idUsuario, idEmpresa], (err, rows) => {
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
                    id_asignacion: asignacion.id_asignacion
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

// === OBTENER LISTA INICIAL DE RESIDENTES (PENDIENTES Y SOLVENTES) ===
router.get("/residentes-pendientes", (req, res) => {
    const query = `
        SELECT 
            r.id_residente, r.nombre, r.dpi, r.nit, r.telefono, r.correo, r.direccion_notificacion, r.numero_identificacion,
            c.id_contrato, c.codigo_contrato, c.monto_total AS saldo_pendiente, 
            c.monto_cuota, c.cuotas_pactadas, tc.id_tipo_contrato, 
            tc.nombre_tipo_contrato AS nombre_contrato,
            c.id_proyecto,
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
        ORDER BY CASE WHEN c.monto_total > 0 THEN 0 ELSE 1 END, r.nombre ASC
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error("Error al obtener residentes pendientes:", err.message);
            return res.status(500).send("Error al obtener residentes: " + err.message);
        }

        return res.status(200).json(result || []);
    });
});

// === BUSCAR RESIDENTE POR NOMBRE, APELLIDO, DPI O NUMERO DE CONTRATO ===
router.get("/buscar-residente", (req, res) => {
    const { criterio } = req.query;

    if (!criterio) {
        return res.status(400).send("Debe proporcionar un criterio de búsqueda.");
    }

    const query = `
        SELECT 
            r.id_residente, r.nombre, r.dpi, r.nit, r.telefono, r.correo, r.direccion_notificacion, r.numero_identificacion,
            c.id_contrato, c.codigo_contrato, c.monto_total AS saldo_pendiente, 
            c.monto_cuota, c.cuotas_pactadas, tc.id_tipo_contrato, 
            tc.nombre_tipo_contrato AS nombre_contrato,
            c.id_proyecto,
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
        WHERE c.estado = 'activo' AND (
            r.nombre LIKE ? 
            OR r.dpi LIKE ?
            OR r.numero_identificacion LIKE ?
            OR c.codigo_contrato LIKE ?
        )
        ORDER BY CASE WHEN c.monto_total > 0 THEN 0 ELSE 1 END, r.nombre ASC
        LIMIT 50
    `;

    const searchTerm = `%${criterio}%`;
    const queryParams = [searchTerm, searchTerm, searchTerm, searchTerm];

    db.query(query, queryParams, (err, result) => {
        if (err) {
            console.error("Error en la consulta:", err.message);
            return res.status(500).send("Error al consultar el residente: " + err.message);
        }
        if (result.length === 0) return res.status(404).send("No se encontraron residentes con contratos activos bajo ese criterio.");
        
        res.status(200).json(result);
    });
});

// === OBTENER MESES PENDIENTES ===
router.get("/meses-pendientes", (req, res) => {
    const { id_contrato } = req.query;
    const nombreMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    if (!id_contrato) {
        const hoy = new Date();
        return res.status(200).json({ meses: [nombreMeses[hoy.getMonth()] + ' ' + hoy.getFullYear()] });
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

        if (fechaFinMes) {
            while (cursor <= fechaFinMes) {
                candidatos.push(`${nombreMeses[cursor.getMonth()]} ${cursor.getFullYear()}`);
                cursor.setMonth(cursor.getMonth() + 1);
            }
        } else {
            const totalMesesObjetivo = Math.max(
                Number.isInteger(cuotasPactadas) && cuotasPactadas > 0 ? cuotasPactadas : 0,
                mesesTranscurridos
            );

            for (let i = 0; i < totalMesesObjetivo; i += 1) {
                candidatos.push(`${nombreMeses[cursor.getMonth()]} ${cursor.getFullYear()}`);
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
            const mesasPagadosSet = new Set();
            (result || []).forEach(row => {
                if (row.mes_pagado && row.mes_pagado.trim()) {
                    mesasPagadosSet.add(row.mes_pagado.trim());
                }
            });

            // Filtrar: solo retornar meses que NO estén en pagados
            const pendientes = candidatos.filter(mes => !mesasPagadosSet.has(mes));

            // Si hay saldo pendiente, asegurar que existan meses pendientes suficientes para poder cobrar.
            const cuotasRestantesPorSaldo = (montoCuota > 0 && saldoPendiente > 0)
                ? Math.ceil(saldoPendiente / montoCuota)
                : 0;

            if (cuotasRestantesPorSaldo > 0 && pendientes.length < cuotasRestantesPorSaldo) {
                const pendientesSet = new Set(pendientes);
                const base = fechaFinMes
                    ? new Date(fechaFinMes.getFullYear(), fechaFinMes.getMonth(), 1)
                    : new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
                let offset = fechaFinMes ? 1 : candidatos.length;

                while (pendientesSet.size < cuotasRestantesPorSaldo) {
                    const extra = new Date(base.getFullYear(), base.getMonth(), 1);
                    extra.setMonth(extra.getMonth() + offset);
                    const etiqueta = `${nombreMeses[extra.getMonth()]} ${extra.getFullYear()}`;
                    if (!mesasPagadosSet.has(etiqueta)) {
                        pendientesSet.add(etiqueta);
                    }
                    offset += 1;
                }

                return res.status(200).json({ meses: Array.from(pendientesSet) });
            }

            return res.status(200).json({ meses: pendientes });
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

        const servicios = (rows || [])
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
                    es_cobro_unico: esCobroUnico,
                    ya_pagado_mes: esCobroUnico ? solventeContrato : Number(row.ya_pagado_mes || 0) === 1,
                    ya_pagado_alguna_vez: solventeContrato
                };
            })
            .filter((servicio) => !(servicio.es_cobro_unico && servicio.ya_pagado_alguna_vez));

        return res.status(200).json({
            id_contrato: Number(id_contrato),
            mes_consulta: mes,
            servicios
        });
    });
});

// === PROCESAR COBRO ===
router.post("/procesar-pago", (req, res) => {
    const { 
        id_residente, id_contrato, id_tipo_contrato, id_usuario,
        monto_pagar, monto_terreno_pagar, monto_mora, metodo_pago, no_referencia, observaciones,
        mes_pagado, meses_pagados, numero_cuota, servicios_pagados
    } = req.body;

    // Normalizar meses para asegurar que tengan año completo
    const normalizarMeses = (meses) => {
        const nombreMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const hoy = new Date();
        const yearActual = hoy.getFullYear();
        
        return meses.map(mes => {
            // Si ya tiene año (contiene espacio), devolverlo tal cual
            if (mes.includes(' ') && !isNaN(mes.split(' ')[1])) {
                return mes;
            }
            // Si es solo el nombre del mes, agregar el año actual
            if (nombreMeses.includes(mes)) {
                return `${mes} ${yearActual}`;
            }
            // En cualquier otro caso, devolverlo como está
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
                subtotal: Number(item?.subtotal),
                nombre_servicio: String(item?.nombre_servicio || '').trim(),
                periodicidad: String(item?.periodicidad || '').trim().toLowerCase(),
                es_cobro_unico: Boolean(item?.es_cobro_unico) || esServicioCobroUnico(item?.periodicidad || '', item?.nombre_servicio || '')
            }))
            .filter((item) => Number.isInteger(item.id_servicio) && item.id_servicio > 0 && Number.isFinite(item.subtotal) && item.subtotal > 0)
        : [];

    let serviciosMesInicial = [];

    const montoSolicitado = parseFloat(monto_pagar || 0);
    const montoTerrenoSolicitado = parseFloat(monto_terreno_pagar);
    const montoTerrenoTotalBase = Number.isFinite(montoTerrenoSolicitado)
        ? parseFloat(Math.max(montoTerrenoSolicitado, 0).toFixed(2))
        : parseFloat(Math.max((Number.isFinite(montoSolicitado) ? montoSolicitado : 0), 0).toFixed(2));

    let montoTerrenoTotal = montoTerrenoTotalBase;
    let montoServiciosMensual = 0;
    let montoServiciosMesInicial = 0;
    let montoServiciosTotal = 0;
    let montoPrincipalTotal = 0;
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
        ivaTotal = parseFloat((montoPrincipalTotal * 0.12).toFixed(2));
        ivaPorMes = parseFloat((ivaTotal / cantidadMeses).toFixed(2));
    };

    recalcularTotales();

    const parseMesEtiqueta = (mesTexto = '') => {
        const nombreMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const limpio = String(mesTexto || '').trim();
        if (!limpio) return null;
        const partes = limpio.split(' ');
        if (partes.length < 2) return null;
        const mesNombre = partes[0];
        const anio = Number(partes[1]);
        const idx = nombreMeses.findIndex((m) => m.toLowerCase() === mesNombre.toLowerCase());
        if (idx < 0 || !Number.isInteger(anio)) return null;
        return new Date(anio, idx, 1);
    };

    const etiquetaMesDesdeFecha = (fecha) => {
        const nombreMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return `${nombreMeses[fecha.getMonth()]} ${fecha.getFullYear()}`;
    };
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

            db.query('SELECT monto_total, fecha_compra, fecha_firma FROM contratos_residentes WHERE id_contrato = ?', [id_contrato], (saldoErr, saldoRows) => {
            if (saldoErr) {
                return db.rollback(() => res.status(500).send('Error al validar saldo pendiente: ' + saldoErr.message));
            }

            if (!saldoRows || !saldoRows.length) {
                return db.rollback(() => res.status(404).send('No se encontró el contrato para aplicar el cobro.'));
            }

            const saldoActual = parseFloat(saldoRows[0].monto_total || 0);

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
                    .map((item) => ({ etiqueta: item, fecha: parseMesEtiqueta(item) }))
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
                const serviciosAValidar = [...serviciosSolicitados, ...serviciosMesInicial];

                if (!serviciosAValidar.length) {
                    return procesarCobroPrincipal();
                }

                const idsServicios = [...new Set(serviciosAValidar.map((s) => s.id_servicio))];
                const placeholdersIds = idsServicios.map(() => '?').join(',');
                const placeholdersMeses = mesesAProcesar.map(() => '?').join(',');

                const fechaCompra = saldoRows[0]?.fecha_compra ? new Date(saldoRows[0].fecha_compra) : null;
                const fechaFirma = saldoRows[0]?.fecha_firma ? new Date(saldoRows[0].fecha_firma) : null;
                const fechaInicioValida = (fechaCompra && !Number.isNaN(fechaCompra.getTime()))
                    ? fechaCompra
                    : ((fechaFirma && !Number.isNaN(fechaFirma.getTime())) ? fechaFirma : null);
                const mesInicialContrato = fechaInicioValida
                    ? etiquetaMesDesdeFecha(new Date(fechaInicioValida.getFullYear(), fechaInicioValida.getMonth(), 1))
                    : null;

                const sqlServiciosAsignados = `
                                        SELECT DISTINCT base.id_servicio
                                        FROM (
                                                SELECT cs.id_servicio
                                                FROM contratos_servicios cs
                                                INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
                                                WHERE cs.id_contrato = ?
                                                    AND cs.estado = 'activo'
                                                    AND s.estado = 'activo'

                                                UNION

                                                SELECT ps.id_servicio
                                                FROM contratos_residentes c
                                                INNER JOIN proyecto_servicios ps ON ps.id_proyecto = c.id_proyecto
                                                INNER JOIN servicios s ON s.id_servicio = ps.id_servicio
                                                WHERE c.id_contrato = ?
                                                    AND ps.estado = 'activo'
                                                    AND s.estado = 'activo'
                                        ) AS base
                                        WHERE base.id_servicio IN (${placeholdersIds})
                `;

                                db.query(sqlServiciosAsignados, [id_contrato, id_contrato, ...idsServicios], (servErr, servRows) => {
                    if (servErr) {
                        return db.rollback(() => res.status(500).send('Error validando servicios del contrato: ' + servErr.message));
                    }

                    const idsValidos = new Set((servRows || []).map((r) => Number(r.id_servicio)));
                    const idsNoValidos = idsServicios.filter((id) => !idsValidos.has(id));
                    if (idsNoValidos.length) {
                        return db.rollback(() => res.status(400).send('Hay servicios que no estan asignados o activos en este contrato.'));
                    }

                    const sqlDuplicados = `
                        SELECT DISTINCT pd.id_concepto_servicio, pd.mes_pagado
                        FROM pagos_detalle pd
                        INNER JOIN pagos p ON p.id_pago = pd.id_pago
                        WHERE p.id_contrato = ?
                          AND pd.tipo_concepto = 'servicio'
                          AND pd.id_concepto_servicio IN (${placeholdersIds})
                          AND pd.mes_pagado IN (${placeholdersMeses})
                    `;

                    db.query(sqlDuplicados, [id_contrato, ...idsServicios, ...mesesAProcesar], (dupErr, dupRows) => {
                        if (dupErr) {
                            return db.rollback(() => res.status(500).send('Error validando duplicidad de cobro de servicios: ' + dupErr.message));
                        }

                        if (dupRows && dupRows.length) {
                            const detalleDuplicado = dupRows.map((d) => `servicio ${d.id_concepto_servicio} (${d.mes_pagado})`).join(', ');
                            return db.rollback(() => res.status(400).send(`Ya existen cobros registrados para: ${detalleDuplicado}.`));
                        }

                        if (!serviciosMesInicial.length || !mesInicialContrato) {
                            return procesarCobroPrincipal();
                        }

                        const idsServiciosInicial = [...new Set(serviciosMesInicial.map((s) => s.id_servicio))];
                        const placeholdersIniciales = idsServiciosInicial.map(() => '?').join(',');
                        const sqlDuplicadosInicial = `
                            SELECT DISTINCT pd.id_concepto_servicio
                            FROM pagos_detalle pd
                            INNER JOIN pagos p ON p.id_pago = pd.id_pago
                            WHERE p.id_contrato = ?
                              AND pd.tipo_concepto = 'servicio'
                              AND pd.id_concepto_servicio IN (${placeholdersIniciales})
                              AND pd.mes_pagado = ?
                        `;

                        db.query(sqlDuplicadosInicial, [id_contrato, ...idsServiciosInicial, mesInicialContrato], (dupIniErr, dupIniRows) => {
                            if (dupIniErr) {
                                return db.rollback(() => res.status(500).send('Error validando servicios del mes inicial: ' + dupIniErr.message));
                            }

                            if (dupIniRows && dupIniRows.length) {
                                const idsDuplicados = new Set((dupIniRows || []).map((r) => Number(r.id_concepto_servicio)));
                                serviciosMesInicial = serviciosMesInicial.filter((item) => !idsDuplicados.has(Number(item.id_servicio)));
                                recalcularTotales();
                            }

                            return procesarCobroPrincipal();
                        });
                    });
                });
            };

            const procesarCobroPrincipal = () => {
            const sqlCaja = `INSERT INTO caja_ingresos 
                (numero_recibo, fecha_pago, monto_pagado, monto_mora, metodo_pago, observaciones, id_residente, id_tipo_contrato) 
                VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?)`;

            db.query(sqlCaja, [numero_recibo, montoPrincipalTotal, monto_mora || 0, metodo_pago, observaciones, id_residente, id_tipo_contrato], (err, resCaja) => {
                if (err) return db.rollback(() => res.status(500).send("Error en caja_ingresos: " + err.message));

                const sqlEmpresaContrato = `
                    SELECT COALESCE(c.id_empresa_marca, r.id_empresa) AS id_empresa_facturacion
                    FROM contratos_residentes c
                    LEFT JOIN residentes r ON r.id_residente = c.id_residente
                    WHERE c.id_contrato = ?
                    LIMIT 1
                `;

                db.query(sqlEmpresaContrato, [id_contrato], (empresaErr, empresaRows) => {
                    if (empresaErr) {
                        return db.rollback(() => res.status(500).send("Error al obtener empresa del contrato: " + empresaErr.message));
                    }

                    const idEmpresaFacturacion = empresaRows?.[0]?.id_empresa_facturacion || null;

                    const continuarConInsertPago = (correlativoAsignado, idResolucionUsada = null, correlativoMeta = {}) => {
                        const sqlPago = `INSERT INTO pagos (id_contrato, id_usuario, fecha_pago, monto_total_pagado, forma_pago, no_referencia) 
                                         VALUES (?, ?, NOW(), ?, ?, ?)`;
                        const moraTotal = parseFloat(monto_mora || 0);
                        const totalTransaccion = parseFloat((montoPrincipalTotal + moraTotal).toFixed(2));

                        db.query(sqlPago, [id_contrato, idUsuarioSeguro, totalTransaccion, metodo_pago, correlativoAsignado], (err, resPago) => {
                            if (err) return db.rollback(() => res.status(500).send("Error en tabla pagos: " + err.message));

                            const lastIdPago = resPago.insertId;
                            const correlativoFinal = correlativoAsignado || `TMP-${String(lastIdPago).padStart(8, '0')}`;

                            const finalizarConDetalles = () => {
                                const detalleValues = [];

                                if (montoTerrenoTotal > 0) {
                                    mesesAProcesar.forEach((mes, index) => {
                                        detalleValues.push([lastIdPago, 'cuota_terreno', null, mes, (parseInt(numero_cuota || 1) + index), montoPorMesTerreno]);
                                    });
                                }

                                if (serviciosSolicitados.length > 0) {
                                    const serviciosMensuales = serviciosSolicitados.filter((servicio) => !servicio.es_cobro_unico);
                                    const serviciosUnicos = serviciosSolicitados.filter((servicio) => servicio.es_cobro_unico);

                                    mesesAProcesar.forEach((mes) => {
                                        serviciosMensuales.forEach((servicio) => {
                                            detalleValues.push([lastIdPago, 'servicio', servicio.id_servicio, mes, null, servicio.subtotal]);
                                        });
                                    });

                                    serviciosUnicos.forEach((servicio) => {
                                        detalleValues.push([lastIdPago, 'servicio', servicio.id_servicio, mesesAProcesar[0], null, servicio.subtotal]);
                                    });
                                }

                                if (serviciosMesInicial.length > 0) {
                                    const fechaCompra = saldoRows[0]?.fecha_compra ? new Date(saldoRows[0].fecha_compra) : null;
                                    const fechaFirma = saldoRows[0]?.fecha_firma ? new Date(saldoRows[0].fecha_firma) : null;
                                    const fechaInicioValida = (fechaCompra && !Number.isNaN(fechaCompra.getTime()))
                                        ? fechaCompra
                                        : ((fechaFirma && !Number.isNaN(fechaFirma.getTime())) ? fechaFirma : null);
                                    const mesInicialContrato = fechaInicioValida
                                        ? etiquetaMesDesdeFecha(new Date(fechaInicioValida.getFullYear(), fechaInicioValida.getMonth(), 1))
                                        : mesesAProcesar[0];

                                    serviciosMesInicial.forEach((servicio) => {
                                        detalleValues.push([lastIdPago, 'servicio', servicio.id_servicio, mesInicialContrato, null, servicio.subtotal]);
                                    });
                                }

                                const placeholders = detalleValues.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                                const flatValues = detalleValues.flat();

                                db.query(`INSERT INTO pagos_detalle (id_pago, tipo_concepto, id_concepto_servicio, mes_pagado, numero_cuota_afectada, subtotal) VALUES ${placeholders}`,
                                    flatValues,
                                    (err) => {
                                        if (err) return db.rollback(() => res.status(500).send("Error en pagos_detalle: " + err.message));

                                        const finalizarCommit = () => {
                                            db.commit((err) => {
                                                if (err) return db.rollback(() => res.status(500).send("Error al confirmar base de datos."));

                                                // Obtener empresa real del contrato para membrete/logo
                                                const empresaQuery = `
                                                    SELECT
                                                        COALESCE(em.nombre_empresa, er.nombre_empresa) AS nombre_empresa,
                                                        COALESCE(em.logo, er.logo) AS logo_empresa,
                                                        COALESCE(ep.logo, em.logo, er.logo) AS logo_proyecto,
                                                        COALESCE(em.logo, er.logo) AS logo,
                                                        COALESCE(em.nit, ep.nit, er.nit, 'N/A') AS nit,
                                                        COALESCE(em.pais, ep.pais, er.pais, 'Guatemala') AS pais,
                                                        COALESCE(em.moneda, ep.moneda, er.moneda, 'GTQ') AS moneda,
                                                        c.id_proyecto,
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

                                                db.query(empresaQuery, [id_contrato], (errEmpresa, resEmpresa) => {
                                                    const empresa = resEmpresa?.[0] || { nombre_empresa: 'INMOBILIARIA ALFA S.A.', logo: null, nit: 'N/A', pais: 'Guatemala', moneda: 'GTQ' };
                                                    const detalleCobro = [];

                                                    mesesAProcesar.forEach((mes, index) => {
                                                        if (montoPorMesTerreno > 0) {
                                                            const desgloseTerreno = calcularComponentesFiscalmente(montoPorMesTerreno);
                                                            detalleCobro.push({
                                                                concepto: `Cuota de Terreno No. ${parseInt(numero_cuota || 1, 10) + index}`,
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
                                                        const fechaCompra = saldoRows[0]?.fecha_compra ? new Date(saldoRows[0].fecha_compra) : null;
                                                        const fechaFirma = saldoRows[0]?.fecha_firma ? new Date(saldoRows[0].fecha_firma) : null;
                                                        const fechaInicioValida = (fechaCompra && !Number.isNaN(fechaCompra.getTime()))
                                                            ? fechaCompra
                                                            : ((fechaFirma && !Number.isNaN(fechaFirma.getTime())) ? fechaFirma : null);
                                                        const mesInicialContrato = fechaInicioValida
                                                            ? etiquetaMesDesdeFecha(new Date(fechaInicioValida.getFullYear(), fechaInicioValida.getMonth(), 1))
                                                            : mesesAProcesar[0];

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

                                                    res.status(200).json({
                                                        success: true,
                                                        numero_recibo,
                                                        fecha: new Date().toLocaleDateString(),
                                                        monto_pagado: montoPrincipalTotal,
                                                        monto_terreno_pagado: montoTerrenoTotal,
                                                        monto_servicios_pagado: montoServiciosTotal,
                                                        monto_servicios_mes_inicial: montoServiciosMesInicial,
                                                        servicios_cobrados: serviciosSolicitados,
                                                        servicios_cobrados_mes_inicial: serviciosMesInicial,
                                                        monto_mora: moraTotal,
                                                        iva_total: ivaTotal,
                                                        iva_por_mes: ivaPorMes,
                                                        monto_por_mes: montoPorMesTerreno,
                                                        total_cobrado: totalTransaccion,
                                                        mes_pagado: mesesAProcesar[0],
                                                        meses_pagados: mesesAProcesar,
                                                        detalle_cobro: detalleCobro,
                                                        numero_cuota,
                                                        metodo_pago: metodo_pago,
                                                        no_referencia: correlativoFinal,
                                                        id_pago: lastIdPago,
                                                        id_resolucion_usada: idResolucionUsada,
                                                        id_asignacion_correlativo: correlativoMeta?.id_asignacion || null,
                                                        origen_correlativo: correlativoMeta?.origen || (correlativoAsignado ? 'resolucion' : 'temporal'),
                                                        empresa: {
                                                            nombre: empresa.nombre_empresa,
                                                            nit: empresa.nit,
                                                            logo: empresa.logo,
                                                            pais: empresa.pais,
                                                            moneda: empresa.moneda
                                                        }
                                                    });
                                                });
                                            });
                                        };

                                        if (montoTerrenoTotal > 0) {
                                            const sqlRestar = `UPDATE contratos_residentes SET monto_total = GREATEST(monto_total - ?, 0) WHERE id_contrato = ?`;
                                            db.query(sqlRestar, [montoTerrenoTotal, id_contrato], (updErr) => {
                                                if (updErr) return db.rollback(() => res.status(500).send("Error al actualizar saldo: " + updErr.message));
                                                return finalizarCommit();
                                            });
                                        } else {
                                            return finalizarCommit();
                                        }
                                    }
                                );
                            };

                            if (correlativoAsignado) {
                                return finalizarConDetalles();
                            }

                            const correlativoTemporal = `TMP-${String(lastIdPago).padStart(8, '0')}`;
                            db.query('UPDATE pagos SET no_referencia = ? WHERE id_pago = ?', [correlativoTemporal, lastIdPago], (updErr) => {
                                if (updErr) return db.rollback(() => res.status(500).send("Error al asignar correlativo temporal: " + updErr.message));
                                return finalizarConDetalles();
                            });
                        });
                    };

                    if (!idEmpresaFacturacion) {
                        return continuarConInsertPago(null, null);
                    }

                    return reservarCorrelativoAsignado(idUsuarioSeguro, idEmpresaFacturacion, (asignErr, asignacionReservada) => {
                        if (asignErr) {
                            return db.rollback(() => res.status(500).send("Error al obtener correlativo asignado al usuario: " + asignErr.message));
                        }

                        if (asignacionReservada?.correlativo) {
                            return continuarConInsertPago(asignacionReservada.correlativo, asignacionReservada.id_resolucion, {
                                id_asignacion: asignacionReservada.id_asignacion,
                                origen: 'asignado'
                            });
                        }

                        return obtenerContextoUsuarioCobro(idUsuarioSeguro, (userErr, contextoUsuario) => {
                            if (userErr) {
                                return db.rollback(() => res.status(500).send("Error al validar permisos del usuario cobrador: " + userErr.message));
                            }

                            const esAdmin = Boolean(contextoUsuario?.esAdmin);
                            const roleType = String(contextoUsuario?.role_type || '').toLowerCase();

                            if (!esAdmin && roleType !== 'caja' && roleType !== 'juridico') {
                                return db.rollback(() => res.status(400).send("Este usuario no tiene correlativos asignados para cobrar facturas. Solicita un lote de correlativos antes de registrar el cobro."));
                            }

                            const rolResolucionFiltro = esAdmin
                                ? ''
                                : (roleType === 'juridico'
                                    ? " AND COALESCE(rol, 'caja') IN ('juridico', 'ambos')"
                                    : " AND COALESCE(rol, 'caja') IN ('caja', 'ambos')");

                            const sqlResolucion = `
                        SELECT id_resolucion, serie, correlativo_actual, rango_inicial, rango_final, fecha_vencimiento
                        FROM resoluciones_facturas
                        WHERE id_empresa = ?
                          AND estado = 'activo'
                          AND correlativo_actual BETWEEN rango_inicial AND rango_final
                          AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURDATE())
                          ${rolResolucionFiltro}
                        ORDER BY fecha_vencimiento ASC, id_resolucion ASC
                        LIMIT 1
                    `;

                            db.query(sqlResolucion, [idEmpresaFacturacion], (resErr, resRows) => {
                                if (resErr) {
                                    return db.rollback(() => res.status(500).send("Error al obtener resolución activa: " + resErr.message));
                                }

                                if (!resRows || !resRows.length) {
                                    return continuarConInsertPago(null, null);
                                }

                                const resolucion = resRows[0];
                                const correlativoNumero = Number(resolucion.correlativo_actual || 0);
                                const rangoFinal = Number(resolucion.rango_final || 0);

                                if (!Number.isFinite(correlativoNumero) || correlativoNumero <= 0 || correlativoNumero > rangoFinal) {
                                    return db.rollback(() => res.status(400).send("La resolución activa no tiene correlativo disponible."));
                                }

                                const correlativoGenerado = `${resolucion.serie}-${String(correlativoNumero).padStart(8, '0')}`;
                                const siguienteCorrelativo = correlativoNumero + 1;

                                db.query(
                                    'UPDATE resoluciones_facturas SET correlativo_actual = ? WHERE id_resolucion = ?',
                                    [siguienteCorrelativo, resolucion.id_resolucion],
                                    (updResolErr) => {
                                        if (updResolErr) {
                                            return db.rollback(() => res.status(500).send("No se pudo reservar el correlativo de resolución."));
                                        }

                                        return continuarConInsertPago(correlativoGenerado, resolucion.id_resolucion, {
                                            id_asignacion: null,
                                            origen: 'resolucion'
                                        });
                                    }
                                );
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

module.exports = router;