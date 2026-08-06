import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

function Morosidad() {
  const [morosidades, setMorosidades] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const API_URL = `${API_BASE_URL}/api/morosidad`;

  const cargarMorosidades = () => {
    Axios.get(API_URL).then(res => setMorosidades(res.data));
  };

  useEffect(() => {
    const inicializarMorosidad = async () => {
      try {
        await Axios.post(`${API_URL}/generar-automatico`);
      } catch (_error) {
        // Si falla la generacion, igual cargamos listado para no bloquear la pantalla.
      } finally {
        cargarMorosidades();
      }
    };

    inicializarMorosidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actualizarEstado = (id, nuevoEstado) => {
    Axios.put(`${API_URL}/actualizar-estado`, { id_morosidad: id, estado: nuevoEstado })
    .then(() => {
        cargarMorosidades();
        Swal.fire({ icon: "success", title: "Estado Actualizado", timer: 1500, showConfirmButton: false });
    });
  };

  const generarMoraAutomatica = async () => {
    if (procesando) return;

    setProcesando(true);
    try {
      const res = await Axios.post(`${API_URL}/generar-automatico`);
      await cargarMorosidades();

      const generadas = Number(res?.data?.generated || 0);
      Swal.fire({
        icon: 'success',
        title: 'Mora actualizada',
        text: generadas > 0
          ? `Se generaron ${generadas} mora(s) vencida(s).`
          : 'No se generaron moras nuevas. Todo esta al dia o aun no vence.'
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error?.response?.data?.message || 'No se pudo generar la mora automatica.'
      });
    } finally {
      setProcesando(false);
    }
  };

  // Paginación (sin filtro)
  // eslint-disable-next-line no-unused-vars
  const { paginatedItems: morosidadesPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(morosidades, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="d-flex justify-content-between align-items-center bg-light p-3">
        <h4>CONTROL DE MOROSIDAD</h4>
        <button className="btn btn-warning fw-bold" onClick={generarMoraAutomatica} disabled={procesando}>
          {procesando ? 'Generando...' : '⚙️ GENERAR MORA AUTOMATICA'}
        </button>
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
              <td>Contrato #{val.id_contrato}</td>
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
    </div>
  );
}
export default Morosidad;