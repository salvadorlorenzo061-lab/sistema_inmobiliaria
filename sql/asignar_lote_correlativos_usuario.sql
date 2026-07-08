-- Script: Asignar lote de correlativos a un usuario especifico sin repetir rangos
-- Uso: ejecutar en phpMyAdmin sobre la BD correcta

START TRANSACTION;

-- Parametros
SET @p_id_usuario := 1;           -- Usuario destino (ej. JAVIER)
SET @p_id_resolucion := 1;        -- Resolucion activa
SET @p_cantidad := 1000;          -- Cantidad de correlativos (1000 => 100..1099 si actual es 100)
SET @p_observaciones := 'Asignacion inicial por modulo';

-- Bloquear y leer resolucion
SELECT id_resolucion, id_empresa, serie, correlativo_actual, rango_inicial, rango_final, estado
INTO @r_id_resolucion, @r_id_empresa, @r_serie, @r_corr_actual, @r_rango_ini, @r_rango_fin, @r_estado
FROM resoluciones_facturas
WHERE id_resolucion = @p_id_resolucion
FOR UPDATE;

-- Validaciones basicas
SELECT CASE
  WHEN @r_id_resolucion IS NULL THEN 'ERROR: Resolucion no existe'
  WHEN @r_estado <> 'activo' THEN 'ERROR: Resolucion inactiva'
  WHEN @p_cantidad IS NULL OR @p_cantidad <= 0 THEN 'ERROR: Cantidad invalida'
  WHEN @r_corr_actual IS NULL OR @r_corr_actual < @r_rango_ini OR @r_corr_actual > @r_rango_fin THEN 'ERROR: Correlativo actual fuera de rango'
  ELSE 'OK'
END AS validacion_resolucion;

-- Verificar usuario
SELECT COUNT(*) INTO @u_exists
FROM usuarios
WHERE id_usuario = @p_id_usuario;

SELECT CASE WHEN @u_exists = 1 THEN 'OK' ELSE 'ERROR: Usuario no existe' END AS validacion_usuario;

-- Calcular rango a asignar
SET @a_inicio := @r_corr_actual;
SET @a_fin := @r_corr_actual + @p_cantidad - 1;

SELECT CASE
  WHEN @a_fin > @r_rango_fin THEN CONCAT('ERROR: No alcanza rango disponible. Maximo permitido: ', @r_serie, '-', LPAD(@r_rango_fin, 8, '0'))
  ELSE 'OK'
END AS validacion_rango;

-- Evitar traslape con cualquier asignacion existente de la misma resolucion
SELECT COUNT(*) INTO @overlap_count
FROM asignar_correlativos
WHERE id_resolucion = @p_id_resolucion
  AND (
    (@a_inicio BETWEEN correlativo_inicio AND correlativo_fin)
    OR (@a_fin BETWEEN correlativo_inicio AND correlativo_fin)
    OR (correlativo_inicio BETWEEN @a_inicio AND @a_fin)
    OR (correlativo_fin BETWEEN @a_inicio AND @a_fin)
  );

SELECT CASE WHEN @overlap_count = 0 THEN 'OK' ELSE 'ERROR: El rango se traslapa con otro usuario' END AS validacion_no_traslape;

-- Solo inserta si todas las validaciones pasan
INSERT INTO asignar_correlativos (
  id_usuario, id_resolucion, id_empresa, serie,
  correlativo_inicio, correlativo_fin, correlativo_actual,
  estado, observaciones
)
SELECT
  @p_id_usuario, @p_id_resolucion, @r_id_empresa, @r_serie,
  @a_inicio, @a_fin, @a_inicio,
  'activo', @p_observaciones
FROM DUAL
WHERE @r_id_resolucion IS NOT NULL
  AND @r_estado = 'activo'
  AND @u_exists = 1
  AND @p_cantidad > 0
  AND @a_fin <= @r_rango_fin
  AND @overlap_count = 0;

-- Mover correlativo actual de resolucion al siguiente disponible
UPDATE resoluciones_facturas
SET correlativo_actual = @a_fin + 1
WHERE id_resolucion = @p_id_resolucion
  AND @r_id_resolucion IS NOT NULL
  AND @r_estado = 'activo'
  AND @u_exists = 1
  AND @p_cantidad > 0
  AND @a_fin <= @r_rango_fin
  AND @overlap_count = 0;

COMMIT;

-- Verificacion final
SELECT
  ac.id_asignacion,
  ac.id_usuario,
  u.nombre AS nombre_usuario,
  ac.id_resolucion,
  ac.id_empresa,
  ac.serie,
  CONCAT(ac.serie, '-', LPAD(ac.correlativo_inicio, 8, '0')) AS inicio,
  CONCAT(ac.serie, '-', LPAD(ac.correlativo_fin, 8, '0')) AS fin,
  ac.estado
FROM asignar_correlativos ac
LEFT JOIN usuarios u ON u.id_usuario = ac.id_usuario
WHERE ac.id_resolucion = @p_id_resolucion
ORDER BY ac.id_asignacion DESC;
