-- ============================================================================
-- SCRIPT: Vaciar base de datos (reset operativo)
-- ----------------------------------------------------------------------------
-- VACIA todas las tablas TRANSACCIONALES y deja intactas:
--   ✅ roles              (roles de sistema)
--   ✅ usuarios           (usuarios)
--   ✅ proyecto           (proyectos)
--   ✅ empresas           (empresas / marcas)
--
-- También se PRESERVAN por defecto los catálogos/configuración:
--   ✅ servicios, tipos_contrato, proyecto_servicios
--   ✅ resoluciones_facturas, asignar_correlativos  (numeración de facturas)
--   (al final hay bloques OPCIONALES comentados por si quieres vaciarlos
--    o reiniciar los correlativos)
--
-- ⚠️  ADVERTENCIAS:
--   1. HAZ UN BACKUP ANTES DE EJECUTAR (mysqldump o export desde Aiven).
--   2. Ejecuta conectado a la base correcta:
--        mysql -h <host> -P <puerto> -u <user> -p <nombre_bd> < vaciar_base_datos.sql
--      o pega el contenido en la consola SQL de Aiven / phpMyAdmin.
--   3. Si alguna tabla no existe en tu ambiente, comenta esa línea
--      (o ejecuta mysql con --force para que continúe con el resto).
-- ============================================================================

-- Safe Update Mode de MySQL Workbench bloquea DELETE sin WHERE (Error 1175).
-- Se desactiva solo para esta sesión. Es una protección del CLIENTE
-- (Workbench), no de la base de datos.
SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1) FACTURACIÓN E HISTORIALES
-- ============================================================================
DELETE FROM facturas_historial;
ALTER TABLE facturas_historial AUTO_INCREMENT = 1;

DELETE FROM estado_cuenta_historial;
ALTER TABLE estado_cuenta_historial AUTO_INCREMENT = 1;

DELETE FROM cuadre_fact_historial;
ALTER TABLE cuadre_fact_historial AUTO_INCREMENT = 1;

DELETE FROM cuadre_facturacion_historial;
ALTER TABLE cuadre_facturacion_historial AUTO_INCREMENT = 1;

-- ============================================================================
-- 2) PAGOS Y CAJA
-- ============================================================================
DELETE FROM pagos_detalle;
ALTER TABLE pagos_detalle AUTO_INCREMENT = 1;

DELETE FROM pagos;
ALTER TABLE pagos AUTO_INCREMENT = 1;

DELETE FROM pagos_extraordinarios;
ALTER TABLE pagos_extraordinarios AUTO_INCREMENT = 1;

DELETE FROM caja_ingresos;
ALTER TABLE caja_ingresos AUTO_INCREMENT = 1;

-- ============================================================================
-- 3) MOROSIDAD, ANULACIONES Y CONVENIOS
-- ============================================================================
DELETE FROM morosidad_exoneraciones;
ALTER TABLE morosidad_exoneraciones AUTO_INCREMENT = 1;

DELETE FROM morosidad;
ALTER TABLE morosidad AUTO_INCREMENT = 1;

DELETE FROM anulacion_deuda;
ALTER TABLE anulacion_deuda AUTO_INCREMENT = 1;

DELETE FROM convenio_pagos;
ALTER TABLE convenio_pagos AUTO_INCREMENT = 1;

-- ============================================================================
-- 4) CONTRATOS Y VENTAS
-- ============================================================================
DELETE FROM contratos_documentos;
ALTER TABLE contratos_documentos AUTO_INCREMENT = 1;

DELETE FROM contratos_finiquitos;
ALTER TABLE contratos_finiquitos AUTO_INCREMENT = 1;

DELETE FROM contratos_servicios;
ALTER TABLE contratos_servicios AUTO_INCREMENT = 1;

DELETE FROM ventas_propiedad;
ALTER TABLE ventas_propiedad AUTO_INCREMENT = 1;

DELETE FROM contratos_residentes;
ALTER TABLE contratos_residentes AUTO_INCREMENT = 1;

-- ============================================================================
-- 5) RESIDENTES Y BITÁCORA
-- ============================================================================
DELETE FROM residentes;
ALTER TABLE residentes AUTO_INCREMENT = 1;

DELETE FROM bitacora;
ALTER TABLE bitacora AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- ============================================================================
-- 6) OPCIONAL — Reiniciar numeración de facturas (SIN borrar las
--    resoluciones ni asignaciones; solo regresa el correlativo al inicio).
--    Descomenta si quieres que la facturación vuelva a empezar desde el
--    correlativo inicial de cada resolución/asignación.
-- ============================================================================
-- UPDATE resoluciones_facturas SET correlativo_actual = rango_inicial;
-- UPDATE asignar_correlativos
--    SET correlativo_actual = correlativo_inicio,
--        estado = 'activo',
--        fecha_cierre = NULL;

-- ============================================================================
-- 7) OPCIONAL — Vaciar también catálogos y configuración de facturación.
--    ⚠️ Solo descomenta si realmente quieres borrarlos.
-- ============================================================================
-- SET FOREIGN_KEY_CHECKS = 0;
-- DELETE FROM asignar_correlativos;   ALTER TABLE asignar_correlativos AUTO_INCREMENT = 1;
-- DELETE FROM resoluciones_facturas;  ALTER TABLE resoluciones_facturas AUTO_INCREMENT = 1;
-- DELETE FROM proyecto_servicios;     ALTER TABLE proyecto_servicios AUTO_INCREMENT = 1;
-- DELETE FROM servicios;              ALTER TABLE servicios AUTO_INCREMENT = 1;
-- DELETE FROM tipos_contrato;         ALTER TABLE tipos_contrato AUTO_INCREMENT = 1;
-- SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 8) VERIFICACIÓN — datos preservados (deben mostrar tus registros)
-- ============================================================================
SELECT 'roles'     AS tabla, COUNT(*) AS registros FROM roles
UNION ALL SELECT 'usuarios',  COUNT(*) FROM usuarios
UNION ALL SELECT 'proyecto',  COUNT(*) FROM proyecto
UNION ALL SELECT 'empresas',  COUNT(*) FROM empresas
UNION ALL SELECT 'servicios', COUNT(*) FROM servicios
UNION ALL SELECT 'tipos_contrato', COUNT(*) FROM tipos_contrato;

-- Tablas vaciadas (todas deben mostrar 0)
SELECT 'pagos'                AS tabla, COUNT(*) AS registros FROM pagos
UNION ALL SELECT 'pagos_detalle',        COUNT(*) FROM pagos_detalle
UNION ALL SELECT 'facturas_historial',   COUNT(*) FROM facturas_historial
UNION ALL SELECT 'contratos_residentes', COUNT(*) FROM contratos_residentes
UNION ALL SELECT 'residentes',           COUNT(*) FROM residentes
UNION ALL SELECT 'morosidad',            COUNT(*) FROM morosidad
UNION ALL SELECT 'convenio_pagos',       COUNT(*) FROM convenio_pagos
UNION ALL SELECT 'bitacora',             COUNT(*) FROM bitacora;
