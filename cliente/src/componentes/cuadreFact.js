import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import './cuadreFact.css';

const fechaInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const moneda = (v) => `Q ${Number(v || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rangoPeriodo = (tipo) => {
  const hoy = new Date(); const inicio = new Date(hoy); const fin = new Date(hoy);
  if (tipo === 'semana') { inicio.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7)); fin.setDate(inicio.getDate() + 6); }
  if (tipo === 'quincena') { inicio.setDate(hoy.getDate() <= 15 ? 1 : 16); fin.setDate(hoy.getDate() <= 15 ? 15 : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()); }
  if (tipo === 'mes') { inicio.setDate(1); fin.setDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()); }
  return { inicio: fechaInput(inicio), fin: fechaInput(fin) };
};

const PERIODOS = [
  { key: 'dia', etiqueta: 'DIARIO' },
  { key: 'semana', etiqueta: 'SEMANAL' },
  { key: 'quincena', etiqueta: 'QUINCENAL' },
  { key: 'mes', etiqueta: 'MENSUAL' }
];

const filaInicial = (key) => ({ periodo: key, idUsuario: '', ...rangoPeriodo(key), cargando: false });

export default function CuadreFact() {
  const API = `${API_BASE_URL}/api/cuadre_fact`;
  const [usuarios, setUsuarios] = useState([]);
  const [filas, setFilas] = useState(() => PERIODOS.map((p) => filaInicial(p.key)));
  const [historial, setHistorial] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);

  const cargarHistorial = useCallback(async () => {
    try { const { data } = await axios.get(`${API}/historial`); setHistorial(Array.isArray(data) ? data : []); } catch { setHistorial([]); }
  }, [API]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/usuarios`).then(({ data }) => setUsuarios(Array.isArray(data) ? data : [])).catch(() => setUsuarios([]));
    cargarHistorial();
  }, [cargarHistorial]);

  const actualizarFila = (key, cambios) => {
    setFilas((prev) => prev.map((f) => (f.periodo === key ? { ...f, ...cambios } : f)));
  };

  const reiniciarFechas = (key) => {
    actualizarFila(key, rangoPeriodo(key));
  };

  const nombrePersona = (idUsuario) => {
    if (!idUsuario) return 'TODOS LOS USUARIOS';
    const u = usuarios.find((x) => String(x.id_usuario) === String(idUsuario));
    return (u?.nombre || `Usuario #${idUsuario}`).toUpperCase();
  };

  const crearPdf = ({ reporte, periodoEtiqueta, personaTexto }) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const ahora = new Date().toLocaleString('es-GT');
    const emitidas = reporte.detalle.filter((x) => String(x.estado_factura).toUpperCase() !== 'ANULADA');
    const anuladas = reporte.detalle.filter((x) => String(x.estado_factura).toUpperCase() === 'ANULADA');

    doc.setFillColor(20, 45, 65);
    doc.rect(0, 0, 279, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(`CUADRE DE FACTURACIÓN ${periodoEtiqueta}`, 140, 10, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Generado: ${ahora}  |  Generado por: ${usuario.nombre || 'N/A'}`, 14, 19);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(`Persona: ${personaTexto}   |   Período: ${reporte.fecha_inicio} al ${reporte.fecha_fin}`, 14, 31);

    autoTable(doc, {
      startY: 35,
      head: [['Emitidas', 'Anuladas', 'Total emitido', 'Total anulado', 'Neto cobrado']],
      body: [[
        String(reporte.totales.emitidas),
        String(reporte.totales.anuladas),
        moneda(reporte.totales.total_emitido),
        moneda(reporte.totales.total_anulado),
        moneda(reporte.totales.neto)
      ]],
      styles: { fontSize: 10, halign: 'center', fontStyle: 'bold' },
      headStyles: { fillColor: [23, 162, 184], halign: 'center' }
    });

    if (reporte.resumen_usuarios.length > 1) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
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
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 81, 50);
    doc.text(`FACTURAS EMITIDAS (${emitidas.length})`, 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Fecha', 'Usuario', 'Correlativo', 'Forma de pago', 'Total']],
      body: emitidas.length
        ? emitidas.map((x) => [new Date(x.fecha_evento).toLocaleString('es-GT'), x.nombre_usuario, x.correlativo, x.forma_pago, moneda(x.total_cobrado)])
        : [['—', 'Sin facturas emitidas en el período', '—', '—', '—']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [25, 135, 84] },
      columnStyles: { 4: { halign: 'right' } }
    });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(132, 32, 41);
    doc.text(`FACTURAS ANULADAS (${anuladas.length})`, 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Fecha anulación', 'Usuario', 'Correlativo', 'Motivo', 'Monto anulado']],
      body: anuladas.length
        ? anuladas.map((x) => [new Date(x.fecha_evento).toLocaleString('es-GT'), x.nombre_usuario, x.correlativo, 'Documento anulado', moneda(Math.abs(Number(x.total_cobrado || 0)))])
        : [['—', 'Sin facturas anuladas en el período', '—', '—', '—']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 53, 69] },
      columnStyles: { 4: { halign: 'right' } }
    });

    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${i} de ${totalPaginas}`, 270, 210, { align: 'right' });
    }
    return doc;
  };

  const imprimirReporte = async (fila) => {
    if (!fila.inicio || !fila.fin || fila.inicio > fila.fin) {
      return Swal.fire('Rango inválido', 'Revise las fechas del cuadre.', 'warning');
    }
    actualizarFila(fila.periodo, { cargando: true });
    try {
      const { data } = await axios.get(`${API}/reporte`, {
        params: { fecha_inicio: fila.inicio, fecha_fin: fila.fin, estado: 'todas', id_usuario: fila.idUsuario || undefined }
      });
      if (!data.detalle.length) {
        return Swal.fire('Sin movimientos', 'No hay facturas emitidas ni anuladas en ese rango.', 'info');
      }
      const etiqueta = PERIODOS.find((p) => p.key === fila.periodo)?.etiqueta || '';
      const doc = crearPdf({ reporte: data, periodoEtiqueta: etiqueta, personaTexto: nombrePersona(fila.idUsuario) });
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      axios.post(`${API}/historial`, {
        id_usuario_generador: usuario.id_usuario,
        fecha_inicio: fila.inicio, fecha_fin: fila.fin,
        filtro_estado: 'todas', filtro_usuario: fila.idUsuario || null,
        reporte: data, pdf_base64: doc.output('datauristring').split(',')[1]
      }).then(cargarHistorial).catch(() => {});
      doc.save(`Cuadre_${etiqueta}_${fila.inicio}_${fila.fin}.pdf`);
    } catch (error) {
      Swal.fire('No se pudo generar el cuadre', error?.response?.data?.message || 'Error del servidor.', 'error');
    } finally {
      actualizarFila(fila.periodo, { cargando: false });
    }
  };

  const descargarHistorico = async (item) => {
    try {
      const { data } = await axios.get(`${API}/historial/${item.id_cuadre}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = `CuadreFacturacion_${item.id_cuadre}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { Swal.fire('Error', 'No se pudo descargar el PDF histórico.', 'error'); }
  };

  return (
    <div className="container mt-4 cf-root">
      <div className="card shadow-sm border-0 cf-card">
        <div className="cf-header">
          <div>
            <h4 className="mb-0">Cuadre de Facturación por Usuario</h4>
            <small>Cierre diario, semanal, quincenal y mensual por gestor de cobro</small>
          </div>
          <button className="btn btn-light btn-sm fw-bold" onClick={() => setVerHistorial(!verHistorial)}>
            HISTORIAL ({historial.length})
          </button>
        </div>

        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle cf-tabla-cuadres">
              <thead>
                <tr>
                  <th>REPORTE</th>
                  <th>PERSONA</th>
                  <th>FECHA INICIO</th>
                  <th>FECHA FIN</th>
                  <th className="text-center">IMPRIMIR REPORTE</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const etiqueta = PERIODOS.find((p) => p.key === fila.periodo)?.etiqueta;
                  return (
                    <tr key={fila.periodo}>
                      <td className="cf-periodo">{etiqueta}</td>
                      <td>
                        <select
                          className="form-select cf-select"
                          value={fila.idUsuario}
                          onChange={(e) => actualizarFila(fila.periodo, { idUsuario: e.target.value })}
                        >
                          <option value="">TODOS</option>
                          {usuarios.map((u) => (
                            <option key={u.id_usuario} value={u.id_usuario}>{String(u.nombre || '').toUpperCase()}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          className="form-control cf-fecha"
                          value={fila.inicio}
                          onChange={(e) => actualizarFila(fila.periodo, { inicio: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="form-control cf-fecha"
                          value={fila.fin}
                          onChange={(e) => actualizarFila(fila.periodo, { fin: e.target.value })}
                        />
                      </td>
                      <td className="text-center">
                        <button
                          className="btn btn-dark fw-bold cf-btn-imprimir"
                          onClick={() => imprimirReporte(fila)}
                          disabled={fila.cargando}
                        >
                          {fila.cargando ? 'GENERANDO…' : '🖨 IMPRIMIR'}
                        </button>
                        <button
                          className="btn btn-link btn-sm cf-btn-reiniciar"
                          title="Restablecer fechas del período"
                          onClick={() => reiniciarFechas(fila.periodo)}
                        >
                          ↺
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {verHistorial && (
            <div className="table-responsive mt-3">
              <h6 className="cf-subtitulo">Historial de cuadres generados</h6>
              <table className="table table-sm table-striped align-middle">
                <thead className="table-light">
                  <tr><th>Generado</th><th>Rango</th><th>Generado por</th><th className="text-end">PDF</th></tr>
                </thead>
                <tbody>
                  {historial.length === 0 && (
                    <tr><td colSpan="4" className="text-center text-muted py-3">Aún no hay cuadres guardados.</td></tr>
                  )}
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
        </div>
      </div>
    </div>
  );
}
