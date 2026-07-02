import React, { useState } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const EstadoCuenta = () => {
  const [busqueda, setBusqueda] = useState('');
  const [listaResidentes, setListaResidentes] = useState([]);
  const [estadoCuenta, setEstadoCuenta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mostrarModalFechas, setMostrarModalFechas] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [idContratoActual, setIdContratoActual] = useState(null);

  // Buscar residente
  const buscarResidente = async () => {
    if (!busqueda.trim()) {
      return alert("Ingresa nombre, DPI, clave o número de contrato para buscar");
    }
    
    setLoading(true);
    try {
      const res = await axios.get(
        `http://localhost:3001/api/estado_cuenta/buscar-residente?criterio=${busqueda}`
      );
      setListaResidentes(res.data);
      setEstadoCuenta(null);
    } catch (error) {
      alert(error.response?.data || "Error al buscar residente");
      setListaResidentes([]);
    } finally {
      setLoading(false);
    }
  };

  // Obtener estado de cuenta
  const obtenerEstadoCuenta = async (id_contrato, fInicio = '', fFin = '') => {
    setLoading(true);
    try {
      let url = `http://localhost:3001/api/estado_cuenta/estado-cuenta/${id_contrato}`;
      if (fInicio && fFin) {
        url += `?fecha_inicio=${fInicio}&fecha_fin=${fFin}`;
      }
      
      const res = await axios.get(url);
      setEstadoCuenta(res.data);
      setListaResidentes([]);
      setMostrarModalFechas(false);
      setFechaInicio('');
      setFechaFin('');
    } catch (error) {
      alert(error.response?.data || "Error al obtener estado de cuenta");
    } finally {
      setLoading(false);
    }
  };

  // Limpiar búsqueda
  const limpiar = () => {
    setBusqueda('');
    setListaResidentes([]);
    setEstadoCuenta(null);
    setFechaInicio('');
    setFechaFin('');
    setMostrarModalFechas(false);
  };

  // Abre modal para filtrar por fechas
  const abrirModalFechas = (id_contrato) => {
    setIdContratoActual(id_contrato);
    setFechaInicio('');
    setFechaFin('');
    setMostrarModalFechas(true);
  };

  // Confirmar y obtener estado de cuenta con fechas
  const confirmarFechas = () => {
    if (!fechaInicio || !fechaFin) {
      return alert("Por favor, selecciona fecha de inicio y fin");
    }
    if (new Date(fechaInicio) > new Date(fechaFin)) {
      return alert("La fecha de inicio debe ser menor o igual a la fecha fin");
    }
    obtenerEstadoCuenta(idContratoActual, fechaInicio, fechaFin);
  };

  // Obtener sin filtro de fechas
  const obtenerSinFiltro = () => {
    obtenerEstadoCuenta(idContratoActual);
  };

  const exportarEstadoCuentaPDF = () => {
    if (!estadoCuenta) {
      return alert('Primero debes cargar un estado de cuenta.');
    }

    try {
      const doc = new jsPDF();
      const fechaImpresion = new Date().toLocaleString();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('ESTADO DE CUENTA DE RESIDENTES', 14, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Fecha de impresión: ${fechaImpresion}`, 14, 25);

      doc.setDrawColor(180);
      doc.line(14, 29, 196, 29);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Datos del Residente', 14, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Nombre: ${estadoCuenta.contrato.nombre || 'N/A'}`, 14, 45);
      doc.text(`DPI: ${estadoCuenta.contrato.dpi || 'N/A'}`, 14, 51);
      doc.text(`Contrato: ${estadoCuenta.contrato.codigo_contrato || 'N/A'}`, 14, 57);
      doc.text(`Tipo de Contrato: ${estadoCuenta.contrato.nombre_tipo_contrato || 'N/A'}`, 14, 63);
      doc.text(`Fecha Firma: ${estadoCuenta.contrato.fecha_firma ? new Date(estadoCuenta.contrato.fecha_firma).toLocaleDateString() : 'N/A'}`, 14, 69);
      doc.text(`Cuotas Pactadas: ${estadoCuenta.contrato.cuotas_pactadas || 'N/A'}`, 14, 75);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Resumen Financiero', 110, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Monto Total del Contrato: Q${parseFloat(estadoCuenta.contrato.monto_total || 0).toFixed(2)}`, 110, 45);
      doc.text(`Monto por Cuota: Q${parseFloat(estadoCuenta.contrato.monto_cuota || 0).toFixed(2)}`, 110, 51);
      doc.text(`Total Pagado: Q${parseFloat(estadoCuenta.totalPagado || 0).toFixed(2)}`, 110, 57);
      doc.text(`Saldo Pendiente: Q${parseFloat(estadoCuenta.saldoPendiente || 0).toFixed(2)}`, 110, 63);

      const pagosRows = (estadoCuenta.pagos || []).map((pago) => ([
        pago.fecha_pago ? new Date(pago.fecha_pago).toLocaleDateString() : 'N/A',
        pago.meses_pagados || 'N/A',
        `Q${parseFloat(pago.total_cobrado || 0).toFixed(2)}`,
        `${pago.cantidad_conceptos || 0} concepto(s)`
      ]));

      autoTable(doc, {
        startY: 84,
        head: [['Fecha de Pago', 'Meses Pagados', 'Monto Pagado', 'Conceptos']],
        body: pagosRows.length ? pagosRows : [['N/A', 'Sin pagos registrados', 'Q0.00', '0 concepto(s)']],
        theme: 'striped',
        headStyles: { fillColor: [33, 37, 41] },
        styles: { fontSize: 10 }
      });

      let yFinal = (doc.lastAutoTable?.finalY || 90) + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Meses Pagados', 14, yFinal);
      yFinal += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const mesesTexto = (estadoCuenta.mesesPagados && estadoCuenta.mesesPagados.length)
        ? estadoCuenta.mesesPagados.join(', ')
        : 'No hay meses pagados registrados.';
      const mesesLines = doc.splitTextToSize(mesesTexto, 180);
      doc.text(mesesLines, 14, yFinal);

      const fileName = `EstadoCuenta_${estadoCuenta.contrato.codigo_contrato || 'residente'}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      alert('No se pudo generar el PDF del estado de cuenta.');
    }
  };

  return (
    <div className="estado-cuenta-view p-4">
      <div className="card w-100 shadow-sm">
        <div className="card-header bg-primary text-white module-header" style={{position: 'sticky', top: 0, zIndex: 100}}>
          <h3 className="mb-0">📋 Estado de Cuenta de Residentes</h3>
        </div>

        <div className="card-body">
          {/* BÚSQUEDA */}
          <div className="row mb-4">
            <div className="col-md-8">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por nombre, DPI, clave o número de contrato..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarResidente()}
              />
            </div>
            <div className="col-md-4 d-flex gap-2">
              <button
                className="btn btn-primary fw-bold flex-grow-1"
                onClick={buscarResidente}
                disabled={loading}
              >
                {loading ? '⏳ Buscando...' : '🔍 Buscar'}
              </button>
              <button
                className="btn btn-secondary fw-bold"
                onClick={limpiar}
              >
                🗑️ Limpiar
              </button>
            </div>
          </div>

          {/* LISTA DE RESIDENTES */}
          {listaResidentes.length > 0 && (
            <div className="mb-4">
              <h5 className="text-secondary">Residentes encontrados:</h5>
              <div className="list-group">
                {listaResidentes.map((residente) => (
                  <button
                    key={residente.id_contrato}
                    className="list-group-item list-group-item-action"
                    onClick={() => abrirModalFechas(residente.id_contrato)}
                  >
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 className="mb-1 fw-bold">{residente.nombre}</h6>
                        <p className="mb-0 small text-muted">
                          DPI: {residente.dpi} | Contrato: {residente.codigo_contrato}
                        </p>
                        <p className="mb-0 small text-muted">
                          Tipo: {residente.nombre_tipo_contrato}
                        </p>
                      </div>
                      <span className="badge bg-info">Ver Estado</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ESTADO DE CUENTA */}
          {estadoCuenta && (
            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">📊 Estado de Cuenta Actual</h5>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={exportarEstadoCuentaPDF}
                  >
                    📄 Exportar PDF
                  </button>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => abrirModalFechas(idContratoActual)}
                  >
                    📅 Cambiar Fechas
                  </button>
                </div>
              </div>
              <div className="row">
                {/* DATOS DEL RESIDENTE */}
                <div className="col-md-6 mb-3">
                  <div className="card border-primary">
                    <div className="card-header bg-primary text-white">
                      <h6 className="mb-0">👤 Datos del Residente</h6>
                    </div>
                    <div className="card-body">
                      <p className="mb-2">
                        <strong>Nombre:</strong> {estadoCuenta.contrato.nombre}
                      </p>
                      <p className="mb-2">
                        <strong>DPI:</strong> {estadoCuenta.contrato.dpi}
                      </p>
                      <p className="mb-2">
                        <strong>Contrato:</strong> {estadoCuenta.contrato.codigo_contrato}
                      </p>
                      <p className="mb-2">
                        <strong>Tipo de Contrato:</strong> {estadoCuenta.contrato.nombre_tipo_contrato}
                      </p>
                      <p className="mb-2">
                        <strong>Fecha Firma:</strong>{' '}
                        {new Date(estadoCuenta.contrato.fecha_firma).toLocaleDateString()}
                      </p>
                      <p className="mb-0">
                        <strong>Cuotas Pactadas:</strong> {estadoCuenta.contrato.cuotas_pactadas}
                      </p>
                    </div>
                  </div>
                </div>

                {/* RESUMEN FINANCIERO */}
                <div className="col-md-6 mb-3">
                  <div className="card border-success">
                    <div className="card-header bg-success text-white">
                      <h6 className="mb-0">💰 Resumen Financiero</h6>
                    </div>
                    <div className="card-body">
                      <p className="mb-2">
                        <strong>Monto Total del Contrato:</strong> Q
                        {parseFloat(estadoCuenta.contrato.monto_total).toFixed(2)}
                      </p>
                      <p className="mb-2">
                        <strong>Monto por Cuota:</strong> Q
                        {parseFloat(estadoCuenta.contrato.monto_cuota).toFixed(2)}
                      </p>
                      <p className="mb-2">
                        <strong>Total Pagado:</strong>{' '}
                        <span className="badge bg-success">
                          Q{estadoCuenta.totalPagado.toFixed(2)}
                        </span>
                      </p>
                      <p className="mb-0">
                        <strong>Saldo Pendiente:</strong>{' '}
                        <span className={`badge ${estadoCuenta.saldoPendiente > 0 ? 'bg-danger' : 'bg-success'}`}>
                          Q{estadoCuenta.saldoPendiente.toFixed(2)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* HISTÓRICO DE PAGOS */}
              <div className="card mt-3">
                <div className="card-header bg-info text-white">
                  <h6 className="mb-0">📊 Histórico de Pagos</h6>
                </div>
                <div className="card-body">
                  {estadoCuenta.pagos.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped table-hover">
                        <thead className="table-dark">
                          <tr>
                            <th>Fecha de Pago</th>
                            <th>Meses Pagados</th>
                            <th>Monto Pagado</th>
                            <th>Conceptos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {estadoCuenta.pagos.map((pago, idx) => (
                            <tr key={idx}>
                              <td>
                                <strong>
                                  {new Date(pago.fecha_pago).toLocaleDateString()}
                                </strong>
                              </td>
                              <td>{pago.meses_pagados}</td>
                              <td>
                                <span className="badge bg-success">
                                  Q{parseFloat(pago.total_cobrado).toFixed(2)}
                                </span>
                              </td>
                              <td>
                                <span className="badge bg-secondary">
                                  {pago.cantidad_conceptos} concepto(s)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="alert alert-warning mb-0">
                      ⚠️ No hay pagos registrados para este residente.
                    </div>
                  )}
                </div>
              </div>

              {/* MESES PAGADOS */}
              <div className="card mt-3">
                <div className="card-header bg-warning">
                  <h6 className="mb-0">📅 Meses Pagados</h6>
                </div>
                <div className="card-body">
                  {estadoCuenta.mesesPagados.length > 0 ? (
                    <div className="d-flex flex-wrap gap-2">
                      {estadoCuenta.mesesPagados.map((mes, idx) => (
                        <span key={idx} className="badge bg-success p-2">
                          {mes}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted mb-0">No hay meses pagados registrados.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ESTADO SIN RESULTADOS */}
          {!loading && !estadoCuenta && listaResidentes.length === 0 && busqueda && (
            <div className="alert alert-info">
              Ingresa los datos de búsqueda y presiona "Buscar" para ver el estado de cuenta.
            </div>
          )}

          {/* MODAL PARA FILTRAR POR FECHAS */}
          {mostrarModalFechas && (
            <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header bg-primary text-white">
                    <h5 className="modal-title">📅 Seleccionar Rango de Fechas</h5>
                    <button 
                      type="button" 
                      className="btn-close btn-close-white"
                      onClick={() => setMostrarModalFechas(false)}
                    ></button>
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label fw-bold">Fecha de Inicio:</label>
                      <input
                        type="date"
                        className="form-control"
                        value={fechaInicio}
                        onChange={(e) => setFechaInicio(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-bold">Fecha Fin:</label>
                      <input
                        type="date"
                        className="form-control"
                        value={fechaFin}
                        onChange={(e) => setFechaFin(e.target.value)}
                      />
                    </div>
                    <div className="alert alert-info small mb-0">
                      💡 Selecciona ambas fechas para filtrar el estado de cuenta o haz clic en "Ver Todo" para todos los pagos.
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setMostrarModalFechas(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-warning"
                      onClick={obtenerSinFiltro}
                      disabled={loading}
                    >
                      {loading ? '⏳ Cargando...' : '📋 Ver Todo'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={confirmarFechas}
                      disabled={loading}
                    >
                      {loading ? '⏳ Cargando...' : '✅ Filtrar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EstadoCuenta;
