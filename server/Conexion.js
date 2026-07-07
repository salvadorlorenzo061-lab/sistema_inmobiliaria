const mysql = require('mysql2');

const databaseName = String(process.env.DB_NAME || '').trim();
const selectedDatabase = databaseName && databaseName.toLowerCase() !== 'defaultdb'
  ? databaseName
  : 'inmobiliaria';

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'mysql-27a2d8f6-salvadorlorenzo061-2f31.d.aivencloud.com',
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD,
  database: selectedDatabase,
  port: process.env.DB_PORT || 28828,
  ssl: {
    rejectUnauthorized: false
  }
});

const wrapDbMethod = (methodName) => {
  if (typeof db[methodName] !== 'function') return;

  const original = db[methodName].bind(db);
  db[methodName] = (...args) => {
    try {
      return original(...args);
    } catch (error) {
      const maybeCallback = args.length ? args[args.length - 1] : null;
      if (typeof maybeCallback === 'function') {
        return maybeCallback(error);
      }
      throw error;
    }
  };
};

['query', 'beginTransaction', 'commit', 'rollback'].forEach(wrapDbMethod);

db.connect((err) => {
  if (err) {
    console.error('Error de conexión:', err);
    return;
  }
  console.log(`Conectado exitosamente a la base de datos MySQL en Aiven: ${selectedDatabase}`);
});

module.exports = db;