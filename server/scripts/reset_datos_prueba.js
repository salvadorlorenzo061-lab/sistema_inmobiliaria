// Limpia los datos de PRUEBA dejando el sistema en cero, conservando la configuracion.
//
// Uso (desde la carpeta server, con las variables DB_USER, DB_PASSWORD, DB_NAME y DB_PORT definidas):
//   node scripts/reset_datos_prueba.js                     -> SIMULACION: solo muestra cuantas filas se borrarian
//   node scripts/reset_datos_prueba.js --ejecutar          -> borra (exige CONFIRMAR_RESET=BORRAR en el entorno)
// Opciones:
//   --incluir-bitacora        tambien vacia la bitacora
//   --reiniciar-correlativos  devuelve cada asignacion de correlativos a su numero inicial
//
// NO toca: residentes, usuarios, roles, empresas, proyectos, servicios, tipos de contrato,
// resoluciones de factura ni asignaciones de correlativos (salvo --reiniciar-correlativos).
// HAGA UN RESPALDO (mysqldump) ANTES DE EJECUTAR: el borrado no se puede deshacer.

const db = require('../Conexion');

const args = new Set(process.argv.slice(2));
const ejecutar = args.has('--ejecutar');
const incluirBitacora = args.has('--incluir-bitacora');
const reiniciarCorrelativos = args.has('--reiniciar-correlativos');

const TABLAS = [
    'anulacion_deuda',
    'facturas_historial',
    'pagos_detalle',
    'pagos',
    'pagos_extraordinarios',
    'convenio_pagos',
    'morosidad_exoneraciones',
    'morosidad',
    'contratos_servicios',
    'contratos_documentos',
    'contratos_finiquitos',
    'ventas_propiedad',
    'contratos_residentes',
    'estado_cuenta_historial',
    'cuadre_fact_historial',
    'cuadre_facturacion_historial',
    'notificaciones_log'
];
if (incluirBitacora) TABLAS.push('bitacora');

const consulta = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const main = async () => {
    const [{ base }] = await consulta('SELECT DATABASE() AS base');
    console.log(`Base de datos: ${base}`);

    const existentes = (await consulta(
        'SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    )).map((fila) => fila.nombre);

    const objetivo = TABLAS.filter((tabla) => existentes.includes(tabla));
    const ausentes = TABLAS.filter((tabla) => !existentes.includes(tabla));

    console.log('\n' + 'Tabla'.padEnd(33) + 'Filas');
    for (const tabla of objetivo) {
        const [{ total }] = await consulta(`SELECT COUNT(*) AS total FROM \`${tabla}\``);
        console.log(tabla.padEnd(33) + total);
    }
    if (ausentes.length) console.log(`\n(No existen, se omiten: ${ausentes.join(', ')})`);

    if (!ejecutar) {
        console.log('\nSIMULACION: no se borro nada. Agregue --ejecutar para borrar.');
        return;
    }
    if (process.env.CONFIRMAR_RESET !== 'BORRAR') {
        console.log('\nPara borrar defina la variable de entorno CONFIRMAR_RESET=BORRAR y repita el comando.');
        return;
    }

    await consulta('SET FOREIGN_KEY_CHECKS = 0');
    try {
        for (const tabla of objetivo) {
            await consulta(`TRUNCATE TABLE \`${tabla}\``);
            console.log(`Vaciada: ${tabla}`);
        }
        if (reiniciarCorrelativos && existentes.includes('asignar_correlativos')) {
            const r = await consulta(
                `UPDATE asignar_correlativos SET correlativo_actual = correlativo_inicio, estado = 'activo', fecha_cierre = NULL`
            );
            console.log(`Correlativos reiniciados: ${r.affectedRows} asignacion(es)`);
        }
    } finally {
        await consulta('SET FOREIGN_KEY_CHECKS = 1');
    }
    console.log('\nListo. El sistema quedo en cero.');
};

main()
    .catch((error) => {
        console.error('Error:', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end(() => process.exit()));
