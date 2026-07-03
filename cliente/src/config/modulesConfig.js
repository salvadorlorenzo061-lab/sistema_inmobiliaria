// Importar todos los componentes
import Residentes from '../componentes/Residentes';
import Usuarios from '../componentes/Usuarios';
import TiposContrato from '../componentes/Tipos_contratos';
import Caja from '../componentes/Caja';
import Bitacora from '../componentes/Bitacora';
import Empresas from '../componentes/Empresas';
import EmpresaProyecto from '../componentes/Empresa_proyecto';
import Proyecto from '../componentes/Proyecto';
import ResolucionesFacturasComponent from '../componentes/Resoluciones_facturas';
import ContratosResidentesComponent from '../componentes/Contratos_Residentes';
import AnulacionDeuda from '../componentes/AnulacionDeuda';
import Morosidad from '../componentes/Morosidad';
import Servicios from '../componentes/Servicios';
import Servicio from '../componentes/Servicio/Servicio';
import Roles from '../componentes/Roles';
import PagosExtraordinarios from '../componentes/PagosExtraordinarios';
import Pagos from '../componentes/Pagos';
import PagosDetalle from '../componentes/Pagos_detalle';
import EstadoCuenta from '../componentes/Estado_Cuenta';
import MenuGeneral from '../componentes/MenuGeneral';
import AsignarCorrelativo from '../componentes/Asignar_correlativo';

// Configuración de módulos - Aquí es donde agregas o quitas módulos
export const modulesConfig = [
  {
    id: 'menu_general',
    label: 'Menu General',
    icon: '🧭',
    path: '/menu_general',
    component: MenuGeneral,
    category: 'Sistema'
  },
  {
    id: 'residentes',
    label: 'Residentes',
    icon: '🏡',
    path: '/residentes',
    component: Residentes,
    category: 'Sistema'
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: '👨‍⚖️',
    path: '/usuarios',
    component: Usuarios,
    category: 'Sistema'
  },
  {
    id: 'roles',
    label: 'Roles Sistema',
    icon: '🔑',
    path: '/roles',
    component: Roles,
    category: 'Sistema'
  },
  {
    id: 'contratos_residentes',
    label: 'Contratos Legales',
    icon: '✍️',
    path: '/contratos_residentes',
    component: ContratosResidentesComponent,
    category: 'Sistema'
  },
  {
    id: 'tipos_contratos',
    label: 'Modalidades Contrato',
    icon: '🗺️',
    path: '/tipos_contratos',
    component: TiposContrato,
    category: 'Sistema'
  },
  {
    id: 'servicios',
    label: 'Catálogo Servicios',
    icon: '💧',
    path: '/servicios',
    component: Servicios,
    category: 'Sistema'
  },
  {
    id: 'servicio',
    label: 'Servicio',
    icon: '💧',
    path: '/servicio',
    component: Servicio,
    category: 'Sistema'
  },
  {
    id: 'caja',
    label: 'Caja (General)',
    icon: '🗄️',
    path: '/caja',
    component: Caja,
    category: 'Caja'
  },
  {
    id: 'caja_ingresos',
    label: 'Caja Ingresos Manual',
    icon: '💰',
    path: '/caja_ingresos',
    component: Caja,
    category: 'Caja'
  },
  {
    id: 'morosidad',
    label: 'Mora y Atrasos',
    icon: '🚨',
    path: '/morosidad',
    component: Morosidad,
    category: 'Caja'
  },
  {
    id: 'anulacion_deuda',
    label: 'Anular Cobro',
    icon: '❌',
    path: '/anulacion_deuda',
    component: AnulacionDeuda,
    category: 'Caja'
  },
  {
    id: 'pagos_extraordinarios',
    label: 'Cobros Extra',
    icon: '⚠️',
    path: '/pagos_extraordinarios',
    component: PagosExtraordinarios,
    category: 'Caja'
  },
  {
    id: 'pagos',
    label: 'Pagos',
    icon: '💳',
    path: '/pagos',
    component: Pagos,
    category: 'Caja'
  },
  {
    id: 'pagos_detalle',
    label: 'Detalle Pagos',
    icon: '📋',
    path: '/pagos_detalle',
    component: PagosDetalle,
    category: 'Caja'
  },
  {
    id: 'asignar_correlativo',
    label: 'Asignar Correlativos',
    icon: '🧾',
    path: '/asignar_correlativo',
    component: AsignarCorrelativo,
    category: 'Caja'
  },
  {
    id: 'resoluciones_facturas',
    label: 'Resoluciones Facturas',
    icon: '🖨️',
    path: '/resoluciones_facturas',
    component: ResolucionesFacturasComponent,
    category: 'Reportes'
  },
  {
    id: 'bitacora',
    label: 'Bitácora',
    icon: '🕒',
    path: '/bitacora',
    component: Bitacora,
    category: 'Reportes'
  },
  {
    id: 'estado_cuenta',
    label: 'Estado de Cuenta',
    icon: '📋',
    path: '/estado_cuenta',
    component: EstadoCuenta,
    category: 'Reportes'
  },
  {
    id: 'empresas',
    label: 'Empresa',
    icon: '🏢',
    path: '/empresas',
    component: Empresas,
    category: 'Sistema'
  },
  {
    id: 'empresa_proyecto',
    label: 'Empresa-Proyecto',
    icon: '🧩',
    path: '/empresa_proyecto',
    component: EmpresaProyecto,
    category: 'Sistema'
  },
  {
    id: 'proyectos',
    label: 'Proyectos',
    icon: '📁',
    path: '/proyectos',
    component: Proyecto,
    category: 'Sistema'
  }
];

// Obtener módulos por categoría
export const getModulesByCategory = (category) => {
  return modulesConfig.filter(module => module.category === category);
};

// Obtener todas las categorías únicas
export const getAllCategories = () => {
  return [...new Set(modulesConfig.map(module => module.category))];
};

// Obtener un módulo por ID
export const getModuleById = (id) => {
  return modulesConfig.find(module => module.id === id);
};
