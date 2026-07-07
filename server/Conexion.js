const mysql = require('mysql2');

const databaseName = String(process.env.DB_NAME || '').trim();
const selectedDatabase = databaseName && databaseName.toLowerCase() !== 'defaultdb'
  ? databaseName
  : 'inmobiliaria';

const connectionConfig = {
  host: process.env.DB_HOST || 'mysql-27a2d8f6-salvadorlorenzo061-2f31.d.aivencloud.com',
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD,
  database: selectedDatabase,
  port: process.env.DB_PORT || 28828,
  ssl: {
    rejectUnauthorized: false
  }
};

let internalDb = null;

const connectInternal = () => {
  internalDb = mysql.createConnection(connectionConfig);

  internalDb.connect((err) => {
    if (err) {
      console.error('Error al conectar a MySQL. Reintentando en 2s:', err.message);
      setTimeout(connectInternal, 2000);
      return;
    }
    console.log(`Conectado exitosamente a la base de datos MySQL en Aiven: ${selectedDatabase}`);
  });

  internalDb.on('error', (err) => {
    console.error('Error de conexion MySQL:', err.message);
    if (err && err.fatal) {
      try {
        internalDb.destroy();
      } catch {
        // no-op
      }
      setTimeout(connectInternal, 250);
    }
  });
};

const executeWithFatalRetry = (methodName, args, alreadyRetried = false) => {
  const callArgs = [...args];
  const maybeCallback = callArgs.length ? callArgs[callArgs.length - 1] : null;
  const hasCallback = typeof maybeCallback === 'function';

  if (hasCallback) {
    const originalCallback = maybeCallback;
    callArgs[callArgs.length - 1] = (err, ...rest) => {
      if (err && err.fatal && !alreadyRetried) {
        setTimeout(() => executeWithFatalRetry(methodName, args, true), 150);
        return;
      }
      originalCallback(err, ...rest);
    };
  }

  try {
    return internalDb[methodName](...callArgs);
  } catch (error) {
    if (hasCallback) {
      maybeCallback(error);
      return;
    }
    throw error;
  }
};

connectInternal();

const db = {
  query: (...args) => executeWithFatalRetry('query', args),
  beginTransaction: (...args) => executeWithFatalRetry('beginTransaction', args),
  commit: (...args) => executeWithFatalRetry('commit', args),
  rollback: (...args) => executeWithFatalRetry('rollback', args)
};

module.exports = db;