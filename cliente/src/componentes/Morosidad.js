import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

function Morosidad() {
  const [id_contrato, setId_contrato] = useState("");
  const [monto_mora, setMonto_mora] = useState("");
  const [dias_retraso, setDias_retraso] = useState("");
  const [estado] = useState("pendiente");
  const [mesesPendientes, setMesesPendientes] = useState([]);
  const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
  const [cargandoMeses, setCargandoMeses] = useState(false);
  
  const [morosidades, setMorosidades] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = `${API_BASE_URL}/api/morosidad`;
  const CONTRATOS_API_URL = `${API_BASE_URL}/api/contratos_residentes`;

  const cargarMesesPendientes = useCallback(async (contratoId) => {
    if (!contratoId) {
      setMesesPendientes([]);
      setMesesSeleccionados([]);
      return;
    }

    setCargandoMeses(true);
    try {
      const res = await Axios.get(`${API_URL}/meses-pendientes`, { params: { id_contrato: contratoId } });
      const lista = Array.isArray(res.data?.meses) ? res.data.meses : [];
      setMesesPendientes(lista);
      setMesesSeleccionados(lista.length ? [lista[0]] : []);
    } catch {
      setMesesPendientes([]);
      setMesesSeleccionados([]);
    } finally {
      setCargandoMeses(false);
    }
  }, [API_URL]);

  const cargarDatos = useCallback(() => Promise.all([
    Axios.get(API_URL)
      .then(res => setMorosidades(res.data || []))
      .catch(() => setMorosidades([])),
    Axios.get(CONTRATOS_API_URL)
      .then(res => setContratos(res.data || []))
      .catch(() => setContratos([]))
  ]), [API_URL, CONTRATOS_API_URL]);

  useEffect(() => { 
    Axios.post(`${API_URL}/generar-automatico`)
      .catch(() => null)
      .finally(() => {
        cargarDatos();
      });
  }, [API_URL, cargarDatos]);

  useEffect(() => {
    if (showModal) {
      cargarMesesPendientes(id_contrato);
    }
  }, [showModal, id_contrato, cargarMesesPendientes]);

  const contratoPorId = new Map((contratos || []).map((c) => [String(c.id_contrato), c]));

  const getLabelContrato = (idContrato) => {
    const contrato = contratoPorId.get(String(idContrato));
    if (!contrato) {
      return `Contrato #${idContrato}`;
    }

    const codigo = contrato.codigo_contrato || `#${contrato.id_contrato}`;
    const residente = contrato.nombre_residente || 'Sin residente';
    const identificacion = contrato.numero_identificacion ? ` · ${contrato.numero_identificacion}` : '';
    return `${codigo} - ${residente}${identificacion}`;
  };

  const actualizarEstado = (id, nuevoEstado) => {
    Axios.put(`${API_URL}/actualizar-estado`, { id_morosidad: id, estado: nuevoEstado })
    .then(() => {
        cargarDatos();
        Swal.fire({ icon: "success", title: "Estado Actualizado", timer: 1500, showConfirmButton: false });
    });
  };

  const addMora = async () => {
    if (!id_contrato) {
      Swal.fire({ icon: 'warning', title: 'Selecciona un contrato' });
      return;
    }

    if (!mesesSeleccionados.length) {
      Swal.fire({ icon: 'warning', title: 'Selecciona al menos un mes pendiente' });
      return;
    }

    try {
      await Promise.all(mesesSeleccionados.map((mes_atrasado) => Axios.post(`${API_URL}/crear`, {
        id_contrato,
        mes_atrasado,
        monto_mora,
        dias_retraso,
        estado
      })));

      await cargarDatos();
      setShowModal(false);
      setId_contrato("");
      setMesesPendientes([]);
      setMesesSeleccionados([]);
      setMonto_mora("");
      setDias_retraso("");
      Swal.fire("Agregado", "Mora generada manualmente", "success");
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo aplicar la mora',
        text: error?.response?.data?.detail || error?.response?.data?.message || 'Revisa el contrato y los meses seleccionados'
      });
    }
  };

  const toggleMesSeleccionado = (mes) => {
    setMesesSeleccionados((actuales) => {
      if (actuales.includes(mes)) {
        return actuales.filter((item) => item !== mes);
      }

      return [...actuales, mes];
    });
  };

  // Paginación (sin filtro)
  // eslint-disable-next-line no-unused-vars
  const { paginatedItems: morosidadesPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(morosidades, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="d-flex justify-content-between align-items-center bg-light p-3">
        <h4>CONTROL DE MOROSIDAD</h4>
        <button className="btn btn-warning fw-bold" onClick={() => setShowModal(true)}>➕ GENERAR MORA</button>
      </div>
      </div>
      
      <table className="table table-bordered shadow-sm">
        <thead className="table-danger">
          <tr>
            <th>ID MORA</th>
            <th>CONTRATO ASIGNADO</th>
            <th>MES ATRASADO</th>
            <th>DÍAS RETRASO</th>
            <th>MONTO PENALIZACIÓN</th>
            <th>ESTADO</th>
            <th>CAMBIAR ESTADO</th>
          </tr>
        </thead>
        <tbody>
          {morosidades.map((val) => (
            <tr key={val.id_morosidad}>
              <td>#{val.id_morosidad}</td>
              <td>{getLabelContrato(val.id_contrato)}</td>
              <td>{val.mes_atrasado}</td>
              <td>{val.dias_retraso} días</td>
              <td className="fw-bold">Q{val.monto_mora}</td>
              <td>
                <span className={`badge bg-${val.estado === 'pagado' ? 'success' : val.estado === 'anulado' ? 'dark' : 'danger'}`}>
                  {val.estado.toUpperCase()}
                </span>
              </td>
              <td>
                <select className="form-select form-select-sm" value={val.estado} onChange={(e) => actualizarEstado(val.id_morosidad, e.target.value)}>
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="anulado">Anulado</option>
                </select>
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
        itemsCount={morosidades.length}
      />

      {/* MODAL CREAR MORA MANUAL */}
      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content border-danger">
              <div className="modal-header bg-danger text-white"><h5 className="modal-title">Aplicar Mora Manual</h5></div>
              <div className="modal-body">
                <select className="form-select mb-2" value={id_contrato} onChange={e => setId_contrato(e.target.value)}>
                  <option value="">-- Contrato a Penalizar --</option>
                  {contratos.map(c => (
                    <option key={c.id_contrato} value={c.id_contrato}>
                      {getLabelContrato(c.id_contrato)}
                    </option>
                  ))}
                </select>
                <div className="border rounded p-2 mb-2 bg-light">
                  <div className="fw-bold mb-2">Meses pendientes</div>
                  {cargandoMeses ? (
                    <div className="text-muted">Cargando meses pendientes...</div>
                  ) : mesesPendientes.length ? (
                    <div className="d-grid gap-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {mesesPendientes.map((mes) => (
                        <label key={mes} className="form-check d-flex align-items-center gap-2 mb-0">
                          <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={mesesSeleccionados.includes(mes)}
                            onChange={() => toggleMesSeleccionado(mes)}
                          />
                          <span className="form-check-label">{mes}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted">No hay meses pendientes para este contrato.</div>
                  )}
                </div>
                <input type="number" placeholder="Días de Retraso" className="form-control mb-2" onChange={e => setDias_retraso(e.target.value)} />
                <input type="number" step="0.01" placeholder="Monto Penalización (Q)" className="form-control mb-2" onChange={e => setMonto_mora(e.target.value)} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cerrar</button>
                <button className="btn btn-danger" onClick={addMora}>Aplicar Cargo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Morosidad;