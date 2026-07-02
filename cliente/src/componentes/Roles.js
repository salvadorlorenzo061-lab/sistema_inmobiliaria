import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import { API_BASE_URL } from '../config';
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function Roles() {
  const [id_rol, setId_rol] = useState("");
  const [nombre_rol, setNombre_rol] = useState("");
  const [descripcion, setDescripcion] = useState("");
  
  const [rolesList, setRoles] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false); 

  const API_URL = `${API_BASE_URL}/api/roles`;

  // =========================================================================
  //  CONTROLADORES CRUD
  // =========================================================================
  const getRoles = useCallback(() => {
    Axios.get(API_URL)
    .then((response) => { setRoles(response.data); })
    .catch((error) => { console.error("Error al obtener roles", error); });
  }, [API_URL]);

  useEffect(() => { getRoles(); }, [getRoles]);

  const addRol = () => {
    if (!nombre_rol.trim() || !descripcion.trim()) {
      Swal.fire({
        position: "top-end",
        icon: "warning",
        title: 'CAMPOS INCOMPLETOS',
        showConfirmButton: false,
        timer: 3000
      });
      return; 
    }

    Axios.post(`${API_URL}/crear`, { nombre_rol, descripcion })
    .then(() => {
      getRoles();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: `Rol "${nombre_rol}" creado correctamente`,
        showConfirmButton: false,
        timer: 3000
      });
    })
    .catch((error) => {
      Swal.fire({
        title: "<strong>Error al registrar</strong>",
        text: error.response?.data?.message || 'Hubo un error en el servidor',
        icon: 'error',
        timer: 3500,
        showConfirmButton: false
      });
    });
  };

  const actualizarRol = () => {
    if (!nombre_rol.trim() || !descripcion.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
      return;
    }

    Axios.put(`${API_URL}/actualizar`, { id_rol, nombre_rol, descripcion })
    .then(() => {
      getRoles();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({
        html: '<strong>¡Éxito!</strong><p>Rol modificado correctamente</p>',
        icon: 'success',
        timer: 3000,
        showConfirmButton: false
      });
    })
    .catch((error) => {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error al actualizar el rol' });
    });
  };

  const deleteRol = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: `<i>¿Desea eliminar el rol <strong>${val.nombre_rol}</strong>?</i>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminarlo",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_rol}`)
        .then(() => {
          getRoles();
          Swal.fire('¡Eliminado!', 'El rol fue retirado del sistema.', 'success');
        })
        .catch((error) => {
          Swal.fire({
            title: "Operación Bloqueada",
            text: error.response?.data?.message || 'No se pudo eliminar el rol.',
            icon: 'warning'
          });
        });
      }
    });
  };

  const abrirEditarModal = (val) => {
    setId_rol(val.id_rol);
    setNombre_rol(val.nombre_rol);
    setDescripcion(val.descripcion);
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_rol(""); setNombre_rol(""); setDescripcion("");
  };

  // Filtrado en tiempo real
  const rolesFiltrados = rolesList.filter((item) => 
    item.nombre_rol.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Paginación
  const { paginatedItems: rolesPaginados, totalPages, startIndex, endIndex } = getPaginatedData(rolesFiltrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      {/* CABECERA */}
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4">
          <h3 className="m-0 text-dark fw-bold">CONFIGURACIÓN DE ROLES</h3>
        </div>
        <div className="col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-dark text-white">🔍</span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar rol por nombre..." 
              value={busqueda}
              onChange={handleBusquedaChange}
            />
          </div>
        </div>
        <div className="col-md-3 text-end">
          <button 
            className="btn btn-dark fw-bold w-100" 
            onClick={() => { limpiarCampos(); setShowRegModal(true); }}
          >
            ➕ AGREGAR NUEVO ROL
          </button>
        </div>
      </div>
      </div>
      
      {/* TABLA DE ROLES */}
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th style={{ width: '120px' }}>ID ROL</th>
            <th style={{ width: '250px' }}>NOMBRE DEL ROL</th>
            <th>DESCRIPCIÓN DE ATRIBUCIONES</th>
            <th style={{ width: '200px' }}>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {rolesFiltrados.length > 0 ? (
            rolesPaginados.map((val) => (
              <tr key={val.id_rol}>
                <th>#{val.id_rol}</th>
                <td><span className="badge bg-primary fs-6">{val.nombre_rol}</span></td>
                <td className="text-muted">{val.descripcion}</td>
                <td>
                  <div className="btn-group" role="group">
                    <button type="button" onClick={() => abrirEditarModal(val)} className="btn btn-info btn-sm m-1 fw-bold">EDITAR</button>
                    <button type="button" onClick={() => deleteRol(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="text-center text-muted py-3">No se encontraron roles configurados.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={rolesFiltrados.length}
      />

      {/* MODAL 1: REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title fw-bold">Crear Nuevo Rol de Sistema</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre del Rol:</label>
                  <input 
                    type="text" 
                    value={nombre_rol} 
                    onChange={(e) => setNombre_rol(e.target.value)} 
                    className="form-control" 
                    placeholder="Ej: Gestor de Cobros" 
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Descripción / Permisos:</label>
                  <textarea 
                    rows="3"
                    value={descripcion} 
                    onChange={(e) => setDescripcion(e.target.value)} 
                    className="form-control" 
                    placeholder="Describa brevemente qué puede hacer este rol..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-dark fw-bold" onClick={addRol}>Guardar Rol</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-info text-black">
                <h5 className="modal-title fw-bold">Modificar Atribuciones Rol #{id_rol}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre del Rol:</label>
                  <input type="text" value={nombre_rol} onChange={(e) => setNombre_rol(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Descripción / Permisos:</label>
                  <textarea rows="3" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="form-control" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-info fw-bold" onClick={actualizarRol}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Roles;