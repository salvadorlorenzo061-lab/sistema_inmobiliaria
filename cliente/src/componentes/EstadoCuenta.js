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
  const [textoManual, setTextoManual] = useState('');
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
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
      const historialResponse = await axios.get(`${API_BASE_URL}/api/estado_cuenta/historial/${idContrato}`);
      setHistorial(Array.isArray(historialResponse.data) ? historialResponse.data : []);
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
          banco: item.banco_pago || item.forma_pago || 'N/A',
          boleta: item.boleta_referencia || 'N/A',
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

  const crearPDF = (textoConfirmado = textoManual) => {
    if (!estado?.contrato || !resumen) return;
    const contrato = estado.contrato;
    const doc = new jsPDF('p', 'mm', 'letter');
    const ancho = doc.internal.pageSize.getWidth();
    const azul = [10, 47, 68];
    const dorado = [194, 145, 35];
    const logo = logoNormalizado(contrato.logo_proyecto || contrato.logo_empresa_pdf);
    if (logo) {
      try {
        const propiedades = doc.getImageProperties(logo);
        const maxW = 62;
        const maxH = 24;
        const escala = Math.min(maxW / propiedades.width, maxH / propiedades.height);
        const logoW = propiedades.width * escala;
        const logoH = propiedades.height * escala;
        doc.addImage(logo, logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', (ancho - logoW) / 2, 7, logoW, logoH, 'logo-proyecto', 'FAST');
      } catch (e) { console.warn(e); }
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
    const moraRegistrada = Number(contrato.mora_registrada || 0);
    const estadoCuenta = Number(estado.saldoPendiente || 0) <= 0
      ? 'CANCELADO'
      : moraRegistrada > 0
        ? 'MORA'
        : resumen.cuotasPagadas > 0 ? 'AL DÍA' : 'PENDIENTE';
    dato('ESTADO', estadoCuenta, 118, 80, 153);
    doc.setFillColor(...azul); doc.rect(12, 87, ancho - 24, 6, 'F');
    doc.setTextColor(255); doc.setFontSize(8); doc.text('RESUMEN DE SU CUENTA', ancho / 2, 91.2, { align: 'center' });
    autoTable(doc, {
      startY: 93, margin: { left: 12, right: 12 }, theme: 'plain', styles: { fontSize: 7.2, cellPadding: 1.2 },
      body: [
        ['Precio total', moneda(contrato.monto_total), 'Enganche', moneda(contrato.enganche), 'Saldo financiado', moneda(resumen.capital)],
        ['Tasa anual', `${Number(contrato.interes_porcentaje || 0).toFixed(2)}%`, 'Cuota mensual', moneda(resumen.montoCuota), 'Plazo original', `${resumen.cuotas} meses`],
        ['Capital pagado', moneda(resumen.capitalPagado), 'Cuotas pagadas', String(resumen.cuotasPagadas), 'Saldo de capital', moneda(resumen.saldoCapital)],
        ['Próxima cuota', String(resumen.proxima || 'N/A'), 'Cuotas pendientes', String(Math.max(resumen.cuotas - resumen.cuotasPagadas, 0)), 'Saldo total', moneda(estado.saldoPendiente)],
        ['Mora registrada', moneda(moraRegistrada), '', '', '', '']
      ],
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' }, 4: { fontStyle: 'bold' } }
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5, margin: { left: 12, right: 12 }, theme: 'plain',
      head: [[{ content: `ÚLTIMOS ${cantidad} PAGOS REGISTRADOS`, colSpan: 9, styles: { fillColor: azul, halign: 'center' } }], ['Fecha pago', 'Tipo', 'Monto', 'Cuota', 'Banco', 'Boleta', 'Recibo', 'Capital', 'Interés']],
      body: resumen.movimientos.length ? resumen.movimientos.map((m) => [fecha(m.fecha), 'CUOTA', moneda(m.monto), m.numero, m.banco, m.boleta, m.recibo, moneda(m.capital), moneda(m.interes)]) : [['', 'Sin pagos registrados', '', '', '', '', '', '', '']],
      styles: { fontSize: 6.3, halign: 'center', cellPadding: 1.1 }, headStyles: { fillColor: dorado, textColor: 255, fontStyle: 'bold' }
    });
    const y = doc.lastAutoTable.finalY + 7;
    doc.setFillColor(...azul); doc.rect(12, y, ancho - 24, 6, 'F');
    doc.setTextColor(255); doc.text('INFORMACIÓN IMPORTANTE', ancho / 2, y + 4.2, { align: 'center' });
    doc.setTextColor(70); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text('Este documento presenta los pagos vigentes registrados. Las facturas anuladas no forman parte de este estado de cuenta.', ancho / 2, y + 12, { align: 'center' });
    doc.setDrawColor(80, 80, 80);
    doc.rect(28, y + 17, ancho - 56, 18);
    doc.setFontSize(8);
    const textoIngresado = String(textoConfirmado || '').trim();
    doc.text(doc.splitTextToSize(textoIngresado, ancho - 64), ancho / 2, y + 23, { align: 'center' });
    doc.line(42, 244, 82, 244); doc.line(137, 244, 177, 244);
    doc.text('Elaboró / Revisó', 62, 249, { align: 'center' }); doc.text('Sello / Autorización', 157, 249, { align: 'center' });
    return doc;
  };

  const descargarPDF = (doc) => {
    doc.save(`EstadoCuenta_${estado?.contrato?.codigo_contrato || 'cliente'}.pdf`);
  };

  const descargarHistorico = async (item) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/estado_cuenta/historial/${item.id_estado_cuenta}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `EstadoCuenta_${estado?.contrato?.codigo_contrato || item.id_contrato}_${item.id_estado_cuenta}.pdf`;
      document.body.appendChild(enlace); enlace.click(); enlace.remove(); window.URL.revokeObjectURL(url);
    } catch (error) {
      Swal.fire('PDF no disponible', error?.response?.data?.message || 'Este registro no contiene el archivo PDF.', 'warning');
    }
  };

  const generarEstadoCuenta = async () => {
    if (!estado?.contrato) return;
    const filas = resumen.movimientos.map((m) => `<tr><td>${fecha(m.fecha)}</td><td>${m.numero}</td><td>${moneda(m.monto)}</td><td>${m.banco}</td><td>${m.boleta}</td><td>${m.recibo}</td></tr>`).join('');
    const resultado = await Swal.fire({
      title: 'Texto manual del estado de cuenta',
      width: 950,
      html: `<div class="text-start mb-2"><b>Contrato:</b> ${estado.contrato.codigo_contrato} &nbsp; <b>Total pagado:</b> ${moneda(estado.totalPagado)} &nbsp; <b>Saldo:</b> ${moneda(estado.saldoPendiente)}</div><div style="max-height:220px;overflow:auto"><table class="table table-sm table-bordered"><thead><tr><th>Fecha</th><th>Cuota</th><th>Monto</th><th>Banco</th><th>Boleta</th><th>Recibo</th></tr></thead><tbody>${filas || '<tr><td colspan="6">Sin movimientos</td></tr>'}</tbody></table></div><label class="d-block text-start fw-bold" for="texto-estado-cuenta">Texto para el PDF</label><textarea id="texto-estado-cuenta" class="swal2-textarea" style="width:90%" rows="4" placeholder="Ejemplo: SALDO A CANCELAR: Q 10,000.00">${String(textoManual || '').replace(/</g, '&lt;')}</textarea>`,
      showCancelButton: true,
      confirmButtonText: 'Guardar y generar PDF',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const valor = document.getElementById('texto-estado-cuenta')?.value?.trim();
        if (!valor) { Swal.showValidationMessage('Debe ingresar el texto que aparecerá en el PDF.'); return false; }
        return valor;
      }
    });
    if (!resultado.isConfirmed) return;
    const texto = String(resultado.value || '').trim();
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      const doc = crearPDF(texto);
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      await axios.post(`${API_BASE_URL}/api/estado_cuenta/historial`, {
        id_contrato: estado.contrato.id_contrato,
        id_usuario: usuario.id_usuario || null,
        texto_manual: texto,
        cantidad_movimientos: cantidad,
        pdf_base64: pdfBase64,
        datos: { contrato: estado.contrato, totalPagado: estado.totalPagado, saldoPendiente: estado.saldoPendiente, resumen, texto }
      });
      setTextoManual(texto);
      const { data } = await axios.get(`${API_BASE_URL}/api/estado_cuenta/historial/${estado.contrato.id_contrato}`);
      setHistorial(Array.isArray(data) ? data : []);
      descargarPDF(doc);
    } catch (error) {
      Swal.fire('Error', error?.response?.data?.message || 'No se pudo guardar el historial del estado de cuenta.', 'error');
    }
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
            <div className="d-flex gap-2"><select className="form-select" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}><option value={5}>Últimos 5 movimientos</option><option value={10}>Últimos 10 movimientos</option></select><button className="btn btn-outline-secondary text-nowrap" onClick={() => setMostrarHistorial((valor) => !valor)}>Historial ({historial.length})</button><button className="btn btn-danger text-nowrap" onClick={generarEstadoCuenta}>Generar PDF</button></div>
          </div>
          {mostrarHistorial && <div className="card border-secondary mb-3"><div className="card-header fw-bold">Historial de estados de cuenta generados</div><div className="table-responsive"><table className="table table-sm table-striped mb-0"><thead><tr><th>Fecha</th><th>Usuario</th><th>Movimientos</th><th>Texto registrado</th><th>Acciones</th></tr></thead><tbody>{historial.length ? historial.map((item) => <tr key={item.id_estado_cuenta}><td>{fecha(item.fecha_generacion)}</td><td>{item.nombre_usuario}</td><td>{item.cantidad_movimientos}</td><td>{item.texto_manual}</td><td><div className="d-flex gap-1"><button className="btn btn-sm btn-outline-primary" onClick={() => setTextoManual(item.texto_manual || '')}>Usar texto</button><button className="btn btn-sm btn-danger" disabled={!Number(item.tiene_pdf)} onClick={() => descargarHistorico(item)}>Descargar PDF</button></div></td></tr>) : <tr><td colSpan="5" className="text-center">Aún no se han generado estados de cuenta.</td></tr>}</tbody></table></div></div>}
          <div className="row g-3 mb-3"><div className="col-md-4"><div className="alert alert-primary mb-0"><strong>Contrato:</strong> {estado.contrato.codigo_contrato}</div></div><div className="col-md-4"><div className="alert alert-success mb-0"><strong>Total pagado:</strong> {moneda(estado.totalPagado)}</div></div><div className="col-md-4"><div className="alert alert-warning mb-0"><strong>Saldo pendiente:</strong> {moneda(estado.saldoPendiente)}</div></div></div>
          <div className="table-responsive"><table className="table table-striped table-bordered"><thead className="table-dark"><tr><th>Fecha</th><th>Cuota</th><th>Monto</th><th>Banco</th><th>Boleta</th><th>Recibo</th><th>Capital</th><th>Interés</th></tr></thead><tbody>{resumen.movimientos.length ? resumen.movimientos.map((m) => <tr key={m.id}><td>{fecha(m.fecha)}</td><td>{m.numero}</td><td>{moneda(m.monto)}</td><td>{m.banco}</td><td>{m.boleta}</td><td>{m.recibo}</td><td>{moneda(m.capital)}</td><td>{moneda(m.interes)}</td></tr>) : <tr><td colSpan="8" className="text-center">No hay movimientos registrados.</td></tr>}</tbody></table></div>
        </>}
      </div>
    </div>
  </div>;
};

export default EstadoCuenta;
