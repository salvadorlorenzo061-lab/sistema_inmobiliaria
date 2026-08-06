import { useEffect, useMemo, useState } from 'react';
import Axios from 'axios';
import Swal from 'sweetalert2';
import 'bootstrap/dist/css/bootstrap.min.css';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

const resolverEstadoVisualConvenio = (item = {}) => {
  const saldoActual = Number(item?.saldo_actual || 0);
  const estadoActual = String(item?.estado || '').trim().toLowerCase();

  if (estadoActual === 'anulado') return 'anulado';
  if (estadoActual === 'incumplido') return 'incumplido';
  if (saldoActual <= 0 || estadoActual === 'pagado' || estadoActual === 'cumplido') return 'pagado';
  if (estadoActual === 'pendiente' || estadoActual === 'activo') return 'pendiente';
  return estadoActual || 'pendiente';
};

const getBadgeEstadoConvenio = (estadoVisual = '') => {
  if (estadoVisual === 'pagado') return 'success';
  if (estadoVisual === 'anulado') return 'dark';
  if (estadoVisual === 'incumplido') return 'danger';
  return 'warning';
};

function Convenio() {
  const [id_convenio, setIdConvenio] = useState('');
  const [id_contrato, setIdContrato] = useState('');
  const [fecha_convenio, setFechaConvenio] = useState(() => new Date().toISOString().slice(0, 10));
  const [monto_original, setMontoOriginal] = useState('');
  const [saldo_actual, setSaldoActual] = useState('');
  const [cuotas_pactadas, setCuotasPactadas] = useState('12');
  const [monto_cuota, setMontoCuota] = useState('');
  const [fecha_inicio, setFechaInicio] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [estado, setEstado] = useState('pendiente');

  const [convenios, setConvenios] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [esEdicion, setEsEdicion] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaResidente, setBusquedaResidente] = useState('');
  const [resultadosResidentes, setResultadosResidentes] = useState([]);
  const [residenteSeleccionado, setResidenteSeleccionado] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 10;
  const API_URL = `${API_BASE_URL}/api/convenio`;

  const cargarConvenios = () => {
    Axios.get(API_URL)
      .then((res) => setConvenios(Array.isArray(res.data) ? res.data : []))
      .catch(() => setConvenios([]));
  };

  useEffect(() => {
    cargarConvenios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const montoOriginalNum = Number(monto_original || 0);
    const cuotasNum = Number(cuotas_pactadas || 0);
    if (montoOriginalNum > 0 && cuotasNum > 0) {
      setMontoCuota((montoOriginalNum / cuotasNum).toFixed(2));
    } else {
      setMontoCuota('');
    }
  }, [monto_original, cuotas_pactadas]);

  const limpiarFormulario = () => {
    setIdConvenio('');
    setIdContrato('');
    setFechaConvenio(new Date().toISOString().slice(0, 10));
    setMontoOriginal('');
    setSaldoActual('');
    setCuotasPactadas('12');
    setMontoCuota('');
    setFechaInicio('');
    setObservaciones('');
    setEstado('pendiente');
    setBusquedaResidente('');
    setResultadosResidentes([]);
    setResidenteSeleccionado(null);
    setEsEdicion(false);
  };

  const abrirCrear = () => {
    limpiarFormulario();
    setShowModal(true);
  };

  const abrirEditar = (item) => {
    setIdConvenio(String(item.id_convenio || ''));
    setIdContrato(String(item.id_contrato || ''));
    setFechaConvenio(item.fecha_convenio ? String(item.fecha_convenio).slice(0, 10) : new Date().toISOString().slice(0, 10));
    setMontoOriginal(String(item.monto_original ?? ''));
    setSaldoActual(String(item.saldo_actual ?? ''));
    setCuotasPactadas(String(item.cuotas_pactadas ?? '1'));
    setMontoCuota(String(item.monto_cuota ?? ''));
    setFechaInicio(item.fecha_inicio ? String(item.fecha_inicio).slice(0, 10) : '');
    setObservaciones(String(item.observaciones || ''));
    setEstado(String(item.estado || 'pendiente'));
    setBusquedaResidente(`${item.nombre_residente || ''} · ${item.codigo_contrato || `#${item.id_contrato}`}`);
    setResultadosResidentes([]);
    setResidenteSeleccionado({
      id_contrato: item.id_contrato,
      nombre: item.nombre_residente,
      codigo_contrato: item.codigo_contrato,
      numero_identificacion: item.numero_identificacion
    });
    setEsEdicion(true);
    setShowModal(true);
  };

  const buscarResidenteContrato = async () => {
    if (!busquedaResidente.trim()) {
      Swal.fire({ icon: 'warning', title: 'Escribe un criterio para buscar' });
      return;
    }

    try {
      const res = await Axios.get(`${API_URL}/buscar-residente?criterio=${encodeURIComponent(busquedaResidente.trim())}`);
      const lista = Array.isArray(res.data) ? res.data : [];
      setResultadosResidentes(lista);
      if (!lista.length) {
        Swal.fire({ icon: 'info', title: 'Sin resultados', text: 'No se encontraron contratos activos para ese criterio.' });
      }
    } catch (error) {
      setResultadosResidentes([]);
      Swal.fire({
        icon: 'error',
        title: 'Error en la busqueda',
        text: error?.response?.data?.message || 'No se pudo consultar residentes.'
      });
    }
  };

  const seleccionarResidenteContrato = (item) => {
    setIdContrato(String(item.id_contrato || ''));
    setResidenteSeleccionado(item);
    setBusquedaResidente(`${item.nombre || ''} · ${item.codigo_contrato || `#${item.id_contrato}`}`);
    setResultadosResidentes([]);

    const montoBase = Number(item.monto_total || 0);
    if (montoBase > 0) {
      setMontoOriginal(String(montoBase.toFixed(2)));
      setSaldoActual(String(montoBase.toFixed(2)));
    }
  };

  const guardarConvenio = async () => {
    if (!id_contrato) {
      Swal.fire({ icon: 'warning', title: 'Debe seleccionar un contrato' });
      return;
    }

    const payload = {
      id_convenio,
      id_contrato,
      fecha_convenio,
      monto_original,
      saldo_actual,
      cuotas_pactadas,
      monto_cuota,
      fecha_inicio: fecha_inicio || null,
      observaciones,
      estado
    };

    try {
      if (esEdicion) {
        await Axios.put(`${API_URL}/actualizar`, payload);
      } else {
        await Axios.post(`${API_URL}/crear`, payload);
      }

      await cargarConvenios();
      setShowModal(false);
      limpiarFormulario();
      Swal.fire({
        icon: 'success',
        title: esEdicion ? 'Convenio actualizado' : 'Convenio registrado',
        timer: 1800,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: error?.response?.data?.message || 'Error de servidor al guardar convenio.'
      });
    }
  };

  const cambiarEstadoConvenio = async (item, nuevoEstado) => {
    const confirm = await Swal.fire({
      icon: 'question',
      title: `Cambiar estado a ${nuevoEstado.toUpperCase()}?`,
      text: `Convenio #${item.id_convenio}`,
      showCancelButton: true,
      confirmButtonText: 'Si, continuar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
      await Axios.put(`${API_URL}/cambiar-estado/${item.id_convenio}`, { estado: nuevoEstado });
      await cargarConvenios();
      Swal.fire({ icon: 'success', title: 'Estado actualizado', timer: 1600, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'Error', text: error?.response?.data?.message || 'No se pudo actualizar el estado.' });
    }
  };

  const eliminarConvenio = async (item) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Eliminar convenio?',
      text: `Convenio #${item.id_convenio}`,
      showCancelButton: true,
      confirmButtonText: 'Si, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
      await Axios.delete(`${API_URL}/eliminar/${item.id_convenio}`);
      await cargarConvenios();
      Swal.fire({ icon: 'success', title: 'Convenio eliminado', timer: 1600, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'Error', text: error?.response?.data?.message || 'No se pudo eliminar el convenio.' });
    }
  };

  const imprimirConvenioPdf = (item) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const fechaEmision = new Date();
      const montoOriginalNum = Number(item?.monto_original || 0);
      const saldoActualNum = Number(item?.saldo_actual || 0);
      const cuotasNum = Math.max(Number(item?.cuotas_pactadas || 0), 0);
      const cuotaNum = Number(item?.monto_cuota || 0);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('CONVENIO DE PAGOS - INMOBILIARIA', 14, 16);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Documento: CONV-${String(item?.id_convenio || 'N/A').padStart(6, '0')}`, 14, 23);
      doc.text(`Fecha emision: ${fechaEmision.toLocaleDateString('es-GT')}`, 14, 28);
      doc.text(`Estado: ${String(item?.estado || 'activo').toUpperCase()}`, 14, 33);

      doc.text(`Contrato: ${item?.codigo_contrato || `#${item?.id_contrato || 'N/A'}`}`, 110, 23);
      doc.text(`Residente: ${item?.nombre_residente || 'N/A'}`, 110, 28);
      doc.text(`Identificacion: ${item?.numero_identificacion || 'N/A'}`, 110, 33);

      autoTable(doc, {
        startY: 40,
        head: [['Campo', 'Valor']],
        body: [
          ['Fecha convenio', item?.fecha_convenio ? new Date(item.fecha_convenio).toLocaleDateString('es-GT') : 'N/A'],
          ['Fecha inicio pagos', item?.fecha_inicio ? new Date(item.fecha_inicio).toLocaleDateString('es-GT') : 'N/A'],
          ['Monto original', `Q${montoOriginalNum.toFixed(2)}`],
          ['Saldo actual', `Q${saldoActualNum.toFixed(2)}`],
          ['Cuotas pactadas', String(cuotasNum || 0)],
          ['Monto por cuota', `Q${cuotaNum.toFixed(2)}`],
          ['Observaciones', String(item?.observaciones || 'Sin observaciones')]
        ],
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80] },
        styles: { fontSize: 10 }
      });

      if (cuotasNum > 0 && cuotaNum > 0) {
        const planRows = [];
        let saldoProyectado = montoOriginalNum;
        for (let i = 1; i <= cuotasNum; i += 1) {
          const pagoCuota = Math.min(cuotaNum, Math.max(saldoProyectado, 0));
          saldoProyectado = Math.max(saldoProyectado - pagoCuota, 0);
          planRows.push([
            String(i),
            `Q${pagoCuota.toFixed(2)}`,
            `Q${saldoProyectado.toFixed(2)}`
          ]);
        }

        autoTable(doc, {
          startY: (doc.lastAutoTable?.finalY || 45) + 8,
          head: [['Cuota No.', 'Pago estimado', 'Saldo proyectado']],
          body: planRows,
          theme: 'striped',
          headStyles: { fillColor: [23, 162, 184] },
          styles: { fontSize: 9 }
        });
      }

      const finalY = (doc.lastAutoTable?.finalY || 200) + 20;
      doc.setFont('Helvetica', 'normal');
      doc.text('Firma residente: ________________________________', 14, Math.min(finalY, 250));
      doc.text('Firma representante: _____________________________', 110, Math.min(finalY, 250));

      doc.save(`Convenio_${item?.id_convenio || 'NUEVO'}.pdf`);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo generar PDF',
        text: 'Ocurrio un error al preparar el documento del convenio.'
      });
    }
  };

  const listaFiltrada = useMemo(() => {
    const criterio = String(busqueda || '').toLowerCase().trim();
    if (!criterio) return convenios;

    return convenios.filter((item) => {
      const texto = [
        item.id_convenio,
        item.codigo_contrato,
        item.nombre_residente,
        item.numero_identificacion,
        item.estado,
        item.observaciones
      ].join(' ').toLowerCase();

      return texto.includes(criterio);
    });
  }, [busqueda, convenios]);

  const { paginatedItems, totalPages, startIndex, endIndex } = getPaginatedData(listaFiltrada, currentPage, itemsPerPage);

  return (
    <div className="container mt-4">
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm mb-3">
          <div className="col-md-4">
            <h4 className="fw-bold m-0">CONVENIO DE PAGOS</h4>
          </div>
          <div className="col-md-5">
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por convenio, contrato o residente..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="col-md-3 text-end">
            <button className="btn btn-primary fw-bold w-100" onClick={abrirCrear}>➕ NUEVO CONVENIO</button>
          </div>
        </div>
      </div>

      <table className="table table-bordered table-striped shadow-sm align-middle">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>CONTRATO</th>
            <th>RESIDENTE</th>
            <th>FECHA CONVENIO</th>
            <th>MONTO ORIGINAL</th>
            <th>SALDO ACTUAL</th>
            <th>CUOTAS</th>
            <th>CUOTA</th>
            <th>ESTADO</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.length ? paginatedItems.map((item) => (
            <tr key={item.id_convenio}>
              <td>#{item.id_convenio}</td>
              <td>
                {item.codigo_contrato || `#${item.id_contrato}`}
                <br />
                <small className="text-muted">Contrato #{item.id_contrato}</small>
              </td>
              <td>
                <div className="fw-bold">{item.nombre_residente || 'Sin residente'}</div>
                <small className="text-muted">{item.numero_identificacion || 'Sin clave'}</small>
              </td>
              <td>{item.fecha_convenio ? new Date(item.fecha_convenio).toLocaleDateString('es-GT') : '-'}</td>
              <td className="fw-bold text-primary">Q{Number(item.monto_original || 0).toFixed(2)}</td>
              <td className="fw-bold text-danger">Q{Number(item.saldo_actual || 0).toFixed(2)}</td>
              <td>{item.cuotas_pactadas}</td>
              <td>Q{Number(item.monto_cuota || 0).toFixed(2)}</td>
              <td>
                <span className={`badge bg-${getBadgeEstadoConvenio(resolverEstadoVisualConvenio(item))}`}>
                  {resolverEstadoVisualConvenio(item).toUpperCase()}
                </span>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-sm btn-warning fw-bold me-1" onClick={() => abrirEditar(item)}>EDITAR</button>
                <button className="btn btn-sm btn-info fw-bold me-1" onClick={() => imprimirConvenioPdf(item)}>PDF</button>
                <button className="btn btn-sm btn-success fw-bold me-1" onClick={() => cambiarEstadoConvenio(item, 'pagado')}>PAGADO</button>
                <button className="btn btn-sm btn-warning fw-bold me-1" onClick={() => cambiarEstadoConvenio(item, 'pendiente')}>PENDIENTE</button>
                <button className="btn btn-sm btn-secondary fw-bold me-1" onClick={() => cambiarEstadoConvenio(item, 'anulado')}>ANULAR</button>
                <button className="btn btn-sm btn-danger fw-bold" onClick={() => eliminarConvenio(item)}>ELIMINAR</button>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan="10" className="text-center text-muted py-3">No hay convenios registrados.</td>
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
        itemsCount={listaFiltrada.length}
      />

      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header bg-primary text-white">
                <h5 className="fw-bold m-0">{esEdicion ? 'Editar Convenio de Pago' : 'Nuevo Convenio de Pago'}</h5>
              </div>
              <div className="modal-body row">
                <div className="col-md-9 mb-2">
                  <label className="form-label fw-bold">Buscar Residente / Contrato:</label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Nombre, DPI, clave o codigo contrato"
                      value={busquedaResidente}
                      onChange={(e) => setBusquedaResidente(e.target.value)}
                    />
                    <button className="btn btn-outline-primary" onClick={buscarResidenteContrato}>Buscar</button>
                  </div>
                </div>
                <div className="col-md-3 mb-2">
                  <label className="form-label fw-bold">Contrato:</label>
                  <input type="text" className="form-control bg-light" readOnly value={id_contrato || ''} />
                </div>

                {resultadosResidentes.length > 0 && (
                  <div className="col-12 mb-3">
                    <div className="border rounded p-2 bg-light" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      {resultadosResidentes.map((item) => (
                        <button
                          key={`${item.id_contrato}-${item.id_residente}`}
                          type="button"
                          className="btn btn-outline-secondary btn-sm w-100 text-start mb-2"
                          onClick={() => seleccionarResidenteContrato(item)}
                        >
                          <strong>{item.nombre}</strong> · {item.numero_identificacion || 'Sin clave'}
                          <br />
                          <small>{item.codigo_contrato || `Contrato #${item.id_contrato}`} · {item.nombre_tipo_contrato || 'Tipo no definido'}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {residenteSeleccionado && (
                  <div className="col-12 mb-3">
                    <div className="alert alert-info mb-0">
                      Convenio para: <strong>{residenteSeleccionado.nombre}</strong>
                      {' · '}
                      {residenteSeleccionado.codigo_contrato || `Contrato #${residenteSeleccionado.id_contrato}`}
                    </div>
                  </div>
                )}

                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Fecha Convenio:</label>
                  <input type="date" className="form-control" value={fecha_convenio} onChange={(e) => setFechaConvenio(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Monto Original (Q):</label>
                  <input type="number" className="form-control" value={monto_original} onChange={(e) => setMontoOriginal(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Saldo Actual (Q):</label>
                  <input type="number" className="form-control" value={saldo_actual} onChange={(e) => setSaldoActual(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Cuotas Pactadas:</label>
                  <input type="number" min="1" className="form-control" value={cuotas_pactadas} onChange={(e) => setCuotasPactadas(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Monto Cuota (Auto):</label>
                  <input type="text" className="form-control bg-light" readOnly value={monto_cuota} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Fecha Inicio Pago:</label>
                  <input type="date" className="form-control" value={fecha_inicio} onChange={(e) => setFechaInicio(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Estado:</label>
                  <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="activo">Activo</option>
                    <option value="cumplido">Cumplido</option>
                    <option value="incumplido">Incumplido</option>
                    <option value="anulado">Anulado</option>
                  </select>
                </div>
                <div className="col-md-8 mb-3">
                  <label className="form-label fw-bold">Observaciones:</label>
                  <textarea className="form-control" rows="2" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary fw-bold" onClick={guardarConvenio}>{esEdicion ? 'Actualizar Convenio' : 'Guardar Convenio'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Convenio;
