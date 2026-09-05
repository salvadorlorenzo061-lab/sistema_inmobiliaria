import React, { useState } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { CONTRACT_VISUAL_ASSETS } from '../utils/contractVisualAssets';
import { resolveContractTemplateId } from '../utils/contractTemplates';
import { calcularCuotaFija, generarTablaAmortizacion } from '../utils/amortizacion';

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
        setMensajeBusqueda('No se pudo consultar el cliente en este momento.');
        showFadeToast(obtenerMensajeError(error, 'No se pudo consultar el cliente en este momento.'), 'error');
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

  const construirPlanContrato = (contrato = {}) => {
    const cuotasPactadas = Math.max(Number(contrato.plazo_meses || contrato.cuotas_pactadas || 0), 0);
    const montoTotalContrato = Math.max(Number(contrato.monto_total || 0), 0);
    const engancheContrato = Math.max(Number(contrato.enganche || 0), 0);
    const interesAnualContrato = Math.max(Number(contrato.interes_porcentaje || 0), 0);
    const capitalFinanciado = Math.max(montoTotalContrato - engancheContrato, 0);
    const tablaAmortizacion = generarTablaAmortizacion(capitalFinanciado, interesAnualContrato, cuotasPactadas);
    const montoCuota = Number(contrato.monto_cuota || 0) || calcularCuotaFija(capitalFinanciado, interesAnualContrato, cuotasPactadas);
    const ultimaCuota = Number(tablaAmortizacion[tablaAmortizacion.length - 1]?.cuota_estimada || montoCuota || 0);

    return {
      cuotasPactadas,
      montoCuota,
      ultimaCuota,
      montoTotalContrato
    };
  };

  const obtenerMarcaTipoServicio = (serviciosNombres = '', formaPago = '') => {
    const normalizadoServicios = String(serviciosNombres || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const marcasPorServicio = {
      d: /(drenaje|alcantarillado)/.test(normalizadoServicios) ? '*' : '',
      t: /(tramite|gestion|gestoria|papeleria|derecho|paja)/.test(normalizadoServicios) ? '*' : '',
      e: /(electricidad|electrico|energia|luz)/.test(normalizadoServicios) ? '*' : '',
      c: /(construccion|construc)/.test(normalizadoServicios) ? '*' : ''
    };

    if (marcasPorServicio.d || marcasPorServicio.t || marcasPorServicio.e || marcasPorServicio.c) {
      return marcasPorServicio;
    }

    // Respaldo para historicos sin detalle de servicio: conserva el comportamiento anterior.
    const normalizadoPago = String(formaPago || '').toLowerCase();
    return {
      d: normalizadoPago.includes('deposit') ? '*' : '',
      t: normalizadoPago.includes('transfer') ? '*' : '',
      e: normalizadoPago.includes('efectivo') ? '*' : '',
      c: normalizadoPago.includes('cheque') ? '*' : ''
    };
  };

  const planContratoActual = estadoCuenta?.contrato ? construirPlanContrato(estadoCuenta.contrato) : null;

  const construirFilasDetalleVisual = () => {
    if (!estadoCuenta) return [];

    const detalleBase = Array.isArray(estadoCuenta.cuotasDetalle) && estadoCuenta.cuotasDetalle.length
      ? estadoCuenta.cuotasDetalle
      : (Array.isArray(estadoCuenta.pagos) ? estadoCuenta.pagos : []);

    return detalleBase
      .map((item, index) => {
        const cuotaNumero = Number(item?.numero_cuota ?? item?.numero_cuota_afectada ?? 0) || 0;
        const tipoConcepto = String(item?.tipo_concepto || item?.tipos_concepto || '').toLowerCase();
        const esEnganche = cuotaNumero === 0 || tipoConcepto.includes('enganche') || String(item?.meses_pagados || '').toLowerCase().includes('enganche');

        return {
          id: `${item?.id_pago || index}-${cuotaNumero}`,
          numeroCuota: cuotaNumero,
          nombre: esEnganche ? 'Enganche / Cuota 0' : `Cuota ${cuotaNumero || index + 1}`,
          fechaPago: item?.fecha_pago || '',
          mesesPagados: String(item?.meses_pagados || item?.mes_pagado || '').trim(),
          monto: Number(item?.monto_total_detalle ?? item?.total_cobrado ?? item?.monto_cuota ?? 0),
          conceptos: String(item?.tipos_concepto || item?.tipo_concepto || '').trim(),
          correlativo: String(item?.correlativo || item?.no_referencia || '').trim(),
          formaPago: String(item?.forma_pago || item?.banco || 'EFECTIVO').trim() || 'EFECTIVO',
          esEnganche
        };
      })
      .filter((fila) => Number.isFinite(fila.monto) && fila.monto >= 0)
      .sort((a, b) => {
        if (a.esEnganche && !b.esEnganche) return -1;
        if (!a.esEnganche && b.esEnganche) return 1;
        return (a.numeroCuota || 0) - (b.numeroCuota || 0);
      });
  };

  const filasDetalleVisual = estadoCuenta ? construirFilasDetalleVisual() : [];

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
      const logoProyectoRaw = String(
        contrato?.logo_proyecto || contrato?.logo_empresa_pdf || contrato?.logo_empresa || ''
      ).trim();
      const logoProyecto = logoProyectoRaw
        ? (logoProyectoRaw.startsWith('data:image') ? logoProyectoRaw : `data:image/png;base64,${logoProyectoRaw}`)
        : '';
      const nombreCliente = String(contrato?.nombre || 'CLIENTE').trim() || 'CLIENTE';
      const nombreProyecto = String(contrato?.nombre_proyecto || contrato?.nombre_proyecto_pdf || 'PROYECTO').trim() || 'PROYECTO';
      const loteContrato = String(contrato?.lote || contrato?.manzana || contrato?.codigo_lote || 'N/A').trim() || 'N/A';
      const serviciosContratoNombres = String(contrato.servicios_activos_nombres || '').trim();
      let serviciosCajaNombres = '';

      try {
        if (contrato.id_contrato) {
          const resServiciosCaja = await axios.get(`${API_BASE_URL}/api/caja/servicios-contrato/${contrato.id_contrato}`);
          const serviciosCaja = Array.isArray(resServiciosCaja?.data?.servicios)
            ? resServiciosCaja.data.servicios
            : [];

          serviciosCajaNombres = serviciosCaja
            .map((item) => String(item?.nombre_servicio || '').trim())
            .filter(Boolean)
            .join(', ');
        }
      } catch (servCajaErr) {
        console.warn('No se pudo consultar servicios desde Caja para estado de cuenta:', servCajaErr?.message || servCajaErr);
      }
      const formatoContrato = resolveContractTemplateId(
        contrato.formato_contrato || contrato.nombre_proyecto || contrato.nombre_tipo_contrato || ''
      );
      const { cuotasPactadas, montoCuota, ultimaCuota, montoTotalContrato } = construirPlanContrato(contrato);

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

      const nombreMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const etiquetaMesCaja = (fecha) => {
        if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
        return `${nombreMeses[fecha.getMonth()]} ${fecha.getFullYear()}`;
      };

      const pendientesCajaSet = new Set();
      try {
        if (contrato.id_contrato) {
          const resPendientesCaja = await axios.get(`${API_BASE_URL}/api/caja/meses-pendientes`, {
            params: { id_contrato: contrato.id_contrato }
          });
          const mesesPendientesCaja = Array.isArray(resPendientesCaja?.data?.meses)
            ? resPendientesCaja.data.meses
            : [];

          mesesPendientesCaja
            .map((mes) => String(mes || '').trim())
            .filter(Boolean)
            .forEach((mes) => pendientesCajaSet.add(mes));
        }
      } catch (pendientesErr) {
        console.warn('No se pudo consultar meses pendientes desde Caja:', pendientesErr?.message || pendientesErr);
      }

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
        const resumenY = 76;
        const resumenW = 196;
        const resumenH = 51;

        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.25);
        doc.rect(resumenX, resumenY, resumenW, resumenH);
        doc.line(resumenX, resumenY + 8, resumenX + resumenW, resumenY + 8);
        doc.line(resumenX, resumenY + 19, resumenX + resumenW, resumenY + 19);
        doc.line(76, resumenY + 8, 76, resumenY + resumenH);
        doc.line(127, resumenY + 8, 127, resumenY + resumenH);
        doc.line(158, resumenY + 8, 158, resumenY + resumenH);
        doc.line(158, resumenY + 27, resumenX + resumenW, resumenY + 27);
        doc.line(158, resumenY + 35, resumenX + resumenW, resumenY + 35);
        doc.line(158, resumenY + 43, resumenX + resumenW, resumenY + 43);

        doc.setFillColor(245, 245, 245);
        doc.rect(resumenX, resumenY, resumenW, 8, 'F');
        doc.setFillColor(230, 230, 230);
        doc.rect(resumenX, resumenY + 8, 66, 11, 'F');
        doc.rect(76, resumenY + 8, 51, 11, 'F');
        doc.rect(127, resumenY + 8, 31, 11, 'F');
        doc.rect(158, resumenY + 8, 48, 11, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...darkTextColor);
        doc.text((contrato.nombre || 'CLIENTE').toUpperCase(), resumenX + (resumenW / 2), resumenY + 6, { align: 'center' });

        doc.setFontSize(12);
        doc.text('DIRECCION', 43, resumenY + 15.3, { align: 'center' });
        doc.text('Monto de cuota', 101.5, resumenY + 15.3, { align: 'center' });
        doc.text('No. DE', 142.5, resumenY + 13.6, { align: 'center' });
        doc.text('CUOTA', 142.5, resumenY + 17.1, { align: 'center' });
        doc.text('CUOTA', 182, resumenY + 15.3, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(`TELEFONO: ${contrato.telefono || 'N/A'}`, 12.5, resumenY + 25.2);
        doc.text(direccionLineas.slice(0, 2), 12.5, resumenY + 34.3);

        doc.text('Cada una', 79, resumenY + 25.2);
        doc.text(formatoMoneda(montoCuota), 125.2, resumenY + 25.2, { align: 'right' });
        doc.text('Una ultima', 79, resumenY + 34.3);
        doc.text(formatoMoneda(ultimaCuota || montoCuota), 125.2, resumenY + 34.3, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(String(cuotasPactadas || 0), 142.5, resumenY + 30, { align: 'center' });

        doc.setFontSize(12);
        doc.text('TOTAL:', 159.2, resumenY + 25.2);
        doc.text(formatoMoneda(montoTotalContrato), 204.5, resumenY + 25.2, { align: 'right' });
        doc.setTextColor(198, 22, 22);
        doc.text('ENGANCHE:', 159.2, resumenY + 33.2);
        doc.text(formatoMoneda(totalEnganche), 204.5, resumenY + 33.2, { align: 'right' });
        doc.setTextColor(...darkTextColor);
        doc.text('ABONADO:', 159.2, resumenY + 41.2);
        doc.text(formatoMoneda(totalPagado), 204.5, resumenY + 41.2, { align: 'right' });
        doc.text('SALDO:', 159.2, resumenY + 49.2);
        doc.text(formatoMoneda(estadoCuenta.saldoPendiente || 0), 204.5, resumenY + 49.2, { align: 'right' });
      };

      const nombreResidenteTexto = String(contrato.nombre || '').trim();
      const nombreResidenteMayus = nombreResidenteTexto.toUpperCase();
      const nombreSinPrefijo = nombreResidenteMayus.replace(/^(SR\.?|SRA\.?|SRA\s+|SR\s+)\s*/i, '').trim();
      const tratamiento = /^SRA\.?\s+/i.test(nombreResidenteTexto) || /^SRA\.?\s+/i.test(nombreResidenteMayus) ? 'Sra.' : 'Sr.';
      const solicitanteTexto = nombreResidenteTexto
        ? `el ${tratamiento} ${nombreSinPrefijo || nombreResidenteMayus}`
        : 'el cliente';
      const cuerpoIntro = `Por medio del presente, se adjunta el detalle de pagos solicitado por ${solicitanteTexto}, el cual se especifica de manera clara la forma y fecha en que fueron aplicados cada uno de sus pagos.`;
      const fechaReporteBase = estadoCuenta?.fecha_fin || new Date();
      const fechaLarga = new Date(fechaReporteBase).toLocaleDateString('es-GT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      const filas = [];
      const pagosPorId = new Map();
      (Array.isArray(estadoCuenta.pagos) ? estadoCuenta.pagos : []).forEach((pago) => {
        const idPago = Number(pago?.id_pago || 0);
        if (idPago > 0) {
          pagosPorId.set(idPago, {
            meses_pagados: String(pago?.meses_pagados || '').trim(),
            tipos_concepto: String(pago?.tipos_concepto || '').trim(),
            monto_mora: Number(pago?.monto_mora || 0),
            correlativo: String(pago?.correlativo || '').trim(),
            no_referencia: String(pago?.no_referencia || '').trim()
          });
        }
      });

      for (let i = 1; i <= cuotasPactadas; i += 1) {
        const detalle = detallesPorCuota.get(i);
        const fechaProgramada = agregarMeses(contrato.fecha_firma, i);
        const mesCuotaEtiqueta = etiquetaMesCaja(fechaProgramada);
        const estaPendienteEnCaja = Boolean(mesCuotaEtiqueta && pendientesCajaSet.has(mesCuotaEtiqueta));
        if (!detalle && !estaPendienteEnCaja) {
          continue;
        }
        const montoProgramado = (i === cuotasPactadas && ultimaCuota > 0) ? ultimaCuota : montoCuota;
        const serviciosFuenteFila = [detalle?.servicios_nombres, serviciosContratoNombres, serviciosCajaNombres]
          .map((txt) => String(txt || '').trim())
          .filter(Boolean)
          .join(', ');

        const marcasForma = obtenerMarcaTipoServicio(
          serviciosFuenteFila,
          detalle?.forma_pago
        );
        const tienePago = Boolean(detalle?.fecha_pago);
        const idPagoDetalle = Number(detalle?.id_pago || 0);
        const pagoRef = pagosPorId.get(idPagoDetalle) || null;
        const montoMoraFila = Math.max(Number(detalle?.monto_mora || 0), Number(pagoRef?.monto_mora || 0));
        const montoReciboFila = Number(detalle?.monto_total_detalle || detalle?.monto_cuota || montoProgramado || 0);
        const mesesPagadosFila = String(detalle?.meses_pagados || pagoRef?.meses_pagados || '').trim();
        const conceptosFila = String(detalle?.tipos_concepto || pagoRef?.tipos_concepto || '')
          .split(',')
          .map((txt) => txt.trim())
          .filter(Boolean)
          .map((txt) => txt.replace(/_/g, ' '))
          .join(' + ');
        const serviciosFila = String(detalle?.servicios_nombres || '').trim();
        const correlativoFila = String(detalle?.correlativo || pagoRef?.correlativo || detalle?.no_referencia || pagoRef?.no_referencia || '').trim();
        const observacionesLista = [];

        if (mesesPagadosFila) observacionesLista.push(`Meses: ${mesesPagadosFila}`);
        if (conceptosFila) observacionesLista.push(`Conceptos: ${conceptosFila}`);
        if (serviciosFila) observacionesLista.push(`Servicios: ${serviciosFila}`);
        if (montoMoraFila > 0) observacionesLista.push(`Incluye mora Q ${montoMoraFila.toFixed(2)}`);
        if (!detalle?.fecha_pago && estaPendienteEnCaja) observacionesLista.push('Pendiente');

        const observacionFila = observacionesLista.join(' | ');

        filas.push([
          formatoFecha(fechaProgramada),
          marcasForma.d,
          marcasForma.t,
          marcasForma.e,
          marcasForma.c,
          (detalle?.no_referencia || correlativoFila || '').toString(),
          tienePago ? formatoFecha(detalle?.fecha_pago) : (estaPendienteEnCaja ? mesCuotaEtiqueta : ''),
          tienePago ? formatoMoneda(montoReciboFila) : (estaPendienteEnCaja ? formatoMoneda(montoProgramado) : ''),
          String(i),
          tienePago ? correlativoFila : '',
          observacionFila
        ]);
      }

      enganches.forEach((item) => {
        const serviciosFuenteFila = [item?.servicios_nombres, serviciosContratoNombres, serviciosCajaNombres]
          .map((txt) => String(txt || '').trim())
          .filter(Boolean)
          .join(', ');

        const marcasForma = obtenerMarcaTipoServicio(
          serviciosFuenteFila,
          item?.forma_pago
        );
        filas.push([
          formatoFecha(item?.fecha_pago),
          marcasForma.d,
          marcasForma.t,
          marcasForma.e,
          marcasForma.c,
          (item?.no_referencia || item?.correlativo || '').toString(),
          formatoFecha(item?.fecha_pago),
          formatoMoneda(item?.monto_total_detalle || 0),
          '0',
          (item?.correlativo || item?.no_referencia || '').toString(),
          'Enganche'
        ]);
      });

      const nuevoFormatoFecha = (valor) => {
        if (!valor) return '';
        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return '';
        return fecha.toLocaleDateString('es-GT');
      };

      const detalleBase = Array.isArray(estadoCuenta?.cuotasDetalle) && estadoCuenta.cuotasDetalle.length
        ? estadoCuenta.cuotasDetalle
        : (Array.isArray(estadoCuenta?.pagos) ? estadoCuenta.pagos : []);

      const detallePorCuota = new Map();
      detalleBase.forEach((pago, index) => {
        const cuotaNumero = Number(pago?.numero_cuota ?? pago?.numero_cuota_afectada ?? 0) || 0;
        const tipoConcepto = String(pago?.tipo_concepto || pago?.tipos_concepto || '').toLowerCase();
        const esEnganche = cuotaNumero === 0 || tipoConcepto.includes('enganche') || String(pago?.meses_pagados || '').toLowerCase().includes('enganche');
        const key = esEnganche ? 0 : cuotaNumero || index + 1;

        detallePorCuota.set(key, {
          cuotaNumero: key,
          fechaCuota: String(pago?.meses_pagados || pago?.mes_pagado || '').split(',').map((item) => item.trim()).filter(Boolean)[0] || 'N/A',
          tipoPago: esEnganche ? 'ENGANCHE' : 'CUOTA',
          cuotaLabel: esEnganche ? 0 : cuotaNumero || index + 1,
          banco: String(pago?.forma_pago || pago?.banco || 'EFECTIVO').trim() || 'EFECTIVO',
          noDeposito: String(pago?.no_referencia || pago?.no_deposito || pago?.numero_referencia || '').trim() || '',
          fechaPago: formatoFecha(pago?.fecha_pago),
          monto: Number(pago?.monto_total_detalle ?? pago?.total_cobrado ?? pago?.monto_cuota ?? 0),
          recibo: String(pago?.correlativo || pago?.no_referencia || pago?.id_pago || '').trim() || String(pago?.id_pago || ''),
          esEnganche
        });
      });

      const obtenerBancoDisplay = (pago) => {
        const raw = String(pago?.forma_pago || pago?.banco || pago?.metodo_pago || 'EFECTIVO').trim();
        if (!raw) return 'EFECTIVO';
        const texto = raw.toLowerCase();

        if (texto.includes('deposit') || texto.includes('depósito') || texto.includes('deposito')) return 'DEPÓSITO';
        if (texto.includes('transfer') || texto.includes('tranferencia') || texto.includes('transf')) return 'TRANSFERENCIA';
        if (texto.includes('efect') || texto.includes('cash')) return 'EFECTIVO';
        if (texto.includes('cheque')) return 'CHEQUE';

        return raw.toUpperCase();
      };

      const crearFilaPago = (pago, fechaCuota, tipoEtiqueta, cuotaLabel) => {
        if (!pago) {
          return [fechaCuota || '', tipoEtiqueta, String(cuotaLabel), '', '', '', '', ''];
        }

        const banco = obtenerBancoDisplay(pago);
        const noDeposito = String(
          pago.no_referencia || pago.no_deposito || pago.numero_referencia || pago.numero_transaccion || ''
        ).trim();
        const fechaPago = nuevoFormatoFecha(pago.fecha_pago);
        const monto = Number(pago.monto_total_detalle ?? pago.total_cobrado ?? pago.monto_cuota ?? 0);
        const recibo = String(pago.correlativo || pago.no_referencia || pago.id_pago || '').trim();

        return [
          fechaCuota || '',
          tipoEtiqueta,
          String(cuotaLabel),
          banco,
          banco === 'EFECTIVO' ? (noDeposito || '') : (noDeposito || 'N/A'),
          fechaPago,
          formatoMoneda(monto),
          recibo || ''
        ];
      };

      const filasReporte = [];

      if (enganches.length) {
        enganches.forEach((item) => {
          const monto = Number(item?.monto_total_detalle ?? item?.monto_cuota ?? 0);
          const fechaCuota = nuevoFormatoFecha(item?.fecha_pago) || 'N/A';
          const banco = obtenerBancoDisplay(item);
          const noDeposito = String(item?.no_referencia || item?.no_deposito || item?.numero_referencia || item?.numero_transaccion || '').trim();
          const recibo = String(item?.correlativo || item?.no_referencia || item?.id_pago || '').trim();

          filasReporte.push([
            fechaCuota,
            'ENGANCHE',
            '0',
            banco,
            banco === 'EFECTIVO' ? (noDeposito || '') : (noDeposito || 'N/A'),
            nuevoFormatoFecha(item?.fecha_pago),
            formatoMoneda(monto),
            recibo || ''
          ]);
        });
      }

      const totalCuotas = Math.max(Number(cuotasPactadas || 0), 0);
      for (let cuota = 1; cuota <= totalCuotas; cuota += 1) {
        const pagoDetalle = detallePorCuota.get(cuota) || null;
        const fechaCuota = nuevoFormatoFecha(agregarMeses(contrato?.fecha_firma, cuota));
        filasReporte.push(
          pagoDetalle
            ? crearFilaPago(pagoDetalle, fechaCuota, 'CUOTA', cuota)
            : [fechaCuota || '', 'PENDIENTE', String(cuota), '', '', '', '', '']
        );
      }

      const tablaDetallePagos = filasReporte.length
        ? filasReporte
        : [['', '', '', '', '', '', 'Q 0.00', 'Sin pagos registrados']];

      const headerY = 72;
      if (logoProyecto) {
        try {
          doc.addImage(logoProyecto, 'PNG', 18, 12, 34, 24, `logo-proyecto-detalle-${Date.now()}`, 'FAST');
        } catch (error) {
          console.warn('No se pudo cargar el logotipo del proyecto:', error);
        }
      }

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setTextColor(35, 35, 35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('GRUPO DE INVERSIONES', pageWidth / 2, 24, { align: 'center' });
      doc.setFontSize(18);
      doc.text('DETALLE DE PAGOS', pageWidth / 2, 40, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('CLIENTE', 16, headerY);
      doc.text(nombreCliente.toUpperCase(), 50, headerY);
      doc.text('PROYECTO', 16, headerY + 9);
      doc.text(nombreProyecto.toUpperCase(), 50, headerY + 9);
      doc.text('ID CLIENTE', 120, headerY);
      doc.text(String(contrato?.id_residente || contrato?.id_cliente || 'N/D'), 160, headerY);
      doc.text('LOTE / MANZANA', 120, headerY + 9);
      doc.text(loteContrato, 168, headerY + 9);

      autoTable(doc, {
        startY: headerY + 18,
        margin: { left: 10, right: 10 },
        head: [[
          'Fecha cuota',
          'Tipo de pago',
          'Cuota',
          'Banco',
          'No. depósito',
          'Fecha pago',
          'Monto',
          'Recibo'
        ]],
        body: tablaDetallePagos,
        theme: 'grid',
        styles: {
          fontSize: 8.2,
          halign: 'center',
          valign: 'middle',
          overflow: 'linebreak',
          lineColor: [120, 120, 120],
          lineWidth: 0.2,
          cellPadding: 1.7,
          textColor: [20, 20, 20]
        },
        headStyles: {
          fillColor: [20, 96, 220],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 24 },
          2: { cellWidth: 14 },
          3: { cellWidth: 18 },
          4: { cellWidth: 22 },
          5: { cellWidth: 24 },
          6: { cellWidth: 21 },
          7: { cellWidth: 18 }
        },
        didDrawPage: (data) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(90, 90, 90);
          doc.text(`Página ${data.pageNumber}`, pageWidth - 18, pageHeight - 8, { align: 'right' });
        }
      });

      const fileName = `DetallePago_${estadoCuenta.contrato.codigo_contrato || 'cliente'}.pdf`;
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
          <h3 className="mb-0">📋 Detalle de Pagos</h3>
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
              <h5 className="text-secondary">Clientes encontrados:</h5>
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
                {/* DATOS DEL CLIENTE */}
                <div className="col-md-6 mb-3">
                  <div className="card border-primary estado-cuenta-summary-card">
                    <div className="card-header bg-primary text-white">
                      <h6 className="mb-0">👤 Datos del Cliente</h6>
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
                        {Number(planContratoActual?.montoCuota || 0).toFixed(2)}
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
                  {filasDetalleVisual.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped table-hover">
                        <thead className="table-dark">
                          <tr>
                            <th>Cuota / Enganche</th>
                            <th>Meses</th>
                            <th>Fecha de Pago</th>
                            <th>Monto</th>
                            <th>Conceptos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filasDetalleVisual.map((fila) => (
                            <tr key={fila.id}>
                              <td>
                                <strong>{fila.nombre}</strong>
                              </td>
                              <td>{fila.mesesPagados || 'N/A'}</td>
                              <td>{fila.fechaPago ? new Date(fila.fechaPago).toLocaleDateString() : 'N/A'}</td>
                              <td>
                                <span className="badge bg-success">
                                  Q{Number(fila.monto || 0).toFixed(2)}
                                </span>
                              </td>
                              <td>
                                <div className="d-flex flex-wrap gap-1">
                                  {String(fila.conceptos || '')
                                    .split(',')
                                    .map((item) => item.trim())
                                    .filter(Boolean)
                                    .map((tipo) => (
                                      <span key={`${fila.id}-${tipo}`} className={`badge ${tipo === 'mora' ? 'bg-danger' : 'bg-secondary'}`}>
                                        {tipo.toUpperCase()}
                                      </span>
                                    ))}
                                  {!String(fila.conceptos || '').trim() && (
                                    <span className="badge bg-secondary">PAGO</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="alert alert-warning mb-0">
                      ⚠️ No hay pagos registrados para este cliente.
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
