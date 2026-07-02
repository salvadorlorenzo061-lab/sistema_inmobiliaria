import './App.css';
import React, { useEffect, useMemo, useState } from 'react'; 
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import { modulesConfig } from './config/modulesConfig';
import Login from './componentes/Login';

const normalizeText = (value = '') => value
  .toString()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const MODULE_PERMISSION_ALIASES = {
  menu_general: ['menu principal', 'menu general'],
  anulacion_deuda: ['anular cobro', 'anulacion deuda', 'anulacion de deuda'],
  caja_ingresos: ['caja ingresos manual'],
  asignar_correlativo: ['asignar correlativos', 'asignar correlativo', 'cuadre del dia', 'cuadre del mes']
};

const getFallbackPermisosByRole = (rolNormalizado = '') => {
  if (rolNormalizado.includes('cobro') || rolNormalizado.includes('caja')) {
    return new Set([
      normalizeText('Caja (General)'),
      normalizeText('Caja Ingresos Manual'),
      normalizeText('Mora y Atrasos'),
      normalizeText('Pagos'),
      normalizeText('Detalle Pagos')
    ]);
  }

  return new Set();
};

const parsePermisos = (permisos) => {
  if (Array.isArray(permisos)) {
    return permisos;
  }

  if (typeof permisos === 'string' && permisos.trim()) {
    try {
      const parsed = JSON.parse(permisos);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  const logoSources = ['/images/logo.svg'];
  const [logoIndex, setLogoIndex] = useState(0);
  const [usuarioActivo, setUsuarioActivo] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const cargarUsuarioActivo = () => {
      try {
        const data = JSON.parse(localStorage.getItem('usuario') || '{}');
        setUsuarioActivo(data || {});
        setIsAuthenticated(Boolean(data && data.id_usuario));
      } catch {
        setUsuarioActivo({});
        setIsAuthenticated(false);
      }
    };

    cargarUsuarioActivo();
    window.addEventListener('focus', cargarUsuarioActivo);
    window.addEventListener('storage', cargarUsuarioActivo);
    window.addEventListener('usuario-updated', cargarUsuarioActivo);

    return () => {
      window.removeEventListener('focus', cargarUsuarioActivo);
      window.removeEventListener('storage', cargarUsuarioActivo);
      window.removeEventListener('usuario-updated', cargarUsuarioActivo);
    };
  }, []);

  const inicialesUsuario = useMemo(() => {
    const nombre = String(usuarioActivo.nombre_usuario || usuarioActivo.nombre || 'USUARIO').trim();
    const partes = nombre.split(' ').filter(Boolean);
    if (!partes.length) return 'U';
    return (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
  }, [usuarioActivo]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const cerrarSesionTemporal = () => {
    localStorage.removeItem('usuario');
    setUsuarioActivo({});
    setIsAuthenticated(false);
    window.dispatchEvent(new Event('usuario-updated'));
  };

  const onLoginSuccess = (usuario) => {
    setUsuarioActivo(usuario || {});
    setIsAuthenticated(Boolean(usuario && usuario.id_usuario));
  };

  const modulesPermitidos = useMemo(() => {
    if (!isAuthenticated) {
      return [];
    }

    const permisos = parsePermisos(usuarioActivo.permisos);
    const permisosNormalizados = new Set(permisos.map((item) => normalizeText(item)));
    const rolNormalizado = normalizeText(usuarioActivo.nombre_rol);
    const esAdmin = rolNormalizado.includes('admin') || rolNormalizado.includes('administrador') || rolNormalizado.includes('superusuario');
    const fallbackPermisos = getFallbackPermisosByRole(rolNormalizado);
    const permisosEfectivos = permisosNormalizados.size > 0 ? permisosNormalizados : fallbackPermisos;

    return modulesConfig.filter((module) => {
      if (esAdmin) {
        return true;
      }

      if (module.id === 'asignar_correlativo') {
        return false;
      }

      if (module.id === 'menu_general') {
        return true;
      }

      if (permisosEfectivos.size === 0) {
        return false;
      }

      const candidates = [
        module.id,
        module.label,
        module.path.replace('/', ''),
        ...(MODULE_PERMISSION_ALIASES[module.id] || [])
      ].map(normalizeText);

      return candidates.some((candidate) => permisosEfectivos.has(candidate));
    });
  }, [isAuthenticated, usuarioActivo]);

  const categories = useMemo(() => {
    return [...new Set(modulesPermitidos.map((module) => module.category))];
  }, [modulesPermitidos]);

  // Toggle para expandir/contraer categorías
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Inicializar todas las categorías como expandidas
  const initializeCategories = () => {
    const initialized = {};
    categories.forEach(cat => {
      if (expandedCategories[cat] === undefined) {
        initialized[cat] = true;
      }
    });
    return initialized;
  };

  const finalExpandedState = { ...initializeCategories(), ...expandedCategories };

  if (!isAuthenticated) {
    return (
      <Router>
        <Login onLoginSuccess={onLoginSuccess} />
      </Router>
    );
  }

  return (
    <Router>
      <div className="container-fluid"> 
        <div className="row">
          
          {/* BARRA LATERAL DINÁMICA (SIDEBAR) */}
          <div 
            className={`bg-light p-3 shadow-sm min-vh-100 transition-all sidebar-shell ${
              isMenuOpen ? 'col-md-3 col-lg-2' : 'col-auto d-flex flex-column align-items-center'
            }`}
            style={{ transition: 'all 0.3s' }}
          >
            {/* LOGO */}
            <div className="mb-4 w-100 d-flex justify-content-center">
              <Link to="/menu_general" title="Ir al menu general" className="d-inline-block text-center text-decoration-none" style={{ minHeight: '76px' }}>
                {logoIndex < logoSources.length ? (
                  <img 
                    src={logoSources[logoIndex]}
                    alt="Grupo de Inversiones" 
                    onError={() => setLogoIndex((prev) => prev + 1)}
                    style={{
                      maxWidth: isMenuOpen ? '150px' : '42px',
                      height: 'auto',
                      maxHeight: '72px',
                      transition: 'all 0.3s',
                      cursor: 'pointer'
                    }} 
                  />
                ) : (
                  <div className="fw-bold text-primary" style={{ fontSize: isMenuOpen ? '0.95rem' : '0.75rem' }}>
                    GRUPO DE INVERSION
                  </div>
                )}
                {isMenuOpen && (
                  <div className="small text-success fw-bold mt-1" style={{ letterSpacing: '0.3px' }}>
                    GRUPO DE INVERSION
                  </div>
                )}
              </Link>
            </div>

            <button className="btn btn-primary mb-4 w-100" onClick={toggleMenu}>
              {isMenuOpen ? '◀ Contraer' : '▶'}
            </button>

            {isMenuOpen && <h5 className="fw-bold mb-4 text-center text-secondary">⚙️ Sistema</h5>}

            {/* MENÚ DINÁMICO POR CATEGORÍAS */}
            <nav className="nav flex-column w-100 gap-2">
              {categories.map((category, idx) => (
                <div key={idx} className="mb-3">
                  {isMenuOpen && (
                    <button
                      onClick={() => toggleCategory(category)}
                      className="btn btn-sm btn-link fw-bold d-block mb-2 ps-2 text-start w-100 text-decoration-none sidebar-category-btn"
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="me-2">
                        {finalExpandedState[category] ? '▼' : '▶'}
                      </span>
                      {category}
                    </button>
                  )}
                  
                  {/* Módulos de esta categoría - Mostrar/Ocultar según estado */}
                  {finalExpandedState[category] && (
                    <>
                      {modulesConfig
                        .filter(module => modulesPermitidos.some((permitido) => permitido.id === module.id))
                        .filter(module => module.category === category)
                        .map((module) => (
                          <NavLink
                            key={module.id}
                            to={module.path} 
                            className={({ isActive }) => `nav-link fw-bold p-2 text-start d-flex align-items-center sidebar-menu-link ${isActive ? 'is-active' : ''}`}
                          >
                            <span>{module.icon}</span> 
                            {isMenuOpen && <span className="ms-2">{module.label}</span>}
                          </NavLink>
                        ))}
                    </>
                  )}
                </div>
              ))}
            </nav>
          </div>

          {/* CONTENIDO PRINCIPAL (DERECHA) */}
          <div className={`p-4 app-content-with-profile ${isMenuOpen ? 'col-md-9 col-lg-10' : 'col'}`}>
            <div className="perfil-activo-top-right">
              <div className="perfil-activo-card">
                <div className="perfil-activo-header">
                  {usuarioActivo.foto_perfil ? (
                    <img src={usuarioActivo.foto_perfil} alt="Perfil activo" className="perfil-activo-avatar" />
                  ) : (
                    <div className="perfil-activo-iniciales">{inicialesUsuario}</div>
                  )}
                  <div className="perfil-activo-info">
                    <div className="perfil-activo-titulo">Usuario activo</div>
                    <div className="perfil-activo-nombre">{usuarioActivo.nombre_usuario || usuarioActivo.nombre || 'Invitado'}</div>
                    <div className="perfil-activo-rol">{usuarioActivo.nombre_rol || 'Sin rol'}</div>
                  </div>
                </div>
                <button type="button" className="btn btn-sm btn-outline-danger perfil-cerrar-sesion" onClick={cerrarSesionTemporal}>
                  Cerrar sesión
                </button>
              </div>
            </div>
            <Routes>
              {/* RUTAS DINÁMICAS - Se generan automáticamente */}
              {modulesPermitidos.map((module) => {
                const Component = module.component;
                return (
                  <Route 
                    key={module.id}
                    path={module.path} 
                    element={<Component />} 
                  />
                );
              })}
              
              {/* Ruta por defecto */}
              {modulesPermitidos.length > 0 && (() => {
                const DefaultComponent = modulesPermitidos[0].component;
                return <Route path="/" element={<DefaultComponent />} />;
              })()}
              {modulesPermitidos.length === 0 && (
                <Route path="*" element={<div className="alert alert-warning">No tienes módulos asignados. Contacta al administrador.</div>} />
              )}
            </Routes>
          </div>

        </div>
      </div>
    </Router>
  );
}

export default App;