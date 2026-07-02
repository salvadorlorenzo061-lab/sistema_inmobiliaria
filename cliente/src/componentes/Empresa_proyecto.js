import { useCallback, useEffect, useState } from 'react';
import Axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function EmpresaProyecto() {
  const [relaciones, setRelaciones] = useState([]);
  const [matrices, setMatrices] = useState([]);
  const [proyectos, setProyectos] = useState([]);

  const [busqueda, setBusqueda] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [idProyecto, setIdProyecto] = useState('');
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [nitProyecto, setNitProyecto] = useState('');
  const [idMatriz, setIdMatriz] = useState('');
  const [paisProyecto, setPaisProyecto] = useState('GUATEMALA');
  const [monedaProyecto, setMonedaProyecto] = useState('GTQ');
  const [estadoProyecto, setEstadoProyecto] = useState('activo');

  const limpiarCampos = () => {
    setIdProyecto('');
    setNombreProyecto('');
    setNitProyecto('');
    setIdMatriz('');
    setPaisProyecto('GUATEMALA');
    setMonedaProyecto('GTQ');
    setEstadoProyecto('activo');
  };

  const cargarDatos = useCallback(() => {
    Promise.all([
      Axios.get(`${API_BASE_URL}/api/empresas`),
      Axios.get(`${API_BASE_URL}/api/empresa_proyecto`),
      Axios.get(`${API_BASE_URL}/api/empresa_proyecto/catalogo`)
    ])
      .then(([empresasResponse, relacionesResponse, catalogoResponse]) => {
        const empresasModulo = Array.isArray(empresasResponse.data) ? empresasResponse.data : [];
        const matricesDesdeEmpresas = empresasModulo
          .filter((empresa) => !empresa.id_empresa_matriz)
          .map((empresa) => ({
            id_empresa: empresa.id_empresa,
            nombre_empresa: empresa.nombre_empresa,
            nit: empresa.nit || 'C/F'
          }));

        const matricesFinales = matricesDesdeEmpresas.length > 0
          ? matricesDesdeEmpresas
          : empresasModulo.map((empresa) => ({
              id_empresa: empresa.id_empresa,
              nombre_empresa: empresa.nombre_empresa,
              nit: empresa.nit || 'C/F'
            }));

        setRelaciones(Array.isArray(relacionesResponse.data) ? relacionesResponse.data : []);
        setMatrices(matricesFinales);
        setProyectos(Array.isArray(catalogoResponse.data?.proyectos) ? catalogoResponse.data.proyectos : []);
      })
      .catch((error) => {
        console.error('Error al obtener datos empresa-proyecto', error);
        setRelaciones([]);
        setMatrices([]);
        setProyectos([]);
      });
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const relacionesFiltradas = relaciones.filter((item) => {
    const texto = busqueda.toLowerCase();
    const empresa = (item.nombre_empresa || '').toLowerCase();
    const nit = (item.nit || '').toLowerCase();
    const proyectos = (item.proyectos || []).join(' ').toLowerCase();

    return empresa.includes(texto) || nit.includes(texto) || proyectos.includes(texto);
  });

  const { paginatedItems, totalPages, startIndex, endIndex } = getPaginatedData(
    relacionesFiltradas,
    currentPage,
    itemsPerPage
  );

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const abrirEditar = (item) => {
    setIdProyecto(item.id_proyecto);
    setNombreProyecto(item.nombre_proyecto || '');
    setNitProyecto(item.nit_empresa || '');
    setIdMatriz(item.id_empresa_matriz ? String(item.id_empresa_matriz) : '');
    setPaisProyecto('GUATEMALA');
    setMonedaProyecto('GTQ');
    setEstadoProyecto(item.estado || 'activo');
    setShowEditModal(true);
  };

  const crearProyecto = () => {
    if (!nombreProyecto.trim() || !idMatriz) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Nombre del proyecto y empresa matriz son obligatorios.' });
      return;
    }

    Axios.post(`${API_BASE_URL}/api/empresa_proyecto/crear`, {
      nombre_proyecto: nombreProyecto,
      nit: nitProyecto,
      id_empresa_matriz: idMatriz,
      pais: paisProyecto,
      moneda: monedaProyecto,
      estado: estadoProyecto
    })
      .then(() => {
        setShowRegModal(false);
        limpiarCampos();
        cargarDatos();
        Swal.fire({ icon: 'success', title: 'Proyecto creado', timer: 1800, showConfirmButton: false });
      })
      .catch((error) => {
        Swal.fire({
          icon: 'error',
          title: 'No se pudo crear',
          text: error.response?.data?.message || 'Error en el servidor'
        });
      });
  };

  const actualizarProyecto = () => {
    if (!idProyecto || !nombreProyecto.trim() || !idMatriz) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Completa todos los datos obligatorios.' });
      return;
    }

    Axios.put(`${API_BASE_URL}/api/empresa_proyecto/actualizar/${idProyecto}`, {
      nombre_proyecto: nombreProyecto,
      nit: nitProyecto,
      id_empresa_matriz: idMatriz,
      pais: paisProyecto,
      moneda: monedaProyecto,
      estado: estadoProyecto
    })
      .then(() => {
        setShowEditModal(false);
        limpiarCampos();
        cargarDatos();
        Swal.fire({ icon: 'success', title: 'Proyecto actualizado', timer: 1800, showConfirmButton: false });
      })
      .catch((error) => {
        Swal.fire({
          icon: 'error',
          title: 'No se pudo actualizar',
          text: error.response?.data?.message || 'Error en el servidor'
        });
      });
  };

  const eliminarProyecto = (item) => {
    Swal.fire({
      icon: 'warning',
      title: '¿Eliminar proyecto?',
      text: item.nombre_proyecto,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Axios.delete(`${API_BASE_URL}/api/empresa_proyecto/delete/${item.id_proyecto}`)
        .then(() => {
          cargarDatos();
          Swal.fire({ icon: 'success', title: 'Proyecto eliminado', timer: 1800, showConfirmButton: false });
        })
        .catch((error) => {
          Swal.fire({
            icon: 'error',
            title: 'No se pudo eliminar',
            text: error.response?.data?.message || 'Error en el servidor'
          });
        });
    });
  };

  return (
    <div className="container mt-4">
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm">
          <div className="col-md-3">
            <h3 className="m-0 text-dark fw-bold">EMPRESA Y PROYECTOS</h3>
          </div>
          <div className="col-md-6">
            <div className="input-group">
              <span className="input-group-text bg-primary text-white">🔍</span>
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por empresa, NIT o proyecto..."
                value={busqueda}
                onChange={handleBusquedaChange}
              />
            </div>
          </div>
          <div className="col-md-3 text-end">
            <button
              className="btn btn-success fw-bold w-100"
              onClick={() => {
                limpiarCampos();
                setShowRegModal(true);
              }}
            >
              ➕ AGREGAR PROYECTO
            </button>
          </div>
        </div>
      </div>

      <table className="table table-striped table-bordered align-middle shadow-sm mt-3">
        <thead className="table-dark">
          <tr>
            <th style={{ width: '30%' }}>EMPRESA MATRIZ</th>
            <th style={{ width: '12%' }}>NIT</th>
            <th style={{ width: '45%' }}>PROYECTOS RELACIONADOS</th>
            <th style={{ width: '13%' }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.length > 0 ? (
            paginatedItems.map((item) => (
              <tr key={item.id_empresa}>
                <td className="fw-bold text-dark">{item.nombre_empresa}</td>
                <td><span className="badge bg-light text-dark border">{item.nit || 'C/F'}</span></td>
                <td>
                  {item.proyectos?.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {item.proyectos.map((proyecto, index) => (
                        <span key={`${item.id_empresa}-${index}`} className="badge bg-info text-dark">
                          {proyecto}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">Sin proyectos asociados</span>
                  )}
                </td>
                <td>
                  <span className="badge bg-success">{item.total_proyectos || 0}</span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="text-center text-muted py-3">No se encontraron relaciones empresa-proyecto.</td>
            </tr>
          )}
        </tbody>
      </table>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={relacionesFiltradas.length}
        itemLabel="empresas matriz"
      />

      <div className="card shadow-sm mt-4">
        <div className="card-header bg-light fw-bold">CRUD de Proyectos</div>
        <div className="card-body p-0">
          <table className="table table-bordered table-striped align-middle m-0">
            <thead className="table-dark">
              <tr>
                <th>ID</th>
                <th>PROYECTO</th>
                <th>NIT</th>
                <th>MATRIZ</th>
                <th>ESTADO</th>
                <th>OPCIONES</th>
              </tr>
            </thead>
            <tbody>
              {proyectos.length > 0 ? (
                proyectos.map((item) => (
                  <tr key={item.id_proyecto}>
                    <td>#{item.id_proyecto}</td>
                    <td className="fw-bold">{item.nombre_proyecto}</td>
                    <td>{item.nit_empresa || 'C/F'}</td>
                    <td>{item.nombre_matriz}</td>
                    <td>
                      <span className={`badge ${item.estado === 'activo' ? 'bg-success' : 'bg-secondary'}`}>
                        {(item.estado || 'activo').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-info btn-sm fw-bold" onClick={() => abrirEditar(item)}>EDITAR</button>
                        <button className="btn btn-danger btn-sm fw-bold" onClick={() => eliminarProyecto(item)}>ELIMINAR</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center text-muted py-3">No hay proyectos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Crear Proyecto</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre del Proyecto:</label>
                  <input type="text" className="form-control" value={nombreProyecto} onChange={(e) => setNombreProyecto(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT:</label>
                  <input type="text" className="form-control" value={nitProyecto} onChange={(e) => setNitProyecto(e.target.value)} placeholder="C/F si aplica" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa Matriz:</label>
                  <select className="form-select" value={idMatriz} onChange={(e) => setIdMatriz(e.target.value)}>
                    <option value="">-- Seleccione matriz --</option>
                    {matrices.map((m) => (
                      <option key={m.id_empresa} value={m.id_empresa}>{m.nombre_empresa}</option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label fw-bold">País:</label>
                    <input type="text" className="form-control" value={paisProyecto} onChange={(e) => setPaisProyecto(e.target.value)} />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label fw-bold">Moneda:</label>
                    <select className="form-select" value={monedaProyecto} onChange={(e) => setMonedaProyecto(e.target.value)}>
                      <option value="GTQ">GTQ</option>
                      <option value="USD">USD</option>
                      <option value="MXN">MXN</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select className="form-select" value={estadoProyecto} onChange={(e) => setEstadoProyecto(e.target.value)}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-success fw-bold" onClick={crearProyecto}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title fw-bold">Editar Proyecto #{idProyecto}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre del Proyecto:</label>
                  <input type="text" className="form-control" value={nombreProyecto} onChange={(e) => setNombreProyecto(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT:</label>
                  <input type="text" className="form-control" value={nitProyecto} onChange={(e) => setNitProyecto(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa Matriz:</label>
                  <select className="form-select" value={idMatriz} onChange={(e) => setIdMatriz(e.target.value)}>
                    <option value="">-- Seleccione matriz --</option>
                    {matrices.map((m) => (
                      <option key={m.id_empresa} value={m.id_empresa}>{m.nombre_empresa}</option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label fw-bold">País:</label>
                    <input type="text" className="form-control" value={paisProyecto} onChange={(e) => setPaisProyecto(e.target.value)} />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label fw-bold">Moneda:</label>
                    <select className="form-select" value={monedaProyecto} onChange={(e) => setMonedaProyecto(e.target.value)}>
                      <option value="GTQ">GTQ</option>
                      <option value="USD">USD</option>
                      <option value="MXN">MXN</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select className="form-select" value={estadoProyecto} onChange={(e) => setEstadoProyecto(e.target.value)}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-warning fw-bold" onClick={actualizarProyecto}>Actualizar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmpresaProyecto;
