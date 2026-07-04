import React, { useState } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { CONTRACT_VISUAL_ASSETS } from '../utils/contractVisualAssets';
import { resolveContractTemplateId } from '../utils/contractTemplates';

const EstadoCuenta = () => {
  const [busqueda, setBusqueda] = useState('');
  const [listaResidentes, setListaResidentes] = useState([]);
  const [estadoCuenta, setEstadoCuenta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mensajeBusqueda, setMensajeBusqueda] = useState('');
  const [tipoMensajeBusqueda, setTipoMensajeBusqueda] = useState('info');
  const [mostrarModalFechas, setMostrarModalFechas] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [idContratoActual, setIdContratoActual] = useState(null);

  const showFadeToast = (message, icon = 'info') => {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon,
      title: message,
      showConfirmButton: false,
      timer: 2600,
      timerProgressBar: true,
      showClass: {
        popup: 'swal-toast-fade-in'
      },
      hideClass: {
        popup: 'swal-toast-fade-out'
      }
    });
  };

  const obtenerMensajeError = (error, fallback) => {
    const status = error?.response?.status;
    const rawMessage = String(error?.response?.data || '').trim();

    if (status === 404 && rawMessage) {
      return rawMessage;
    }

    if (rawMessage && /closed state|protocol|connect|network|timeout|socket|mysql/i.test(rawMessage)) {
      return fallback;
    }

    return rawMessage || fallback;
  };

  // Buscar residente
  const buscarResidente = async () => {
    if (!busqueda.trim()) {
      showFadeToast('Ingresa nombre, DPI, clave o numero de contrato para buscar', 'warning');
      return;
    }
    
    setLoading(true);
    setMensajeBusqueda('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/estado_cuenta/buscar-residente?criterio=${encodeURIComponent(busqueda)}`
      );
      const resultados = Array.isArray(res.data) ? res.data : [];
      setListaResidentes(resultados);
      setEstadoCuenta(null);
      if (resultados.length === 0) {
        setTipoMensajeBusqueda('warning');
        setMensajeBusqueda('No hay datos que coincidan con la búsqueda realizada.');
      } else {
        setTipoMensajeBusqueda('info');
        setMensajeBusqueda('');
      }
    } catch (error) {
      setListaResidentes([]);
      setEstadoCuenta(null);

      if (error?.response?.status === 404) {
        setTipoMensajeBusqueda('warning');
        setMensajeBusqueda('No hay datos que coincidan con la búsqueda realizada.');
      } else {
        setTipoMensajeBusqueda('danger');
        setMensajeBusqueda('No se pudo consultar el residente en este momento.');
        showFadeToast(obtenerMensajeError(error, 'No se pudo consultar el residente en este momento.'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Obtener estado de cuenta
  const obtenerEstadoCuenta = async (id_contrato, fInicio = '', fFin = '') => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/api/estado_cuenta/estado-cuenta/${id_contrato}`;
      if (fInicio && fFin) {
        url += `?fecha_inicio=${fInicio}&fecha_fin=${fFin}`;
      }
      
      const res = await axios.get(url);
      setEstadoCuenta(res.data);
      setListaResidentes([]);
      setMensajeBusqueda('');
      setTipoMensajeBusqueda('info');
      setMostrarModalFechas(false);
      setFechaInicio('');
      setFechaFin('');
    } catch (error) {
      showFadeToast(obtenerMensajeError(error, 'No se pudo obtener el estado de cuenta en este momento.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Limpiar búsqueda
  const limpiar = () => {
    setBusqueda('');
    setListaResidentes([]);
    setEstadoCuenta(null);
    setMensajeBusqueda('');
    setTipoMensajeBusqueda('info');
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
      showFadeToast('Por favor, selecciona fecha de inicio y fin', 'warning');
      return;
    }
    if (new Date(fechaInicio) > new Date(fechaFin)) {
      showFadeToast('La fecha de inicio debe ser menor o igual a la fecha fin', 'warning');
      return;
    }
    obtenerEstadoCuenta(idContratoActual, fechaInicio, fechaFin);
  };

  // Obtener sin filtro de fechas
  const obtenerSinFiltro = () => {
    obtenerEstadoCuenta(idContratoActual);
  };

  const formatoFecha = (valor) => {
    if (!valor) return '';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';
    return fecha.toLocaleDateString('es-GT');
  };

  const formatoMoneda = (valor) => {
    const numero = Number(valor || 0);
    return `Q ${numero.toLocaleString('es-GT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const agregarMeses = (fechaBase, meses) => {
    const base = new Date(fechaBase);
    if (Number.isNaN(base.getTime())) return null;
    const nueva = new Date(base);
    nueva.setMonth(nueva.getMonth() + meses);
    return nueva;
  };

  const obtenerMarcaFormaPago = (formaPago = '') => {
    const normalizado = String(formaPago || '').toLowerCase();
    return {
      d: normalizado.includes('deposit') ? '*' : '',
      t: normalizado.includes('transfer') ? '*' : '',
      e: normalizado.includes('efectivo') ? '*' : '',
      c: normalizado.includes('cheque') ? '*' : ''
    };
  };

  const exportarEstadoCuentaPDF = async () => {
    if (!estadoCuenta) {
      showFadeToast('Primero debes cargar un estado de cuenta.', 'warning');
      return;
    }

    try {
      const doc = new jsPDF('p', 'mm', 'letter');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const goldColor = [173, 136, 38];
      const darkTextColor = [35, 35, 35];
      const borderColor = [85, 85, 85];

      const contrato = estadoCuenta.contrato || {};
      const formatoContrato = resolveContractTemplateId(
        contrato.formato_contrato || contrato.nombre_proyecto || contrato.nombre_tipo_contrato || ''
      );
      const cuotasPactadas = Number(contrato.cuotas_pactadas || 0);
      const montoTotalContrato = Number(contrato.monto_total || 0);
      const montoCuota = Number(contrato.monto_cuota || 0);
      const ultimaCuota = cuotasPactadas > 1
        ? Math.max(0, montoTotalContrato - (montoCuota * (cuotasPactadas - 1)))
        : montoTotalContrato;

      const detallesPorCuota = new Map();
      const detalleRaw = Array.isArray(estadoCuenta.cuotasDetalle) ? estadoCuenta.cuotasDetalle : [];
      detalleRaw.forEach((item) => {
        const cuota = Number(item?.numero_cuota || 0);
        if (cuota > 0 && !detallesPorCuota.has(cuota)) {
          detallesPorCuota.set(cuota, item);
        }
      });

      if (!detallesPorCuota.size && Array.isArray(estadoCuenta.pagos)) {
        const pagosAsc = [...estadoCuenta.pagos].sort((a, b) => new Date(a.fecha_pago) - new Date(b.fecha_pago));
        pagosAsc.forEach((pago, idx) => {
          const cuota = idx + 1;
          if (cuota <= cuotasPactadas) {
            detallesPorCuota.set(cuota, {
              numero_cuota: cuota,
              fecha_pago: pago.fecha_pago,
              forma_pago: pago.forma_pago,
              no_referencia: pago.no_referencia,
              id_pago: pago.id_pago,
              monto_cuota: pago.total_cobrado,
              monto_total_detalle: pago.total_cobrado,
              meses_pagados: pago.meses_pagados,
              tipos_concepto: 'cuota_terreno'
            });
          }
        });
      }

      const enganches = detalleRaw.filter((item) => Number(item?.numero_cuota || 0) === 0);
      const totalEnganche = enganches.reduce((acc, item) => acc + Number(item?.monto_total_detalle || 0), 0);

      const obtenerBackgroundFormato = () => {
        switch (formatoContrato) {
          case 'FORMATO_01':
            return CONTRACT_VISUAL_ASSETS.FORMATO_01_MAIN;
          case 'FORMATO_02':
            return CONTRACT_VISUAL_ASSETS.FORMATO_02_MAIN;
          case 'FORMATO_03':
            return CONTRACT_VISUAL_ASSETS.FORMATO_03_MAIN;
          default:
            return null;
        }
      };

      const dibujarMembrete = (paginaActual) => {
        const backgroundAsset = obtenerBackgroundFormato();

        if (backgroundAsset) {
          doc.addImage(backgroundAsset, 'PNG', 8, 8, pageWidth - 16, pageHeight - 16, `estado-cuenta-main-${formatoContrato}-${paginaActual}`, 'FAST');
        } else if (formatoContrato === 'FORMATO_04' && CONTRACT_VISUAL_ASSETS.FORMATO_04_HEADER) {
          doc.addImage(CONTRACT_VISUAL_ASSETS.FORMATO_04_HEADER, 'PNG', 8, 8, pageWidth - 16, 26, `estado-cuenta-header-${paginaActual}`, 'FAST');
        } else {
          doc.setFillColor(...goldColor);
          doc.rect(0, 0, pageWidth, 6, 'F');
        }

        if (backgroundAsset) {
          // El fondo de formato completo ya contiene pie de página.
        } else if (formatoContrato === 'FORMATO_04' && CONTRACT_VISUAL_ASSETS.FORMATO_04_FOOTER) {
          doc.addImage(CONTRACT_VISUAL_ASSETS.FORMATO_04_FOOTER, 'PNG', 8, pageHeight - 19, pageWidth - 16, 10, `estado-cuenta-footer-${paginaActual}`, 'FAST');
        } else {
          doc.setFillColor(...goldColor);
          doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Pagina ${paginaActual}`, pageWidth - 14, pageHeight - 3, { align: 'right' });
      };

      const dibujarResumenContrato = () => {
        const direccion = String(contrato.direccion_notificacion || '').trim() || 'DIRECCION NO REGISTRADA';
        const direccionLineas = doc.splitTextToSize(direccion, 57);
        const totalPagado = Number(estadoCuenta.totalPagado || 0);
        const resumenX = 10;
        const resumenY = 57;
        const resumenW = 196;
        const resumenH = 37;

        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.25);
        doc.rect(resumenX, resumenY, resumenW, resumenH);
        doc.line(resumenX, resumenY + 6, resumenX + resumenW, resumenY + 6);
        doc.line(resumenX, resumenY + 14, resumenX + resumenW, resumenY + 14);
        doc.line(76, resumenY + 6, 76, resumenY + resumenH);
        doc.line(127, resumenY + 6, 127, resumenY + resumenH);
        doc.line(158, resumenY + 6, 158, resumenY + resumenH);
        doc.line(158, resumenY + 19.5, resumenX + resumenW, resumenY + 19.5);
        doc.line(158, resumenY + 25, resumenX + resumenW, resumenY + 25);
        doc.line(158, resumenY + 30.5, resumenX + resumenW, resumenY + 30.5);

        doc.setFillColor(245, 245, 245);
        doc.rect(resumenX, resumenY, resumenW, 6, 'F');
        doc.setFillColor(230, 230, 230);
        doc.rect(resumenX, resumenY + 6, 66, 8, 'F');
        doc.rect(76, resumenY + 6, 51, 8, 'F');
        doc.rect(127, resumenY + 6, 31, 8, 'F');
        doc.rect(158, resumenY + 6, 48, 8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...darkTextColor);
        doc.text((contrato.nombre || 'RESIDENTE').toUpperCase(), resumenX + (resumenW / 2), resumenY + 4.1, { align: 'center' });

        doc.setFontSize(7);
        doc.text('DIRECCION', 43, resumenY + 11, { align: 'center' });
        doc.text('Monto de cuota', 101.5, resumenY + 11, { align: 'center' });
        doc.text('No. DE', 142.5, resumenY + 9.4, { align: 'center' });
        doc.text('CUOTA', 142.5, resumenY + 12.4, { align: 'center' });
        doc.text('CUOTA', 182, resumenY + 11, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.text(`TELEFONO: ${contrato.telefono || 'N/A'}`, 12.5, resumenY + 18.2);
        doc.text(direccionLineas.slice(0, 2), 12.5, resumenY + 23.2);

        doc.text('Cada una', 80, resumenY + 18.2);
        doc.text(formatoMoneda(montoCuota), 123.5, resumenY + 18.2, { align: 'right' });
        doc.text('Una ultima', 80, resumenY + 25.4);
        doc.text(formatoMoneda(ultimaCuota || montoCuota), 123.5, resumenY + 25.4, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(String(cuotasPactadas || 0), 142.5, resumenY + 21.8, { align: 'center' });

        doc.setFontSize(6.6);
        doc.text('TOTAL:', 161, resumenY + 18.2);
        doc.text(formatoMoneda(montoTotalContrato), 203, resumenY + 18.2, { align: 'right' });
        doc.setTextColor(198, 22, 22);
        doc.text('ENGANCHE:', 161, resumenY + 23.7);
        doc.text(formatoMoneda(totalEnganche), 203, resumenY + 23.7, { align: 'right' });
        doc.setTextColor(...darkTextColor);
        doc.text('ABONADO:', 161, resumenY + 29.2);
        doc.text(formatoMoneda(totalPagado), 203, resumenY + 29.2, { align: 'right' });
        doc.text('SALDO:', 161, resumenY + 34.7);
        doc.text(formatoMoneda(estadoCuenta.saldoPendiente || 0), 203, resumenY + 34.7, { align: 'right' });
      };

      const nombreResidenteTexto = String(contrato.nombre || '').trim();
      const nombreResidenteMayus = nombreResidenteTexto.toUpperCase();
      const nombreSinPrefijo = nombreResidenteMayus.replace(/^(SR\.?|SRA\.?|SRA\s+|SR\s+)\s*/i, '').trim();
      const tratamiento = /^SRA\.?\s+/i.test(nombreResidenteTexto) || /^SRA\.?\s+/i.test(nombreResidenteMayus) ? 'Sra.' : 'Sr.';
      const solicitanteTexto = nombreResidenteTexto
        ? `el ${tratamiento} ${nombreSinPrefijo || nombreResidenteMayus}`
        : 'el residente';
      const cuerpoIntro = `Por medio del presente, se adjunta el detalle de pagos solicitado por ${solicitanteTexto}, el cual se especifica de manera clara la forma y fecha en que fueron aplicados cada uno de sus pagos.`;
      const fechaReporteBase = estadoCuenta?.fecha_fin || new Date();
      const fechaLarga = new Date(fechaReporteBase).toLocaleDateString('es-GT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      const filas = [];
      for (let i = 1; i <= cuotasPactadas; i += 1) {
        const detalle = detallesPorCuota.get(i);
        const fechaProgramada = agregarMeses(contrato.fecha_firma, i);
        const montoProgramado = (i === cuotasPactadas && ultimaCuota > 0) ? ultimaCuota : montoCuota;
        const marcasForma = obtenerMarcaFormaPago(detalle?.forma_pago);
        const tienePago = Boolean(detalle?.fecha_pago);

        filas.push([
          formatoFecha(fechaProgramada),
          marcasForma.d,
          marcasForma.t,
          marcasForma.e,
          marcasForma.c,
          (detalle?.no_referencia || '').toString(),
          tienePago ? formatoFecha(detalle?.fecha_pago) : '',
          tienePago ? formatoMoneda(Number(detalle?.monto_cuota || montoProgramado || 0)) : '',
          String(i),
          tienePago && detalle?.id_pago ? String(detalle.id_pago) : '',
          detalle?.fecha_pago ? '' : 'Pendiente'
        ]);
      }

      enganches.forEach((item) => {
        const marcasForma = obtenerMarcaFormaPago(item?.forma_pago);
        filas.push([
          formatoFecha(item?.fecha_pago),
          marcasForma.d,
          marcasForma.t,
          marcasForma.e,
          marcasForma.c,
          (item?.no_referencia || '').toString(),
          formatoFecha(item?.fecha_pago),
          formatoMoneda(item?.monto_total_detalle || 0),
          '0',
          item?.id_pago ? String(item.id_pago) : '',
          'Enganche'
        ]);
      });

      autoTable(doc, {
        startY: 94,
        margin: { top: 44, bottom: 18, left: 10, right: 10 },
        head: [
          [
            { content: 'FECHA', rowSpan: 2 },
            { content: 'Forma.P', colSpan: 4 },
            { content: 'NO.', rowSpan: 2 },
            { content: 'FECHA DE PAGO', rowSpan: 2 },
            { content: 'MONTO DEL RECIBO', rowSpan: 2 },
            { content: 'No.DE CUOTA', rowSpan: 2 },
            { content: 'RECIBO No.', rowSpan: 2 },
            { content: 'OBSERVACIONES', rowSpan: 2 }
          ],
          ['D', 'T', 'E', 'C']
        ],
        body: filas.length ? filas : [['', '', '', '', '', '', '', '', '', '', 'Sin pagos registrados']],
        theme: 'grid',
        styles: {
          fontSize: 6.6,
          lineColor: borderColor,
          lineWidth: 0.1,
          cellPadding: 1.3,
          textColor: [20, 20, 20]
        },
        headStyles: {
          fillColor: [236, 236, 236],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          fontSize: 6.5
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255]
        },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 6, halign: 'center' },
          2: { cellWidth: 6, halign: 'center' },
          3: { cellWidth: 6, halign: 'center' },
          4: { cellWidth: 6, halign: 'center' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 20, halign: 'center' },
          7: { cellWidth: 21, halign: 'right' },
          8: { cellWidth: 13, halign: 'center' },
          9: { cellWidth: 15, halign: 'center' },
          10: { cellWidth: 27 }
        },
        didDrawPage: (data) => {
          dibujarMembrete(data.pageNumber);

          if (data.pageNumber === 1) {
            if (!obtenerBackgroundFormato()) {
              doc.setTextColor(...goldColor);
              doc.setFillColor(...goldColor);
              doc.rect(0, 40, pageWidth, 4.5, 'F');
            }
            doc.setTextColor(45);
            doc.setFont('times', 'normal');
            doc.setFontSize(8.4);
            doc.text(`Guatemala, ${fechaLarga}`, pageWidth - 14, 50, { align: 'right' });

            const introLines = doc.splitTextToSize(cuerpoIntro, 188);
            doc.setFontSize(7.5);
            doc.text(introLines, 28, 60);
            dibujarResumenContrato();
          } else {
            doc.setFont('times', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(160, 160, 160);
            doc.text('CORPORACION DE', pageWidth / 2, pageHeight / 2 - 8, { align: 'center', angle: 45 });
            doc.text('INVERSION', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
            doc.text('INMOBILIARIA', pageWidth / 2, pageHeight / 2 + 8, { align: 'center', angle: 45 });
          }
        }
      });

      const fileName = `EstadoCuenta_${estadoCuenta.contrato.codigo_contrato || 'residente'}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      showFadeToast('No se pudo generar el PDF del estado de cuenta.', 'error');
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
            <div className="row mb-4 align-items-stretch">
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
                <div className="estado-cuenta-actions">
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
                  <div className="card border-primary estado-cuenta-summary-card">
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
                  <div className="card border-success estado-cuenta-summary-card">
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
            <div className={`alert alert-${tipoMensajeBusqueda === 'danger' ? 'danger' : tipoMensajeBusqueda === 'warning' ? 'warning' : 'info'}`}>
              {mensajeBusqueda || 'Ingresa los datos de búsqueda y presiona "Buscar" para ver el estado de cuenta.'}
            </div>
          )}

          {/* MODAL PARA FILTRAR POR FECHAS */}
          {mostrarModalFechas && (
            <div className="modal d-block estado-cuenta-modal" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
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
