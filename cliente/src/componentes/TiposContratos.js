import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function TiposContratos() {
  const [id_tipo_contrato, setId_tipo_contrato] = useState("");
  const [nombre_contrato, setNombre_contrato] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [tiposList, setTiposList] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [esEdicion, setEsEdicion] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = "http://localhost:3001/api/tipos_contratos";
  const getNombreContrato = (item = {}) => item.nombre_contrato || item.nombre_tipo_contrato || '';

  const getTipos = () => { Axios.get(API_URL).then(res => setTiposList(res.data)); };
  useEffect(() => { getTipos(); }, []);

  const guardar = () => {
    if(!nombre_contrato.trim()){ Swal.fire('Error', 'El nombre es requerido', 'warning'); return; }
    const url = esEdicion ? `${API_URL}/actualizar` : `${API_URL}/crear`;
    const metodo = esEdicion ? Axios.put : Axios.post;

    metodo(url, { id_tipo_contrato, nombre_contrato, descripcion })
    .then(() => {
      getTipos(); setShowModal(false); limpiar();
      Swal.fire({ icon: 'success', title: 'Operación exitosa', timer: 2000, showConfirmButton: false });
    });
  };

  const eliminar = (id) => {
    Swal.fire({ title: '¿Eliminar modalidad?', text: "Se borrará el tipo de contrato permanentemente.", icon: 'warning', showCancelButton: true })
    .then(r => {
      if(r.isConfirmed){
        Axios.delete(`${API_URL}/delete/${id}`).then(() => { getTipos(); Swal.fire('Borrado', '', 'success'); })
        .catch(() => Swal.fire('Error', 'Está en uso en contratos activos', 'error'));
      }
    });
  };

  const abrirEditar = (val) => {
    setId_tipo_contrato(val.id_tipo_contrato); setNombre_contrato(getNombreContrato(val));
    setDescripcion(val.descripcion || ""); setEsEdicion(true); setShowModal(true);
  };

  const limpiar = () => { setId_tipo_contrato(""); setNombre_contrato(""); setDescripcion(""); setEsEdicion(false); };

  const listaFiltrada = tiposList.filter(t => getNombreContrato(t).toLowerCase().includes(busqueda.toLowerCase()));

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const { paginatedItems: tiposPaginados, totalPages, startIndex, endIndex } = getPaginatedData(listaFiltrada, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="d-flex justify-content-between align-items-center bg-light p-3 rounded">
        <h4 className="fw-bold m-0">MODALIDADES DE CONTRATOS</h4>
        <input type="text" className="form-control w-25" placeholder="Filtrar..." onChange={handleBusquedaChange} />
        <button className="btn btn-secondary fw-bold" onClick={() => { limpiar(); setShowModal(true); }}>➕ NUEVO TIPO</button>
      </div>
      </div>

      <table className="table table-bordered table-striped shadow-sm">
        <thead className="table-secondary text-dark">
          <tr><th>ID</th><th>MODALIDAD</th><th>DESCRIPCIÓN</th><th>ACCIONES</th></tr>
        </thead>
        <tbody>
          {tiposPaginados.map(val => (
            <tr key={val.id_tipo_contrato}>
              <td>#{val.id_tipo_contrato}</td>
              <td className="fw-bold text-dark">{getNombreContrato(val)}</td>
              <td>{val.descripcion || <span className="text-muted">Sin descripción</span>}</td>
              <td>
                <button className="btn btn-sm btn-warning m-1" onClick={() => abrirEditar(val)}>EDITAR</button>
                <button className="btn btn-sm btn-danger m-1" onClick={() => eliminar(val.id_tipo_contrato)}>ELIMINAR</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={listaFiltrada.length}
      />

      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-secondary text-white"><h5>{esEdicion ? "Modificar Modalidad" : "Nueva Modalidad"}</h5></div>
              <div className="modal-body">
                <label className="fw-bold">Nombre del Contrato:</label>
                <input type="text" className="form-control mb-2" value={nombre_contrato} onChange={e => setNombre_contrato(e.target.value)} placeholder="Ej: Compraventa con Financiamiento" />
                <label className="fw-bold">Descripción legal / operativa:</label>
                <textarea className="form-control" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Términos generales del tipo de contrato..."></textarea>
              </div>
              <div className="modal-footer">
                <button className="btn btn-light" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-secondary" onClick={guardar}>Guardar Tipo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default TiposContratos;