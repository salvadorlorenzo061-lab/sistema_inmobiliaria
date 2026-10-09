import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { calcularCuotaFija, generarTablaAmortizacion } from '../utils/amortizacion';

const moneda = (valor) => `Q ${Number(valor || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-GT') : 'N/A';
const logoNormalizado = (valor) => {
  const texto = String(valor || '').trim();
  if (!texto || texto.startsWith('data:image') || texto.startsWith('http')) return texto;
  return `data:image/png;base64,${texto}`;
};

const EstadoCuenta = () => {
  const [criterio, setCriterio] = useState('');
  const [resultados, setResultados] = useState([]);
  const [estado, setEstado] = useState(null);
  const [cantidad, setCantidad] = useState(5);
  const [cargando, setCargando] = useState(false);

  const buscar = async () => {
    if (!criterio.trim()) return Swal.fire('Dato requerido', 'Ingresa nombre, DPI, clave o contrato.', 'warning');
    setCargando(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/estado_cuenta/buscar-residente`, { params: { criterio } });
      setResultados(Array.isArray(data) ? data : []);
      setEstado(null);
    } catch (error) {
      setResultados([]);
      Swal.fire('Sin resultados', error?.response?.data || 'No fue posible consultar clientes.', 'info');
    } finally {
      setCargando(false);
    }
  };

  const cargarEstado = async (idContrato) => {
    setCargando(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/estado_cuenta/estado-cuenta/${idContrato}`, { params: { _refresh: Date.now() } });
      setEstado(data);
      setResultados([]);
    } catch (error) {
      Swal.fire('Error', error?.response?.data || 'No fue posible cargar el estado de cuenta.', 'error');
    } finally {
      setCargando(false);
    }
  };

  const resumen = useMemo(() => {
    if (!estado?.contrato) return null;
    const contrato = estado.contrato;
    const capital = Math.max(Number(contrato.monto_total || 0) - Number(contrato.enganche || 0), 0);
    const cuotas = Math.max(Number(contrato.cuotas_pactadas || contrato.plazo_meses || 0), 0);
    const tabla = generarTablaAmortizacion(capital, Number(contrato.interes_porcentaje || 0), cuotas);
    const porCuota = new Map(tabla.map((fila) => [Number(fila.numero_cuota), fila]));
    const movimientos = (Array.isArray(estado.cuotasDetalle) ? estado.cuotasDetalle : [])
      .filter((item) => Number(item.numero_cuota || 0) > 0)
      .map((item) => {
        const numero = Number(item.numero_cuota || 0);
        const fila = porCuota.get(numero) || {};
        return {
          id: `${item.id_pago}-${numero}`,
          fecha: item.fecha_pago,
          numero,
          monto: Number(item.monto_total_detalle ?? item.monto_cuota ?? 0),
          banco: item.forma_pago || 'N/A',
          recibo: item.correlativo || item.no_referencia || 'N/A',
          capital: Number(fila.capital_cuota || 0),
          interes: Number(fila.interes_mes || 0)
        };
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const cuotasPagadas = new Set(movimientos.map((item) => item.numero)).size;
    const capitalPagado = tabla.slice(0, cuotasPagadas).reduce((suma, fila) => suma + Number(fila.capital_cuota || 0), 0);
    const proxima = Math.min(cuotasPagadas + 1, cuotas);
    return {
      capital,
      cuotas,
      tabla,
      movimientos: movimientos.slice(0, cantidad),
      cuotasPagadas,
      capitalPagado,
      saldoCapital: Math.max(capital - capitalPagado, 0),
      proxima,
      montoCuota: Number(contrato.monto_cuota || 0) || calcularCuotaFija(capital, Number(contrato.interes_porcentaje || 0), cuotas)
    };
  }, [estado, cantidad]);

  const exportarPDF = () => {
    if (!estado?.contrato || !resumen) return;
    const contrato = estado.contrato;
    const doc = new jsPDF('p', 'mm', 'letter');
    const ancho = doc.internal.pageSize.getWidth();
    const azul = [10, 47, 68];
    const dorado = [194, 145, 35];
    const logo = logoNormalizado(contrato.logo_proyecto || contrato.logo_empresa_pdf);
    if (logo) {
      try { doc.addImage(logo, logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', 73, 7, 70, 28, 'logo-proyecto', 'FAST'); } catch (e) { console.warn(e); }
    }
    doc.setTextColor(...azul);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('ESTADO DE CUENTA', ancho / 2, 44, { align: 'center' });
    const dato = (titulo, valor, x, y, vx) => {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.text(titulo, x, y);
      doc.setFont('helvetica', 'normal'); doc.text(String(valor || 'N/A'), vx, y, { maxWidth: 55 });
    };
    dato('CLIENTE', String(contrato.nombre || '').toUpperCase(), 17, 59, 50);
    dato('PROYECTO', String(contrato.nombre_proyecto || '').toUpperCase(), 17, 66, 50);
    dato('DIRECCIÓN', contrato.direccion_notificacion, 17, 73, 50);
    dato('FECHA CONTRATO', fecha(contrato.fecha_firma), 17, 80, 50);
    dato('ID CLIENTE', contrato.numero_identificacion || contrato.id_residente, 118, 59, 153);
    dato('LOTE / MANZANA', `${contrato.lote || 'N/A'} / ${contrato.manzana || 'N/A'}`, 118, 66, 153);
    dato('TELÉFONO', contrato.telefono, 118, 73, 153);
    dato('ESTADO', Number(estado.saldoPendiente || 0) <= 0 ? 'SOLVENTE' : 'PENDIENTE', 118, 80, 153);
    doc.setFillColor(...azul); doc.rect(12, 87, ancho - 24, 6, 'F');
    doc.setTextColor(255); doc.setFontSize(8); doc.text('RESUMEN DE SU CUENTA', ancho / 2, 91.2, { align: 'center' });
    autoTable(doc, {
      startY: 93, margin: { left: 12, right: 12 }, theme: 'plain', styles: { fontSize: 7.2, cellPadding: 1.2 },
      body: [
        ['Precio total', moneda(contrato.monto_total), 'Enganche', moneda(contrato.enganche), 'Saldo financiado', moneda(resumen.capital)],
        ['Tasa anual', `${Number(contrato.interes_porcentaje || 0).toFixed(2)}%`, 'Cuota mensual', moneda(resumen.montoCuota), 'Plazo original', `${resumen.cuotas} meses`],
        ['Capital pagado', moneda(resumen.capitalPagado), 'Cuotas pagadas', String(resumen.cuotasPagadas), 'Saldo de capital', moneda(resumen.saldoCapital)],
        ['Próxima cuota', String(resumen.proxima || 'N/A'), 'Cuotas pendientes', String(Math.max(resumen.cuotas - resumen.cuotasPagadas, 0)), 'Saldo total', moneda(estado.saldoPendiente)]
      ],
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' }, 4: { fontStyle: 'bold' } }
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5, margin: { left: 12, right: 12 }, theme: 'plain',
      head: [[{ content: `ÚLTIMOS ${cantidad} PAGOS REGISTRADOS`, colSpan: 8, styles: { fillColor: azul, halign: 'center' } }], ['Fecha pago', 'Tipo', 'Monto', 'Cuota', 'Banco', 'Recibo', 'Capital', 'Interés']],
      body: resumen.movimientos.length ? resumen.movimientos.map((m) => [fecha(m.fecha), 'CUOTA', moneda(m.monto), m.numero, m.banco, m.recibo, moneda(m.capital), moneda(m.interes)]) : [['', 'Sin pagos registrados', '', '', '', '', '', '']],
      styles: { fontSize: 7, halign: 'center', cellPadding: 1.3 }, headStyles: { fillColor: dorado, textColor: 255, fontStyle: 'bold' }
    });
    const y = doc.lastAutoTable.finalY + 7;
    doc.setFillColor(...azul); doc.rect(12, y, ancho - 24, 6, 'F');
    doc.setTextColor(255); doc.text('INFORMACIÓN IMPORTANTE', ancho / 2, y + 4.2, { align: 'center' });
    doc.setTextColor(70); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text('Este documento presenta los pagos vigentes registrados. Las facturas anuladas no forman parte de este estado de cuenta.', ancho / 2, y + 12, { align: 'center' });
    doc.line(42, 244, 82, 244); doc.line(137, 244, 177, 244);
    doc.text('Elaboró / Revisó', 62, 249, { align: 'center' }); doc.text('Sello / Autorización', 157, 249, { align: 'center' });
    doc.save(`EstadoCuenta_${contrato.codigo_contrato || 'cliente'}.pdf`);
  };

  return <div className="p-4">
    <div className="card shadow-sm border-0">
      <div className="card-header bg-primary text-white"><h3 className="mb-0">📄 Estado de Cuenta</h3></div>
      <div className="card-body">
        <div className="row g-2">
          <div className="col-md-8"><input className="form-control" value={criterio} onChange={(e) => setCriterio(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Buscar por cliente, DPI, clave o contrato..." /></div>
          <div className="col-md-2"><button className="btn btn-primary w-100" onClick={buscar} disabled={cargando}>{cargando ? 'Consultando...' : 'Buscar'}</button></div>
          <div className="col-md-2"><button className="btn btn-secondary w-100" onClick={() => { setCriterio(''); setResultados([]); setEstado(null); }}>Limpiar</button></div>
        </div>
        {resultados.length > 0 && <div className="list-group mt-3">{resultados.map((item) => <button key={item.id_contrato} className="list-group-item list-group-item-action" onClick={() => cargarEstado(item.id_contrato)}><strong>{item.nombre}</strong><br /><small>{item.codigo_contrato} · {item.nombre_tipo_contrato}</small></button>)}</div>}
        {estado && resumen && <>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4 mb-3">
            <h4 className="mb-0">{estado.contrato.nombre}</h4>
            <div className="d-flex gap-2"><select className="form-select" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}><option value={5}>Últimos 5 movimientos</option><option value={10}>Últimos 10 movimientos</option></select><button className="btn btn-danger text-nowrap" onClick={exportarPDF}>Descargar PDF</button></div>
          </div>
          <div className="row g-3 mb-3"><div className="col-md-4"><div className="alert alert-primary mb-0"><strong>Contrato:</strong> {estado.contrato.codigo_contrato}</div></div><div className="col-md-4"><div className="alert alert-success mb-0"><strong>Total pagado:</strong> {moneda(estado.totalPagado)}</div></div><div className="col-md-4"><div className="alert alert-warning mb-0"><strong>Saldo pendiente:</strong> {moneda(estado.saldoPendiente)}</div></div></div>
          <div className="table-responsive"><table className="table table-striped table-bordered"><thead className="table-dark"><tr><th>Fecha</th><th>Cuota</th><th>Monto</th><th>Banco</th><th>Recibo</th><th>Capital</th><th>Interés</th></tr></thead><tbody>{resumen.movimientos.length ? resumen.movimientos.map((m) => <tr key={m.id}><td>{fecha(m.fecha)}</td><td>{m.numero}</td><td>{moneda(m.monto)}</td><td>{m.banco}</td><td>{m.recibo}</td><td>{moneda(m.capital)}</td><td>{moneda(m.interes)}</td></tr>) : <tr><td colSpan="7" className="text-center">No hay movimientos registrados.</td></tr>}</tbody></table></div>
        </>}
      </div>
    </div>
  </div>;
};

export default EstadoCuenta;
