import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { buildConsolidatedInvoiceRows, renderFacturaComprobante } from '../utils/facturaPdf';
import { API_BASE_URL } from '../config';

// La anulacion usa el mismo formato que la factura emitida (RECIBO DE CAJA O COMPROBANTE DE PAGO),
// solo que con el sello ANULADA. El layout de Recibo Juridico queda abajo, desactivado.
const USAR_FORMATO_RECIBO_JURIDICO = false;

const getImageFormatFromDataUrl = (dataUrl = '') => {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i);
  if (!match) return 'PNG';
  const rawFormat = match[1].toLowerCase();
  if (rawFormat === 'jpg' || rawFormat === 'jpeg') return 'JPEG';
  if (rawFormat === 'webp') return 'WEBP';
  return 'PNG';
};

const normalizeImageDataUrl = (value = '') => {
  if (!value || typeof value !== 'string') return '';

  const raw = String(value).trim();
  if (!raw) return '';

  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/i.test(raw)) {
    return raw;
  }

  const base64Part = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  const cleaned = String(base64Part || '').replace(/\s+/g, '');
  if (!cleaned) return '';

  const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned);
  if (!looksLikeBase64) return '';

  let mime = 'image/png';
  if (cleaned.startsWith('/9j/')) {
    mime = 'image/jpeg';
  } else if (cleaned.startsWith('UklGR')) {
    mime = 'image/webp';
  } else if (cleaned.startsWith('iVBOR')) {
    mime = 'image/png';
  }

  return `data:${mime};base64,${cleaned}`;
};

const fechaLargaGT = (valor) => {
  const fecha = valor instanceof Date && !Number.isNaN(valor.getTime()) ? valor : new Date();
  return fecha.toLocaleDateString('es-GT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

function AnulacionDeuda() {
  const [id_anulacion, setId_anulacion] = useState("");
  const [id_morosidad, setId_morosidad] = useState("");
  const [id_contrato, setId_contrato] = useState("");
  const [correlativo, setCorrelativo] = useState("");
  const [id_pago_anulado, setId_pago_anulado] = useState("");
  const [id_usuario_autoriza, setId_usuario_autoriza] = useState("");
  const [monto_anulado, setMonto_anulado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalleCorrelativo, setDetalleCorrelativo] = useState(null);
  
  const [anulacionesList, setAnulaciones] = useState([]);
  const [morosidadesList, setMorosidades] = useState([]);
  const [contratosList, setContratos] = useState([]);
  const [usuariosList, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false); 

  const API_URL = `${API_BASE_URL}/api/anulacion_deuda`;

  const getUsuarioActivo = () => {
    try {
      return JSON.parse(localStorage.getItem('usuario') || '{}');
    } catch {
      return {};
    }
  };

  const getNombreUsuario = (usuario = {}) => {
    return usuario?.nombre_usuario || usuario?.nombre || usuario?.correo || `Usuario #${usuario?.id_usuario || ''}`;
  };

  const esRolJuridico = (usuario = {}) => {
    const rol = String(usuario?.nombre_rol || '').toLowerCase();
    return rol.includes('jurid') || rol.includes('legal');
  };

  const esUsuarioAutorizador = (usuario = {}) => {
    const rol = String(usuario?.nombre_rol || '').toLowerCase();
    return String(usuario?.estado || '').toLowerCase() === 'activo'
      && (rol.includes('admin') || rol.includes('administrador') || rol.includes('gerente') || rol.includes('jurid') || rol.includes('legal'));
  };

  const cargarDatosRelacionales = useCallback(() => {
    Axios.get(`${API_BASE_URL}/api/morosidad`).then((res) => setMorosidades(res.data)).catch(console.error);
    Axios.get(`${API_BASE_URL}/api/contratos_residentes`).then((res) => setContratos(res.data)).catch(console.error);
    Axios.get(`${API_BASE_URL}/api/usuarios`).then((res) => {
      const usuarios = Array.isArray(res.data) ? res.data : [];
      setUsuarios(usuarios);

      const usuarioActivo = getUsuarioActivo();
      const usuarioActivoId = String(usuarioActivo?.id_usuario || '');
      const usuarioAutorizadorActual = usuarios.find((u) => String(u.id_usuario) === usuarioActivoId && esUsuarioAutorizador(u));

      if (usuarioAutorizadorActual && !id_usuario_autoriza) {
        setId_usuario_autoriza(String(usuarioAutorizadorActual.id_usuario));
      }
    }).catch(console.error);
  }, [id_usuario_autoriza]);

  const getAnulaciones = useCallback(() => {
    Axios.get(API_URL).then((res) => setAnulaciones(res.data)).catch(console.error);
  }, [API_URL]);

  const refrescarVista = useCallback(() => {
    getAnulaciones();
    cargarDatosRelacionales();
  }, [getAnulaciones, cargarDatosRelacionales]);

  useEffect(() => { 
    refrescarVista();

    const handleFocus = () => refrescarVista();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refrescarVista();
      }
    };

    const intervalId = window.setInterval(refrescarVista, 15000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refrescarVista]);

  const getMesesCorrelativo = () => {
    const raw = String(detalleCorrelativo?.meses_pagados || '').trim();
    if (!raw) return [];
    return raw.split(',').map((mes) => mes.trim()).filter(Boolean);
  };

  const getDetalleCobroCorrelativo = () => {
    return Array.isArray(detalleCorrelativo?.detalle_cobro) ? detalleCorrelativo.detalle_cobro : [];
  };

  const getContratoInfo = (idContratoActual) => {
    return contratosList.find((contrato) => String(contrato.id_contrato) === String(idContratoActual)) || null;
  };

  const getAutorizadorInfo = (idUsuario) => {
    return usuariosList.find((usuario) => String(usuario.id_usuario) === String(idUsuario)) || null;
  };

  const descargarPdfAnulacion = async (anulacion) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const usuarioActivo = getUsuarioActivo();
      const contratoInfo = getContratoInfo(anulacion.id_contrato);
      const autorizadorInfo = getAutorizadorInfo(anulacion.id_usuario_autoriza);
      const correlativoTexto = anulacion.correlativo || `PAGO-${anulacion.id_pago || '-'}`;
      const correlativoMatch = String(correlativoTexto).match(/^([A-Za-z]+)-([0-9]+)$/);
      const serieCorrelativo = correlativoMatch ? correlativoMatch[1].toUpperCase() : 'B';
      const numeroCorrelativo = correlativoMatch
        ? correlativoMatch[2].slice(-5)
        : String(anulacion.id_pago || anulacion.id_anulacion || 0).padStart(5, '0');
      const fechaDocumento = anulacion.fecha_anulacion ? new Date(anulacion.fecha_anulacion) : new Date();
      const usarFormatoJuridico = USAR_FORMATO_RECIBO_JURIDICO && esRolJuridico(usuarioActivo);
      const logoEmpresa = normalizeImageDataUrl(contratoInfo?.logo_empresa_pdf || contratoInfo?.logo_proyecto || '');
      const logoProyecto = normalizeImageDataUrl(contratoInfo?.logo_proyecto || '');
      const nombreMarca = contratoInfo?.nombre_marca_pdf || contratoInfo?.nombre_proyecto || 'PROYECTO INMOBILIARIO';
      const montoAnulado = parseFloat(anulacion.monto_anulado || 0);

      if (usarFormatoJuridico) {
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margenX = 8;
        const ancho = pageW - (margenX * 2);
        const contenidoY = 36;
        const contenidoH = 145;
        const nombreEmpresa = String(nombreMarca || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase();
        const nombreProyecto = String(contratoInfo?.nombre_proyecto_pdf || contratoInfo?.nombre_proyecto || 'Proyecto');
        const fechaDoc = fechaDocumento instanceof Date && !Number.isNaN(fechaDocumento.getTime()) ? fechaDocumento : new Date();
        const d = String(fechaDoc.getDate()).padStart(2, '0');
        const m = String(fechaDoc.getMonth() + 1).padStart(2, '0');
        const yFull = String(fechaDoc.getFullYear());

        doc.setDrawColor(188, 177, 117);
        doc.setLineWidth(0.35);
        if (typeof doc.roundedRect === 'function') {
          doc.roundedRect(margenX, contenidoY, ancho, contenidoH, 3, 3, 'S');
        } else {
          doc.rect(margenX, contenidoY, ancho, contenidoH);
        }

        if (logoEmpresa) {
          try {
            doc.addImage(logoEmpresa, getImageFormatFromDataUrl(logoEmpresa), margenX + 2.5, 7.8, 36, 21, `anu-jur-logo-${Date.now()}`, 'FAST');
          } catch {
            // no-op
          }
        }

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10.8);
        doc.text(nombreEmpresa, pageW / 2, 14.5, { align: 'center' });
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.text('15 Avenida "A" 24-22, Zona 13, Oficina #5', pageW / 2, 20, { align: 'center' });
        doc.text('PBX: 2220-6406  Telefono: 5825-5903', pageW / 2, 24.2, { align: 'center' });

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.text('Recibo Juridico', pageW - 42.5, 14.2);
        doc.rect(pageW - 42.5, 15.9, 37.5, 11.8);
        doc.setTextColor(166, 35, 35);
        doc.setFontSize(11.8);
        doc.text(`NO. ${String(numeroCorrelativo || '0').padStart(5, '0')}`, pageW - 23.8, 23.9, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        doc.setTextColor(195, 195, 195);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(28);
        doc.text('CORPORACION DE', pageW / 2, 102, { align: 'center' });
        doc.text('INVERSION INMOBILIARIA', pageW / 2, 116, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        let rY = contenidoY + 8;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.text('DATOS DEL CLIENTE', margenX + 4, rY);
        doc.setDrawColor(210, 190, 92);
        doc.setLineWidth(0.45);
        doc.line(margenX + 4, rY + 1.8, margenX + 34, rY + 1.8);

        rY += 11;
        doc.setDrawColor(60, 60, 60);
        doc.setLineWidth(0.2);
        doc.setFontSize(8.3);
        doc.text('Fecha:', margenX + 4, rY);
        const fechaX = margenX + 18;
        const boxW = 8;
        const boxH = 8;
        [d[0], d[1], m[0], m[1], yFull[0], yFull[1], yFull[2], yFull[3]].forEach((char, idx) => {
          const offsetX = idx < 2 ? idx * (boxW + 1) : idx < 4 ? (2 * (boxW + 1)) + 4 + ((idx - 2) * (boxW + 1)) : (4 * (boxW + 1)) + 8 + ((idx - 4) * (boxW + 1));
          doc.rect(fechaX + offsetX, rY - 5.8, boxW, boxH);
          doc.text(char, fechaX + offsetX + (boxW / 2), rY - 0.4, { align: 'center' });
        });
        doc.text('/', fechaX + (2 * (boxW + 1)) + 1.4, rY - 0.8);
        doc.text('/', fechaX + (4 * (boxW + 1)) + 5.2, rY - 0.8);

        const amountBoxX = pageW - 47;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11.3);
        doc.text('Por: Q', amountBoxX - 22, rY + 0.1);
        doc.rect(amountBoxX, rY - 5.8, 42, 8.2);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10.4);
        doc.text(Math.abs(montoAnulado).toFixed(2), amountBoxX + 2, rY - 0.2);

        const filaAncho = ancho - 4;
        const filaX = margenX + 2;
        const filaH = 10.5;
        rY += 6;
        doc.rect(filaX, rY, filaAncho, filaH);
        doc.rect(filaX, rY + filaH, filaAncho, filaH);
        doc.rect(filaX, rY + (filaH * 2), filaAncho, filaH);
        doc.rect(filaX, rY + (filaH * 3), filaAncho, filaH);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.3);
        doc.text('Recibimos de:', filaX + 2, rY + 6.8);
        doc.text('Cantidad de:', filaX + 2, rY + 17.3);
        doc.text('Por cancelacion de:', filaX + 2, rY + 27.8);
        doc.text('Proyecto:', filaX + 2, rY + 38.3);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10.3);
        doc.text(doc.splitTextToSize(String(contratoInfo?.nombre_residente || 'N/A'), filaAncho - 34).slice(0, 1), filaX + 30, rY + 6.8);
        doc.text('ANULACION DE COBRO REGISTRADO', filaX + 30, rY + 17.3);
        doc.text(doc.splitTextToSize(String(anulacion.motivo || 'Sin motivo registrado'), filaAncho - 40).slice(0, 1), filaX + 40, rY + 27.8);
        doc.text(doc.splitTextToSize(nombreProyecto, filaAncho - 34).slice(0, 1), filaX + 23, rY + 38.3);

        const pagosY = rY + (filaH * 4);
        doc.rect(filaX, pagosY, filaAncho, 24);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.text('Boleta:', filaX + 2, pagosY + 5.6);
        doc.text('Transferencia:', filaX + 52, pagosY + 5.6);
        doc.text('Cheque:', filaX + 114, pagosY + 5.6);
        doc.text('Efectivo:', filaX + 156, pagosY + 5.6);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10.1);
        doc.text(doc.splitTextToSize(String(correlativoTexto || 'N/A'), 56).slice(0, 1), filaX + 52, pagosY + 16);

        const firmaY = pagosY + 24;
        doc.rect(filaX, firmaY, filaAncho, 22);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Firma:', filaX + 2, firmaY + 6.2);
        doc.setFontSize(15);
        doc.setTextColor(20, 20, 20);
        doc.text('CANCELADO', filaX + 28, firmaY + 13);
        doc.setTextColor(0, 0, 0);
        if (logoProyecto) {
          try {
            doc.addImage(logoProyecto, getImageFormatFromDataUrl(logoProyecto), filaX + 62, firmaY + 1.8, 32, 13.2, `anu-jur-proy-${Date.now()}`, 'FAST');
          } catch {
            // no-op
          }
        }

        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(6.7);
        doc.text(
          doc.splitTextToSize('Los pagos mediante cheque estan regulados por las disposiciones contenidas en el Articulo 494 al 543 del Codigo de Comercio. Es importante tener en cuenta que todo cheque recibido se acepta bajo reserva de cobro; en caso de presentarse un cheque sin fondos disponibles, se aplicara un recargo de Q75.00 y se debitara en el proximo pago. Este recibo se extiende previo a la confirmacion de la transaccion bancaria.', ancho - 4).slice(0, 2),
          margenX + 2,
          pageH - 7.5
        );

        doc.save(`Anulacion_Juridica_${String(correlativoTexto).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
        return;
      }

      // Mismo formato que la factura emitida, con el sello ANULADA.
      // Se reusa la evidencia historica del pago para que ambos documentos coincidan campo a campo.
      let documento = null;
      if (anulacion.id_pago) {
        try {
          const { data } = await Axios.get(
            `${API_BASE_URL}/api/pagos_detalle/documento/${anulacion.id_pago}`,
            { params: { estado_factura: "ANULADA" } }
          );
          documento = data;
        } catch {
          documento = null;
        }
      }

      const detallesDoc = Array.isArray(documento?.detalles) ? documento.detalles : [];
      const totalDetalle = detallesDoc.reduce((acc, item) => acc + Number(item?.subtotal || 0), 0);
      const totalAnulado = totalDetalle > 0 ? totalDetalle : Math.abs(montoAnulado);
      const logoFactura = normalizeImageDataUrl(documento?.empresa?.logo_empresa || "") || logoEmpresa;
      const filasFactura = buildConsolidatedInvoiceRows(detallesDoc, {
        usarCuotaCeroEnganche: Number(documento?.contrato?.enganche || 0) > 0
      });

      renderFacturaComprobante(doc, {
        logo: logoFactura,
        empresa: {
          nombre: documento?.empresa?.nombre_empresa || nombreMarca,
          nit: documento?.empresa?.nit || contratoInfo?.nit_empresa,
          pais: documento?.empresa?.pais || contratoInfo?.pais_empresa,
          moneda: documento?.empresa?.moneda || contratoInfo?.moneda_empresa
        },
        documentoNo: documento?.correlativo || correlativoTexto,
        fechaEmision: fechaDocumento,
        cliente: {
          nombre: documento?.cliente?.nombre_residente || contratoInfo?.nombre_residente,
          direccion: documento?.cliente?.direccion,
          identificacion: documento?.cliente?.numero_identificacion,
          dpi: documento?.cliente?.dpi,
          nit: documento?.cliente?.nit
        },
        contrato: documento?.contrato?.codigo_contrato
          || contratoInfo?.codigo_contrato
          || `#${anulacion.id_contrato || "-"}`,
        pago: {
          metodo: documento?.metodo_pago,
          referencia: documento?.correlativo || correlativoTexto,
          banco: documento?.banco_pago,
          fechaOperacion: documento?.fecha_operacion,
          boletaReferencia: documento?.boleta_referencia
        },
        filas: filasFactura,
        resumen: [
          { label: "Subtotal documento anulado", valor: totalAnulado },
          { label: "Total revertido", valor: totalAnulado, bold: true, rojo: true }
        ],
        anulada: true,
        notaPie: `Documento anulado. Autoriza: ${getNombreUsuario(autorizadorInfo)}. Motivo: ${String(anulacion.motivo || "Sin motivo registrado")}`.slice(0, 190)
      });

      doc.save(`Anulacion_${anulacion.id_anulacion || "sin_id"}_${String(correlativoTexto).replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`);
    } catch (error) {
      console.error('Error al generar PDF de anulaciÃ³n:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el PDF de la anulaciÃ³n.' });
    }
  };

  const addAnulacion = () => {
    if (!correlativo.trim() || !id_usuario_autoriza || !motivo.trim()) {
      Swal.fire({ icon: "warning", title: 'CAMPOS INCOMPLETOS', timer: 3000, showConfirmButton: false });
      return; 
    }

    if (!detalleCorrelativo || !id_pago_anulado) {
      Swal.fire({ icon: 'warning', title: 'Primero debes buscar y validar el correlativo', timer: 2600, showConfirmButton: false });
      return;
    }

    const meses = getMesesCorrelativo();
    const mesesTexto = meses.length ? meses.join(', ') : 'No especificado';
    const montoTexto = `Q${parseFloat(monto_anulado || 0).toFixed(2)}`;
    const residenteTexto = detalleCorrelativo.nombre_residente || 'N/A';

    Swal.fire({
      icon: 'question',
      title: 'Confirmar anulaciÃ³n de cargo',
      html: `
        <div style="text-align:left">
          <p><strong>Correlativo:</strong> ${correlativo}</p>
          <p><strong>Pago:</strong> #${id_pago_anulado}</p>
          <p><strong>Residente:</strong> ${residenteTexto}</p>
          <p><strong>Contrato:</strong> #${id_contrato || '-'}</p>
          <p><strong>Meses a revertir:</strong> ${mesesTexto}</p>
          <p><strong>Monto a revertir:</strong> ${montoTexto}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'SÃ­, anular cargo',
      cancelButtonText: 'Cancelar'
    }).then((confirmacion) => {
      if (!confirmacion.isConfirmed) {
        return;
      }

      Axios.post(`${API_URL}/anular-por-correlativo`, {
        correlativo: String(detalleCorrelativo?.no_referencia || detalleCorrelativo?.correlativo || correlativo || '').trim(),
        id_pago: Number(id_pago_anulado || 0) || null,
        id_usuario_autoriza,
        motivo,
        nombre_usuario: getNombreUsuario(usuariosList.find((u) => String(u.id_usuario) === String(id_usuario_autoriza))) || 'DESCONOCIDO'
      })
      .then(() => {
        getAnulaciones();
        limpiarCampos();
        setShowRegModal(false);
        Swal.fire({ icon: "success", title: `Cobro anulado por correlativo`, timer: 3000, showConfirmButton: false });
      })
      .catch((err) => Swal.fire({ icon: 'error', title: 'Error al registrar', text: err.response?.data?.message }));
    })
  };

  const buscarCorrelativo = () => {
    const toNumeroCorrelativo = (value = '') => {
      const texto = String(value || '').trim();
      const m = texto.match(/(\d+)$/);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    };

    const aplicarResultadoBusqueda = (data = {}, mensaje = 'Cobro localizado') => {
      const correlativoCanonico = String(data.no_referencia || data.correlativo || correlativo || '').trim();
      setDetalleCorrelativo(data);
      setId_contrato(String(data.id_contrato || ''));
      setMonto_anulado(String(parseFloat(data.principal_pagado || data.monto_anulado || 0).toFixed(2)));
      setId_pago_anulado(String(data.id_pago || ''));
      if (correlativoCanonico) {
        setCorrelativo(correlativoCanonico);
      }
      Swal.fire({ icon: 'success', title: mensaje, timer: 1600, showConfirmButton: false });
    };

    const limpiarBusqueda = () => {
      setDetalleCorrelativo(null);
      setId_contrato('');
      setMonto_anulado('');
      setId_pago_anulado('');
    };

    const ejecutarBusqueda = async () => {
    const valor = correlativo.trim();
    if (!valor) {
      Swal.fire({ icon: 'warning', title: 'Ingresa el correlativo del cobro', timer: 2500, showConfirmButton: false });
      return;
    }

      try {
        const res = await Axios.get(`${API_URL}/buscar-correlativo/${encodeURIComponent(valor)}`);
        aplicarResultadoBusqueda(res.data || {}, 'Cobro localizado');
        return;
      } catch (err) {
      const status = Number(err?.response?.status || 0);
      const data = err?.response?.data || {};

      if (status === 409) {
        aplicarResultadoBusqueda(data, 'Correlativo ya anulado');
        Swal.fire({
          icon: 'info',
          title: 'Correlativo ya anulado',
          text: data?.message || 'Ese correlativo ya fue anulado previamente.'
        });
        return;
      }

      const numeroBuscado = /^#?\d+$/.test(valor) ? Number(String(valor).replace('#', '')) : null;
      if (status === 404 && Number.isFinite(numeroBuscado) && numeroBuscado > 0) {
        try {
          const pagosResp = await Axios.get(`${API_BASE_URL}/api/pagos`);
          const pagos = Array.isArray(pagosResp?.data) ? pagosResp.data : [];
          const pagoMatch = pagos.find((pago) => {
            const numeroRef = toNumeroCorrelativo(pago?.no_referencia || '');
            return Number.isFinite(numeroRef) && numeroRef === numeroBuscado;
          });

          if (pagoMatch?.no_referencia) {
            const retry = await Axios.get(`${API_URL}/buscar-correlativo/${encodeURIComponent(pagoMatch.no_referencia)}`);
            aplicarResultadoBusqueda(retry.data || {}, 'Cobro localizado por referencia completa');
            return;
          }
        } catch {
          // Si falla el fallback, se mantiene el flujo normal de no encontrado.
        }
      }

      limpiarBusqueda();
      Swal.fire({ icon: 'error', title: 'No encontrado', text: err.response?.data?.message || 'No se encontrÃ³ el correlativo.' });
      }
    };

    ejecutarBusqueda();
  };

  const actualizarAnulacion = () => {
    Axios.put(`${API_URL}/actualizar`, { id_anulacion, id_morosidad, id_contrato, id_usuario_autoriza, monto_anulado, motivo })
    .then(() => {
      getAnulaciones();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({ icon: 'success', title: 'AnulaciÃ³n de cobro actualizada', timer: 3000, showConfirmButton: false });
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Error al actualizar' }));
  };

  const deleteAnulacion = (val) => {
    Swal.fire({
      title: "Confirmar eliminaciÃ³n",
      text: `Â¿Eliminar la anulaciÃ³n de cobro #${val.id_anulacion}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Eliminar"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_anulacion}`).then(() => {
          getAnulaciones();
          Swal.fire('Eliminado', 'Registro borrado.', 'success');
        });
      }
    });
  };

  const abrirEditar = (val) => {
    setId_anulacion(val.id_anulacion);
    setId_morosidad(val.id_morosidad);
    setId_contrato(val.id_contrato);
    setId_usuario_autoriza(val.id_usuario_autoriza);
    setMonto_anulado(String(val.monto_anulado));
    setMotivo(val.motivo);
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_anulacion("");
    setId_morosidad("");
    setId_contrato("");
    setCorrelativo("");
    setId_pago_anulado("");
    setId_usuario_autoriza("");
    setMonto_anulado("");
    setMotivo("");
    setDetalleCorrelativo(null);
  };

  // Filtrado y paginaciÃ³n
  const textoBusqueda = busqueda.toLowerCase();
  const anulacionesUnicas = [];
  const correlativosVistos = new Set();

  anulacionesList.forEach((a) => {
    const clave = String(a.correlativo || a.id_pago || a.id_anulacion || '').trim().toLowerCase();
    if (!clave || correlativosVistos.has(clave)) {
      return;
    }

    correlativosVistos.add(clave);
    anulacionesUnicas.push(a);
  });

  const anulacionesFiltradas = anulacionesUnicas.filter((a) => {
    const motivoText = String(a.motivo || '').toLowerCase();
    const correlativoText = String(a.correlativo || '').toLowerCase();
    const contratoText = String(a.id_contrato || '').toLowerCase();
    const pagoText = String(a.id_pago || '').toLowerCase();
    return motivoText.includes(textoBusqueda)
      || correlativoText.includes(textoBusqueda)
      || contratoText.includes(textoBusqueda)
      || pagoText.includes(textoBusqueda);
  });
  const { paginatedItems: anulacionesPaginadas, totalPages, startIndex, endIndex } = getPaginatedData(anulacionesFiltradas, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className='container mt-4'>
      <div className="module-header">
      <div className="row align-items-center bg-light p-3 rounded shadow-sm">
        <div className="col-md-4"><h3 className="m-0 text-dark fw-bold">ANULAR COBRO</h3></div>
        <div className="col-md-5">
          <input type="text" className="form-control" placeholder="Buscar por motivo, correlativo o pago..." value={busqueda} onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-3 text-end d-flex gap-2">
          <button className="btn btn-outline-secondary fw-bold" onClick={refrescarVista}>â†» ACTUALIZAR</button>
          <button className="btn btn-info fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>âž• ANULAR COBRO</button>
        </div>
      </div>
      </div>
      
      <table className="table table-striped table-bordered align-middle shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>REFERENCIA</th>
            <th>CONTRATO</th>
            <th>CORRELATIVO</th>
            <th>AUTORIZÃ“</th>
            <th>MONTO</th>
            <th>MOTIVO</th>
            <th>FECHA</th>
            <th>OPCIONES</th>
          </tr>
        </thead>
        <tbody>
          {anulacionesPaginadas.map((val) => (
            <tr key={val.id_anulacion}>
              <th>#{val.id_anulacion}</th>
              <td>{val.id_morosidad ? `Ref #${val.id_morosidad}` : 'Por correlativo'}</td>
              <td>Contrato #{val.id_contrato}</td>
              <td>
                <div>{val.correlativo || `PAGO-${val.id_pago || '-'}`}</div>
                <small className="text-muted">Pago #{val.id_pago || '-'}</small>
              </td>
              <td>Usu. #{val.id_usuario_autoriza}</td>
              <td className="text-danger fw-bold">-Q{parseFloat(val.monto_anulado).toFixed(2)}</td>
              <td>{val.motivo}</td>
              <td>{new Date(val.fecha_anulacion).toLocaleDateString()}</td>
              <td>
                <button onClick={() => descargarPdfAnulacion(val)} className="btn btn-info btn-sm m-1 text-white">PDF</button>
                <button onClick={() => abrirEditar(val)} className="btn btn-warning btn-sm m-1">EDITAR</button>
                <button onClick={() => deleteAnulacion(val)} className="btn btn-danger btn-sm m-1">ELIMINAR</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* PAGINACIÃ“N */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={anulacionesFiltradas.length}
      />

      {/* MODALES REGISTRO Y EDICIÃ“N (Simplificado visualmente para espacio, usa la misma estructura de los inputs) */}
      {(showRegModal || showEditModal) && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title">{showRegModal ? "Anular Cobro" : "Editar AnulaciÃ³n de Cobro"}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => { setShowRegModal(false); setShowEditModal(false); }}></button>
              </div>
              <div className="modal-body">
                {showRegModal ? (
                  <>
                    <div className="mb-2">
                      <label className="fw-bold">No. Correlativo del Cobro:</label>
                      <div className="input-group">
                        <input
                          value={correlativo}
                          onChange={(e) => setCorrelativo(e.target.value)}
                          className="form-control"
                          placeholder="Ejemplo: 41 o referencia de pago"
                        />
                        <button type="button" className="btn btn-outline-primary" onClick={buscarCorrelativo}>Buscar</button>
                      </div>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Pago Detectado:</label>
                      <input
                        value={id_pago_anulado ? `Pago #${id_pago_anulado}` : ''}
                        className="form-control"
                        readOnly
                        placeholder="Busque el correlativo"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Contrato Asociado:</label>
                      <input
                        value={id_contrato ? `Contrato #${id_contrato}` : ''}
                        className="form-control"
                        readOnly
                        placeholder="Busque el correlativo"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Cobrado por Usuario:</label>
                      <input
                        value={detalleCorrelativo?.nombre_usuario_cobro || ''}
                        className="form-control"
                        readOnly
                        placeholder="Busque el correlativo"
                      />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Usuario que Autoriza:</label>
                      <select value={id_usuario_autoriza} onChange={(e) => setId_usuario_autoriza(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Gerente/Admin/Juridico --</option>
                        {usuariosList.filter(esUsuarioAutorizador).map(u => <option key={u.id_usuario} value={u.id_usuario}>{getNombreUsuario(u)}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Monto del Cargo a Revertir (Q):</label>
                      <input type="number" step="0.01" value={monto_anulado} className="form-control" readOnly />
                    </div>
                    {detalleCorrelativo && (
                      <div className="alert alert-info py-2 mb-2">
                        <div><strong>Correlativo encontrado:</strong> {detalleCorrelativo.no_referencia || correlativo || 'N/A'}</div>
                        <div><strong>Residente:</strong> {detalleCorrelativo.nombre_residente || 'N/A'}</div>
                        <div><strong>Contrato:</strong> {detalleCorrelativo.codigo_contrato || `#${detalleCorrelativo.id_contrato}`}</div>
                        <div><strong>Cobrado por:</strong> {detalleCorrelativo.nombre_usuario_cobro || `Usuario #${detalleCorrelativo.id_usuario || 'N/A'}`}</div>
                        <div><strong>Fecha de cobro:</strong> {detalleCorrelativo.fecha_pago ? new Date(detalleCorrelativo.fecha_pago).toLocaleString() : 'N/A'}</div>
                        <div><strong>Forma de pago:</strong> {detalleCorrelativo.forma_pago || 'N/A'}</div>
                        <div><strong>Total cobrado ubicado:</strong> Q{parseFloat(detalleCorrelativo.principal_pagado || 0).toFixed(2)}</div>
                        <div><strong>Terreno a revertir:</strong> Q{parseFloat(detalleCorrelativo.principal_terreno || 0).toFixed(2)}</div>
                        <div><strong>Abono a capital a revertir:</strong> Q{parseFloat(detalleCorrelativo.principal_enganche || 0).toFixed(2)}</div>
                        <div><strong>Servicios a revertir:</strong> Q{parseFloat(detalleCorrelativo.principal_servicios || 0).toFixed(2)}</div>
                        <div><strong>Mora a revertir:</strong> Q{parseFloat(detalleCorrelativo.principal_mora || 0).toFixed(2)}</div>
                        <div className="mb-1"><strong>Meses a revertir:</strong></div>
                        <div className="d-flex flex-wrap gap-1">
                          {getMesesCorrelativo().length ? (
                            getMesesCorrelativo().map((mes) => (
                              <span key={mes} className="badge bg-primary-subtle text-primary border border-primary-subtle">
                                {mes}
                              </span>
                            ))
                          ) : (
                            <span className="badge bg-secondary">No especificado</span>
                          )}
                        </div>
                        <div className="mt-2 mb-1"><strong>Detalle del cobro encontrado:</strong></div>
                        <div className="border rounded bg-white p-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                          {getDetalleCobroCorrelativo().length ? (
                            getDetalleCobroCorrelativo().map((item) => (
                              <div key={item.id_pago_detalle} className="d-flex justify-content-between align-items-start small border-bottom py-1">
                                <div>
                                  <div className="fw-bold">{item.concepto}</div>
                                  <div className="text-muted">{item.mes_pagado || 'Sin mes'}{item.tipo_concepto === 'cuota_terreno' && item.numero_cuota_afectada ? ` | Cuota ${item.numero_cuota_afectada}` : ''}</div>
                                </div>
                                <div className="text-danger fw-bold">Q{parseFloat(item.subtotal || 0).toFixed(2)}</div>
                              </div>
                            ))
                          ) : (
                            <div className="text-muted small">No hay detalle disponible para este cobro.</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mb-2">
                      <label className="fw-bold">Motivo/JustificaciÃ³n:</label>
                      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="form-control"></textarea>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2">
                      <label className="fw-bold">Mora a Anular:</label>
                      <select value={id_morosidad} onChange={(e) => setId_morosidad(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Morosidad --</option>
                        {morosidadesList.map(m => <option key={m.id_morosidad} value={m.id_morosidad}>ID: {m.id_morosidad} - Monto: Q{m.monto_mora}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Contrato Asociado:</label>
                      <select value={id_contrato} onChange={(e) => setId_contrato(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Contrato --</option>
                        {contratosList.map(c => <option key={c.id_contrato} value={c.id_contrato}>Contrato #{c.id_contrato}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Usuario que Autoriza:</label>
                      <select value={id_usuario_autoriza} onChange={(e) => setId_usuario_autoriza(e.target.value)} className="form-select">
                        <option value="">-- Seleccione Gerente/Admin/Juridico --</option>
                        {usuariosList.filter(esUsuarioAutorizador).map(u => <option key={u.id_usuario} value={u.id_usuario}>{getNombreUsuario(u)}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Monto a Perdonar (Q):</label>
                      <input type="number" step="0.01" value={monto_anulado} onChange={(e) => setMonto_anulado(e.target.value)} className="form-control" />
                    </div>
                    <div className="mb-2">
                      <label className="fw-bold">Motivo/JustificaciÃ³n:</label>
                      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="form-control"></textarea>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowRegModal(false); setShowEditModal(false); }}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  onClick={showRegModal ? addAnulacion : actualizarAnulacion}
                  disabled={showRegModal && !id_pago_anulado}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnulacionDeuda;
