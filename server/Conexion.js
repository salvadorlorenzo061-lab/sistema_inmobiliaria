const mysql = require('mysql2');

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