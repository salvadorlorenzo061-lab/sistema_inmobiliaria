-- Limpieza de duplicados en resoluciones_facturas
-- Criterio de duplicado: misma empresa + usuario + numero_resolucion + serie (normalizados)
-- Se conserva el registro con mayor id_resolucion (mas reciente) y se eliminan anteriores.
-- Ejecutar con respaldo previo.

START TRANSACTION;

DELETE rf_old
FROM resoluciones_facturas rf_old
INNER JOIN resoluciones_facturas rf_keep
    ON rf_old.id_empresa = rf_keep.id_empresa
   AND COALESCE(rf_old.id_usuario, 0) = COALESCE(rf_keep.id_usuario, 0)
   AND UPPER(TRIM(COALESCE(rf_old.numero_resolucion, ''))) = UPPER(TRIM(COALESCE(rf_keep.numero_resolucion, '')))
   AND UPPER(TRIM(COALESCE(rf_old.serie, ''))) = UPPER(TRIM(COALESCE(rf_keep.serie, '')))
   AND rf_old.id_resolucion < rf_keep.id_resolucion;

COMMIT;

-- Verificacion post-limpieza:
-- SELECT id_empresa, id_usuario, UPPER(TRIM(numero_resolucion)) AS numero_resolucion_norm, UPPER(TRIM(serie)) AS serie_norm, COUNT(*) AS total
-- FROM resoluciones_facturas
-- GROUP BY id_empresa, id_usuario, UPPER(TRIM(numero_resolucion)), UPPER(TRIM(serie))
-- HAVING COUNT(*) > 1;
