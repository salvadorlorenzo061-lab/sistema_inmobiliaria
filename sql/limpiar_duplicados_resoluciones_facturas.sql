-- Limpieza de duplicados en resoluciones_facturas
-- Criterio de duplicado: mismo usuario + numero_resolucion + serie y empresa equivalente
-- (equivalente = mismo id_empresa o mismo nombre_empresa normalizado)
-- Se conserva el registro con mayor id_resolucion (mas reciente) y se eliminan anteriores.
-- Ejecutar con respaldo previo.

START TRANSACTION;

DELETE rf_old
FROM resoluciones_facturas rf_old
LEFT JOIN empresas e_old ON e_old.id_empresa = rf_old.id_empresa
INNER JOIN resoluciones_facturas rf_keep
     ON COALESCE(rf_old.id_usuario, 0) = COALESCE(rf_keep.id_usuario, 0)
   AND UPPER(TRIM(COALESCE(rf_old.numero_resolucion, ''))) = UPPER(TRIM(COALESCE(rf_keep.numero_resolucion, '')))
   AND UPPER(TRIM(COALESCE(rf_old.serie, ''))) = UPPER(TRIM(COALESCE(rf_keep.serie, '')))
     AND rf_old.id_resolucion < rf_keep.id_resolucion
LEFT JOIN empresas e_keep ON e_keep.id_empresa = rf_keep.id_empresa
WHERE (
     rf_old.id_empresa = rf_keep.id_empresa
     OR UPPER(TRIM(COALESCE(e_old.nombre_empresa, ''))) = UPPER(TRIM(COALESCE(e_keep.nombre_empresa, '')))
);

COMMIT;

-- Verificacion post-limpieza:
-- SELECT
--   COALESCE(rf.id_usuario, 0) AS id_usuario,
--   UPPER(TRIM(COALESCE(rf.numero_resolucion, ''))) AS numero_resolucion_norm,
--   UPPER(TRIM(COALESCE(rf.serie, ''))) AS serie_norm,
--   UPPER(TRIM(COALESCE(e.nombre_empresa, ''))) AS empresa_norm,
--   COUNT(*) AS total
-- FROM resoluciones_facturas rf
-- LEFT JOIN empresas e ON e.id_empresa = rf.id_empresa
-- GROUP BY COALESCE(rf.id_usuario, 0), UPPER(TRIM(COALESCE(rf.numero_resolucion, ''))), UPPER(TRIM(COALESCE(rf.serie, ''))), UPPER(TRIM(COALESCE(e.nombre_empresa, '')))
-- HAVING COUNT(*) > 1;
