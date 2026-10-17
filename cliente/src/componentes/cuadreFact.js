import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import './cuadreFact.css';

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fechaInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const moneda = (v) => `Q ${Number(v || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rango = (tipo) => {
  const hoy = new Date(); const inicio = new Date(hoy); const fin = new Date(hoy);
  if (tipo === 'semana') { inicio.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); fin.setDate(inicio.getDate() + 6); }
  if (tipo === 'quincena') { inicio.setDate(hoy.getDate() <= 15 ? 1 : 16); fin.setDate(hoy.getDate() <= 15 ? 15 : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()); }
  if (tipo === 'mes') { inicio.setDate(1); fin.setDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()); }
  return { inicio: fechaInput(inicio), fin: fechaInput(fin) };
};
const estadoBadge = (e) => (String(e).toUpperCase() === 'ANULADA' ? 'cf-badge cf-badge--anulada' : 'cf-badge cf-badge--emitida');

export default function CuadreFact() {
  const API = `${API_BASE_URL}/api/cuadre_fact`;
  const [periodo, setPeriodo] = useState('dia');
  const [inicio, setInicio] = useState(hoyLocal());
  const [fin, setFin] = useState(hoyLocal());
  const [estado, setEstado] = useState('todas');
  const [idUsuario, setIdUsuario] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [reporte, setReporte] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargarHistorial = useCallback(async () => {
    try { const { data } = await axios.get(`${API}/historial`); setHistorial(Array.isArray(data) ? data : []); } catch { setHistorial([]); }
  }, [API]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/usuarios`).then(({ data }) => setUsuarios(Array.isArray(data) ? data : [])).catch(() => setUsuarios([]));
    cargarHistorial();
  }, [cargarHistorial]);

  const cambiarPeriodo = (valor) => { setPeriodo(valor); const r = rango(valor); setInicio(r.inicio); setFin(r.fin); };

  const consultar = async () => {
    if (!inicio || !fin || inicio > fin) return Swal.fire('Rango inválido', 'Revise las fechas del cuadre.', 'warning');
    setCargando(true);
    try {
      const { data } = await axios.get(`${API}/reporte`, { params: { fecha_inicio: inicio, fecha_fin: fin, estado, id_usuario: idUsuario || undefined } });
      setReporte(data);
    } catch (error) {
      setReporte(null);
      Swal.fire('No se pudo generar el cuadre', error?.response?.data?.message || 'Error del servidor.', 'error');
    } finally { setCargando(false); }
  };

  const crearPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const nombreUsuario = usuario.nombre || 'N/A';
    const ahora = new Date().toLocaleString('es-GT');

    doc.setFillColor(20, 45, 65);
    doc.rect(0, 0, 279, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('CUADRE DE FACTURACIÓN POR USUARIO', 140, 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Generado: ${ahora}  |  Generado por: ${nombreUsuario}`, 14, 20);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.text(`Período: ${reporte.fecha_inicio} al ${reporte.fecha_fin}  |  Estado: ${String(estado).toUpperCase()}`, 14, 32);

    autoTable(doc, {
      startY: 36,
      head: [['Métrica', 'Valor']],
      body: [
        ['Facturas emitidas', String(reporte.totales.emitidas)],
        ['Facturas anuladas', String(reporte.totales.anuladas)],
        ['Total emitido', moneda(reporte.totales.total_emitido)],
        ['Total anulado', moneda(reporte.totales.total_anulado)],
        ['Neto cobrado', moneda(reporte.totales.neto)]
      ],
      styles: { fontSize: 9, cellPadding: 1.6 },
      headStyles: { fillColor: [23, 162, 184] },
      margin: { left: 14 }
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 7,
      head: [['Usuario cobrador', 'Emitidas', 'Anuladas', 'Corr. inicial', 'Corr. final', 'Emitido', 'Anulado', 'Neto']],
      body: reporte.resumen_usuarios.map((x) => [
        x.nombre_usuario, x.emitidas, x.anuladas,
        x.correlativo_inicial || 'N/A', x.correlativo_final || 'N/A',
        moneda(x.total_emitido), moneda(x.total_anulado), moneda(x.neto)
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 45, 65] },
      columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } }
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 7,
      head: [['Fecha', 'Usuario', 'Correlativo', 'Estado', 'Forma de pago', 'Total']],
      body: reporte.detalle.map((x) => [
        new Date(x.fecha_evento).toLocaleString('es-GT'),
        x.nombre_usuario, x.correlativo, x.estado_factura, x.forma_pago, moneda(x.total_cobrado)
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [23, 162, 184] },
      columnStyles: { 5: { halign: 'right' } }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${i} de ${pageCount}`, 270, 210, { align: 'right' });
    }
    return doc;
  };

  const guardarPdf = async () => {
    if (!reporte) return;
    setGuardando(true);
    try {
      const doc = crearPdf();
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      await axios.post(`${API}/historial`, {
        id_usuario_generador: usuario.id_usuario,
        fecha_inicio: inicio, fecha_fin: fin,
        filtro_estado: estado, filtro_usuario: idUsuario || null,
        reporte, pdf_base64: doc.output('datauristring').split(',')[1]
      });
      doc.save(`CuadreFacturacion_${inicio}_${fin}.pdf`);
      await cargarHistorial();
      Swal.fire('Guardado', 'El cuadre se guardó en el historial y se descargó el PDF.', 'success');
    } catch (error) {
      Swal.fire('Error', error?.response?.data?.message || 'No se pudo guardar el PDF.', 'error');
    } finally { setGuardando(false); }
  };

  const descargarHistorico = async (item) => {
    try {
      const { data } = await axios.get(`${API}/historial/${item.id_cuadre}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = `CuadreFacturacion_${item.id_cuadre}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { Swal.fire('Error', 'No se pudo descargar el PDF histórico.', 'error'); }
  };

  const totales = useMemo(() => reporte?.totales || { emitidas: 0, anuladas: 0, total_emitido: 0, total_anulado: 0, neto: 0 }, [reporte]);

  return (
    <div className="container mt-4 cf-root">
      <div className="card shadow-sm border-0 cf-card">
        <div className="cf-header">
          <div>
            <h4 className="mb-0">Cuadre de Facturación por Usuario</h4>
            <small>Cierre diario, semanal, quincenal y mensual por gestor de cobro</small>
          </div>
        </div>

        <div className="card-body">
          <div className="cf-filtros">
            <div className="cf-campo">
              <label>Período</label>
              <select className="form-select" value={periodo} onChange={(e) => cambiarPeriodo(e.target.value)}>
                <option value="dia">Diario</option>
                <option value="semana">Semanal</option>
                <option value="quincena">Quincenal</option>
                <option value="mes">Mensual</option>
              </select>
            </div>
            <div className="cf-campo">
              <label>Estado</label>
              <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="todas">Emitidas y anuladas</option>
                <option value="emitida">Solo emitidas</option>
                <option value="anulada">Solo anuladas</option>
              </select>
            </div>
            <div className="cf-campo">
              <label>Usuario cobrador</label>
              <select className="form-select" value={idUsuario} onChange={(e) => setIdUsuario(e.target.value)}>
                <option value="">Todos los usuarios</option>
                {usuarios.map((u) => <option key={u.id_usuario} value={u.id_usuario}>{u.nombre}</option>)}
              </select>
            </div>
            <div className="cf-campo">
              <label>Fecha inicio</label>
              <input type="date" className="form-control" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="cf-campo">
              <label>Fecha fin</label>
              <input type="date" className="form-control" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
            <div className="cf-acciones">
              <button className="btn btn-info fw-bold" onClick={consultar} disabled={cargando}>
                {cargando ? 'CONSULTANDO…' : 'GENERAR REPORTE'}
              </button>
              <button className="btn btn-outline-secondary fw-bold" onClick={() => setVerHistorial(!verHistorial)}>
                HISTORIAL ({historial.length})
              </button>
            </div>
          </div>

          {verHistorial && (
            <div className="table-responsive mt-3">
              <table className="table table-sm table-striped align-middle">
                <thead className="table-light">
                  <tr><th>Generado</th><th>Rango</th><th>Usuario</th><th className="text-end">PDF</th></tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id_cuadre}>
                      <td>{new Date(h.fecha_generacion).toLocaleString('es-GT')}</td>
                      <td>{String(h.fecha_inicio).slice(0, 10)} al {String(h.fecha_fin).slice(0, 10)}</td>
                      <td>{h.generado_por}</td>
                      <td className="text-end"><button className="btn btn-sm btn-danger" onClick={() => descargarHistorico(h)}>Descargar PDF</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reporte && (
            <>
              <div className="cf-kpis">
                <div className="cf-kpi cf-kpi--emitidas"><span>Emitidas</span><b>{totales.emitidas}</b></div>
                <div className="cf-kpi cf-kpi--anuladas"><span>Anuladas</span><b>{totales.anuladas}</b></div>
                <div className="cf-kpi cf-kpi--emitido"><span>Total emitido</span><b>{moneda(totales.total_emitido)}</b></div>
                <div className="cf-kpi cf-kpi--anulado"><span>Total anulado</span><b>{moneda(totales.total_anulado)}</b></div>
                <div className="cf-kpi cf-kpi--neto"><span>Neto cobrado</span><b>{moneda(totales.neto)}</b></div>
              </div>

              <div className="d-flex gap-2 mb-3">
                <button className="btn btn-danger fw-bold" onClick={guardarPdf} disabled={guardando}>
                  {guardando ? 'GUARDANDO…' : 'Guardar y descargar PDF'}
                </button>
              </div>

              <h6 className="cf-subtitulo">Resumen por usuario cobrador</h6>
              <div className="table-responsive">
                <table className="table table-bordered table-hover align-middle cf-tabla">
                  <thead>
                    <tr>
                      <th>Usuario</th><th className="text-center">Emitidas</th><th className="text-center">Anuladas</th>
                      <th>Corr. inicial</th><th>Corr. final</th>
                      <th className="text-end">Emitido</th><th className="text-end">Anulado</th><th className="text-end">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.resumen_usuarios.length === 0 && (
                      <tr><td colSpan="8" className="text-center text-muted py-4">No se encontraron facturas en el período seleccionado.</td></tr>
                    )}
                    {reporte.resumen_usuarios.map((x) => (
                      <tr key={x.id_usuario}>
                        <td className="fw-semibold">{x.nombre_usuario}</td>
                        <td className="text-center">{x.emitidas}</td>
                        <td className="text-center">{x.anuladas}</td>
                        <td>{x.correlativo_inicial || 'N/A'}</td>
                        <td>{x.correlativo_final || 'N/A'}</td>
                        <td className="text-end">{moneda(x.total_emitido)}</td>
                        <td className="text-end">{moneda(x.total_anulado)}</td>
                        <td className="text-end fw-bold">{moneda(x.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h6 className="cf-subtitulo mt-4">Detalle de facturas</h6>
              <div className="table-responsive">
                <table className="table table-striped table-hover align-middle cf-tabla">
                  <thead>
                    <tr><th>Fecha</th><th>Usuario</th><th>Correlativo</th><th>Estado</th><th>Forma de pago</th><th className="text-end">Total</th></tr>
                  </thead>
                  <tbody>
                    {reporte.detalle.length === 0 && (
                      <tr><td colSpan="6" className="text-center text-muted py-4">Sin movimientos.</td></tr>
                    )}
                    {reporte.detalle.map((x, i) => (
                      <tr key={`${x.id_pago}-${x.estado_factura}-${i}`}>
                        <td>{new Date(x.fecha_evento).toLocaleString('es-GT')}</td>
                        <td>{x.nombre_usuario}</td>
                        <td className="fw-semibold">{x.correlativo}</td>
                        <td><span className={estadoBadge(x.estado_factura)}>{x.estado_factura}</span></td>
                        <td>{x.forma_pago}</td>
                        <td className={`text-end fw-bold ${Number(x.total_cobrado) < 0 ? 'text-danger' : ''}`}>{moneda(x.total_cobrado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
