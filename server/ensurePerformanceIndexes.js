const db = require('./Conexion');

const performanceIndexes = [
    {
        table: 'pagos',
        name: 'idx_pagos_contrato_pago',
        columns: 'id_contrato, id_pago'
    },
    {
        table: 'pagos',
        name: 'idx_pagos_contrato_fecha',
        columns: 'id_contrato, fecha_pago'
    },
    {
        table: 'pagos_detalle',
        name: 'idx_pagos_detalle_pago_tipo',
        columns: 'id_pago, tipo_concepto'
    },
    {
        table: 'pagos_detalle',
        name: 'idx_pagos_detalle_pago_mes_servicio',
        columns: 'id_pago, mes_pagado, id_concepto_servicio'
    },
    {
        table: 'pagos_detalle',
        name: 'idx_pagos_detalle_pago_cuota',
        columns: 'id_pago, numero_cuota_afectada'
    },
    {
        table: 'facturas_historial',
        name: 'idx_fh_contrato_estado_pago',
        columns: 'id_contrato, estado_factura, id_pago'
    },
    {
        table: 'facturas_historial',
        name: 'idx_fh_contrato_estado_cuota',
        columns: 'id_contrato, estado_factura, numero_cuota_afectada'
    },
    {
        table: 'facturas_historial',
        name: 'idx_fh_contrato_estado_mes',
        columns: 'id_contrato, estado_factura, mes_pagado'
    },
    {
        table: 'facturas_historial',
        name: 'idx_fh_contrato_estado_fecha',
        columns: 'id_contrato, estado_factura, fecha_evento'
    },
    {
        table: 'contratos_servicios',
        name: 'idx_contratos_servicios_contrato_estado',
        columns: 'id_contrato, estado, id_servicio'
    },
    {
        table: 'convenio_pagos',
        name: 'idx_convenio_contrato_estado_id',
        columns: 'id_contrato, estado, id_convenio'
    },
    {
        table: 'contratos_residentes',
        name: 'idx_contratos_estado_residente',
        columns: 'estado, id_residente'
    },
    {
        table: 'contratos_residentes',
        name: 'idx_contratos_codigo',
        columns: 'codigo_contrato'
    },
    {
        table: 'residentes',
        name: 'idx_residentes_numero_identificacion',
        columns: 'numero_identificacion'
    },
    {
        table: 'residentes',
        name: 'idx_residentes_dpi',
        columns: 'dpi'
    },
    {
        table: 'asignar_correlativos',
        name: 'idx_ac_usuario_estado_resolucion',
        columns: 'id_usuario, estado, id_resolucion'
    },
    {
        table: 'resoluciones_facturas',
        name: 'idx_rf_usuario_estado_empresa',
        columns: 'id_usuario, estado, id_empresa'
    },
    {
        table: 'resoluciones_facturas',
        name: 'idx_rf_usuario_numero_serie',
        columns: 'id_usuario, numero_resolucion, serie'
    }
];

const ensureIndex = ({ table, name, columns }) => {
    db.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [name], (checkErr, rows) => {
        if (checkErr) {
            const code = String(checkErr?.code || '').toUpperCase();
            if (code !== 'ER_NO_SUCH_TABLE') {
                console.error(`Error verificando indice ${name} en ${table}:`, checkErr.message);
            }
            return;
        }

        if (Array.isArray(rows) && rows.length > 0) {
            return;
        }

        db.query(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`, (createErr) => {
            if (createErr) {
                const code = String(createErr?.code || '').toUpperCase();
                if (code !== 'ER_DUP_KEYNAME' && code !== 'ER_NO_SUCH_TABLE') {
                    console.error(`Error creando indice ${name} en ${table}:`, createErr.message);
                }
            }
        });
    });
};

const ensurePerformanceIndexes = () => {
    performanceIndexes.forEach(ensureIndex);
    setTimeout(() => {
        performanceIndexes.forEach(ensureIndex);
    }, 15000);
};

module.exports = ensurePerformanceIndexes;
