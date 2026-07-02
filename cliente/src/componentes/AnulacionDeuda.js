import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';

function AnulacionDeuda() {
  const [id_anulacion, setId_anulacion] = useState("");
  const [id_morosidad, setId_morosidad] = useState("");
  const [id_contrato, setId_contrato] = useState("");
  const [correlativo, setCorrelativo] = useState("");
  const [id_pago_anulado, setId_pago_anulado] = useState("");
  const [id_usuario_autoriza, setId_usuario_autoriza] = useState("");
  const [monto_anulado, setMonto_anulado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalleCorrelativo, setDetalleCorrelativo] = useState(null);
  
  const [anulacionesList, setAnulaciones] = useState([]);
  const [morosidadesList, setMorosidades] = useState([]);
  const [contratosList, setContratos] = useState([]);
  const [usuariosList, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false); 

  const API_URL = "http://localhost:3001/api/anulacion_deuda";

  const cargarDatosRelacionales = () => {
    Axios.get("http://localhost:3001/api/morosidad").then((res) => setMorosidades(res.data)).catch(console.error);
    Axios.get("http://localhost:3001/api/contratos_residentes").then((res) => setContratos(res.data)).catch(console.error);
    Axios.get("http://localhost:3001/api/usuarios").then((res) => setUsuarios(res.data)).catch(console.error);
  };

  const getAnulaciones = () => {
    Axios.get(API_URL).then((res) => setAnulaciones(res.data)).catch(console.error);
  };

  useEffect(() => { 
    getAnulaciones(); 
    cargarDatosRelacionales();
  }, []);

  const getMesesCorrelativo = () => {
    const raw = String(detalleCorrelativo?.meses_pagados || '').trim();
    if (!raw) return [];
    return raw.split(',').map((mes) => mes.trim()).filter(Boolean);
  };

  const addAnulacion = () => {
    if (!correlativo.trim() || !id_usuario_autoriza || !motivo.trim()) {
      Swal.fire({ icon: "warning", title: 'CAMPOS INCOMPLETOS', timer: 3000, showConfirmButton: false });
      return; 
    }

    if (!detalleCorrelativo || !id_pago_anulado) {
      Swal.fire({ icon: 'warning', title: 'Primero debes buscar y validar el correlativo', timer: 2600, showConfirmButton: false });
      return;
    }

    const meses = getMesesCorrelativo();
    const mesesTexto = meses.length ? meses.join(', ') : 'No especificado';
    const montoTexto = `Q${parseFloat(monto_anulado || 0).toFixed(2)}`;
    const residenteTexto = detalleCorrelativo.nombre_residente || 'N/A';

    Swal.fire({
      icon: 'question',
      title: 'Confirmar anulación de cargo',
      html: `
        <div style="text-align:left">
          <p><strong>Correlativo:</strong> ${correlativo}</p>
          <p><strong>Pago:</strong> #${id_pago_anulado}</p>
          <p><strong>Residente:</strong> ${residenteTexto}</p>
          <p><strong>Contrato:</strong> #${id_contrato || '-'}</p>
          <p><strong>Meses a revertir:</strong> ${mesesTexto}</p>
          <p><strong>Monto a revertir:</strong> ${montoTexto}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Sí, anular cargo',
      cancelButtonText: 'Cancelar'
    }).then((confirmacion) => {
      if (!confirmacion.isConfirmed) {
        return;
      }

      Axios.post(`${API_URL}/anular-por-correlativo`, {
        correlativo,
        id_usuario_autoriza,
        motivo,
        nombre_usuario: usuariosList.find((u) => String(u.id_usuario) === String(id_usuario_autoriza))?.usuario || 'DESCONOCIDO'
      })
      .then(() => {
        getAnulaciones();
        limpiarCampos();
        setShowRegModal(false);
        Swal.fire({ icon: "success", title: `Cobro anulado por correlativo`, timer: 3000, showConfirmButton: false });
      })
      .catch((err) => Swal.fire({ icon: 'error', title: 'Error al registrar', text: err.response?.data?.message }));
    })
  };

  const buscarCorrelativo = () => {
    const valor = correlativo.trim();
    if (!valor) {
      Swal.fire({ icon: 'warning', title: 'Ingresa el correlativo del cobro', timer: 2500, showConfirmButton: false });
      return;
    }

    Axios.get(`${API_URL}/buscar-correlativo/${encodeURIComponent(valor)}`)
    .then((res) => {
      const data = res.data || {};
      setDetalleCorrelativo(data);
      setId_contrato(String(data.id_contrato || ''));
      setMonto_anulado(String(parseFloat(data.principal_pagado || 0).toFixed(2)));
      setId_pago_anulado(String(data.id_pago || ''));
      Swal.fire({ icon: 'success', title: 'Cobro localizado', timer: 1500, showConfirmButton: false });
    })
    .catch((err) => {
      setDetalleCorrelativo(null);
      setId_contrato('');
      setMonto_anulado('');
      setId_pago_anulado('');
      Swal.fire({ icon: 'error', title: 'No encontrado', text: err.response?.data?.message || 'No se encontró el correlativo.' });
    });
  };

  const actualizarAnulacion = () => {
    Axios.put(`${API_URL}/actualizar`, { id_anulacion, id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo })
    .then(() => {
      getAnulaciones();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({ icon: 'success', title: 'Anulación de cobro actualizada', timer: 3000, showConfirmButton: false });
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Error al actualizar' }));
  };

  const deleteAnulacion = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      text: `¿Eliminar la anulación de cobro #${val.id_anulacion}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Eliminar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_anulacion}`).then(() => {
          getAnulaciones();
          Swal.fire('Eliminado', 'Registro borrado.', 'success');
        });
      }
    });
  };

  const abrirEditar = (val) => {
    setId_anulacion(val.id_anulacion);
    setId_morosidad(val.id_morosidad);
    setId_contrato(val.id_contrato);
    setId_usuario_autoriza(val.id_usuario_autoriza);
    setMonto_anulado(String(val.monto_anulado));
    setMotivo(val.motivo);
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_anulacion("");
    setId_morosidad("");
    setId_contrato("");
    setCorrelativo("");
    setId_pago_anulado("");
    setId_usuario_autoriza("");
    setMonto_anulado("");
    setMotivo("");
    setDetalleCorrelativo(null);
  };

  // Filtrado y paginación
  const textoBusqueda = busqueda.toLowerCase();
  const anulacionesFiltradas = anulacionesList.filter((a) => {
    const motivoText = String(a.motivo || '').toLowerCase();
    const correlativoText = String(a.correlativo || '').toLowerCase();
    const contratoText = String(a.id_contrato || '').toLowerCase();
    const pagoText = String(a.id_pago || '').toLowerCase();
    return motivoText.includes(textoBusqueda)
      || correlativoText.includes(textoBusqueda)
      || contratoText.includes(textoBusqueda)
      || pagoText.includes(textoBusqueda);
  });
  const { paginatedItems: anulacionesPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(anulacionesFiltradas, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4"><h3 className="m-0 text-dark fw-bold">ANULAR COBRO</h3></div>
        <div className="col-md-5">
          <input type="text" className="form-control" placeholder="Buscar por motivo, correlativo o pago..." value={busqueda} onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-3 text-end">
          <button className="btn btn-info fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>➕ ANULAR COBRO</button>
        </div>
      </div>
      </div>
      
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>REFERENCIA</th>
            <th>CONTRATO</th>
            <th>CORRELATIVO</th>
            <th>AUTORIZÓ</th>
            <th>MONTO</th>
            <th>MOTIVO</th>
            <th>FECHA</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {anulacionesPaginadas.map((val) => (
            <tr key={val.id_anulacion}>
              <th>#{val.id_anulacion}</th>
              <td>{val.id_morosidad ? `Ref #${val.id_morosidad}` : 'Por correlativo'}</td>
              <td>Contrato #{val.id_contrato}</td>
              <td>
                <div>{val.correlativo || `PAGO-${val.id_pago || '-'}`}</div>
                <small className="text-muted">Pago #{val.id_pago || '-'}</small>
              </td>
              <td>Usu. #{val.id_usuario_autoriza}</td>
              <td className="text-danger fw-bold">-Q{parseFloat(val.monto_anulado).toFixed(2)}</td>
              <td>{val.motivo}</td>
              <td>{new Date(val.fecha_anulacion).toLocaleDateString()}</td>
              <td>
                <button onClick={() => abrirEditar(val)} className="btn btn-warning btn-sm m-1">EDITAR</button>
                <button onClick={() => deleteAnulacion(val)} className="btn btn-danger btn-sm m-1">ELIMINAR</button>
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
        itemsCount={anulacionesFiltradas.length}
      />

      {/* MODALES REGISTRO Y EDICIÓN (Simplificado visualmente para espacio, usa la misma estructura de los inputs) */}
      {(showRegModal || showEditModal) && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title">{showRegModal ? "Anular Cobro" : "Editar Anulación de Cobro"}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); setShowEditModal(false); }}></button>
              </div>
              <div className="modal-body">
                {showRegModal ? (
                  <>
                    <div className="mb-2">
                      <label className="fw-bold">No. Correlativo del Cobro:</label>
                      <div className="input-group">
                        <input
                          value={correlativo}
                          onChange={(e) => setCorrelativo(e.target.value)}
                          className="form-control"
                          placeholder="Ejemplo: 41 o referencia de pago"
                        />
                        <button type="button" className="btn btn-outline-primary" onClick={buscarCorrelativo}>Buscar</button>
                      </div>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Pago Detectado:</label>
                      <input
                        value={id_pago_anulado ? `Pago #${id_pago_anulado}` : ''}
                        className="form-control"
                        readOnly
                        placeholder="Busque el correlativo"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Contrato Asociado:</label>
                      <input
                        value={id_contrato ? `Contrato #${id_contrato}` : ''}
                        className="form-control"
                        readOnly
                        placeholder="Busque el correlativo"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Usuario que Autoriza:</label>
                      <select value={id_usuario_autoriza} onChange={(e) => setId_usuario_autoriza(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Gerente/Admin --</option>
                        {usuariosList.map(u => <option key={u.id_usuario} value={u.id_usuario}>{u.usuario}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Monto del Cargo a Revertir (Q):</label>
                      <input type="number" step="0.01" value={monto_anulado} className="form-control" readOnly />
                    </div>
                    {detalleCorrelativo && (
                      <div className="alert alert-info py-2 mb-2">
                        <div><strong>Residente:</strong> {detalleCorrelativo.nombre_residente || 'N/A'}</div>
                        <div><strong>Contrato:</strong> {detalleCorrelativo.codigo_contrato || `#${detalleCorrelativo.id_contrato}`}</div>
                        <div className="mb-1"><strong>Meses a revertir:</strong></div>
                        <div className="d-flex flex-wrap gap-1">
                          {getMesesCorrelativo().length ? (
                            getMesesCorrelativo().map((mes) => (
                              <span key={mes} className="badge bg-primary-subtle text-primary border border-primary-subtle">
                                {mes}
                              </span>
                            ))
                          ) : (
                            <span className="badge bg-secondary">No especificado</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mb-2">
                      <label className="fw-bold">Motivo/Justificación:</label>
                      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="form-control"></textarea>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2">
                      <label className="fw-bold">Mora a Anular:</label>
                      <select value={id_morosidad} onChange={(e) => setId_morosidad(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Morosidad --</option>
                        {morosidadesList.map(m => <option key={m.id_morosidad} value={m.id_morosidad}>ID: {m.id_morosidad} - Monto: Q{m.monto_mora}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Contrato Asociado:</label>
                      <select value={id_contrato} onChange={(e) => setId_contrato(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Contrato --</option>
                        {contratosList.map(c => <option key={c.id_contrato} value={c.id_contrato}>Contrato #{c.id_contrato}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Usuario que Autoriza:</label>
                      <select value={id_usuario_autoriza} onChange={(e) => setId_usuario_autoriza(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Gerente/Admin --</option>
                        {usuariosList.map(u => <option key={u.id_usuario} value={u.id_usuario}>{u.usuario}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Monto a Perdonar (Q):</label>
                      <input type="number" step="0.01" value={monto_anulado} onChange={(e) => setMonto_anulado(e.target.value)} className="form-control" />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Motivo/Justificación:</label>
                      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="form-control"></textarea>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowRegModal(false); setShowEditModal(false); }}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  onClick={showRegModal ? addAnulacion : actualizarAnulacion}
                  disabled={showRegModal && !id_pago_anulado}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnulacionDeuda;