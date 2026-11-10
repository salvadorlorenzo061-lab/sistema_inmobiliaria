// Vacía únicamente residentes cuando no existen referencias con datos.
//
// Uso desde server, con DB_USER, DB_PASSWORD, DB_NAME y DB_PORT definidos:
//   node scripts/reset_residentes.js
//   $env:CONFIRMAR_BORRADO_RESIDENTES='SI'; node scripts/reset_residentes.js --ejecutar
//
// Haga un respaldo verificable y detenga temporalmente la aplicación antes de ejecutar.

const db = require('../Conexion');

const args = new Set(process.argv.slice(2));
const ejecutar = args.has('--ejecutar');

const consulta = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const contarFilas = async (tabla, columna = null) => {
    const nombreSeguro = tabla.replace(/`/g, '``');
    const filtro = columna ? ` WHERE \`${columna.replace(/`/g, '``')}\` IS NOT NULL` : '';
    const [{ total }] = await consulta(`SELECT COUNT(*) AS total FROM \`${nombreSeguro}\`${filtro}`);
    return Number(total);
};

const main = async () => {
    const [{ base }] = await consulta('SELECT DATABASE() AS base');
    if (!base) {
        throw new Error('No hay una base de datos seleccionada. Verifique DB_NAME.');
    }
    console.log(`Base de datos: ${base}`);

    const tablas = await consulta(
        `SELECT TABLE_NAME AS nombre
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'residentes'`
    );
    if (tablas.length === 0) {
        throw new Error('No existe la tabla residentes en la base seleccionada.');
    }

    const referenciasPorColumna = await consulta(
        `SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND COLUMN_NAME = 'id_residente'
           AND TABLE_NAME <> 'residentes'`
    );
    const referenciasPorLlave = await consulta(
        `SELECT TABLE_NAME AS tabla
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_NAME = 'residentes'`
    );

    const referencias = new Map();
    for (const { tabla, columna } of referenciasPorColumna) {
        referencias.set(tabla, referencias.has(tabla) ? referencias.get(tabla) : columna);
    }
    for (const { tabla } of referenciasPorLlave) {
        referencias.set(tabla, null);
    }

    const residentes = await contarFilas('residentes');
    let referenciasConDatos = 0;
    console.log(`\nresidentes`.padEnd(34) + residentes);
    for (const [tabla, columna] of referencias) {
        const total = await contarFilas(tabla, columna);
        console.log(`${tabla}${columna ? `.${columna}` : ''}`.padEnd(34) + total);
        referenciasConDatos += total;
    }

    if (referenciasConDatos > 0) {
        throw new Error('Hay datos que referencian residentes. No se borró ninguna fila.');
    }

    if (!ejecutar) {
        console.log('\nSIMULACIÓN: no se borró nada. Agregue --ejecutar y la confirmación requerida.');
        return;
    }
    if (process.env.CONFIRMAR_BORRADO_RESIDENTES !== 'SI') {
        throw new Error('Para borrar, defina CONFIRMAR_BORRADO_RESIDENTES=SI y repita el comando.');
    }

    await consulta('START TRANSACTION');
    try {
        await consulta('DELETE FROM `residentes`');
        await consulta('COMMIT');
    } catch (error) {
        await consulta('ROLLBACK');
        throw error;
    }
    await consulta('ALTER TABLE `residentes` AUTO_INCREMENT = 1');
    console.log('\nResidentes eliminados y el ID quedó preparado para iniciar en 1.');
};

main()
    .catch((error) => {
        console.error('Error:', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end((error) => {
        if (error) {
            console.error('Error al cerrar la conexión:', error.message);
            process.exitCode = 1;
        }
    }));
