import { useState, useEffect } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

function Morosidad() {
  const [morosidades, setMorosidades] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
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

  const normalizarTexto = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const morosidadesFiltradas = morosidades.filter((mora) => {
    const termino = normalizarTexto(busqueda.trim());
    const coincideBusqueda = !termino || [
      mora.nombre_residente,
      mora.dpi,
      mora.numero_identificacion,
      mora.id_residente,
      mora.id_contrato,
      mora.codigo_contrato,
      mora.id_morosidad
    ].some((valor) => normalizarTexto(valor).includes(termino));
    const coincideEstado = estadoFiltro === 'todos'
      || normalizarTexto(mora.estado) === estadoFiltro;

    return coincideBusqueda && coincideEstado;
  });

  const cambiarFiltro = (actualizador) => {
    actualizador();
    setCurrentPage(1);
  };

  const generarPDF = () => {
    if (!morosidadesFiltradas.length) {
      Swal.fire({ icon: 'info', title: 'Sin información', text: 'No hay registros para generar el PDF.' });
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const empresa = morosidadesFiltradas.find((mora) => mora.nombre_empresa)?.nombre_empresa || 'Sin empresa registrada';
    const nitEmpresa = morosidadesFiltradas.find((mora) => mora.nit_empresa)?.nit_empresa || '';
    const fecha = new Date().toLocaleDateString('es-GT');

    doc.setFontSize(16);
    doc.text('CONTROL DE MOROSIDAD', 14, 16);
    doc.setFontSize(10);
    doc.text(`Empresa: ${empresa}${nitEmpresa ? ` | NIT: ${nitEmpresa}` : ''}`, 14, 23);
    doc.text(`Fecha: ${fecha}`, 14, 29);
    doc.text(`Filtro: ${busqueda.trim() || 'Todos'} | Estado: ${estadoFiltro === 'todos' ? 'Todos' : estadoFiltro.toUpperCase()}`, 14, 35);

    autoTable(doc, {
      startY: 41,
      head: [['ID', 'CLIENTE', 'DPI / ID', 'CONTRATO', 'MES ATRASADO', 'DÍAS', 'MONTO', 'ESTADO', 'EMPRESA']],
      body: morosidadesFiltradas.map((mora) => [
        `#${mora.id_morosidad}`,
        mora.nombre_residente || 'Sin nombre',
        mora.dpi || mora.numero_identificacion || mora.id_residente || 'Sin dato',
        mora.codigo_contrato ? `#${mora.codigo_contrato}` : `#${mora.id_contrato}`,
        mora.mes_atrasado || '',
        `${mora.dias_retraso || 0}`,
        `Q${Number(mora.monto_mora || 0).toFixed(2)}`,
        String(mora.estado || 'pendiente').toUpperCase(),
        mora.nombre_empresa || 'Sin empresa'
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [190, 55, 65] },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.text(`Página ${data.pageNumber}`, 260, 202);
      }
    });

    doc.save(`control-morosidad-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const { paginatedItems: morosidadesPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(morosidadesFiltradas, currentPage, itemsPerPage);

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="d-flex justify-content-between align-items-center bg-light p-3">
        <h4>CONTROL DE MOROSIDAD</h4>
        <button className="btn btn-warning fw-bold" onClick={generarMoraAutomatica} disabled={procesando}>
          {procesando ? 'Generando...' : '⚙️ GENERAR MORA AUTOMATICA'}
        </button>
        <button className="btn btn-danger fw-bold ms-2" onClick={generarPDF}>
          📄 GENERAR PDF
        </button>
      </div>
      </div>

      <div className="row g-2 my-3">
        <div className="col-md-8">
          <label className="form-label fw-bold" htmlFor="buscar-morosidad">Buscar cliente</label>
          <input
            id="buscar-morosidad"
            type="search"
            className="form-control"
            placeholder="Nombre, apellido, DPI, ID de cliente, contrato o ID de mora"
            value={busqueda}
            onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label fw-bold" htmlFor="estado-morosidad">Estado</label>
          <select
            id="estado-morosidad"
            className="form-select"
            value={estadoFiltro}
            onChange={(e) => cambiarFiltro(() => setEstadoFiltro(e.target.value))}
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
            <option value="anulado">Anulado</option>
          </select>
        </div>
      </div>
      
      <table className="table table-bordered shadow-sm">
        <thead className="table-danger">
          <tr>
            <th>ID MORA</th>
            <th>CONTRATO ASIGNADO</th>
            <th>CLIENTE</th>
            <th>EMPRESA</th>
            <th>MES ATRASADO</th>
            <th>DÍAS RETRASO</th>
            <th>MONTO PENALIZACIÓN</th>
            <th>ESTADO</th>
            <th>CAMBIAR ESTADO</th>
          </tr>
        </thead>
        <tbody>
          {morosidadesPaginadas.map((val) => (
            <tr key={val.id_morosidad}>
              <td>#{val.id_morosidad}</td>
              <td>Contrato #{val.id_contrato}</td>
              <td>{val.nombre_residente || 'Sin nombre'}<br /><small>DPI: {val.dpi || val.numero_identificacion || 'Sin dato'}</small></td>
              <td>{val.nombre_empresa || 'Sin empresa'}</td>
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
        itemsCount={morosidadesFiltradas.length}
      />
    </div>
  );
}
export default Morosidad;