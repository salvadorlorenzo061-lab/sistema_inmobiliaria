-- Limpieza de duplicados en resoluciones_facturas
-- Criterio de duplicado: mismo usuario + numero_resolucion + serie + mismo id_empresa
-- Se conserva el registro con mayor id_resolucion (mas reciente) y se eliminan anteriores.
-- Ejecutar con respaldo previo.

START TRANSACTION;

DELETE rf_old
FROM resoluciones_facturas rf_old
INNER JOIN resoluciones_facturas rf_keep
     ON COALESCE(rf_old.id_usuario, 0) = COALESCE(rf_keep.id_usuario, 0)
   AND UPPER(TRIM(COALESCE(rf_old.numero_resolucion, ''))) = UPPER(TRIM(COALESCE(rf_keep.numero_resolucion, '')))
   AND UPPER(TRIM(COALESCE(rf_old.serie, ''))) = UPPER(TRIM(COALESCE(rf_keep.serie, '')))
     AND rf_old.id_resolucion < rf_keep.id_resolucion
WHERE rf_old.id_empresa = rf_keep.id_empresa;

COMMIT;

-- Verificacion post-limpieza:
-- SELECT
--   COALESCE(rf.id_usuario, 0) AS id_usuario,
--   UPPER(TRIM(COALESCE(rf.numero_resolucion, ''))) AS numero_resolucion_norm,
--   UPPER(TRIM(COALESCE(rf.serie, ''))) AS serie_norm,
--   rf.id_empresa,
--   COUNT(*) AS total
-- FROM resoluciones_facturas rf
-- GROUP BY COALESCE(rf.id_usuario, 0), UPPER(TRIM(COALESCE(rf.numero_resolucion, ''))), UPPER(TRIM(COALESCE(rf.serie, ''))), rf.id_empresa
-- HAVING COUNT(*) > 1;
