const mysql = require('mysql');

// Configuración híbrida: Usa las variables de la nube (process.env) o cae en localhost por defecto
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "inmobiliaria",
  port: process.env.DB_PORT || 3306
});

// Conectar a la base de datos
db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conectado exitosamente a la base de datos MySQL.');
});

// Exportar la conexión para usarla en otros archivos del servidor
module.exports = db;