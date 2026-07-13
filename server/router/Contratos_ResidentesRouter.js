const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

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

ensureEmpresaMarcaColumn();
ensureProyectoColumn();
ensureFormatoContratoColumn();
ensureContratosServiciosTable();
ensureContratosDocumentosTable();

// === 1. LISTAR CONTRATOS (CON JOINS) ===
router.get("/", (req, res) => {
    const query = `
           SELECT c.id_contrato, c.codigo_contrato, c.id_residente, c.id_tipo_contrato,
               c.fecha_firma AS fecha_inicio, c.fecha_firma, c.fecha_compra, c.fecha_fin,
                   c.monto_total, c.cuotas_pactadas, c.monto_cuota, c.dia_pago_limite,
                   c.estado, c.formato_contrato, c.documento_contrato,
                   c.id_empresa_marca, c.id_proyecto,
                   r.nombre AS nombre_residente,
                   tc.nombre_tipo_contrato,
                   e.nombre_empresa AS nombre_empresa_marca,
                   p.nombre AS nombre_proyecto,
                   COALESCE(e.logo, er.logo) AS logo_empresa_pdf,
                   COALESCE(em.logo, e.logo, er.logo) AS logo_proyecto,
                   COALESCE(e.nombre_empresa, er.nombre_empresa) AS nombre_marca_pdf,
                   COALESCE(p.nombre, em.nombre_empresa, e.nombre_empresa, er.nombre_empresa) AS nombre_proyecto_pdf,
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
            ORDER BY c.id_contrato DESC
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error('Error al listar contratos:', err);
            return res.status(500).send('Error de servidor');
        }
        res.send(result);
    });
});

// === 2. CREAR CONTRATO ===
router.post("/crear", (req, res) => {
    const { 
        codigo_contrato, id_residente, id_empresa_marca, id_proyecto, id_tipo_contrato, formato_contrato, monto_total, 
        cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato,
        servicios_contrato
    } = req.body;

    // Validar que el código de contrato no esté duplicado
    db.query('SELECT * FROM contratos_residentes WHERE codigo_contrato = ?', [codigo_contrato], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error interno del servidor");
        }
        if (result.length > 0) {
            return res.status(400).send({ message: "El código de contrato ya se encuentra registrado" });
        }

        const queryInsert = `
            INSERT INTO contratos_residentes 
            (codigo_contrato, id_residente, id_empresa_marca, id_proyecto, id_tipo_contrato, formato_contrato, monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
            queryInsert,
            [codigo_contrato, id_residente, id_empresa_marca || null, id_proyecto || null, id_tipo_contrato, formato_contrato || 'FORMATO_01', monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra || null, fecha_fin || null, estado, documento_contrato || null],
            (insertErr, insertResult) => {
                if (insertErr) {
                    console.error(insertErr);
                    return res.status(500).send("Error al registrar el contrato");
                } else {
                    const idContratoCreado = insertResult?.insertId;
                    if (!idContratoCreado) {
                        return res.status(200).send("Contrato establecido con éxito");
                    }

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
                }
            }
        );
    });
});

// === 3. ACTUALIZAR CONTRATO ===
router.put("/actualizar", (req, res) => {
    const { 
        id_contrato, codigo_contrato, id_residente, id_empresa_marca, id_proyecto, id_tipo_contrato, formato_contrato, monto_total, 
        cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato,
        servicios_contrato
    } = req.body;
    
    const queryUpdate = `
        UPDATE contratos_residentes SET 
        codigo_contrato=?, id_residente=?, id_empresa_marca=?, id_proyecto=?, id_tipo_contrato=?, formato_contrato=?, monto_total=?, 
        cuotas_pactadas=?, monto_cuota=?, dia_pago_limite=?, fecha_firma=?, fecha_compra=?, fecha_fin=?, estado=?, documento_contrato=? 
        WHERE id_contrato=?
    `;
    db.query(
        queryUpdate,
        [codigo_contrato, id_residente, id_empresa_marca || null, id_proyecto || null, id_tipo_contrato, formato_contrato || 'FORMATO_01', monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra || null, fecha_fin || null, estado, documento_contrato || null, id_contrato],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error al actualizar el contrato");
            } else {
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
            }
        }
    );
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
        const nombreOriginal = String(req.file.originalname || '').replace(/[\r\n|]/g, ' ').trim();
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
                const mimeType = String(req.file.mimetype || 'application/octet-stream').trim();

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
                const nombreOriginalDb = String(row.nombre_original || '').trim();
                const safeCodigoDb = String(row.codigo_contrato || `CONTRATO-${idContrato}`).replace(/[^A-Za-z0-9_-]/g, '_');
                const downloadNameDb = nombreOriginalDb || `${safeCodigoDb}.bin`;
                const mimeDb = String(row.mime_type || 'application/octet-stream').trim();

                res.setHeader('Content-Type', mimeDb || 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadNameDb)}`);
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
            const originalName = String(originalNameRaw || '').trim();

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
            const downloadName = originalName || `${safeCodigo}${ext}`;

            return res.download(absPath, downloadName);
        }
    );
});

// Alias para compatibilidad con clientes legacy.
router.get('/descargar-archivo/:id_contrato', (req, res) => {
    req.url = `/descargar-word/${req.params.id_contrato}`;
    return router.handle(req, res);
});

module.exports = router;