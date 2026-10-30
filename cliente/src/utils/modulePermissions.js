const normalizeText = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

export const MODULOS_PERMISOS = [
  { id: 'menu_general', label: 'Menu General', aliases: ['menu principal'] },
  { id: 'residentes', label: 'Clientes', aliases: ['residentes'] },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'roles', label: 'Roles Sistema' },
  { id: 'contratos_residentes', label: 'Contratos Legales' },
  { id: 'tipos_contratos', label: 'Modalidades Contrato' },
  { id: 'servicios', label: 'Catálogo Servicios' },
  { id: 'servicio', label: 'Servicio', aliases: ['servicios basicos'] },
  { id: 'caja', label: 'Caja (General)' },
  { id: 'caja_ingresos', label: 'Caja Ingresos Manual' },
  { id: 'morosidad', label: 'Mora y Atrasos' },
  { id: 'convenio', label: 'Convenio de Pagos', aliases: ['convenio', 'convenio pagos'] },
  { id: 'anulacion_deuda', label: 'Anular Cobro', aliases: ['anulacion deuda', 'anulacion de deuda'] },
  { id: 'pagos_extraordinarios', label: 'Cobros Extra' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'pagos_detalle', label: 'Detalle Pagos', aliases: ['detalle pagos'] },
  { id: 'dashboard_financiero', label: 'Dashboard Financiero', aliases: ['dashboard', 'reportes financieros'] },
  { id: 'reporte_facturas', label: 'Reporte de Facturas' },
  { id: 'asignar_correlativo', label: 'Cuadre de Facturación', aliases: ['asignar correlativos', 'asignar correlativo', 'cuadre diario', 'cuadre semanal', 'cuadre quincenal', 'cuadre mensual', 'cuadre anual'] },
  { id: 'cuadre_fact', label: 'Cuadre de Facturación Nuevo', aliases: ['cuadre fact'] },
  { id: 'resoluciones_facturas', label: 'Resoluciones Facturas' },
  { id: 'bitacora', label: 'Bitácora' },
  { id: 'estado_cuenta', label: 'Detalle de Pagos' },
  { id: 'estado_cuenta_resumen', label: 'Estado de Cuenta' },
  { id: 'cuenta_estado_capital', label: 'Tabla de Amortización' },
  { id: 'empresas', label: 'Empresa' },
  { id: 'empresa_proyecto', label: 'Empresa-Proyecto', aliases: ['empresa proyecto', 'proyecto empresa'] },
  { id: 'proyectos', label: 'Proyectos', aliases: ['proyecto', 'catalogo de proyectos', 'catalogo proyectos'] }
];

const aliasModuloId = new Map(
  MODULOS_PERMISOS.flatMap(({ id, label, aliases = [] }) => (
    [id, label, ...aliases].map((valor) => [normalizeText(valor.replace(/^\//, '')), id])
  ))
);

const obtenerValoresPermiso = (permiso) => {
  if (typeof permiso === 'string' || typeof permiso === 'number') {
    return [String(permiso)];
  }
  if (!permiso || typeof permiso !== 'object') {
    return [];
  }
  return [permiso.id, permiso.nombre, permiso.label, permiso.modulo, permiso.path]
    .filter((valor) => valor !== null && typeof valor !== 'undefined')
    .map(String);
};

export const parsePermisos = (permisos) => {
  if (Array.isArray(permisos)) return permisos;
  if (typeof permisos !== 'string' || !permisos.trim()) return [];
  try {
    const parsed = JSON.parse(permisos);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const normalizarPermisos = (permisos) => [...new Set(
  parsePermisos(permisos)
    .flatMap(obtenerValoresPermiso)
    .map((valor) => aliasModuloId.get(normalizeText(valor.replace(/^\//, ''))))
    .filter(Boolean)
)];

export const etiquetaModuloPermiso = (permiso) => {
  const id = aliasModuloId.get(normalizeText(String(permiso || '').replace(/^\//, '')));
  return MODULOS_PERMISOS.find((modulo) => modulo.id === id)?.label || String(permiso || '');
};

export const modulosPermitidosParaUsuario = (modules, usuario = {}) => {
  const rol = normalizeText(usuario.nombre_rol);
  const esAdministrador = ['admin', 'administrador', 'superusuario'].some((fragmento) => rol.includes(fragmento));
  const permisosNoConfigurados = usuario.permisos_configurados === false
    || usuario.permisos_configurados === 0
    || usuario.permisos_configurados === '0'
    || typeof usuario.permisos_configurados === 'undefined';

  if (esAdministrador && permisosNoConfigurados) return modules;

  const permisos = new Set(normalizarPermisos(usuario.permisos));
  return modules.filter((modulo) => permisos.has(modulo.id));
};
