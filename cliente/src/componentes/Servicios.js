import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import { API_BASE_URL } from '../config';
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function Servicios() {
  const [id_servicio, setId_servicio] = useState("");
  const [nombre_servicio, setNombre_servicio] = useState("");
  const [costo_servicio, setCosto_servicio] = useState("");
  const [estado, setEstado] = useState("activo");
  const [periodicidad, setPeriodicidad] = useState("mensual");

  const [serviciosList, setServicios] = useState([]);
  const [proyectosCatalogo, setProyectosCatalogo] = useState([]);
  const [proyectoAsignadoId, setProyectoAsignadoId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false); 
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const API_URL = `${API_BASE_URL}/api/servicios`;

  const getServicios = useCallback(() => {
    Axios.get(API_URL)
      .then((res) => {
        // Validar que la respuesta sea un arreglo para evitar otros errores de mapeo
        setServicios(Array.isArray(res.data) ? res.data : []);
      })
      .catch(console.error);
  }, [API_URL]);

  const getCatalogoProyectos = useCallback(() => {
    Axios.get(`${API_URL}/catalogo-proyectos`)
      .then((res) => {
        setProyectosCatalogo(Array.isArray(res.data) ? res.data : []);
      })
      .catch((error) => {
        console.error('Error cargando catalogo de proyectos:', error);
        setProyectosCatalogo([]);
      });
  }, [API_URL]);

  useEffect(() => {
    getServicios();
    getCatalogoProyectos();
  }, [getServicios, getCatalogoProyectos]);

  const addServicio = () => {
    if (!nombre_servicio.trim() || !costo_servicio.trim()) {
      Swal.fire({ position: "top-end", icon: "warning", title: 'CAMPOS VACÍOS', showConfirmButton: false, timer: 2500 });
      return; 
    }
    Axios.post(`${API_URL}/crear`, {
      nombre_servicio,
      costo_servicio,
      estado,
      periodicidad,
      proyectos_asignados: proyectoAsignadoId ? [Number(proyectoAsignadoId)] : []
    })
    .then(() => {
      getServicios(); limpiarCampos(); setShowRegModal(false);
      Swal.fire({ position: "top-end", icon: "success", title: 'Servicio creado', showConfirmButton: false, timer: 2500 });
    }).catch((error) => {
      const mensaje = error?.response?.data?.message || error?.response?.data || error?.message || 'No se pudo insertar el servicio.';
      Swal.fire({ icon: 'error', title: 'Error al insertar', text: mensaje });
    });
  };

  const actualizarServicio = () => {
    Axios.put(`${API_URL}/actualizar`, {
      id_servicio,
      nombre_servicio,
      costo_servicio,
      estado,
      periodicidad,
      proyectos_asignados: proyectoAsignadoId ? [Number(proyectoAsignadoId)] : []
    })
    .then(() => {
      getServicios(); limpiarCampos(); setShowEditModal(false);
      Swal.fire({ icon: 'success', title: 'Servicio modificado', timer: 2500, showConfirmButton: false });
    }).catch((error) => {
      const mensaje = error?.response?.data?.message || error?.response?.data || error?.message || 'No se pudo actualizar el servicio.';
      Swal.fire({ icon: 'error', title: 'Error al actualizar', text: mensaje });
    });
  };

  const deleteServicio = (val) => {
    Swal.fire({
      title: "¿Eliminar servicio?",
      html: `¿Remover <strong>${val.nombre_servicio}</strong>?`,
      icon: "warning",
      showCancelButton: true
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_servicio}`)
        .then(() => { getServicios(); Swal.fire('Removido', '', 'success'); })
        .catch((err) => {
          Swal.fire('Error', err.response?.data?.message || 'No se puede eliminar porque está en uso', 'error');
        });
      }
    });
  };

  const abrirEditar = (val) => {
    setId_servicio(val.id_servicio); setNombre_servicio(val.nombre_servicio);
    setCosto_servicio(String(val.costo_servicio)); setEstado(val.estado || "activo");
    setPeriodicidad(val.periodicidad || "mensual");

    Axios.get(`${API_URL}/proyectos/${val.id_servicio}`)
      .then((res) => {
        const ids = Array.isArray(res.data?.proyectos)
          ? res.data.proyectos
          : [];
        const primerProyecto = ids
          .map((id) => Number(id))
          .find((id) => Number.isInteger(id) && id > 0);
        setProyectoAsignadoId(primerProyecto ? String(primerProyecto) : "");
      })
      .catch((error) => {
        console.error('Error cargando proyectos asignados al servicio:', error);
        setProyectoAsignadoId("");
      })
      .finally(() => {
        setShowEditModal(true);
      });
  };

  const limpiarCampos = () => {
    setId_servicio(""); setNombre_servicio(""); setCosto_servicio(""); setEstado("activo");
    setPeriodicidad("mensual");
    setProyectoAsignadoId("");
  };

  // Filtrado y paginación
  const serviciosFiltrados = serviciosList.filter(s => (s.nombre_servicio || '').toLowerCase().includes(busqueda.toLowerCase()));
  const { paginatedItems: serviciosPaginados, totalPages, startIndex, endIndex } = getPaginatedData(serviciosFiltrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4"><h4 className="m-0 fw-bold">CATÁLOGO DE SERVICIOS</h4></div>
        <div className="col-md-5">
          <input type="text" className="form-control" placeholder="Buscar servicio..." value={busqueda} onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-3 text-end">
          <button className="btn btn-dark fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>➕ NUEVO SERVICIO</button>
        </div>
      </div>
      </div>
      
      <table className="table table-striped table-bordered shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>NOMBRE DEL SERVICIO</th>
            <th>TARIFA ESTÁNDAR</th>
            <th>PERIODICIDAD</th>
            <th>ESTADO</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {serviciosPaginados.filter(s => (s.nombre_servicio || '').toLowerCase().includes(busqueda.toLowerCase())).map((val) => (
            <tr key={val.id_servicio}>
              <th>#{val.id_servicio}</th>
              <td className="fw-bold">{val.nombre_servicio}</td>
              <td className="text-primary fw-bold">Q {parseFloat(val.costo_servicio || 0).toFixed(2)}</td>
              <td>
                <span className={`badge ${String(val.periodicidad || 'mensual') === 'unico' ? 'bg-secondary' : 'bg-primary'}`}>
                  {String(val.periodicidad || 'mensual').toUpperCase()}
                </span>
              </td>
              <td>
                {/* 🟢 CORREGIDO: Protección con cortocircuito (|| 'inactivo') para evitar el crash si viene NULL */}
                <span className={`badge bg-${(val.estado || 'inactivo') === 'activo' ? 'success' : 'danger'}`}>
                  {(val.estado || 'inactivo').toUpperCase()}
                </span>
              </td>
              <td>
                <button onClick={() => abrirEditar(val)} className="btn btn-warning btn-sm m-1 text-dark fw-bold">EDITAR</button>
                <button onClick={() => deleteServicio(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={serviciosFiltrados.length}
      />

      {/* MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-dark text-white"><h5 className="fw-bold">Añadir Rubro Comercial</h5></div>
              <div className="modal-body">
                <div className="mb-3"><label className="fw-bold">Nombre del Servicio:</label><input type="text" className="form-control" placeholder="Ej: Agua Potable o Mantenimiento" value={nombre_servicio} onChange={e => setNombre_servicio(e.target.value)} /></div>
                <div className="mb-3"><label className="fw-bold">Costo Base / Mensual (Q):</label><input type="number" step="0.01" className="form-control" value={costo_servicio} onChange={e => setCosto_servicio(e.target.value)} /></div>
                <div className="mb-3"><label className="fw-bold">Estado inicial:</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select>
                </div>
                <div className="mb-3"><label className="fw-bold">Periodicidad de cobro:</label>
                  <select className="form-select" value={periodicidad} onChange={e => setPeriodicidad(e.target.value)}><option value="mensual">Mensual</option><option value="unico">Cobro unico</option></select>
                  <small className="text-muted">Use mensual para servicios que deben volver a aparecer cada mes. Use cobro unico para extras que solo se cobran una vez.</small>
                </div>
                <div className="mb-3">
                  <label className="fw-bold">Asignar a proyecto:</label>
                  <select
                    className="form-select"
                    value={proyectoAsignadoId}
                    onChange={(e) => setProyectoAsignadoId(e.target.value)}
                  >
                    <option value="">Sin proyecto</option>
                    {proyectosCatalogo.map((proyecto) => (
                      <option key={proyecto.id_proyecto} value={proyecto.id_proyecto}>
                        {proyecto.nombre} - {proyecto.nombre_empresa || 'Sin empresa'}
                      </option>
                    ))}
                  </select>
                  <small className="text-muted">Opcional. Si no selecciona proyectos, el servicio no aparecerá en la cláusula tercera.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowRegModal(false)}>Cerrar</button>
                <button className="btn btn-dark" onClick={addServicio}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-warning text-dark"><h5 className="fw-bold">Modificar Servicio #{id_servicio}</h5></div>
              <div className="modal-body">
                <div className="mb-3"><label className="fw-bold">Nombre:</label><input type="text" className="form-control" value={nombre_servicio} onChange={e => setNombre_servicio(e.target.value)} /></div>
                <div className="mb-3"><label className="fw-bold">Costo (Q):</label><input type="number" step="0.01" className="form-control" value={costo_servicio} onChange={e => setCosto_servicio(e.target.value)} /></div>
                <div className="mb-3"><label className="fw-bold">Estado:</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select>
                </div>
                <div className="mb-3"><label className="fw-bold">Periodicidad de cobro:</label>
                  <select className="form-select" value={periodicidad} onChange={e => setPeriodicidad(e.target.value)}><option value="mensual">Mensual</option><option value="unico">Cobro unico</option></select>
                  <small className="text-muted">Cambie aqui si el servicio debe cobrarse cada mes o una sola vez.</small>
                </div>
                <div className="mb-3">
                  <label className="fw-bold">Asignar a proyecto:</label>
                  <select
                    className="form-select"
                    value={proyectoAsignadoId}
                    onChange={(e) => setProyectoAsignadoId(e.target.value)}
                  >
                    <option value="">Sin proyecto</option>
                    {proyectosCatalogo.map((proyecto) => (
                      <option key={proyecto.id_proyecto} value={proyecto.id_proyecto}>
                        {proyecto.nombre} - {proyecto.nombre_empresa || 'Sin empresa'}
                      </option>
                    ))}
                  </select>
                  <small className="text-muted">Opcional. Puede ajustar aquí los proyectos donde aplica este servicio.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button className="btn btn-warning text-dark fw-bold" onClick={actualizarServicio}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Servicios;