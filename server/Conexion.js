const mysql = require('mysql2');
const { AsyncLocalStorage } = require('async_hooks');

const databaseName = String(process.env.DB_NAME || '').trim();
const selectedDatabase = databaseName && databaseName.toLowerCase() !== 'defaultdb'
  ? databaseName
  : 'inmobiliaria';

const db = mysql.createPool({
  host: "mysql-27a2d8f6-salvadorlorenzo061-2f31.d.aivencloud.com", // <-- Corregido con comillas
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: selectedDatabase,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false 
  }
});

const transactionContext = new AsyncLocalStorage();
const originalPoolQuery = db.query.bind(db);

db.query = (...args) => {
  try {
    const txConnection = transactionContext.getStore();
    if (txConnection && typeof txConnection.query === 'function') {
      return txConnection.query(...args);
    }
    return originalPoolQuery(...args);
  } catch (error) {
    const maybeCallback = args.length ? args[args.length - 1] : null;
    if (typeof maybeCallback === 'function') {
      return maybeCallback(error);
    }
    throw error;
  }
};

db.beginTransaction = (callback) => {
  db.getConnection((connErr, connection) => {
    if (connErr) {
      return callback(connErr);
    }

    connection.beginTransaction((txErr) => {
      if (txErr) {
        connection.release();
        return callback(txErr);
      }

      return transactionContext.run(connection, () => callback(null));
    });
  });
};

db.commit = (callback) => {
  const txConnection = transactionContext.getStore();
  if (!txConnection) {
    return callback(new Error('No hay transaccion activa para commit.'));
  }

  txConnection.commit((commitErr) => {
    txConnection.release();
    return callback(commitErr || null);
  });
};

db.rollback = (callback) => {
  const txConnection = transactionContext.getStore();
  if (!txConnection) {
    if (typeof callback === 'function') {
      callback();
    }
    return;
  }

  txConnection.rollback(() => {
    txConnection.release();
    if (typeof callback === 'function') {
      callback();
    }
  });
};

// Validar el pool al iniciar para detectar errores de configuración temprano.
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error de conexión:', err);
    return;
  }
  connection.release();
  console.log(`Conectado exitosamente a la base de datos MySQL en Aiven: ${selectedDatabase}`);
});

module.exports = db;