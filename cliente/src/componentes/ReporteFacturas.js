import React, { useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';

const ReporteFacturas = () => {
  const [criterio, setCriterio] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [estado, setEstado] = useState('TODAS');
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);

  const mostrarToast = (mensaje, icon = 'info') => Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title: mensaje,
    showConfirmButton: false,
    timer: 2600
  });

  const buscarFacturas = async () => {
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      mostrarToast('La fecha inicial no puede ser posterior a la fecha final.', 'warning');
      return;
    }

    setCargando(true);
    setBusquedaRealizada(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/pagos_detalle/reporte-facturas`, {
        params: {
          criterio: criterio.trim(),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          estado
        }
      });
      setFacturas(Array.isArray(data) ? data : []);
    } catch (error) {
      setFacturas([]);
      mostrarToast(error?.response?.data?.message || 'No se pudo consultar la reportería de facturas.', 'error');
    } finally {
      setCargando(false);
    }
  };

  const limpiar = () => {
    setCriterio('');
    setFechaInicio('');
    setFechaFin('');
    setEstado('TODAS');
    setFacturas([]);
    setBusquedaRealizada(false);
  };

  const abrirFactura = (factura) => {
    const params = new URLSearchParams({
      buscar: String(factura?.id_pago || ''),
      estado: String(factura?.estado_factura || 'EMITIDA').toUpperCase()
    });
    window.location.href = `/pagos_detalle?${params.toString()}`;
  };

  return (
    <div className="container mt-4">
      <div className="module-header">
        <div className="row align-items-center bg-light p-3 rounded shadow-sm">
          <div className="col-lg-4">
            <h3 className="m-0 text-dark fw-bold">REPORTE DE FACTURAS</h3>
          </div>
          <div className="col-lg-8 text-lg-end text-muted">
            Facturas emitidas y anuladas
          </div>
        </div>
      </div>

      <div className="border rounded shadow-sm bg-white p-3 mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-lg-5">
            <label className="form-label fw-bold">Residente, identificación o documento</label>
            <input
              type="search"
              className="form-control"
              placeholder="Nombre, apellido, ID, DPI, factura o contrato..."
              value={criterio}
              onChange={(e) => setCriterio(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarFacturas()}
            />
          </div>
          <div className="col-md-3 col-lg-2">
            <label className="form-label fw-bold">Desde</label>
            <input type="date" className="form-control" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="col-md-3 col-lg-2">
            <label className="form-label fw-bold">Hasta</label>
            <input type="date" className="form-control" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
          <div className="col-md-3 col-lg-1">
            <label className="form-label fw-bold">Estado</label>
            <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="TODAS">Todas</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
          <div className="col-md-3 col-lg-2 d-flex gap-2">
            <button type="button" className="btn btn-primary flex-grow-1" onClick={buscarFacturas} disabled={cargando}>
              {cargando ? 'Buscando...' : 'Buscar'}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={limpiar}>Limpiar</button>
          </div>
        </div>
      </div>

      {facturas.length > 0 && (
        <div className="table-responsive border rounded shadow-sm" style={{ maxHeight: '620px' }}>
          <table className="table table-striped table-bordered align-middle mb-0">
            <thead className="table-dark position-sticky top-0">
              <tr>
                <th>Cuota / Mes</th>
                <th>Factura</th>
                <th>Fecha</th>
                <th>Residente</th>
                <th>Identificación</th>
                <th>Contrato</th>
                <th>Estado</th>
                <th className="text-end">Total</th>
                <th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((factura) => (
                <tr key={`${factura.id_pago}-${factura.estado_factura}`}>
                  <td>
                    {factura.cuota_inicio != null ? `Cuota ${factura.cuota_inicio}` : 'Cuota 0'}
                    <div className="small text-muted">{factura.meses_pagados || 'Sin mes registrado'}</div>
                  </td>
                  <td>{factura.correlativo || `Pago #${factura.id_pago}`}</td>
                  <td>{factura.fecha_evento ? new Date(factura.fecha_evento).toLocaleDateString('es-GT') : 'N/A'}</td>
                  <td>{factura.nombre_residente || 'N/A'}</td>
                  <td>{factura.numero_identificacion || factura.dpi || 'N/A'}</td>
                  <td>{factura.codigo_contrato || 'N/A'}</td>
                  <td>
                    <span className={`badge ${String(factura.estado_factura).toUpperCase() === 'ANULADA' ? 'bg-danger' : 'bg-success'}`}>
                      {factura.estado_factura}
                    </span>
                  </td>
                  <td className="text-end fw-bold">Q{Number(factura.total_documento || 0).toFixed(2)}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => abrirFactura(factura)}>
                      Ver PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && busquedaRealizada && facturas.length === 0 && (
        <div className="alert alert-light border text-center text-muted">No hay facturas para los filtros seleccionados.</div>
      )}
    </div>
  );
};

export default ReporteFacturas;
