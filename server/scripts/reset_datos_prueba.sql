-- VACIAR DATOS DE PRUEBA (conserva la estructura y la configuracion)
-- Ejecutar con un respaldo previo: el borrado NO se puede deshacer.
-- No toca: residentes, usuarios, roles, empresas, proyectos, servicios, tipos de contrato ni bitacora.
-- Si alguna tabla no existe en su base, MySQL marcara error en esa linea: comente esa linea y continue.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE anulacion_deuda;
TRUNCATE TABLE facturas_historial;
TRUNCATE TABLE pagos_detalle;
TRUNCATE TABLE pagos;
TRUNCATE TABLE pagos_extraordinarios;
TRUNCATE TABLE convenio_pagos;
TRUNCATE TABLE morosidad_exoneraciones;
TRUNCATE TABLE morosidad;
TRUNCATE TABLE contratos_servicios;
TRUNCATE TABLE contratos_documentos;
TRUNCATE TABLE contratos_finiquitos;
TRUNCATE TABLE ventas_propiedad;
TRUNCATE TABLE contratos_residentes;
TRUNCATE TABLE estado_cuenta_historial;
TRUNCATE TABLE cuadre_fact_historial;
TRUNCATE TABLE cuadre_facturacion_historial;
TRUNCATE TABLE asignar_correlativos;
TRUNCATE TABLE resoluciones_facturas_proyectos;
TRUNCATE TABLE resoluciones_facturas;
TRUNCATE TABLE notificaciones_log;

-- Opcional: vaciar tambien la bitacora (quite los dos guiones para activarlo)
-- TRUNCATE TABLE bitacora;

SET FOREIGN_KEY_CHECKS = 1;

-- Verificacion: todos deben dar 0
SELECT 'contratos_residentes' AS tabla, COUNT(*) AS filas FROM contratos_residentes
UNION ALL SELECT 'pagos', COUNT(*) FROM pagos
UNION ALL SELECT 'facturas_historial', COUNT(*) FROM facturas_historial
UNION ALL SELECT 'morosidad', COUNT(*) FROM morosidad
UNION ALL SELECT 'convenio_pagos', COUNT(*) FROM convenio_pagos
UNION ALL SELECT 'resoluciones_facturas', COUNT(*) FROM resoluciones_facturas;
