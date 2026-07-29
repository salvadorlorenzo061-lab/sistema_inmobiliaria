import { useState, useEffect, useCallback } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { API_BASE_URL } from '../config';

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

  const getAnulaciones = () => {
    Axios.get(API_URL).then((res) => setAnulaciones(res.data)).catch(console.error);
  };

  useEffect(() => { 
    getAnulaciones(); 
    cargarDatosRelacionales();
  }, [cargarDatosRelacionales]);

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

  const descargarPdfAnulacion = (anulacion) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const contratoInfo = getContratoInfo(anulacion.id_contrato);
      const autorizadorInfo = getAutorizadorInfo(anulacion.id_usuario_autoriza);
      const correlativoTexto = anulacion.correlativo || `PAGO-${anulacion.id_pago || '-'}`;
      const fechaDocumento = anulacion.fecha_anulacion ? new Date(anulacion.fecha_anulacion) : new Date();
      const logoEmpresa = normalizeImageDataUrl(contratoInfo?.logo_empresa_pdf || contratoInfo?.logo_proyecto || '');
      const nombreMarca = String(contratoInfo?.nombre_marca_pdf || contratoInfo?.nombre_proyecto || 'PROYECTO INMOBILIARIO').toUpperCase();
      const montoAnulado = parseFloat(anulacion.monto_anulado || 0);
      const pW = doc.internal.pageSize.getWidth();
      const goldColor = [173, 136, 38];

      const fechaFmt = (d) => {
        if (!d || Number.isNaN(d.getTime())) return 'N/A';
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      };
      const fechaHoraFmt = (d) => {
        const now = new Date();
        return `${fechaFmt(d)}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      };

      // === ENCABEZADO ===
      let y = 12;
      doc.setFillColor(...goldColor);
      doc.rect(0, 0, pW, 5, 'F');

      if (logoEmpresa) {
        try { doc.addImage(logoEmpresa, getImageFormatFromDataUrl(logoEmpresa), 10, y, 28, 18, `anu-logo-${Date.now()}`, 'FAST'); } catch { /* no-op */ }
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(nombreMarca, 46, y + 5);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`NIT: ${contratoInfo?.nit || 'N/A'}`, 46, y + 10);
      doc.text('País: Guatemala', 46, y + 14.5);
      doc.text('Moneda: GTQ', 46, y + 19);

      doc.setFillColor(245, 245, 245);
      doc.rect(140, y - 2, 63, 30, 'F');
      doc.setDrawColor(180, 180, 180);
      doc.rect(140, y - 2, 63, 30);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('NOTA DE ANULACIÓN', 171.5, y + 4, { align: 'center' });
      doc.text('DE COBRO', 171.5, y + 9, { align: 'center' });
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.text(`Documento No: ${correlativoTexto}`, 171.5, y + 15, { align: 'center' });
      doc.text(`Fecha emisión: ${fechaFmt(fechaDocumento)}`, 171.5, y + 20, { align: 'center' });
      doc.text(`Fecha/Hora impresión: ${fechaHoraFmt(fechaDocumento)}`, 171.5, y + 25, { align: 'center' });

      y += 36;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(10, y, pW - 10, y);
      y += 5;

      // === DATOS DEL CLIENTE ===
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, pW - 20, 7, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('DATOS DEL CLIENTE / RESIDENTE', 12, y + 5);
      y += 10;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Nombre:', 12, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(contratoInfo?.nombre_residente || 'N/A'), 35, y);
      doc.setFont('Helvetica', 'bold');
      doc.text('Contrato:', 120, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(contratoInfo?.codigo_contrato || `#${anulacion.id_contrato || 'N/A'}`), 143, y);
      y += 6;

      doc.setFont('Helvetica', 'bold');
      doc.text('DPI:', 12, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(contratoInfo?.dpi || contratoInfo?.dpi_residente || 'N/A'), 24, y);
      doc.setFont('Helvetica', 'bold');
      doc.text('NIT:', 120, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(contratoInfo?.nit || 'CF'), 131, y);
      y += 8;

      // === DATOS DE ANULACIÓN ===
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, pW - 20, 7, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('DATOS DE LA ANULACIÓN', 12, y + 5);
      y += 10;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Pago anulado #:', 12, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(anulacion.id_pago || 'N/A'), 46, y);
      doc.setFont('Helvetica', 'bold');
      doc.text('Autoriza:', 120, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(String(autorizadorInfo?.nombre || 'Admin'), 140, y);
      y += 6;

      doc.setFont('Helvetica', 'bold');
      doc.text('Motivo:', 12, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(doc.splitTextToSize(String(anulacion.motivo || 'Sin motivo registrado'), 170)[0], 30, y);
      y += 10;

      // === TABLA ===
      autoTable(doc, {
        startY: y,
        head: [['Concepto / Cuota', 'Mes Afectado', 'Monto Base', 'IVA 12%', 'Total']],
        body: [[
          `Anulación de cobro - Correlativo: ${correlativoTexto}`,
          fechaFmt(fechaDocumento),
          `Q ${montoAnulado.toFixed(2)}`,
          'Q 0.00',
          `Q ${montoAnulado.toFixed(2)}`
        ]],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: goldColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { cellWidth: 75 },
          1: { cellWidth: 35, halign: 'center' },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 20, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' }
        },
        margin: { left: 10, right: 10 }
      });

      y = doc.lastAutoTable.finalY + 8;

      // === RESUMEN ===
      const resX = pW - 90;
      const resW = 80;
      const lineH = 7;
      const drawLine = (label, valor, bold = false, rojo = false) => {
        doc.setFont('Helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(rojo ? 180 : 40, rojo ? 0 : 40, rojo ? 0 : 40);
        doc.text(`${label}:`, resX, y);
        doc.text(`Q${parseFloat(valor || 0).toFixed(2)}`, resX + resW, y, { align: 'right' });
        doc.setTextColor(40, 40, 40);
        y += lineH;
      };

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(resX - 2, y - 3, resX + resW + 2, y - 3);
      drawLine('Monto anulado', montoAnulado);
      drawLine('IVA 12%', 0);
      doc.line(resX - 2, y - 3, resX + resW + 2, y - 3);

      // Sello ANULADO
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(200, 30, 30);
      doc.text('ANULADO', pW / 2, 150, { align: 'center', angle: -20 });
      doc.setTextColor(40, 40, 40);

      // Pie
      const pH = doc.internal.pageSize.getHeight();
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('Este documento acredita la anulación del cobro registrado. Conservar para cualquier aclaración.', 10, pH - 10);
      doc.setFillColor(...goldColor);
      doc.rect(0, pH - 5, pW, 5, 'F');

      doc.save(`Anulacion_Comprobante_${String(correlativoTexto).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error al generar PDF de anulación:', error);
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el PDF de la anulación.' });
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
      title: 'Confirmar anulación de cargo',
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
      confirmButtonText: 'Sí, anular cargo',
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
      Swal.fire({ icon: 'error', title: 'No encontrado', text: err.response?.data?.message || 'No se encontró el correlativo.' });
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
      Swal.fire({ icon: 'success', title: 'Anulación de cobro actualizada', timer: 3000, showConfirmButton: false });
    })
    .catch(() => Swal.fire({ icon: 'error', title: 'Error al actualizar' }));
  };

  const deleteAnulacion = (val) => {
    Swal.fire({
      title: "Confirmar eliminación",
      text: `¿Eliminar la anulación de cobro #${val.id_anulacion}?`,
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

  // Filtrado y paginación
  const textoBusqueda = busqueda.toLowerCase();
  const anulacionesFiltradas = anulacionesList.filter((a) => {
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
        <div className="col-md-3 text-end">
          <button className="btn btn-info fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>➕ ANULAR COBRO</button>
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
            <th>AUTORIZÓ</th>
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

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={anulacionesFiltradas.length}
      />

      {/* MODALES REGISTRO Y EDICIÓN (Simplificado visualmente para espacio, usa la misma estructura de los inputs) */}
      {(showRegModal || showEditModal) && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header bg-dark text-white">
                <h5 className="modal-title">{showRegModal ? "Anular Cobro" : "Editar Anulación de Cobro"}</h5>
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
                      <label className="fw-bold">Motivo/Justificación:</label>
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
                      <label className="fw-bold">Motivo/Justificación:</label>
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