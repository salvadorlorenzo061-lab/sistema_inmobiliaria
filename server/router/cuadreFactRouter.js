import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fechaInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const moneda = (v) => `Q ${Number(v || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rango = (tipo) => {
  const hoy = new Date();
  const inicio = new Date(hoy);
  const fin = new Date(hoy);

  if (tipo === 'semana') {
    inicio.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    fin.setDate(inicio.getDate() + 6);
  }
  if (tipo === 'quincena') {
    inicio.setDate(hoy.getDate() <= 15 ? 1 : 16);
    fin.setDate(hoy.getDate() <= 15 ? 15 : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate());
  }
  if (tipo === 'mes') {
    inicio.setDate(1);
    fin.setDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate());
  }
  return { inicio: fechaInput(inicio), fin: fechaInput(fin) };
};

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

  const cargarHistorial = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/historial`);
      setHistorial(Array.isArray(data) ? data : []);
    } catch {
      setHistorial([]);
    }
  }, [API]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/usuarios`)
      .then(({ data }) => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setUsuarios([]));
    cargarHistorial();
  }, [cargarHistorial]);

  const cambiarPeriodo = (valor) => {
    setPeriodo(valor);
    const r = rango(valor);
    setInicio(r.inicio);
    setFin(r.fin);
  };

  const consultar = async () => {
    if (!inicio || !fin || inicio > fin) {
      return Swal.fire('Rango inválido', 'Revise las fechas del cuadre.', 'warning');
    }
    setCargando(true);
    try {
      const { data } = await axios.get(`${API}/reporte`, {
        params: { fecha_inicio: inicio, fecha_fin: fin, estado, id_usuario: idUsuario || undefined }
      });
      setReporte(data);
    } catch (error) {
      setReporte(null);
      Swal.fire('No se pudo generar el cuadre', error?.response?.data?.message || 'Error del servidor.', 'error');
    } finally {
      setCargando(false);
    }
  };

  const crearPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('CUADRE DE FACTURACIÓN POR USUARIO', 140, 15, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Período: ${reporte.fecha_inicio} al ${reporte.fecha_fin}`, 14, 24);
    doc.text(`Emitidas: ${reporte.totales.emitidas}   Anuladas: ${reporte.totales.anuladas}   Total emitido: ${moneda(reporte.totales.total_emitido)}   Total anulado: ${moneda(reporte.totales.total_anulado)}   Neto: ${moneda(reporte.totales.neto)}`, 14, 31);
    
    autoTable(doc, {
      startY: 38,
      head: [['Usuario', 'Emitidas', 'Anuladas', 'Correlativo inicial', 'Correlativo final', 'Emitido', 'Anulado', 'Neto']],
      body: reporte.resumen_usuarios.map((x) => [
        x.nombre_usuario,
        x.emitidas,
        x.anuladas,
        x.correlativo_inicial || 'N/A',
        x.correlativo_final || 'N/A',
        moneda(x.total_emitido),
        moneda(x.total_anulado),
        moneda(x.neto)
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 45, 65] }
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Fecha', 'Usuario', 'Correlativo', 'Estado', 'Forma de pago', 'Total']],
      body: reporte.detalle.map((x) => [
        new Date(x.fecha_evento).toLocaleString('es-GT'),
        x.nombre_usuario,
        x.correlativo,
        x.estado_factura,
        x.forma_pago,
        moneda(x.total_cobrado)
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [23, 162, 184] }
    });

    return doc;
  };

  const guardarPdf = async () => {
    if (!reporte) return;
    try {
      const doc = crearPdf();
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      await axios.post(`${API}/historial`, {
        id_usuario_generador: usuario.id_usuario,
        fecha_inicio: inicio,
        fecha_fin: fin,
        filtro_estado: estado,
        filtro_usuario: idUsuario || null,
        reporte,
        pdf_base64: doc.output('datauristring').split(',')[1]
      });
      doc.save(`CuadreFacturacion_${inicio}_${fin}.pdf`);
      await cargarHistorial();
    } catch (error) {
      Swal.fire('Error', error?.response?.data?.message || 'No se pudo guardar el PDF.', 'error');
    }
  };

  const descargarHistorico = async (item) => {
    try {
      const { data } = await axios.get(`${API}/historial/${item.id_cuadre}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CuadreFacturacion_${item.id_cuadre}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      Swal.fire('Error', 'No se pudo descargar el PDF histórico.', 'error');
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm border-0">
        <div className="card-header bg-info fw-bold fs-5">Cuadre de Facturación por Usuario</div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-2">
              <label className="fw-bold">Período</label>
              <select className="form-select" value={periodo} onChange={(e) => cambiarPeriodo(e.target.value)}>
                <option value="dia">Diario</option>
                <option value="semana">Semanal</option>
                <option value="quincena">Quince días</option>
                <option value="mes">Mensual</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="fw-bold">Estado</label>
              <select className="form-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="todas">Emitidas y anuladas</option>
                <option value="emitida">Emitidas</option>
                <option value="anulada">Anuladas</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="fw-bold">Usuario cobrador</label>
              <select className="form-select" value={idUsuario} onChange={(e) => setIdUsuario(e.target.value)}>
                <option value="">Todos los usuarios</option>
                {usuarios.map((u) => (
                  <option key={u.id_usuario} value={u.id_usuario}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="fw-bold">Fecha inicio</label>
              <input type="date" className="form-control" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="col-md-2">
              <label className="fw-bold">Fecha fin</label>
              <input type="date" className="form-control" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
            <div className="col-md-2">
              <button className="btn btn-info fw-bold w-100" onClick={consultar} disabled={cargando}>
                {cargando ? 'CONSULTANDO...' : 'GENERAR REPORTE'}
              </button>
            </div>
            <div className="col-md-2">
              <button className="btn btn-outline-secondary fw-bold w-100" onClick={() => setVerHistorial(!verHistorial)}>
                HISTORIAL ({historial.length})
              </button>
            </div>
          </div>

          {verHistorial && (
            <div className="table-responsive mt-3">
              <table className="table table-sm table-striped">
                <thead>
                  <tr>
                    <th>Generado</th>
                    <th>Rango</th>
                    <th>Usuario</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id_cuadre}>
                      <td>{new Date(h.fecha_generacion).toLocaleString('es-GT')}</td>
                      <td>{String(h.fecha_inicio).slice(0, 10)} al {String(h.fecha_fin).slice(0, 10)}</td>
                      <td>{h.generado_por}</td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => descargarHistorico(h)}>
                          Descargar PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reporte && (
            <>
              <div className="row g-2 mt-3">
                <div className="col"><div className="alert alert-primary">Emitidas: <b>{reporte.totales.emitidas}</b></div></div>
                <div className="col"><div className="alert alert-danger">Anuladas: <b>{reporte.totales.anuladas}</b></div></div>
                <div className="col"><div className="alert alert-success">Total emitido: <b>{moneda(reporte.totales.total_emitido)}</b></div></div>
                <div className="col"><div className="alert alert-warning">Neto: <b>{moneda(reporte.totales.neto)}</b></div></div>
              </div>

              <button className="btn btn-danger mb-3" onClick={guardarPdf}>Guardar y descargar PDF</button>

              <div className="table-responsive">
                <table className="table table-bordered table-striped">
                  <thead className="table-dark">
                    <tr>
                      <th>Usuario</th>
                      <th>Emitidas</th>
                      <th>Anuladas</th>
                      <th>Correlativo inicial</th>
                      <th>Correlativo final</th>
                      <th>Total emitido</th>
                      <th>Total anulado</th>
                      <th>Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.resumen_usuarios.map((x) => (
                      <tr key={x.id_usuario}>
                        <td>{x.nombre_usuario}</td>
                        <td>{x.emitidas}</td>
                        <td>{x.anuladas}</td>
                        <td>{x.correlativo_inicial}</td>
                        <td>{x.correlativo_final}</td>
                        <td>{moneda(x.total_emitido)}</td>
                        <td>{moneda(x.total_anulado)}</td>
                        <td>{moneda(x.neto)}</td>
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