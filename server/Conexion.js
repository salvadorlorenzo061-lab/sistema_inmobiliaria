const mysql = require('mysql');

const db = mysql.createConnection({
  host: process.env.mysql-27a2d8f6-salvadorlorenzo061-2f31.d.aivencloud.com,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false // Esto es obligatorio para que Render acepte el certificado de Aiven
  }
});

// Agregamos un manejo de errores más robusto
db.connect((err) => {
  if (err) {
    console.error('Error de conexión:', err);
    return;
  }
  console.log('Conectado exitosamente a la base de datos MySQL en Aiven.');
});

// Manejo de desconexiones inesperadas para evitar el fatal error
db.on('error', function(err) {
  console.error('Error en la base de datos:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    // Aquí podrías implementar una lógica de reconexión si fuera necesario
  } else {
    throw err;
  }
});

module.exports = db;