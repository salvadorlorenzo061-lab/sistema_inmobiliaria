import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { modulesConfig } from '../config/modulesConfig';

const normalizeText = (value = '') => value
  .toString()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const MODULE_PERMISSION_ALIASES = {
  menu_general: ['menu principal', 'menu general'],
  anulacion_deuda: ['anular cobro', 'anulacion deuda', 'anulacion de deuda'],
  caja_ingresos: ['caja ingresos manual']
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
  if (Array.isArray(permisos)) return permisos;
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

function MenuGeneral() {
  const [busqueda, setBusqueda] = useState('');
  const usuarioActivo = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('usuario') || '{}');
    } catch {
      return {};
    }
  }, []);

  const modulosPermitidos = useMemo(() => {
    const permisos = parsePermisos(usuarioActivo.permisos);
    const permisosNormalizados = new Set(permisos.map((item) => normalizeText(item)));
    const rolNormalizado = normalizeText(usuarioActivo.nombre_rol);
    const esAdmin = rolNormalizado.includes('admin') || rolNormalizado.includes('administrador') || rolNormalizado.includes('superusuario');
    const fallbackPermisos = getFallbackPermisosByRole(rolNormalizado);
    const permisosEfectivos = permisosNormalizados.size > 0 ? permisosNormalizados : fallbackPermisos;

    return modulesConfig.filter((modulo) => {
      if (esAdmin || modulo.id === 'menu_general') {
        return true;
      }

      if (modulo.id === 'asignar_correlativo') {
        return false;
      }

      if (permisosEfectivos.size === 0) {
        return false;
      }

      const candidates = [
        modulo.id,
        modulo.label,
        modulo.path.replace('/', ''),
        ...(MODULE_PERMISSION_ALIASES[modulo.id] || [])
      ].map(normalizeText);

      return candidates.some((candidate) => permisosEfectivos.has(candidate));
    });
  }, [usuarioActivo]);

  const categorias = useMemo(() => {
    return [...new Set(modulosPermitidos.map((modulo) => modulo.category))];
  }, [modulosPermitidos]);
  const textoBusqueda = busqueda.trim().toLowerCase();

  const totalModulos = modulosPermitidos.length;

  const categoriasFiltradas = useMemo(() => {
    return categorias
      .map((categoria) => {
        const modulosCategoria = modulosPermitidos.filter((modulo) => modulo.category === categoria);
        const modulosFiltrados = textoBusqueda
          ? modulosCategoria.filter((modulo) => (
              modulo.label.toLowerCase().includes(textoBusqueda)
              || modulo.path.toLowerCase().includes(textoBusqueda)
            ))
          : modulosCategoria;

        return {
          categoria,
          modulos: modulosFiltrados
        };
      })
      .filter((item) => item.modulos.length > 0);
  }, [categorias, textoBusqueda, modulosPermitidos]);

  const totalFiltrado = categoriasFiltradas.reduce((acc, item) => acc + item.modulos.length, 0);

  const getIconoModulo = (modulo) => {
    return `/images/menu-icons/modules/${modulo.id}.svg`;
  };

  return (
    <div className="container mt-4 menu-general-page">
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm mb-3 menu-general-header">
          <div className="col-md-6">
            <h3 className="m-0 text-dark fw-bold">MENU PRINCIPAL</h3>
            <small className="text-muted">Acceso rapido por categorias y mosaicos de modulos.</small>
          </div>
          <div className="col-md-6">
            <div className="menu-general-tools">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar modulo..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <div className="menu-general-stats">
                <span className="badge bg-primary-subtle text-primary-emphasis border">{totalFiltrado}/{totalModulos} modulos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="menu-principal-board">
        {categoriasFiltradas.map(({ categoria, modulos }) => {
          return (
            <section className="menu-principal-col" key={categoria}>
              <div className="menu-principal-col-head d-flex justify-content-between align-items-center">
                <span>{categoria}</span>
                <span className="badge bg-info text-dark rounded-pill px-2">{modulos.length}</span>
              </div>
              <div className="menu-principal-tiles">
                {modulos.map((modulo) => (
                  <Link key={modulo.id} to={modulo.path} className="menu-principal-tile" title={`Ir a ${modulo.label}`}>
                    <div className="menu-principal-icon">
                      <img
                        src={getIconoModulo(modulo)}
                        alt={modulo.label}
                        className="menu-principal-icon-image"
                        onError={(e) => { e.currentTarget.src = '/images/menu-icons/sistema.svg'; }}
                      />
                    </div>
                    <div className="menu-principal-label">{modulo.label}</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {categoriasFiltradas.length === 0 && (
          <div className="col-12">
            <div className="alert alert-secondary mb-0 text-center">
              No se encontraron modulos para la busqueda ingresada.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MenuGeneral;
