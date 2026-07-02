import { useCallback, useEffect, useState } from 'react';
import Axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function Proyecto() {
  const [proyectos, setProyectos] = useState([]);
  const [empresas, setEmpresas] = useState([]);

  const [idProyecto, setIdProyecto] = useState('');
  const [nombre, setNombre] = useState('');
  const [nit, setNit] = useState('');
  const [estado, setEstado] = useState('activo');
  const [idEmpresa, setIdEmpresa] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const API_URL = `${API_BASE_URL}/api/proyectos`;

  const limpiarCampos = () => {
    setIdProyecto('');
    setNombre('');
    setNit('');
    setEstado('activo');
    setIdEmpresa('');
  };

  const cargarDatos = useCallback(() => {
    Promise.all([
      Axios.get(API_URL),
      Axios.get(`${API_URL}/catalogo`)
    ])
      .then(([proyectosResponse, catalogoResponse]) => {
        setProyectos(Array.isArray(proyectosResponse.data) ? proyectosResponse.data : []);
        setEmpresas(Array.isArray(catalogoResponse.data?.empresas) ? catalogoResponse.data.empresas : []);
      })
      .catch((error) => {
        console.error('Error al cargar proyectos', error);
        setProyectos([]);
        setEmpresas([]);
      });
  }, [API_URL]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const proyectosFiltrados = proyectos.filter((item) => {
    const texto = busqueda.toLowerCase();
    return (
      String(item.nombre || '').toLowerCase().includes(texto)
      || String(item.nit || '').toLowerCase().includes(texto)
      || String(item.nombre_empresa || '').toLowerCase().includes(texto)
    );
  });

  const { paginatedItems, totalPages, startIndex, endIndex } = getPaginatedData(
    proyectosFiltrados,
    currentPage,
    itemsPerPage
  );

  const abrirEditarModal = (item) => {
    setIdProyecto(String(item.id_proyecto));
    setNombre(item.nombre || '');
    setNit(item.nit || '');
    setEstado(item.estado || 'activo');
    setIdEmpresa(String(item.id_empresa || ''));
    setShowEditModal(true);
  };

  const crearProyecto = () => {
    if (!nombre.trim() || !idEmpresa) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Nombre e empresa son obligatorios.' });
      return;
    }

    Axios.post(`${API_URL}/crear`, { nombre, nit, estado, id_empresa: idEmpresa })
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
    if (!idProyecto || !nombre.trim() || !idEmpresa) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Nombre e empresa son obligatorios.' });
      return;
    }

    Axios.put(`${API_URL}/actualizar/${idProyecto}`, { nombre, nit, estado, id_empresa: idEmpresa })
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
      text: item.nombre,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Axios.delete(`${API_URL}/delete/${item.id_proyecto}`)
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
          <div className="col-md-4">
            <h3 className="m-0 text-dark fw-bold">GESTION DE PROYECTOS</h3>
          </div>
          <div className="col-md-5">
            <div className="input-group">
              <span className="input-group-text bg-primary text-white">🔍</span>
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por nombre, NIT o empresa..."
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setCurrentPage(1); }}
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
            <th>ID</th>
            <th>PROYECTO</th>
            <th>NIT</th>
            <th>EMPRESA</th>
            <th>ESTADO</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.length > 0 ? (
            paginatedItems.map((item) => (
              <tr key={item.id_proyecto}>
                <td>#{item.id_proyecto}</td>
                <td className="fw-bold">{item.nombre}</td>
                <td>{item.nit}</td>
                <td>{item.nombre_empresa || 'Sin empresa'}</td>
                <td>
                  <span className={`badge ${item.estado === 'activo' ? 'bg-success' : 'bg-secondary'}`}>
                    {(item.estado || 'activo').toUpperCase()}
                  </span>
                </td>
                <td>
                  <div className="d-flex gap-1">
                    <button className="btn btn-info btn-sm fw-bold" onClick={() => abrirEditarModal(item)}>EDITAR</button>
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

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={proyectosFiltrados.length}
      />

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
                  <input type="text" className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT:</label>
                  <input type="text" className="form-control" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="Se toma de empresa si va vacío" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa:</label>
                  <select className="form-select" value={idEmpresa} onChange={(e) => setIdEmpresa(e.target.value)}>
                    <option value="">-- Seleccione empresa --</option>
                    {empresas.map((empresa) => (
                      <option key={empresa.id_empresa} value={empresa.id_empresa}>{empresa.nombre_empresa}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
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
                  <input type="text" className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">NIT:</label>
                  <input type="text" className="form-control" value={nit} onChange={(e) => setNit(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Empresa:</label>
                  <select className="form-select" value={idEmpresa} onChange={(e) => setIdEmpresa(e.target.value)}>
                    <option value="">-- Seleccione empresa --</option>
                    {empresas.map((empresa) => (
                      <option key={empresa.id_empresa} value={empresa.id_empresa}>{empresa.nombre_empresa}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
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

export default Proyecto;
