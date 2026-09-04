const db = require('./Conexion');

const ensureTable = ({ tableName, createSql, logLabel }) => {
    db.query('SHOW TABLES LIKE ?', [tableName], (showErr, rows) => {
        if (showErr) {
            console.error(`No se pudo verificar la tabla ${tableName}:`, showErr.message);
            return;
        }

        if (rows && rows.length > 0) {
            return;
        }

        db.query(createSql, (createErr) => {
            if (createErr) {
                console.error(`No se pudo crear la tabla ${tableName}:`, createErr.message);
                return;
            }

            console.log(`${logLabel || 'Esquema'}: tabla ${tableName} creada.`);
        });
    });
};

const ensureColumn = ({ tableName, columnName, columnSql }) => {
    db.query(
        `SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName],
        (checkErr, rows) => {
            if (checkErr) {
                console.error(`No se pudo verificar columna ${tableName}.${columnName}:`, checkErr.message);
                return;
            }

            const existe = Number(rows?.[0]?.existe || 0) > 0;
            if (existe) {
                return;
            }

            db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`, (alterErr) => {
                if (alterErr) {
                    console.error(`No se pudo crear columna ${tableName}.${columnName}:`, alterErr.message);
                    return;
                }

                console.log(`Esquema: columna ${tableName}.${columnName} creada.`);
            });
        }
    );
};

ensureTable({
    tableName: 'pagos_detalle',
    logLabel: 'Esquema',
    createSql: `
        CREATE TABLE IF NOT EXISTS pagos_detalle (
            id_pago_detalle INT NOT NULL AUTO_INCREMENT,
            id_pago INT NULL,
            tipo_concepto VARCHAR(80) NULL,
            id_concepto_servicio INT NULL,
            mes_pagado VARCHAR(80) NULL,
            numero_cuota_afectada INT NULL,
            subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
            PRIMARY KEY (id_pago_detalle),
            INDEX idx_pagos_detalle_pago (id_pago),
            INDEX idx_pagos_detalle_tipo (tipo_concepto),
            INDEX idx_pagos_detalle_mes (mes_pagado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `
});

ensureTable({
    tableName: 'facturas_historial',
    logLabel: 'Esquema',
    createSql: `
        CREATE TABLE IF NOT EXISTS facturas_historial (
            id_historial BIGINT NOT NULL AUTO_INCREMENT,
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
            PRIMARY KEY (id_historial),
            INDEX idx_historial_pago (id_pago),
            INDEX idx_historial_estado (estado_factura),
            INDEX idx_historial_correlativo (correlativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `
});

ensureColumn({
    tableName: 'anulacion_deuda',
    columnName: 'id_pago',
    columnSql: 'INT NULL'
});

ensureColumn({
    tableName: 'anulacion_deuda',
    columnName: 'correlativo',
    columnSql: 'VARCHAR(80) NULL'
});

ensureColumn({
    tableName: 'anulacion_deuda',
    columnName: 'estado_factura',
    columnSql: 'VARCHAR(20) NOT NULL DEFAULT "EMITIDA"'
});

ensureColumn({
    tableName: 'facturas_historial',
    columnName: 'rol_usuario_emisor',
    columnSql: 'VARCHAR(80) NULL'
});

ensureColumn({
    tableName: 'facturas_historial',
    columnName: 'estado_factura',
    columnSql: 'VARCHAR(20) NOT NULL DEFAULT "EMITIDA"'
});

module.exports = true;
