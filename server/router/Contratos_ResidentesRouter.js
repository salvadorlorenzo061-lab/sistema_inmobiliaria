const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

const EXT_TO_MIME = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain; charset=utf-8',
    '.rtf': 'application/rtf',
    '.zip': 'application/zip'
};

const MIME_TO_EXT = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt',
    'application/rtf': '.rtf',
    'application/zip': '.zip'
};

const sanitizeFilename = (value = '') => String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeMimeType = (filename = '', mimeType = '') => {
    const ext = path.extname(String(filename || '').trim()).toLowerCase();
    const mimeRaw = String(mimeType || '').trim().toLowerCase();
    const mimeBase = mimeRaw.split(';')[0];

    if (ext && EXT_TO_MIME[ext]) {
        if (!mimeBase || mimeBase === 'application/octet-stream') {
            return EXT_TO_MIME[ext];
        }
        if (mimeBase === 'text/plain' && ext !== '.txt') {
            return EXT_TO_MIME[ext];
        }
    }

    return mimeRaw || 'application/octet-stream';
};

const ensureFileExtension = (filename = '', mimeType = '', fallbackBase = 'archivo_contrato') => {
    const cleanName = sanitizeFilename(filename);
    const currentExt = path.extname(cleanName).toLowerCase();

    if (cleanName && currentExt) {
        return cleanName;
    }

    const mimeBase = String(mimeType || '').trim().toLowerCase().split(';')[0];
    const inferredExt = MIME_TO_EXT[mimeBase] || currentExt || '.bin';
    const baseName = sanitizeFilename(cleanName ? cleanName.replace(/\.[^.]+$/, '') : fallbackBase);

    return `${baseName || fallbackBase}${inferredExt}`;
};

const calcularCuotaFijaContrato = (capital = 0, tasaAnual = 0, cuotas = 0) => {
    const principal = Math.round(Math.max(Number(capital || 0), 0));
    const plazo = Math.max(parseInt(cuotas || 0, 10), 0);
    const tasa = Math.max(Number(tasaAnual || 0), 0);

    if (principal <= 0 || plazo <= 0) return 0;
    if (tasa <= 0) return Math.round(principal / plazo);

    const anios = Math.max(plazo / 12, 1);
    const interesTotal = principal * (tasa / 100) * anios;
    const cuotaFija = (principal + interesTotal) / plazo;
    return Math.round(cuotaFija);
};

const normalizeMesInicioPagos = (value, fallback = 1) => {
    const numero = parseInt(value, 10);
    const respaldo = Math.max(1, Math.min(12, parseInt(fallback, 10) || 1));
    if (!Number.isFinite(numero)) return respaldo;
    return Math.max(1, Math.min(12, numero));
};

const normalizeAnioInicioPagos = (value, fallback = new Date().getFullYear()) => {
    const numero = parseInt(value, 10);
    const respaldo = Math.max(2000, parseInt(fallback, 10) || new Date().getFullYear());
    if (!Number.isFinite(numero)) return respaldo;
    return Math.max(2000, numero);
};

router.use(cors());
router.use(express.json());

const contratosUploadDir = path.join(__dirname, '..', 'uploads', 'contratos');
if (!fs.existsSync(contratosUploadDir)) {
    fs.mkdirSync(contratosUploadDir, { recursive: true });
}

const storageArchivoContrato = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, contratosUploadDir),
    filename: (req, file, cb) => {
        const idContrato = Number(req.params.id_contrato || 0);
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        cb(null, `contrato_${idContrato}_${Date.now()}${ext}`);
    }
});

const uploadArchivoContrato = multer({
    storage: storageArchivoContrato,
    limits: { fileSize: 15 * 1024 * 1024 }
});

const uploadFiniquito = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }
});

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

const ensureContratosDocumentosTable = () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS contratos_documentos (
            id_documento BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_contrato INT NOT NULL,
            nombre_original VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120) NULL,
            contenido LONGBLOB NOT NULL,
            fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_contrato_documento (id_contrato),
            INDEX idx_cd_contrato (id_contrato),
            CONSTRAINT fk_cd_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_residentes(id_contrato) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('Error asegurando tabla contratos_documentos:', err.message);
        }
    });
};

const ensureContratosFiniquitosTable = (callback = () => {}) => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS contratos_finiquitos (
            id_finiquito BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            id_contrato INT NOT NULL,
            nombre_original VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120) NULL,
            contenido LONGBLOB NOT NULL,
            fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_contrato_finiquito (id_contrato),
            INDEX idx_cf_contrato (id_contrato),
            CONSTRAINT fk_cf_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_residentes(id_contrato) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    db.query(createTableQuery, (err) => {
        if (err) {
            console.error('Error asegurando tabla contratos_finiquitos:', err.message);
        }
        callback(err || null);
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

const syncServiciosContrato = (idContrato, serviciosContrato, callback) => {
    const serviciosIds = [...new Set((Array.isArray(serviciosContrato) ? serviciosContrato : [])
        .map((item) => Number(item))
        .filter((id) => Number.isInteger(id) && id > 0))];

    resolverColumnaCostoServicios((colErr, columnaCosto) => {
        if (colErr) {
            return callback(colErr);
        }

        if (!serviciosIds.length) {
            db.query('DELETE FROM contratos_servicios WHERE id_contrato = ?', [idContrato], (deleteErr) => {
                if (deleteErr) {
                    return callback(deleteErr);
                }
                return callback(null);
            });
            return;
        }

        const placeholders = serviciosIds.map(() => '?').join(',');
        const sqlServicios = `
            SELECT id_servicio, ${columnaCosto} AS costo_servicio
            FROM servicios
            WHERE id_servicio IN (${placeholders})
              AND estado = 'activo'
        `;

        db.query(sqlServicios, serviciosIds, (servErr, servRows) => {
            if (servErr) {
                return callback(servErr);
            }

            const serviciosValidos = servRows || [];
            if (!serviciosValidos.length) {
                db.query('DELETE FROM contratos_servicios WHERE id_contrato = ?', [idContrato], (deleteErr) => {
                    if (deleteErr) {
                        return callback(deleteErr);
                    }
                    return callback(null);
                });
                return;
            }

            const idsValidos = serviciosValidos.map((row) => Number(row.id_servicio));
            const placeholdersValidos = idsValidos.map(() => '?').join(',');

            db.query(
                `DELETE FROM contratos_servicios WHERE id_contrato = ? AND id_servicio NOT IN (${placeholdersValidos})`,
                [idContrato, ...idsValidos],
                (deleteErr) => {
                    if (deleteErr) {
                        return callback(deleteErr);
                    }

                    const values = serviciosValidos.map((row) => [
                        idContrato,
                        Number(row.id_servicio),
                        Number(row.costo_servicio || 0),
                        'activo'
                    ]);

                    db.query(
                        `
                            INSERT INTO contratos_servicios (id_contrato, id_servicio, monto_servicio, estado)
                            VALUES ?
                            ON DUPLICATE KEY UPDATE
                                monto_servicio = VALUES(monto_servicio),
                                estado = 'activo'
                        `,
                        [values],
                        (upsertErr) => {
                            if (upsertErr) {
                                return callback(upsertErr);
                            }
                            return callback(null);
                        }
                    );
                }
            );
        });
    });
};

const ensureTableExists = (tableName, callback) => {
    db.query(
        `
            SELECT COUNT(*) AS total
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
        `,
        [tableName],
        (tableErr, tableResult) => {
            if (tableErr) {
                console.error(`Error verificando existencia de ${tableName}:`, tableErr);
                return callback(false);
            }
            return callback((tableResult?.[0]?.total || 0) > 0);
        }
    );
};

const ensureFormatoContratoColumn = () => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'contratos_residentes'
          AND COLUMN_NAME = 'formato_contrato'
    `;

    db.query(checkColumnQuery, (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error verificando columna formato_contrato:', checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) return;

        ensureTableExists('contratos_residentes', (tableExists) => {
            if (!tableExists) {
                console.warn('La tabla contratos_residentes no existe en esta base de datos. Se omite migracion de formato_contrato.');
                return;
            }

            const alterQuery = `
                ALTER TABLE contratos_residentes
                ADD COLUMN formato_contrato VARCHAR(20) NULL DEFAULT 'FORMATO_01'
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error('Error agregando columna formato_contrato:', alterErr);
                    return;
                }
                console.log('Columna formato_contrato creada en contratos_residentes.');
            });
        });
    });
};

const ensureEmpresaMarcaColumn = () => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'contratos_residentes'
          AND COLUMN_NAME = 'id_empresa_marca'
    `;

    db.query(checkColumnQuery, (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error verificando columna id_empresa_marca:', checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) return;

        ensureTableExists('contratos_residentes', (tableExists) => {
            if (!tableExists) {
                console.warn('La tabla contratos_residentes no existe en esta base de datos. Se omite migracion de id_empresa_marca.');
                return;
            }

            const alterQuery = `
                ALTER TABLE contratos_residentes
                ADD COLUMN id_empresa_marca INT NULL AFTER id_residente
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error('Error agregando columna id_empresa_marca:', alterErr);
                    return;
                }
                console.log('Columna id_empresa_marca creada en contratos_residentes.');
            });
        });
    });
};

const ensureProyectoColumn = () => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'contratos_residentes'
          AND COLUMN_NAME = 'id_proyecto'
    `;

    db.query(checkColumnQuery, (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error verificando columna id_proyecto:', checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) return;

        ensureTableExists('contratos_residentes', (tableExists) => {
            if (!tableExists) {
                console.warn('La tabla contratos_residentes no existe en esta base de datos. Se omite migracion de id_proyecto.');
                return;
            }

            const alterQuery = `
                ALTER TABLE contratos_residentes
                ADD COLUMN id_proyecto INT NULL AFTER id_empresa_marca
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error('Error agregando columna id_proyecto:', alterErr);
                    return;
                }
                console.log('Columna id_proyecto creada en contratos_residentes.');
            });
        });
    });
};

const ensureInteresPorcentajeColumn = () => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'contratos_residentes'
          AND COLUMN_NAME = 'interes_porcentaje'
    `;

    db.query(checkColumnQuery, (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error verificando columna interes_porcentaje:', checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) return;

        ensureTableExists('contratos_residentes', (tableExists) => {
            if (!tableExists) {
                console.warn('La tabla contratos_residentes no existe en esta base de datos. Se omite migracion de interes_porcentaje.');
                return;
            }

            const alterQuery = `
                ALTER TABLE contratos_residentes
                ADD COLUMN interes_porcentaje DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER monto_cuota
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error('Error agregando columna interes_porcentaje:', alterErr);
                    return;
                }
                console.log('Columna interes_porcentaje creada en contratos_residentes.');
            });
        });
    });
};

const ensureFinancialColumn = (columnName, definition, afterColumn) => {
    const checkColumnQuery = `
        SELECT COUNT(*) AS total
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'contratos_residentes'
          AND COLUMN_NAME = ?
    `;

    db.query(checkColumnQuery, [columnName], (checkErr, checkResult) => {
        if (checkErr) {
            console.error(`Error verificando columna ${columnName}:`, checkErr);
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) return;

        ensureTableExists('contratos_residentes', (tableExists) => {
            if (!tableExists) {
                console.warn(`La tabla contratos_residentes no existe en esta base de datos. Se omite migracion de ${columnName}.`);
                return;
            }

            const afterClause = afterColumn ? ` AFTER ${afterColumn}` : '';
            const alterQuery = `
                ALTER TABLE contratos_residentes
                ADD COLUMN ${columnName} ${definition}${afterClause}
            `;

            db.query(alterQuery, (alterErr) => {
                if (alterErr) {
                    console.error(`Error agregando columna ${columnName}:`, alterErr);
                    return;
                }
                console.log(`Columna ${columnName} creada en contratos_residentes.`);
            });
        });
    });
};

const ensureFinancialContractColumns = () => {
    ensureFinancialColumn('enganche', 'DECIMAL(12,2) NULL DEFAULT 0');
    ensureFinancialColumn('mora', 'DECIMAL(12,2) NULL DEFAULT 0');
    ensureFinancialColumn('plazo_meses', 'INT NULL DEFAULT 0');
    ensureFinancialColumn('cuotas_pagadas', 'INT NULL DEFAULT 0');
    ensureFinancialColumn('mes_inicio_pagos', 'INT NULL DEFAULT 1');
    ensureFinancialColumn('anio_inicio_pagos', 'INT NULL DEFAULT 2026');
    ensureFinancialColumn('saldo_pendiente', 'DECIMAL(12,2) NULL DEFAULT 0');
};

const backfillSaldoPendienteContrato = () => {
    db.query(`
        UPDATE contratos_residentes c
        LEFT JOIN (
            SELECT p.id_contrato,
                   COALESCE(SUM(CASE WHEN pd.tipo_concepto IN ('cuota_terreno', 'enganche', 'abono_capital') THEN pd.subtotal ELSE 0 END), 0) AS total_pagado
            FROM pagos p
            LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
            GROUP BY p.id_contrato
        ) pagos ON pagos.id_contrato = c.id_contrato
        SET c.saldo_pendiente = GREATEST(COALESCE(c.monto_total, 0) - COALESCE(c.enganche, 0) - COALESCE(pagos.total_pagado, 0), 0)
        WHERE c.saldo_pendiente IS NULL OR c.saldo_pendiente <= 0
    `, (err) => {
        if (err) {
            console.error('Error aplicando backfill global de saldo_pendiente en contratos_residentes:', err.message);
            return;
        }
        console.log('Backfill global de saldo_pendiente aplicado a contratos_residentes.');
    });
};

const recalcularSaldoPendienteContrato = (idContrato, callback = () => {}) => {
    const idContratoSeguro = Number(idContrato || 0);
    if (!Number.isInteger(idContratoSeguro) || idContratoSeguro <= 0) {
        return callback(null);
    }

    db.query(`
        UPDATE contratos_residentes c
        LEFT JOIN (
            SELECT p.id_contrato,
                   COALESCE(SUM(CASE WHEN pd.tipo_concepto IN ('cuota_terreno', 'interes', 'abono_capital') THEN pd.subtotal ELSE 0 END), 0) AS total_pagado
            FROM pagos p
            LEFT JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
            GROUP BY p.id_contrato
        ) pagos ON pagos.id_contrato = c.id_contrato
        SET c.saldo_pendiente = GREATEST(COALESCE(c.monto_total, 0) - COALESCE(c.enganche, 0) - COALESCE(pagos.total_pagado, 0), 0)
        WHERE c.id_contrato = ?
    `, [idContratoSeguro], (err) => {
        if (err) {
            console.error('[contratos] error recalculando saldo_pendiente:', err.message);
            return callback(err);
        }

        db.query(`
            UPDATE contratos_residentes c
            LEFT JOIN (
                SELECT p.id_contrato,
                       COUNT(DISTINCT COALESCE(pd.numero_cuota_afectada, p.id_pago)) AS cuotas_reales
                FROM pagos p
                INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                WHERE pd.tipo_concepto = 'cuota_terreno'
                GROUP BY p.id_contrato
            ) pagos_resumen ON pagos_resumen.id_contrato = c.id_contrato
            SET c.cuotas_pagadas = GREATEST(COALESCE(pagos_resumen.cuotas_reales, 0), 0)
            WHERE c.id_contrato = ?
        `, [idContratoSeguro], (syncErr) => {
            if (syncErr) {
                console.error('[contratos] error sincronizando cuotas_pagadas al recalcular saldo:', syncErr.message);
                return callback(syncErr);
            }
            return callback(null);
        });
    });
};

const obtenerCuotasPagadasReales = (idContrato, fallback = 0, callback = () => {}) => {
    const idContratoSeguro = Number(idContrato || 0);
    const fallbackSeguro = Math.max(parseInt(fallback || 0, 10), 0);

    if (!Number.isInteger(idContratoSeguro) || idContratoSeguro <= 0) {
        return callback(null, fallbackSeguro);
    }

    const sql = `
        SELECT COUNT(DISTINCT COALESCE(pd.numero_cuota_afectada, p.id_pago)) AS cuotas_pagadas_reales
        FROM pagos p
        INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
        WHERE p.id_contrato = ?
          AND pd.tipo_concepto = 'cuota_terreno'
          AND (
              COALESCE(pd.numero_cuota_afectada, 0) > 0
              OR COALESCE(pd.numero_cuota_afectada, 0) = 0
          )
    `;

    db.query(sql, [idContratoSeguro], (err, rows) => {
        if (err) {
            return callback(err);
        }

        const reales = Math.max(parseInt(rows?.[0]?.cuotas_pagadas_reales || 0, 10), 0);
        return callback(null, reales > 0 ? reales : fallbackSeguro);
    });
};

const sincronizarCuotasPagadasContrato = (idContrato = null, callback = () => {}) => {
    const condicional = Number.isInteger(Number(idContrato)) && Number(idContrato) > 0
        ? ' WHERE c.id_contrato = ? '
        : '';
    const params = Number.isInteger(Number(idContrato)) && Number(idContrato) > 0
        ? [Number(idContrato)]
        : [];

    const sql = `
        UPDATE contratos_residentes c
        LEFT JOIN (
            SELECT p.id_contrato,
                   COUNT(DISTINCT COALESCE(pd.numero_cuota_afectada, p.id_pago)) AS cuotas_reales
            FROM pagos p
            INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
            WHERE pd.tipo_concepto = 'cuota_terreno'
            GROUP BY p.id_contrato
        ) pagos_resumen ON pagos_resumen.id_contrato = c.id_contrato
        SET c.cuotas_pagadas = GREATEST(COALESCE(pagos_resumen.cuotas_reales, 0), COALESCE(c.cuotas_pagadas, 0))
        ${condicional}
    `;

    db.query(sql, params, (err) => {
        if (err) {
            console.error('[contratos] error sincronizando cuotas_pagadas global:', err.message);
            return callback(err);
        }
        return callback(null);
    });
};

ensureEmpresaMarcaColumn();
ensureProyectoColumn();
ensureFormatoContratoColumn();
ensureInteresPorcentajeColumn();
ensureFinancialContractColumns();
backfillSaldoPendienteContrato();
sincronizarCuotasPagadasContrato(null, () => {
    console.log('Backfill global de cuotas_pagadas aplicado a contratos_residentes.');
});
ensureContratosServiciosTable();
ensureContratosDocumentosTable();
ensureContratosFiniquitosTable();

const asegurarCuotasPagadasPersistidas = ({ idContrato, codigoContrato, cuotasEsperadas }, callback) => {
    const idContratoSeguro = Number(idContrato || 0);
    const cuotasObjetivo = Math.max(parseInt(cuotasEsperadas || 0, 10), 0);

    if (!Number.isInteger(idContratoSeguro) || idContratoSeguro <= 0) {
        return callback(null, null);
    }

    const sqlSelect = 'SELECT id_contrato, codigo_contrato, cuotas_pagadas FROM contratos_residentes WHERE id_contrato = ? LIMIT 1';
    db.query(sqlSelect, [idContratoSeguro], (selectErr, selectRows) => {
        if (selectErr) {
            return callback(selectErr);
        }

        const filaActual = selectRows?.[0] || null;
        const cuotasActuales = Math.max(parseInt(filaActual?.cuotas_pagadas || 0, 10), 0);
        if (cuotasActuales === cuotasObjetivo) {
            return callback(null, filaActual);
        }

        console.warn('[contratos] cuotas_pagadas no persistio al primer intento, aplicando correccion puntual:', {
            idContrato: idContratoSeguro,
            codigoContrato: codigoContrato || filaActual?.codigo_contrato || '',
            cuotasObjetivo,
            cuotasActuales
        });

        db.query(
            'UPDATE contratos_residentes SET cuotas_pagadas = ? WHERE id_contrato = ?',
            [cuotasObjetivo, idContratoSeguro],
            (updateErr) => {
                if (updateErr) {
                    return callback(updateErr);
                }

                db.query(sqlSelect, [idContratoSeguro], (verifyErr, verifyRows) => {
                    if (verifyErr) {
                        return callback(verifyErr);
                    }
                    return callback(null, verifyRows?.[0] || null);
                });
            }
        );
    });
};

// === 1. LISTAR CONTRATOS (CON JOINS) ===
router.get("/", (req, res) => {
    ensureContratosFiniquitosTable((ensureErr) => {
        if (ensureErr) {
            return res.status(500).send('No se pudo preparar el almacenamiento de finiquitos.');
        }

        const query = `
           SELECT c.id_contrato, c.codigo_contrato, c.id_residente, c.id_tipo_contrato,
               c.fecha_firma AS fecha_inicio, c.fecha_firma, c.fecha_compra, c.fecha_fin,
                   c.monto_total, c.saldo_pendiente, c.enganche, c.cuotas_pactadas,
                   CASE
                       WHEN COALESCE((
                           SELECT COUNT(DISTINCT COALESCE(pd.numero_cuota_afectada, p.id_pago))
                           FROM pagos p
                           INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                           WHERE p.id_contrato = c.id_contrato
                             AND pd.tipo_concepto = 'cuota_terreno'
                       ), 0) > 0 THEN (
                           SELECT COUNT(DISTINCT COALESCE(pd.numero_cuota_afectada, p.id_pago))
                           FROM pagos p
                           INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                           WHERE p.id_contrato = c.id_contrato
                             AND pd.tipo_concepto = 'cuota_terreno'
                       )
                       ELSE c.cuotas_pagadas
                   END AS cuotas_pagadas,
                   COALESCE((
                       SELECT MAX(COALESCE(pd.numero_cuota_afectada, 0))
                       FROM pagos p
                       INNER JOIN pagos_detalle pd ON pd.id_pago = p.id_pago
                       WHERE p.id_contrato = c.id_contrato
                         AND pd.tipo_concepto = 'cuota_terreno'
                         AND COALESCE(pd.numero_cuota_afectada, 0) > 0
                   ), 0) AS ultima_cuota_pagada,
                   c.monto_cuota, c.interes_porcentaje, c.mora, c.plazo_meses,
                   c.mes_inicio_pagos, c.anio_inicio_pagos, c.dia_pago_limite,
                   c.estado, c.formato_contrato, c.documento_contrato,
                   c.id_empresa_marca, c.id_proyecto,
                   r.nombre AS nombre_residente,
                   COALESCE(r.numero_identificacion, r.dpi) AS numero_identificacion,
                   r.estado_civil, r.profesion, r.nacionalidad,
                   tc.nombre_tipo_contrato,
                   e.nombre_empresa AS nombre_empresa_marca,
                   p.nombre AS nombre_proyecto,
                   COALESCE(e.logo, er.logo) AS logo_empresa_pdf,
                   COALESCE(em.logo, e.logo, er.logo) AS logo_proyecto,
                   COALESCE(e.nombre_empresa, er.nombre_empresa) AS nombre_marca_pdf,
                   COALESCE(p.nombre, em.nombre_empresa, e.nombre_empresa, er.nombre_empresa) AS nombre_proyecto_pdf,
                   f.nombre_original AS nombre_finiquito,
                   f.fecha_actualizacion AS fecha_finiquito,
                   (
                      
                   SELECT GROUP_CONCAT(cs.id_servicio ORDER BY cs.id_servicio SEPARATOR ',')
                       FROM contratos_servicios cs
                       WHERE cs.id_contrato = c.id_contrato
                         AND cs.estado = 'activo'
                   ) AS servicios_contrato_ids,
                   (
                       SELECT GROUP_CONCAT(s.nombre_servicio ORDER BY s.nombre_servicio SEPARATOR '||')
                       FROM contratos_servicios cs
                       INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
                       WHERE cs.id_contrato = c.id_contrato
                         AND cs.estado = 'activo'
                   ) AS servicios_contrato_nombres
            FROM contratos_residentes c
            INNER JOIN residentes r ON c.id_residente = r.id_residente
            INNER JOIN tipos_contrato tc ON c.id_tipo_contrato = tc.id_tipo_contrato
            LEFT JOIN empresas e ON e.id_empresa = c.id_empresa_marca
            LEFT JOIN proyecto p ON p.id_proyecto = c.id_proyecto
                LEFT JOIN empresas em ON em.id_empresa = p.id_empresa
                LEFT JOIN empresas er ON er.id_empresa = r.id_empresa
            LEFT JOIN contratos_finiquitos f ON f.id_contrato = c.id_contrato
            ORDER BY c.id_contrato DESC
    `;

        db.query(query, (err, result) => {
            if (err) {
                console.error('Error al listar contratos:', err);
                return res.status(500).send('Error de servidor');
            }

            const contratosNormalizados = (result || []).map((contrato) => ({
                ...contrato,
                cuotas_pagadas: Math.max(Number(contrato?.cuotas_pagadas || 0), 0)
            }));

            return res.send(contratosNormalizados);
        });
    });
});

// === 2. CREAR CONTRATO ===
router.post("/crear", (req, res) => {
    const { 
        codigo_contrato, id_residente, id_empresa_marca, id_proyecto, id_tipo_contrato, formato_contrato, monto_total, saldo_pendiente,
        enganche, cuotas_pactadas, cuotas_pagadas, monto_cuota, interes_porcentaje, mora, plazo_meses, mes_inicio_pagos, anio_inicio_pagos,
        dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato,
        servicios_contrato
    } = req.body;

    console.log('[contratos][crear] payload cuotas_pagadas recibido:', {
        codigo_contrato,
        id_residente,
        cuotas_pagadas,
        bodyKeys: Object.keys(req.body || {})
    });

    // Validar que el código de contrato no esté duplicado
    db.query('SELECT * FROM contratos_residentes WHERE codigo_contrato = ?', [codigo_contrato], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error interno del servidor");
        }
        if (result.length > 0) {
            return res.status(400).send({ message: "El código de contrato ya se encuentra registrado" });
        }

        const plazoNormalizado = Number(plazo_meses || cuotas_pactadas || 0);
        const cuotasNormalizadas = Number.isFinite(plazoNormalizado) && plazoNormalizado > 0
            ? plazoNormalizado
            : Number(cuotas_pactadas || 0);
        const montoTotalNumerico = Number(monto_total || 0);
        const engancheNumerico = Number(enganche || 0);
        const interesPorcentajeNumerico = Number(interes_porcentaje || 0);
        const cuotasPagadasNormalizadas = Math.max(parseInt(cuotas_pagadas || 0, 10), 0);
        const capitalFinanciado = Math.max(montoTotalNumerico - engancheNumerico, 0);
        const montoCuotaNormalizado = (cuotasNormalizadas > 0 && capitalFinanciado > 0)
            ? calcularCuotaFijaContrato(capitalFinanciado, interesPorcentajeNumerico, cuotasNormalizadas)
            : Number(monto_cuota || 0);
        const totalConIntereses = (capitalFinanciado > 0 && cuotasNormalizadas > 0)
            ? Number((capitalFinanciado + (capitalFinanciado * (interesPorcentajeNumerico / 100) * (cuotasNormalizadas / 12))).toFixed(2))
            : 0;
        const saldoPendienteBase = (cuotasPagadasNormalizadas <= 0 && totalConIntereses > 0)
            ? totalConIntereses
            : (capitalFinanciado > 0
                ? Math.max(capitalFinanciado - (cuotasPagadasNormalizadas * Number(montoCuotaNormalizado || 0)), 0)
                : 0);
        const saldoPendienteNumerico = Number.isFinite(Number(saldo_pendiente)) && Number(saldo_pendiente) > 0
            ? Number(saldo_pendiente)
            : saldoPendienteBase;

        obtenerCuotasPagadasReales(0, cuotasPagadasNormalizadas, (_realErr, cuotasPagadasDefinitivas) => {
            const queryInsert = `
                INSERT INTO contratos_residentes 
                (codigo_contrato, id_residente, id_empresa_marca, id_proyecto, id_tipo_contrato, formato_contrato, monto_total, saldo_pendiente, enganche, cuotas_pactadas, cuotas_pagadas, monto_cuota, interes_porcentaje, mora, plazo_meses, mes_inicio_pagos, anio_inicio_pagos, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.query(
                queryInsert,
                [
                    codigo_contrato,
                    id_residente,
                    id_empresa_marca || null,
                    id_proyecto || null,
                    id_tipo_contrato,
                    formato_contrato || 'FORMATO_01',
                    montoTotalNumerico,
                    saldoPendienteNumerico,
                    engancheNumerico,
                    cuotasNormalizadas,
                    cuotasPagadasDefinitivas,
                    montoCuotaNormalizado,
                    interesPorcentajeNumerico,
                    Number(mora || 0),
                    cuotasNormalizadas,
                    normalizeMesInicioPagos(mes_inicio_pagos, 1),
                    normalizeAnioInicioPagos(anio_inicio_pagos, new Date().getFullYear()),
                    Math.max(0, Math.min(31, Number(dia_pago_limite ?? 5))),
                    fecha_firma,
                    fecha_compra || null,
                    fecha_fin || null,
                    estado,
                    documento_contrato || null
                ],
                (insertErr, insertResult) => {
                    if (insertErr) {
                        console.error(insertErr);
                        return res.status(500).send("Error al registrar el contrato");
                    } else {
                        const idContratoCreado = insertResult?.insertId;
                        console.log('[contratos][crear] insert ejecutado:', {
                            idContratoCreado,
                            cuotasPagadasDefinitivas
                        });
                        if (!idContratoCreado) {
                            return res.status(200).send("Contrato establecido con éxito");
                        }

                        db.query(
                            'SELECT id_contrato, codigo_contrato, cuotas_pagadas FROM contratos_residentes WHERE id_contrato = ? LIMIT 1',
                            [idContratoCreado],
                            (verifyErr, verifyRows) => {
                                if (verifyErr) {
                                    console.error('[contratos][crear] error verificando cuotas_pagadas guardadas:', verifyErr);
                                } else {
                                    console.log('[contratos][crear] fila guardada:', verifyRows?.[0] || null);
                                }
                            }
                        );

                        recalcularSaldoPendienteContrato(idContratoCreado, (recalcErr) => {
                            if (recalcErr) {
                                console.warn('[contratos][crear] no fue posible recalcular saldo pendiente:', recalcErr.message);
                            }
                        });

                        const finalizarRespuestaCrear = () => {
                            const serviciosEnPayload = Array.isArray(servicios_contrato);
                            if (!serviciosEnPayload) {
                                return res.status(200).send("Contrato establecido con éxito");
                            }

                            syncServiciosContrato(idContratoCreado, servicios_contrato, (asignErr) => {
                                if (asignErr) {
                                    console.error('Contrato creado pero sin asignacion de servicios:', asignErr.message);
                                    return res.status(200).send("Contrato establecido con éxito (servicios pendientes de asignación)");
                                }
                                return res.status(200).send("Contrato establecido con éxito");
                            });
                        };

                        asegurarCuotasPagadasPersistidas(
                            {
                                idContrato: idContratoCreado,
                                codigoContrato: codigo_contrato,
                                cuotasEsperadas: cuotasPagadasDefinitivas
                            },
                            (persistErr, filaPersistida) => {
                                if (persistErr) {
                                    console.error('[contratos][crear] error corrigiendo/verificando cuotas_pagadas:', persistErr);
                                } else {
                                    console.log('[contratos][crear] fila final persistida:', filaPersistida);
                                }
                                return finalizarRespuestaCrear();
                            }
                        );
                    }
                }
            );
        });
    });
});

// === 3. ACTUALIZAR CONTRATO ===
router.put("/actualizar", (req, res) => {
    const { 
        id_contrato, codigo_contrato, id_residente, id_empresa_marca, id_proyecto, id_tipo_contrato, formato_contrato, monto_total, saldo_pendiente,
        enganche, cuotas_pactadas, cuotas_pagadas, monto_cuota, interes_porcentaje, mora, plazo_meses, mes_inicio_pagos, anio_inicio_pagos,
        dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato,
        servicios_contrato
    } = req.body;

    console.log('[contratos][actualizar] payload cuotas_pagadas recibido:', {
        id_contrato,
        codigo_contrato,
        cuotas_pagadas,
        bodyKeys: Object.keys(req.body || {})
    });
    
    const plazoNormalizado = Number(plazo_meses || cuotas_pactadas || 0);
    const cuotasNormalizadas = Number.isFinite(plazoNormalizado) && plazoNormalizado > 0
        ? plazoNormalizado
        : Number(cuotas_pactadas || 0);
    const montoTotalNumerico = Number(monto_total || 0);
    const engancheNumerico = Number(enganche || 0);
    const interesPorcentajeNumerico = Number(interes_porcentaje || 0);
    const cuotasPagadasNormalizadas = Math.max(parseInt(cuotas_pagadas || 0, 10), 0);
    const capitalFinanciado = Math.max(montoTotalNumerico - engancheNumerico, 0);
    const montoCuotaNormalizado = (cuotasNormalizadas > 0 && capitalFinanciado > 0)
        ? calcularCuotaFijaContrato(capitalFinanciado, interesPorcentajeNumerico, cuotasNormalizadas)
        : Number(monto_cuota || 0);
    const totalConIntereses = (capitalFinanciado > 0 && cuotasNormalizadas > 0)
        ? Number((capitalFinanciado + (capitalFinanciado * (interesPorcentajeNumerico / 100) * (cuotasNormalizadas / 12))).toFixed(2))
        : 0;
    const saldoPendienteBase = (cuotasPagadasNormalizadas <= 0 && totalConIntereses > 0)
        ? totalConIntereses
        : (capitalFinanciado > 0
            ? Math.max(capitalFinanciado - (cuotasPagadasNormalizadas * Number(montoCuotaNormalizado || 0)), 0)
            : 0);
    const saldoPendienteNumerico = Number.isFinite(Number(saldo_pendiente)) && Number(saldo_pendiente) > 0
        ? Number(saldo_pendiente)
        : saldoPendienteBase;

    obtenerCuotasPagadasReales(id_contrato, cuotasPagadasNormalizadas, (realErr, cuotasPagadasDefinitivas) => {
        if (realErr) {
            console.error('[contratos][actualizar] error calculando cuotas reales:', realErr.message);
            return res.status(500).send('Error al validar cuotas pagadas del contrato');
        }

        const queryUpdate = `
            UPDATE contratos_residentes SET 
            codigo_contrato=?, id_residente=?, id_empresa_marca=COALESCE(?, id_empresa_marca), id_proyecto=COALESCE(?, id_proyecto), id_tipo_contrato=?, formato_contrato=?, monto_total=?, saldo_pendiente=?, 
            enganche=?, cuotas_pactadas=?, cuotas_pagadas=?, monto_cuota=?, interes_porcentaje=?, mora=?, plazo_meses=?, mes_inicio_pagos=?, anio_inicio_pagos=?,
            dia_pago_limite=?, fecha_firma=?, fecha_compra=?, fecha_fin=?, estado=?, documento_contrato=? 
            WHERE id_contrato=?
        `;
        db.query(
            queryUpdate,
            [
                codigo_contrato,
                id_residente,
                id_empresa_marca || null,
                id_proyecto || null,
                id_tipo_contrato,
                formato_contrato || 'FORMATO_01',
                montoTotalNumerico,
                saldoPendienteNumerico,
                engancheNumerico,
                cuotasNormalizadas,
                cuotasPagadasDefinitivas,
                montoCuotaNormalizado,
                interesPorcentajeNumerico,
                Number(mora || 0),
                cuotasNormalizadas,
                normalizeMesInicioPagos(mes_inicio_pagos, 1),
                normalizeAnioInicioPagos(anio_inicio_pagos, new Date().getFullYear()),
                Math.max(0, Math.min(31, Number(dia_pago_limite ?? 5))),
                fecha_firma,
                fecha_compra || null,
                fecha_fin || null,
                estado,
                documento_contrato || null,
                id_contrato
            ],
            (err, result) => {
                if (err) {
                    console.error(err);
                    res.status(500).send("Error al actualizar el contrato");
                } else {
                    console.log('[contratos][actualizar] update ejecutado:', {
                        id_contrato,
                        affectedRows: result?.affectedRows || 0,
                        cuotasPagadasDefinitivas
                    });

                    db.query(
                        'SELECT id_contrato, codigo_contrato, cuotas_pagadas FROM contratos_residentes WHERE id_contrato = ? LIMIT 1',
                        [id_contrato],
                        (verifyErr, verifyRows) => {
                            if (verifyErr) {
                                console.error('[contratos][actualizar] error verificando cuotas_pagadas guardadas:', verifyErr);
                            } else {
                                console.log('[contratos][actualizar] fila guardada:', verifyRows?.[0] || null);
                            }
                        }
                    );

                    recalcularSaldoPendienteContrato(id_contrato, (recalcErr) => {
                        if (recalcErr) {
                            console.warn('[contratos][actualizar] no fue posible recalcular saldo pendiente:', recalcErr.message);
                        }
                    });

                    const finalizarRespuestaActualizar = () => {
                        if (!Array.isArray(servicios_contrato)) {
                            return res.status(200).send("Contrato actualizado correctamente");
                        }

                        syncServiciosContrato(id_contrato, servicios_contrato, (syncErr) => {
                            if (syncErr) {
                                console.error('Contrato actualizado pero sin sincronizar servicios:', syncErr.message);
                                return res.status(200).send("Contrato actualizado (servicios pendientes de sincronizar)");
                            }
                            return res.status(200).send("Contrato actualizado correctamente");
                        });
                    };

                    sincronizarCuotasPagadasContrato(id_contrato, (syncErr) => {
                        if (syncErr) {
                            console.warn('[contratos][actualizar] no fue posible sincronizar cuotas_pagadas reales:', syncErr.message);
                        }

                        asegurarCuotasPagadasPersistidas(
                            {
                                idContrato: id_contrato,
                                codigoContrato: codigo_contrato,
                                cuotasEsperadas: cuotasPagadasDefinitivas
                            },
                            (persistErr, filaPersistida) => {
                                if (persistErr) {
                                    console.error('[contratos][actualizar] error corrigiendo/verificando cuotas_pagadas:', persistErr);
                                } else {
                                    console.log('[contratos][actualizar] fila final persistida:', filaPersistida);
                                }
                                return finalizarRespuestaActualizar();
                            }
                        );
                    });
                }
            }
        );
    });
});

// === 4. ELIMINAR CONTRATO ===
router.delete("/delete/:id_contrato", (req, res) => {
    const { id_contrato } = req.params; 
    db.query('DELETE FROM contratos_residentes WHERE id_contrato = ?', [id_contrato], (err, result) => {
        if (err) {
            if (err.errno === 1451) {
                return res.status(400).send({ message: "No se puede eliminar el contrato porque posee pagos asociados en caja." });
            }
            console.error(err);
            res.status(500).send("Error al eliminar el contrato");
        } else {
            res.status(200).send("Contrato eliminado correctamente"); 
        }
    });
});

router.post('/subir-word/:id_contrato', (req, res) => {
    const idContrato = Number(req.params.id_contrato || 0);
    if (!Number.isInteger(idContrato) || idContrato <= 0) {
        return res.status(400).send({ message: 'Contrato invalido.' });
    }

    uploadArchivoContrato.single('archivo')(req, res, (uploadErr) => {
        if (uploadErr) {
            return res.status(400).send({ message: uploadErr.message || 'No fue posible subir el archivo.' });
        }

        if (!req.file) {
            return res.status(400).send({ message: 'Debe adjuntar un archivo.' });
        }

        const replaceExisting = String(req.body?.replace_existing || '').trim() === '1';
                const nombreOriginal = sanitizeFilename(String(req.file.originalname || '').replace(/[|]/g, ' '));
        const nombreServidor = String(req.file.filename || '').trim();
        const valorDocumento = `db|${nombreOriginal || nombreServidor}`;

        db.query(
            'SELECT documento_contrato FROM contratos_residentes WHERE id_contrato = ? LIMIT 1',
            [idContrato],
            (lookupErr, lookupRows) => {
                if (lookupErr) {
                    try {
                        fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                    } catch {
                        // no-op
                    }
                    return res.status(500).send({ message: 'No se pudo validar el contrato para guardar el archivo.' });
                }

                const contratoActual = lookupRows?.[0];
                if (!contratoActual) {
                    try {
                        fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                    } catch {
                        // no-op
                    }
                    return res.status(404).send({ message: 'Contrato no encontrado.' });
                }

                const docAnterior = String(contratoActual.documento_contrato || '').trim();
                if (docAnterior && !replaceExisting) {
                    try {
                        fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                    } catch {
                        // no-op
                    }
                    return res.status(409).send({ message: 'Este contrato ya tiene un archivo. Desea reemplazar el archivo existente?' });
                }
                const [oldStoredNameRaw] = docAnterior.split('|');
                const oldStoredName = path.basename(String(oldStoredNameRaw || '').trim());

                const contenido = fs.readFileSync(path.join(contratosUploadDir, nombreServidor));
                const mimeType = normalizeMimeType(nombreOriginal || nombreServidor, String(req.file.mimetype || 'application/octet-stream'));

                db.query(
                    `
                        INSERT INTO contratos_documentos (id_contrato, nombre_original, mime_type, contenido)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            nombre_original = VALUES(nombre_original),
                            mime_type = VALUES(mime_type),
                            contenido = VALUES(contenido),
                            fecha_actualizacion = CURRENT_TIMESTAMP
                    `,
                    [idContrato, nombreOriginal || nombreServidor, mimeType, contenido],
                    (docErr) => {
                        if (docErr) {
                            try {
                                fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                            } catch {
                                // no-op
                            }
                            return res.status(500).send({ message: 'No se pudo guardar el archivo en base de datos.' });
                        }

                        db.query(
                            'UPDATE contratos_residentes SET documento_contrato = ? WHERE id_contrato = ?',
                            [valorDocumento, idContrato],
                            (err, result) => {
                                if (err) {
                                    try {
                                        fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                                    } catch {
                                        // no-op
                                    }
                                    return res.status(500).send({ message: 'No se pudo guardar el documento en el contrato.' });
                                }

                                if (!result?.affectedRows) {
                                    try {
                                        fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                                    } catch {
                                        // no-op
                                    }
                                    return res.status(404).send({ message: 'Contrato no encontrado.' });
                                }

                                if (oldStoredName && oldStoredName !== nombreServidor) {
                                    const oldFilePath = path.join(contratosUploadDir, oldStoredName);
                                    if (fs.existsSync(oldFilePath)) {
                                        try {
                                            fs.unlinkSync(oldFilePath);
                                        } catch {
                                            // no-op
                                        }
                                    }
                                }

                                try {
                                    fs.unlinkSync(path.join(contratosUploadDir, nombreServidor));
                                } catch {
                                    // no-op
                                }

                                return res.status(200).send({
                                    message: docAnterior ? 'Archivo reemplazado y guardado en base de datos.' : 'Archivo cargado y guardado en base de datos.',
                                    documento_contrato: valorDocumento
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

router.get('/descargar-word/:id_contrato', (req, res) => {
    const idContrato = Number(req.params.id_contrato || 0);
    if (!Number.isInteger(idContrato) || idContrato <= 0) {
        return res.status(400).send({ message: 'Contrato invalido.' });
    }

    db.query(
        `
            SELECT c.codigo_contrato, c.documento_contrato,
                   d.nombre_original, d.mime_type, d.contenido
            FROM contratos_residentes c
            LEFT JOIN contratos_documentos d ON d.id_contrato = c.id_contrato
            WHERE c.id_contrato = ?
            LIMIT 1
        `,
        [idContrato],
        (err, rows) => {
            if (err) {
                return res.status(500).send({ message: 'No se pudo consultar el documento del contrato.' });
            }

            const row = rows?.[0];
            if (!row) {
                return res.status(404).send({ message: 'Contrato no encontrado.' });
            }

            if (row.contenido) {
                const nombreOriginalDb = sanitizeFilename(String(row.nombre_original || '').trim());
                const safeCodigoDb = String(row.codigo_contrato || `CONTRATO-${idContrato}`).replace(/[^A-Za-z0-9_-]/g, '_');
                const mimeDb = normalizeMimeType(nombreOriginalDb, String(row.mime_type || 'application/octet-stream').trim());
                const downloadNameDb = ensureFileExtension(nombreOriginalDb, mimeDb, safeCodigoDb);
                const asciiName = downloadNameDb.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_');

                res.setHeader('Content-Type', mimeDb || 'application/octet-stream');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadNameDb)}`);
                return res.status(200).send(row.contenido);
            }

            const docValue = String(row.documento_contrato || '').trim();
            if (!docValue) {
                return res.status(404).send({ message: 'Este contrato no tiene archivo cargado.' });
            }

            const [storedNameRaw, originalNameRaw] = docValue.includes('|')
                ? docValue.split('|')
                : [docValue, docValue];
            const storedName = path.basename(String(storedNameRaw || '').trim());
            const originalName = sanitizeFilename(String(originalNameRaw || '').trim());

            let archivoServidor = storedName;
            let absPath = archivoServidor ? path.join(contratosUploadDir, archivoServidor) : '';

            if (!archivoServidor || !fs.existsSync(absPath)) {
                // Respaldo para registros legacy: localizar el ultimo archivo del contrato.
                const prefijo = `contrato_${idContrato}_`;
                const candidatos = fs.existsSync(contratosUploadDir)
                    ? fs.readdirSync(contratosUploadDir)
                        .filter((name) => String(name || '').startsWith(prefijo))
                        .map((name) => ({
                            name,
                            abs: path.join(contratosUploadDir, name),
                            mtime: fs.statSync(path.join(contratosUploadDir, name)).mtimeMs
                        }))
                        .sort((a, b) => b.mtime - a.mtime)
                    : [];

                if (candidatos.length > 0) {
                    archivoServidor = candidatos[0].name;
                    absPath = candidatos[0].abs;
                }
            }

            if (!archivoServidor || !fs.existsSync(absPath)) {
                return res.status(404).send({
                    message: 'El archivo no existe en el servidor. Vuelve a subirlo en el contrato para descargarlo.'
                });
            }

            const ext = path.extname(archivoServidor).toLowerCase() || '.bin';
            const safeCodigo = String(row.codigo_contrato || `CONTRATO-${idContrato}`).replace(/[^A-Za-z0-9_-]/g, '_');
            const mimeLegacy = normalizeMimeType(archivoServidor, '');
            const downloadName = ensureFileExtension(originalName || `${safeCodigo}${ext}`, mimeLegacy, safeCodigo);

            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.type(mimeLegacy || 'application/octet-stream');

            return res.download(absPath, downloadName);
        }
    );
});

// Alias para compatibilidad con clientes legacy.
router.get('/descargar-archivo/:id_contrato', (req, res) => {
    req.url = `/descargar-word/${req.params.id_contrato}`;
    return router.handle(req, res);
});

router.post('/subir-finiquito/:id_contrato', uploadFiniquito.single('archivo'), (req, res) => {
    const idContrato = Number(req.params.id_contrato || 0);
    if (!Number.isInteger(idContrato) || idContrato <= 0) {
        return res.status(400).send({ message: 'Contrato invalido.' });
    }
    if (!req.file?.buffer) {
        return res.status(400).send({ message: 'Debe adjuntar el finiquito.' });
    }

    const replaceExisting = String(req.body?.replace_existing || '').trim() === '1';
    const nombreOriginal = sanitizeFilename(String(req.file.originalname || 'finiquito.pdf').replace(/[|]/g, ' '));
    const mimeType = normalizeMimeType(nombreOriginal, req.file.mimetype);

    db.query('SELECT id_finiquito FROM contratos_finiquitos WHERE id_contrato = ? LIMIT 1', [idContrato], (lookupErr, rows) => {
        if (lookupErr) {
            return res.status(500).send({ message: 'No se pudo validar el finiquito existente.' });
        }
        if (rows?.length && !replaceExisting) {
            return res.status(409).send({ message: 'Este contrato ya tiene un finiquito. Confirma si deseas reemplazarlo.' });
        }

        db.query(
            `INSERT INTO contratos_finiquitos (id_contrato, nombre_original, mime_type, contenido)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE nombre_original = VALUES(nombre_original), mime_type = VALUES(mime_type),
                 contenido = VALUES(contenido), fecha_actualizacion = CURRENT_TIMESTAMP`,
            [idContrato, nombreOriginal, mimeType, req.file.buffer],
            (saveErr) => {
                if (saveErr) {
                    return res.status(500).send({ message: 'No se pudo guardar el finiquito en la base de datos.' });
                }
                return res.status(200).send({ message: rows?.length ? 'Finiquito reemplazado.' : 'Finiquito guardado.' });
            }
        );
    });
});

router.get('/descargar-finiquito/:id_contrato', (req, res) => {
    const idContrato = Number(req.params.id_contrato || 0);
    if (!Number.isInteger(idContrato) || idContrato <= 0) {
        return res.status(400).send({ message: 'Contrato invalido.' });
    }

    db.query(
        `SELECT c.codigo_contrato, f.nombre_original, f.mime_type, f.contenido
         FROM contratos_residentes c
         LEFT JOIN contratos_finiquitos f ON f.id_contrato = c.id_contrato
         WHERE c.id_contrato = ? LIMIT 1`,
        [idContrato],
        (err, rows) => {
            if (err) return res.status(500).send({ message: 'No se pudo consultar el finiquito.' });
            const row = rows?.[0];
            if (!row) return res.status(404).send({ message: 'Contrato no encontrado.' });
            if (!row.contenido) return res.status(404).send({ message: 'Este contrato no tiene finiquito cargado.' });

            const safeCodigo = String(row.codigo_contrato || `CONTRATO-${idContrato}`).replace(/[^A-Za-z0-9_-]/g, '_');
            const mimeType = normalizeMimeType(row.nombre_original, row.mime_type);
            const downloadName = ensureFileExtension(row.nombre_original, mimeType, `Finiquito_${safeCodigo}`);
            const asciiName = downloadName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_');
            res.setHeader('Content-Type', mimeType);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
            return res.status(200).send(row.contenido);
        }
    );
});

module.exports = router;
