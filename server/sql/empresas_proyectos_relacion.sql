-- Script de apoyo: relacion empresa matriz -> proyectos y NIT
-- Base esperada: MySQL/MariaDB

-- 1) Asegurar columna de relacion en empresas
ALTER TABLE empresas
ADD COLUMN IF NOT EXISTS id_empresa_matriz INT NULL;

-- 2) Crear FK opcional (si tu motor/version no soporta IF NOT EXISTS en FK, ejecútala manualmente)
-- ALTER TABLE empresas
-- ADD CONSTRAINT fk_empresas_matriz
-- FOREIGN KEY (id_empresa_matriz) REFERENCES empresas(id_empresa)
-- ON UPDATE CASCADE ON DELETE SET NULL;

-- 3) Asegurar empresas matriz con su NIT
INSERT INTO empresas (nombre_empresa, nit, pais, moneda, estado)
SELECT 'INVERSION INMOBILIARIA GT', '116750529', 'GUATEMALA', 'GTQ', 'activo'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE UPPER(nombre_empresa) = 'INVERSION INMOBILIARIA GT');

INSERT INTO empresas (nombre_empresa, nit, pais, moneda, estado)
SELECT 'CORPORACION DE PROYECTOS Y VIVIENDAS S.A.', '116145056', 'GUATEMALA', 'GTQ', 'activo'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE UPPER(nombre_empresa) = 'CORPORACION DE PROYECTOS Y VIVIENDAS S.A.');

INSERT INTO empresas (nombre_empresa, nit, pais, moneda, estado)
SELECT 'NORSUR S.A.', '114978166', 'GUATEMALA', 'GTQ', 'activo'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE UPPER(nombre_empresa) = 'NORSUR S.A.');

INSERT INTO empresas (nombre_empresa, nit, pais, moneda, estado)
SELECT 'INVERSION REAL S.A.', '120598000', 'GUATEMALA', 'GTQ', 'activo'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE UPPER(nombre_empresa) = 'INVERSION REAL S.A.');

INSERT INTO empresas (nombre_empresa, nit, pais, moneda, estado)
SELECT 'CORPORACION DE DESARROLLOS JW, S.A.', '120902346', 'GUATEMALA', 'GTQ', 'activo'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE UPPER(nombre_empresa) = 'CORPORACION DE DESARROLLOS JW, S.A.');

-- 4) Actualizar NIT de matrices (por si ya existían)
UPDATE empresas SET nit = '116750529' WHERE UPPER(nombre_empresa) = 'INVERSION INMOBILIARIA GT';
UPDATE empresas SET nit = '116145056' WHERE UPPER(nombre_empresa) = 'CORPORACION DE PROYECTOS Y VIVIENDAS S.A.';
UPDATE empresas SET nit = '114978166' WHERE UPPER(nombre_empresa) = 'NORSUR S.A.';
UPDATE empresas SET nit = '120598000' WHERE UPPER(nombre_empresa) = 'INVERSION REAL S.A.';
UPDATE empresas SET nit = '120902346' WHERE UPPER(nombre_empresa) = 'CORPORACION DE DESARROLLOS JW, S.A.';

-- 5) Tabla temporal de mapeo empresa matriz -> proyectos
-- Nota: los proyectos se guardan en la misma tabla empresas y se enlazan con id_empresa_matriz
DROP TEMPORARY TABLE IF EXISTS tmp_mapeo_empresas;
CREATE TEMPORARY TABLE tmp_mapeo_empresas (
  matriz VARCHAR(255) NOT NULL,
  proyecto VARCHAR(255) NOT NULL
);

INSERT INTO tmp_mapeo_empresas (matriz, proyecto) VALUES
('INVERSION INMOBILIARIA GT', 'ALAMEDAS DE SAN JOSE FASE 1'),
('INVERSION INMOBILIARIA GT', 'ALAMEDAS DE SAN JOSE FASE 2'),
('INVERSION INMOBILIARIA GT', 'COLONIA EL CAMPO II'),
('INVERSION INMOBILIARIA GT', 'ENTRE BOSQUES LA VIRGEN'),
('INVERSION INMOBILIARIA GT', 'VALLES DEL ZAPOTE'),
('INVERSION INMOBILIARIA GT', 'ALAMEDAS II'),

('CORPORACION DE PROYECTOS Y VIVIENDAS S.A.', 'VILLAS DEL CEIBAL'),
('CORPORACION DE PROYECTOS Y VIVIENDAS S.A.', 'VILLAS DEL TAPACUN'),

('NORSUR S.A.', 'ALTOS DEL PORVENIR'),
('NORSUR S.A.', 'PRADERA 1'),
('NORSUR S.A.', 'PRADERA 2'),
('NORSUR S.A.', 'CANADAS DEL ZAPOTE'),
('NORSUR S.A.', 'PERONIA'),
('NORSUR S.A.', 'FISCAL'),
('NORSUR S.A.', 'SAN PEDRO'),
('NORSUR S.A.', 'LA ILUSIONES'),
('NORSUR S.A.', 'MIRADOR'),

('INVERSION REAL S.A.', 'VISTAS DE SAN JOSE'),

('CORPORACION DE DESARROLLOS JW, S.A.', 'LA TRINIDAD'),
('CORPORACION DE DESARROLLOS JW, S.A.', 'COLMENARES'),
('CORPORACION DE DESARROLLOS JW, S.A.', 'CAMPOSANTO PRIVADO LINDA VISTA'),
('CORPORACION DE DESARROLLOS JW, S.A.', 'COLONIA, LOS MANGOS'),
('CORPORACION DE DESARROLLOS JW, S.A.', 'VILLAS EL SAUCE');

-- 6) Crear proyectos faltantes
INSERT INTO empresas (nombre_empresa, pais, moneda, estado)
SELECT m.proyecto, 'GUATEMALA', 'GTQ', 'activo'
FROM tmp_mapeo_empresas m
WHERE NOT EXISTS (
    SELECT 1 FROM empresas e WHERE UPPER(e.nombre_empresa) = UPPER(m.proyecto)
);

-- 7) Relacionar proyecto -> matriz
UPDATE empresas proyecto
JOIN tmp_mapeo_empresas m ON UPPER(proyecto.nombre_empresa) = UPPER(m.proyecto)
JOIN empresas matriz ON UPPER(matriz.nombre_empresa) = UPPER(m.matriz)
SET proyecto.id_empresa_matriz = matriz.id_empresa;

-- 8) Verificación final
SELECT
  matriz.nombre_empresa AS empresa_matriz,
  matriz.nit AS nit_matriz,
  proyecto.nombre_empresa AS proyecto,
  proyecto.id_empresa AS id_proyecto
FROM empresas proyecto
JOIN empresas matriz ON proyecto.id_empresa_matriz = matriz.id_empresa
ORDER BY matriz.nombre_empresa, proyecto.nombre_empresa;
