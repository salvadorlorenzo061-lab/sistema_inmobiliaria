import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Axios from 'axios';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'bootstrap/dist/css/bootstrap.min.css';
import { API_BASE_URL } from '../config';

const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const formatMoney = (value) => `Q ${Number(value || 0).toFixed(2)}`;
const normalizeFileSegment = (value = '') => String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '_');

function AsignarCorrelativo() {
  const [usuariosList, setUsuariosList] = useState([]);
  const [resolucionesList, setResolucionesList] = useState([]);
  const [asignacionesList, setAsignacionesList] = useState([]);

  const [idUsuario, setIdUsuario] = useState('');
  const [idResolucion, setIdResolucion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [observaciones, setObservaciones] = useState('');

  const [tipoCuadre, setTipoCuadre] = useState('dia');
  const [fechaCuadre, setFechaCuadre] = useState(getToday());
  const [periodoMes, setPeriodoMes] = useState(getCurrentMonth());
  const [reporte, setReporte] = useState(null);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [loadError, setLoadError] = useState('');

  const API_URL = `${API_BASE_URL}/api/asignar_correlativo`;

  const resolucionesActivas = useMemo(() => (
    resolucionesList.filter((item) => String(item.estado || '').toLowerCase() === 'activo')
  ), [resolucionesList]);

  const cargarCatalogos = useCallback(async () => {
    const [usuariosRes, resolucionesRes] = await Promise.allSettled([
      Axios.get(`${API_BASE_URL}/api/usuarios`),
      Axios.get(`${API_BASE_URL}/api/resoluciones_facturas`)
    ]);

    if (usuariosRes.status === 'fulfilled') {
      setUsuariosList(usuariosRes.value?.data || []);
    } else {
      setUsuariosList([]);
    }

    if (resolucionesRes.status === 'fulfilled') {
      setResolucionesList(resolucionesRes.value?.data || []);
    } else {
      setResolucionesList([]);
    }

    if (usuariosRes.status === 'rejected' || resolucionesRes.status === 'rejected') {
      throw new Error('No se pudieron cargar los catálogos del módulo. Verifica que el backend tenga habilitadas las rutas necesarias.');
    }
  }, []);

  const cargarAsignaciones = useCallback(async () => {
    const res = await Axios.get(API_URL);
    setAsignacionesList(res.data || []);
  }, [API_URL]);

  useEffect(() => {
    const cargarInicial = async () => {
      try {
        setLoadError('');
        await cargarCatalogos();
        await cargarAsignaciones();
      } catch (error) {
        console.error('Error cargando módulo Asignar Correlativos:', error);
        setLoadError(error?.message || 'No se pudo cargar el módulo de asignación de correlativos.');
      }
    };

    cargarInicial();
  }, [cargarCatalogos, cargarAsignaciones]);

  const limpiarFormulario = () => {
    setIdUsuario('');
    setIdResolucion('');
    setCantidad('1');
    setObservaciones('');
  };

  const asignarLote = async () => {
    if (!idUsuario || !idResolucion || !cantidad) {
      Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Selecciona usuario, resolución y cantidad.' });
      return;
    }

    try {
      const response = await Axios.post(`${API_URL}/crear`, {
        id_usuario: idUsuario,
        id_resolucion: idResolucion,
        cantidad: Number(cantidad),
        observaciones
      });

      await cargarAsignaciones();
      limpiarFormulario();
      Swal.fire({
        icon: 'success',
        title: 'Lote asignado',
        html: `Rango reservado: <strong>${response?.data?.correlativo_inicio || ''}</strong> a <strong>${response?.data?.correlativo_fin || ''}</strong>`
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo asignar el lote',
        text: error?.response?.data?.message || 'Error interno del servidor.'
      });
    }
  };

  const cerrarAsignacion = async (item) => {
    const result = await Swal.fire({
      icon: 'question',
      title: 'Cerrar asignación',
      text: `Se cerrará el lote ${item.correlativo_inicio_display} a ${item.correlativo_fin_display}.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      await Axios.put(`${API_URL}/cerrar/${item.id_asignacion}`);
      await cargarAsignaciones();
      Swal.fire({ icon: 'success', title: 'Asignación cerrada' });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'No se pudo cerrar', text: error?.response?.data?.message || 'Error interno del servidor.' });
    }
  };

  const consultarCuadre = async () => {
    const query = tipoCuadre === 'dia'
      ? `fecha=${encodeURIComponent(fechaCuadre)}`
      : `periodo=${encodeURIComponent(periodoMes)}`;

    setLoadingReporte(true);
    try {
      const endpoint = tipoCuadre === 'dia' ? 'cuadre-dia' : 'cuadre-mes';
      const response = await Axios.get(`${API_URL}/${endpoint}?${query}`);
      setReporte(response.data || null);
    } catch (error) {
      setReporte(null);
      Swal.fire({ icon: 'error', title: 'No se pudo generar el cuadre', text: error?.response?.data?.message || 'Error interno del servidor.' });
    } finally {
      setLoadingReporte(false);
    }
  };

  const exportarCuadrePdf = () => {
    if (!reporte) {
      Swal.fire({ icon: 'warning', title: 'Sin reporte', text: 'Primero genera el cuadre a exportar.' });
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });
    const titulo = `Cuadre ${reporte.scope === 'dia' ? 'del Dia' : 'del Mes'} - ${reporte.periodo}`;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(titulo, 14, 16);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Facturas: ${reporte.total_general?.total_facturas || 0}`, 14, 24);
    doc.text(`Subtotal: ${formatMoney(reporte.total_general?.subtotal)}`, 70, 24);
    doc.text(`IVA: ${formatMoney(reporte.total_general?.iva_total)}`, 130, 24);
    doc.text(`Total: ${formatMoney(reporte.total_general?.total_cobrado)}`, 180, 24);
    doc.text(`Correlativo inicial: ${reporte.total_general?.correlativo_inicial || 'N/A'}`, 14, 31);
    doc.text(`Correlativo final: ${reporte.total_general?.correlativo_final || 'N/A'}`, 110, 31);

    autoTable(doc, {
      startY: 38,
      head: [['Usuario', 'Facturas', 'Correlativo inicial', 'Correlativo final', 'Subtotal', 'IVA', 'Total']],
      body: (reporte.resumen_por_usuario || []).map((item) => ([
        item.nombre_usuario || `Usuario #${item.id_usuario}`,
        item.total_facturas || 0,
        item.correlativo_inicial || 'N/A',
        item.correlativo_final || 'N/A',
        formatMoney(item.subtotal),
        formatMoney(item.iva_total),
        formatMoney(item.total_cobrado)
      ])),
      theme: 'striped',
      headStyles: { fillColor: [33, 37, 41] },
      styles: { fontSize: 9 }
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Fecha', 'Usuario', 'Correlativo', 'Forma de pago', 'Subtotal', 'IVA', 'Mora', 'Total']],
      body: (reporte.detalle_facturas || []).map((item) => ([
        item.fecha_pago ? new Date(item.fecha_pago).toLocaleString() : 'N/A',
        item.nombre_usuario || 'N/A',
        item.no_referencia || 'N/A',
        item.forma_pago || 'N/A',
        formatMoney(item.subtotal),
        formatMoney(item.iva_total),
        formatMoney(item.monto_mora),
        formatMoney(item.total_cobrado)
      ])),
      theme: 'grid',
      headStyles: { fillColor: [13, 110, 253] },
      styles: { fontSize: 8 }
    });

    doc.save(`cuadre_${reporte.scope}_${normalizeFileSegment(reporte.periodo)}.pdf`);
  };

  const exportarCuadreExcel = () => {
    if (!reporte) {
      Swal.fire({ icon: 'warning', title: 'Sin reporte', text: 'Primero genera el cuadre a exportar.' });
      return;
    }

    const lineas = [];
    lineas.push(['Cuadre', reporte.scope === 'dia' ? 'Dia' : 'Mes', reporte.periodo].join(','));
    lineas.push(['Total facturas', reporte.total_general?.total_facturas || 0].join(','));
    lineas.push(['Correlativo inicial', reporte.total_general?.correlativo_inicial || 'N/A'].join(','));
    lineas.push(['Correlativo final', reporte.total_general?.correlativo_final || 'N/A'].join(','));
    lineas.push(['Subtotal', Number(reporte.total_general?.subtotal || 0).toFixed(2)].join(','));
    lineas.push(['IVA total', Number(reporte.total_general?.iva_total || 0).toFixed(2)].join(','));
    lineas.push(['Mora total', Number(reporte.total_general?.monto_mora || 0).toFixed(2)].join(','));
    lineas.push(['Total cobrado', Number(reporte.total_general?.total_cobrado || 0).toFixed(2)].join(','));
    lineas.push('');
    lineas.push('Resumen por usuario');
    lineas.push(['Usuario', 'Facturas', 'Correlativo inicial', 'Correlativo final', 'Subtotal', 'IVA', 'Total'].join(','));
    (reporte.resumen_por_usuario || []).forEach((item) => {
      lineas.push([
        `"${String(item.nombre_usuario || `Usuario #${item.id_usuario}`).replace(/"/g, '""')}"`,
        item.total_facturas || 0,
        `"${String(item.correlativo_inicial || 'N/A').replace(/"/g, '""')}"`,
        `"${String(item.correlativo_final || 'N/A').replace(/"/g, '""')}"`,
        Number(item.subtotal || 0).toFixed(2),
        Number(item.iva_total || 0).toFixed(2),
        Number(item.total_cobrado || 0).toFixed(2)
      ].join(','));
    });
    lineas.push('');
    lineas.push('Detalle de facturas');
    lineas.push(['Fecha', 'Usuario', 'Correlativo', 'Forma de pago', 'Subtotal', 'IVA', 'Mora', 'Total'].join(','));
    (reporte.detalle_facturas || []).forEach((item) => {
      lineas.push([
        `"${String(item.fecha_pago ? new Date(item.fecha_pago).toLocaleString() : 'N/A').replace(/"/g, '""')}"`,
        `"${String(item.nombre_usuario || 'N/A').replace(/"/g, '""')}"`,
        `"${String(item.no_referencia || 'N/A').replace(/"/g, '""')}"`,
        `"${String(item.forma_pago || 'N/A').replace(/"/g, '""')}"`,
        Number(item.subtotal || 0).toFixed(2),
        Number(item.iva_total || 0).toFixed(2),
        Number(item.monto_mora || 0).toFixed(2),
        Number(item.total_cobrado || 0).toFixed(2)
      ].join(','));
    });

    const blob = new Blob([`\uFEFF${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cuadre_${reporte.scope}_${normalizeFileSegment(reporte.periodo)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="container mt-4">
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm mb-4">
          <div className="col-md-7">
            <h3 className="m-0 fw-bold text-dark">ASIGNAR CORRELATIVOS Y CUADRES</h3>
            <div className="text-muted small mt-1">Reserva lotes por cobrador y controla el total cobrado por día o por mes.</div>
          </div>
          <div className="col-md-5 text-end">
            <button className="btn btn-dark fw-bold" onClick={consultarCuadre} disabled={loadingReporte}>
              {loadingReporte ? 'CONSULTANDO...' : 'ACTUALIZAR CUADRE'}
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="alert alert-warning fw-bold" role="alert">
          {loadError}
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-primary text-white fw-bold">Asignación de Lote</div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label fw-bold">Usuario que cobrará</label>
                <select className="form-select" value={idUsuario} onChange={(e) => setIdUsuario(e.target.value)}>
                  <option value="">-- Seleccione usuario --</option>
                  {usuariosList.map((item) => (
                    <option key={item.id_usuario} value={item.id_usuario}>{item.nombre} - {item.correo}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-bold">Resolución activa</label>
                <select className="form-select" value={idResolucion} onChange={(e) => setIdResolucion(e.target.value)}>
                  <option value="">-- Seleccione resolución --</option>
                  {resolucionesActivas.map((item) => (
                    <option key={item.id_resolucion} value={item.id_resolucion}>
                      {item.numero_resolucion} | {item.serie} | {item.correlativo_actual} a {item.rango_final}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-bold">Cantidad de correlativos</label>
                <input type="number" min="1" className="form-control" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </div>

              <div className="mb-3">
                <label className="form-label fw-bold">Observaciones</label>
                <textarea className="form-control" rows="3" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: lote asignado para cobros del turno de mañana" />
              </div>

              <div className="d-flex gap-2">
                <button className="btn btn-primary fw-bold" onClick={asignarLote}>ASIGNAR LOTE</button>
                <button className="btn btn-outline-secondary" onClick={limpiarFormulario}>LIMPIAR</button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-secondary text-white fw-bold">Lotes Asignados</div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-striped table-bordered m-0 align-middle">
                  <thead className="table-dark">
                    <tr>
                      <th>Usuario</th>
                      <th>Resolución</th>
                      <th>Rango</th>
                      <th>Siguiente</th>
                      <th>Disponibles</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asignacionesList.length ? asignacionesList.map((item) => (
                      <tr key={item.id_asignacion}>
                        <td>
                          <div className="fw-bold">{item.nombre_usuario}</div>
                          <div className="small text-muted">{item.correo}</div>
                        </td>
                        <td>
                          <div>{item.numero_resolucion}</div>
                          <div className="small text-muted">{item.nombre_empresa || 'Sin empresa'}</div>
                        </td>
                        <td>
                          <div>{item.correlativo_inicio_display}</div>
                          <div className="small text-muted">hasta {item.correlativo_fin_display}</div>
                        </td>
                        <td>{item.correlativo_actual_display || 'Consumido'}</td>
                        <td>{item.correlativos_disponibles}</td>
                        <td>
                          <span className={`badge ${item.estado === 'activo' ? 'bg-success' : item.estado === 'agotado' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                            {String(item.estado || '').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {item.estado === 'activo' ? (
                            <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => cerrarAsignacion(item)}>CERRAR</button>
                          ) : (
                            <span className="text-muted small">Sin acción</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="7" className="text-center text-muted py-4">No hay lotes asignados todavía.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm border-0 mt-4">
        <div className="card-header bg-info text-dark fw-bold">Cuadre de Cobros</div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label fw-bold">Tipo de cuadre</label>
              <select className="form-select" value={tipoCuadre} onChange={(e) => setTipoCuadre(e.target.value)}>
                <option value="dia">Cuadre del día</option>
                <option value="mes">Cuadre del mes</option>
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label fw-bold">Fecha del cuadre</label>
              <input type="date" className="form-control" value={fechaCuadre} onChange={(e) => setFechaCuadre(e.target.value)} disabled={tipoCuadre !== 'dia'} />
            </div>

            <div className="col-md-3">
              <label className="form-label fw-bold">Mes del cuadre</label>
              <input type="month" className="form-control" value={periodoMes} onChange={(e) => setPeriodoMes(e.target.value)} disabled={tipoCuadre !== 'mes'} />
            </div>

            <div className="col-md-3">
              <button className="btn btn-info fw-bold text-dark w-100" onClick={consultarCuadre} disabled={loadingReporte}>
                {loadingReporte ? 'GENERANDO...' : 'GENERAR REPORTE'}
              </button>
            </div>
          </div>

          {reporte && (
            <div className="d-flex gap-2 flex-wrap mt-3">
              <button className="btn btn-outline-danger fw-bold" onClick={exportarCuadrePdf}>EXPORTAR PDF</button>
              <button className="btn btn-outline-success fw-bold" onClick={exportarCuadreExcel}>EXPORTAR EXCEL</button>
            </div>
          )}

          {reporte && (
            <>
              <div className="row g-3 mt-3">
                <div className="col-md-3">
                  <div className="border rounded p-3 bg-light h-100">
                    <div className="text-muted small">Facturas cobradas</div>
                    <div className="fs-4 fw-bold">{reporte.total_general?.total_facturas || 0}</div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="border rounded p-3 bg-light h-100">
                    <div className="text-muted small">Subtotal cobrado</div>
                    <div className="fs-5 fw-bold text-primary">{formatMoney(reporte.total_general?.subtotal)}</div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="border rounded p-3 bg-light h-100">
                    <div className="text-muted small">IVA total</div>
                    <div className="fs-5 fw-bold text-warning">{formatMoney(reporte.total_general?.iva_total)}</div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="border rounded p-3 bg-light h-100">
                    <div className="text-muted small">Total general cobrado</div>
                    <div className="fs-5 fw-bold text-success">{formatMoney(reporte.total_general?.total_cobrado)}</div>
                  </div>
                </div>
              </div>

              <div className="row g-3 mt-1">
                <div className="col-md-6">
                  <div className="alert alert-secondary mb-0">
                    <strong>Correlativo inicial:</strong> {reporte.total_general?.correlativo_inicial || 'N/A'}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="alert alert-secondary mb-0">
                    <strong>Correlativo final:</strong> {reporte.total_general?.correlativo_final || 'N/A'}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h5 className="fw-bold">Totales por usuario</h5>
                <div className="table-responsive">
                  <table className="table table-bordered table-striped align-middle">
                    <thead className="table-dark">
                      <tr>
                        <th>Usuario</th>
                        <th>Facturas</th>
                        <th>Correlativo inicial</th>
                        <th>Correlativo final</th>
                        <th>Subtotal</th>
                        <th>IVA</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporte.resumen_por_usuario?.length ? reporte.resumen_por_usuario.map((item) => (
                        <tr key={`${item.id_usuario}-${item.correlativo_inicial || 'na'}`}>
                          <td>{item.nombre_usuario || `Usuario #${item.id_usuario}`}</td>
                          <td>{item.total_facturas}</td>
                          <td>{item.correlativo_inicial || 'N/A'}</td>
                          <td>{item.correlativo_final || 'N/A'}</td>
                          <td>{formatMoney(item.subtotal)}</td>
                          <td>{formatMoney(item.iva_total)}</td>
                          <td className="fw-bold text-success">{formatMoney(item.total_cobrado)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="7" className="text-center text-muted py-3">No hay cobros en el período seleccionado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4">
                <h5 className="fw-bold">Detalle de facturas cobradas</h5>
                <div className="table-responsive">
                  <table className="table table-bordered table-striped align-middle">
                    <thead className="table-dark">
                      <tr>
                        <th>Fecha</th>
                        <th>Usuario</th>
                        <th>Correlativo</th>
                        <th>Forma de pago</th>
                        <th>Subtotal</th>
                        <th>IVA</th>
                        <th>Mora</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporte.detalle_facturas?.length ? reporte.detalle_facturas.map((item) => (
                        <tr key={item.id_pago}>
                          <td>{new Date(item.fecha_pago).toLocaleString()}</td>
                          <td>{item.nombre_usuario || 'N/A'}</td>
                          <td>{item.no_referencia || 'N/A'}</td>
                          <td>{item.forma_pago || 'N/A'}</td>
                          <td>{formatMoney(item.subtotal)}</td>
                          <td>{formatMoney(item.iva_total)}</td>
                          <td>{formatMoney(item.monto_mora)}</td>
                          <td className="fw-bold text-success">{formatMoney(item.total_cobrado)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="8" className="text-center text-muted py-3">No se encontraron facturas para el período consultado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AsignarCorrelativo;