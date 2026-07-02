const express = require("express");
const db = require('../Conexion'); 
const router = express.Router(); 
const cors = require('cors');
const { registrarAuditoria, obtenerIP } = require('../auditingMiddleware');

router.use(cors());
router.use(express.json());

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

const REGLAS_AUTOASIGNACION_SERVICIOS = [
    'agua',
    'agua potable',
    'drenaje',
    'mantenimiento'
];

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

const asignarServiciosBaseAContrato = (idContrato, callback) => {
    resolverColumnaCostoServicios((colErr, columnaCosto) => {
        if (colErr) {
            return callback(colErr);
        }

        const condicionesNombre = REGLAS_AUTOASIGNACION_SERVICIOS
            .map(() => 'LOWER(TRIM(s.nombre_servicio)) LIKE ?')
            .join(' OR ');
        const valoresNombre = REGLAS_AUTOASIGNACION_SERVICIOS.map((regla) => `%${regla}%`);

        const sql = `
            INSERT INTO contratos_servicios (id_contrato, id_servicio, monto_servicio, estado)
            SELECT ?, s.id_servicio, s.${columnaCosto}, 'activo'
            FROM servicios s
            LEFT JOIN contratos_servicios cs ON cs.id_contrato = ? AND cs.id_servicio = s.id_servicio
            WHERE s.estado = 'activo'
              AND cs.id_contrato_servicio IS NULL
              AND (${condicionesNombre})
        `;

        db.query(sql, [idContrato, idContrato, ...valoresNombre], (err) => {
            if (err) {
                return callback(err);
            }
            return callback(null);
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
        if (exists) {
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
};
        if (checkErr) {
            console.error('Error verificando columna id_empresa_marca:', checkErr);
ensureFormatoContratoColumn();
            return;
        }

        const exists = checkResult?.[0]?.total > 0;
        if (exists) {
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
};

ensureEmpresaMarcaColumn();
ensureContratosServiciosTable();

// === 1. LISTAR CONTRATOS (CON JOINS) ===
router.get("/", (req, res) => {
    const query = `
        SELECT c.id_contrato, c.codigo_contrato, c.id_residente, c.id_tipo_contrato, 
             c.id_empresa_marca,
               c.formato_contrato,
               c.monto_total, c.cuotas_pactadas, c.monto_cuota, c.dia_pago_limite, 
               c.fecha_firma, c.fecha_compra, c.fecha_fin, c.estado, c.documento_contrato,
               r.nombre AS nombre_residente,
               r.numero_identificacion,
             t.nombre_tipo_contrato,
             em.nombre_empresa AS nombre_empresa_marca,
             em.logo AS logo_empresa_marca
        FROM contratos_residentes c
        INNER JOIN residentes r ON c.id_residente = r.id_residente
        INNER JOIN tipos_contrato t ON c.id_tipo_contrato = t.id_tipo_contrato
         LEFT JOIN empresas em ON c.id_empresa_marca = em.id_empresa
        ORDER BY c.id_contrato DESC
    `;
    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Error al obtener los contratos de residentes");
        } else {
            res.send(result);
        }
    });
});

// === 2. CREAR CONTRATO ===
router.post("/crear", (req, res) => {
    const { 
        codigo_contrato, id_residente, id_empresa_marca, id_tipo_contrato, formato_contrato, monto_total, 
        cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato 
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
            (codigo_contrato, id_residente, id_empresa_marca, id_tipo_contrato, formato_contrato, monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
            queryInsert,
            [codigo_contrato, id_residente, id_empresa_marca || null, id_tipo_contrato, formato_contrato || 'FORMATO_01', monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra || null, fecha_fin || null, estado, documento_contrato || null],
            (insertErr, insertResult) => {
                if (insertErr) {
                    console.error(insertErr);
                    return res.status(500).send("Error al registrar el contrato");
                } else {
                    const idContratoCreado = insertResult?.insertId;
                    const contratoActivo = String(estado || '').toLowerCase() === 'activo';

                    if (!idContratoCreado || !contratoActivo) {
                        return res.status(200).send("Contrato establecido con éxito");
                    }

                    asignarServiciosBaseAContrato(idContratoCreado, (asignErr) => {
                        if (asignErr) {
                            console.error('Contrato creado pero sin asignacion de servicios base:', asignErr.message);
                            return res.status(200).send("Contrato establecido con éxito (servicios base pendientes de asignación)");
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
        id_contrato, codigo_contrato, id_residente, id_empresa_marca, id_tipo_contrato, formato_contrato, monto_total, 
        cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra, fecha_fin, estado, documento_contrato 
    } = req.body;
    
    const queryUpdate = `
        UPDATE contratos_residentes SET 
        codigo_contrato=?, id_residente=?, id_empresa_marca=?, id_tipo_contrato=?, formato_contrato=?, monto_total=?, 
        cuotas_pactadas=?, monto_cuota=?, dia_pago_limite=?, fecha_firma=?, fecha_compra=?, fecha_fin=?, estado=?, documento_contrato=? 
        WHERE id_contrato=?
    `;
    db.query(
        queryUpdate,
        [codigo_contrato, id_residente, id_empresa_marca || null, id_tipo_contrato, formato_contrato || 'FORMATO_01', monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra || null, fecha_fin || null, estado, documento_contrato || null, id_contrato],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send("Error al actualizar el contrato");
            } else {
                res.status(200).send("Contrato actualizado correctamente");
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

module.exports = router;