import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function Pagos() {
  const [id_pago, setId_pago] = useState("");
  const [id_contrato, setId_contrato] = useState("");
  const [id_usuario, setId_usuario] = useState("");
  const [monto_total_pagado, setMonto_total_pagado] = useState("");
  const [forma_pago, setForma_pago] = useState("");
  const [no_referencia, setNo_referencia] = useState("");
  
  const [pagosList, setPagos] = useState([]);
  const [contratosList, setContratos] = useState([]);
  const [usuariosList, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const API_URL = "http://localhost:3001/api/pagos";

  const cargarDatosRelacionales = () => {
    // Carga de contratos para los select
    Axios.get("http://localhost:3001/api/contratos_residentes")
      .then((res) => setContratos(res.data))
      .catch((err) => console.error("Error al cargar contratos", err));

    // Carga de usuarios/empleados para los select
    Axios.get("http://localhost:3001/api/usuarios")
      .then((res) => setUsuarios(res.data))
      .catch((err) => console.error("Error al cargar usuarios", err));
  };

  const getPagos = () => {
    Axios.get(API_URL)
      .then((response) => { setPagos(response.data); })
      .catch((error) => { console.error("Error al obtener pagos", error); });
  };

  useEffect(() => { 
    getPagos(); 
    cargarDatosRelacionales();
  }, []);

  const addPago = () => {
    if (!id_contrato || !id_usuario || !monto_total_pagado.trim() || !forma_pago.trim()) {
      Swal.fire({
        position: "top-end",
        icon: "warning",
        title: 'CAMPOS INCOMPLETOS',
        showConfirmButton: false,
        timer: 3000
      });
      return; 
    }

    Axios.post(`${API_URL}/crear`, { id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia })
    .then(() => {
      getPagos();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({
        position: "top-end",
        icon: "success",
        title: `Pago registrado con éxito`,
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

  const actualizarPago = () => {
    if (!id_contrato || !id_usuario || !monto_total_pagado.trim() || !forma_pago.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
      return;
    }

    Axios.put(`${API_URL}/actualizar`, { id_pago, id_contrato, id_usuario, monto_total_pagado, forma_pago, no_referencia })
    .then(() => {
      getPagos();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({
        html: '<strong>¡Éxito!</strong><p>Pago maestro modificado correctamente</p>',
        icon: 'success',
        timer: 3000,
        showConfirmButton: false
      });
    })
    .catch((error) => {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error al actualizar el pago' });
    });
  };

  const deletePago = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      html: `<i>¿Desea eliminar el pago maestro con ID <strong>#${val.id_pago}</strong>?</i>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_pago}`)
        .then(() => {
          getPagos();
          Swal.fire('¡Eliminado!', 'El registro de pago fue removido.', 'success');
        })
        .catch((error) => {
          Swal.fire({
            title: "Operación Bloqueada",
            text: error.response?.data?.message || 'No se puede borrar porque contiene desgloses activos.',
            icon: 'warning'
          });
        });
      }
    });
  };

  const abrirEditarModal = (val) => {
    setId_pago(val.id_pago);
    setId_contrato(val.id_contrato);
    setId_usuario(val.id_usuario);
    setMonto_total_pagado(String(val.monto_total_pagado));
    setForma_pago(val.forma_pago);
    setNo_referencia(val.no_referencia || ""); 
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_pago(""); setId_contrato(""); setId_usuario(""); setMonto_total_pagado(""); setForma_pago(""); setNo_referencia("");
  };

  const pagosFiltrados = pagosList.filter((item) => 
    String(item.id_pago).includes(busqueda) || item.forma_pago.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Paginación
  const { paginatedItems: pagosPaginados, totalPages, startIndex, endIndex } = getPaginatedData(pagosFiltrados, currentPage, itemsPerPage);

  // eslint-disable-next-line no-unused-vars
  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4">
          <h3 className="m-0 text-dark fw-bold">GESTIÓN DE PAGOS</h3>
        </div>
        <div className="col-md-5">
          <div className="input-group">
            <span className="input-group-text bg-info text-dark">🔍</span>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar por ID o forma de pago..." 
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>
        <div className="col-md-3 text-end">
          <button className="btn btn-info fw-bold w-100 text-dark" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>
            ➕ REGISTRAR PAGO
          </button>
        </div>
      </div>
      </div>
      
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID PAGO</th>
            <th>ID CONTRATO</th>
            <th>RECEPTOR (USUARIO)</th>
            <th>FORMA PAGO</th>
            <th>NO. REFERENCIA</th>
            <th>TOTAL PAGADO</th>
            <th>FECHA HORA</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {pagosPaginados.length > 0 ? (
            pagosPaginados.map((val) => (
              <tr key={val.id_pago}>
                <th>#{val.id_pago}</th>
                <td>Contrato #{val.id_contrato}</td>
                <td>Usuario #{val.id_usuario}</td>
                <td><span className="badge bg-secondary">{val.forma_pago.toUpperCase()}</span></td>
                <td>{val.no_referencia || <span className="text-muted">N/A</span>}</td>
                <td className="fw-bold text-success">Q {parseFloat(val.monto_total_pagado).toFixed(2)}</td>
                <td>{new Date(val.fecha_pago).toLocaleString()}</td>
                <td>
                  <div className="btn-group">
                    <button onClick={() => abrirEditarModal(val)} className="btn btn-warning btn-sm m-1 fw-bold text-dark">EDITAR</button>
                    <button onClick={() => deletePago(val)} className="btn btn-danger btn-sm m-1 fw-bold">ELIMINAR</button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="8" className="text-center text-muted py-3">No se encontraron pagos registrados.</td></tr>
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
        itemsCount={pagosFiltrados.length}
      />

      {/* MODAL REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-info text-dark">
                <h5 className="modal-title fw-bold">Ingresar Nuevo Pago</h5>
                <button type="button" className="btn-close" onClick={() => { setShowRegModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Asociar al Contrato:</label>
                  <select value={id_contrato} onChange={(e) => setId_contrato(e.target.value)} className="form-select">
                    <option value="">-- Seleccione el Contrato --</option>
                    {contratosList.map(c => (
                      <option key={c.id_contrato} value={c.id_contrato}>ID: {c.id_contrato} - Residente: {c.nombre || c.id_residente}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Usuario Receptor del Cobro:</label>
                  <select value={id_usuario} onChange={(e) => setId_usuario(e.target.value)} className="form-select">
                    <option value="">-- Seleccione Usuario --</option>
                    {usuariosList.map(u => (
                      <option key={u.id_usuario} value={u.id_usuario}>{u.nombre_usuario || u.usuario}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Monto Total Recibido (Q):</label>
                  <input type="number" step="0.01" value={monto_total_pagado} onChange={(e) => setMonto_total_pagado(e.target.value)} className="form-control" placeholder="0.00" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Forma de Pago:</label>
                  <select value={forma_pago} onChange={(e) => setForma_pago(e.target.value)} className="form-select">
                    <option value="">-- Seleccione Método --</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="deposito">Depósito Bancario</option>
                    <option value="transferencia">Transferencia Electrónica</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">No. de Referencia / Boleta (Opcional):</label>
                  <input type="text" value={no_referencia} onChange={(e) => setNo_referencia(e.target.value)} className="form-control" placeholder="Ej: DEP-84920" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRegModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-info fw-bold text-dark" onClick={addPago}>Guardar Recibo</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title fw-bold">Modificar Comprobante #{id_pago}</h5>
                <button type="button" className="btn-close" onClick={() => { setShowEditModal(false); limpiarCampos(); }}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold">Asociar al Contrato:</label>
                  <select value={id_contrato} onChange={(e) => setId_contrato(e.target.value)} className="form-select">
                    {contratosList.map(c => (
                      <option key={c.id_contrato} value={c.id_contrato}>ID: {c.id_contrato}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Usuario Receptor:</label>
                  <select value={id_usuario} onChange={(e) => setId_usuario(e.target.value)} className="form-select">
                    {usuariosList.map(u => (
                      <option key={u.id_usuario} value={u.id_usuario}>{u.nombre_usuario || u.usuario}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Monto Total Recibido (Q):</label>
                  <input type="number" step="0.01" value={monto_total_pagado} onChange={(e) => setMonto_total_pagado(e.target.value)} className="form-control" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Forma de Pago:</label>
                  <select value={forma_pago} onChange={(e) => setForma_pago(e.target.value)} className="form-select">
                    <option value="efectivo">Efectivo</option>
                    <option value="deposito">Depósito Bancario</option>
                    <option value="transferencia">Transferencia Electrónica</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">No. de Referencia:</label>
                  <input type="text" value={no_referencia} onChange={(e) => setNo_referencia(e.target.value)} className="form-control" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); limpiarCampos(); }}>Cancelar</button>
                <button type="button" className="btn btn-warning fw-bold text-dark" onClick={actualizarPago}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Pagos;