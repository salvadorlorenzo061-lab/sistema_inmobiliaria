-- Migracion: relacionar resoluciones_facturas con usuarios por id_usuario
-- Ejecutar en la base de datos correcta (ej. inmobiliaria)

START TRANSACTION;

-- 1) Agregar columna id_usuario si no existe
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'resoluciones_facturas'
    AND COLUMN_NAME = 'id_usuario'
);

SET @sql_add_col := IF(
  @col_exists = 0,
  'ALTER TABLE resoluciones_facturas ADD COLUMN id_usuario INT NULL AFTER id_empresa',
  'SELECT "columna id_usuario ya existe"'
);
PREPARE stmt_add_col FROM @sql_add_col;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

-- 2) Si hay filas viejas sin usuario, asignar un usuario por defecto (admin o el primer usuario activo)
UPDATE resoluciones_facturas rf
JOIN (
  SELECT id_usuario
  FROM usuarios
  WHERE LOWER(COALESCE(estado, 'activo')) = 'activo'
  ORDER BY id_usuario ASC
  LIMIT 1
) u ON 1 = 1
SET rf.id_usuario = u.id_usuario
WHERE rf.id_usuario IS NULL;

-- 3) Crear indice para mejorar busquedas y joins
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'resoluciones_facturas'
    AND INDEX_NAME = 'idx_resoluciones_id_usuario'
);

SET @sql_add_idx := IF(
  @idx_exists = 0,
  'ALTER TABLE resoluciones_facturas ADD INDEX idx_resoluciones_id_usuario (id_usuario)',
  'SELECT "indice idx_resoluciones_id_usuario ya existe"'
);
PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;

-- 4) Crear llave foranea solo si no existe
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'resoluciones_facturas'
    AND COLUMN_NAME = 'id_usuario'
    AND REFERENCED_TABLE_NAME = 'usuarios'
    AND CONSTRAINT_NAME = 'fk_resoluciones_usuario'
);

SET @sql_add_fk := IF(
  @fk_exists = 0,
  'ALTER TABLE resoluciones_facturas ADD CONSTRAINT fk_resoluciones_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT',
  'SELECT "fk_resoluciones_usuario ya existe"'
);
PREPARE stmt_add_fk FROM @sql_add_fk;
EXECUTE stmt_add_fk;
DEALLOCATE PREPARE stmt_add_fk;

COMMIT;

-- Verificacion final
SELECT rf.id_resolucion, rf.id_empresa, rf.id_usuario, u.nombre AS nombre_usuario, rf.numero_resolucion, rf.serie, rf.correlativo_actual
FROM resoluciones_facturas rf
LEFT JOIN usuarios u ON u.id_usuario = rf.id_usuario
ORDER BY rf.id_resolucion DESC;
