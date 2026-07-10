import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import 'bootstrap/dist/css/bootstrap.min.css';
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

            
            // Si solo encuentra uno, lo selecciona automáticamente
            if (res.data.length === 1) {
                seleccionarResidente(res.data[0]);
            }
        } catch (error) {
            mostrarToast(error.response?.data || "Error al buscar residente", "error");
            setListaResidentes([]);
            setDatosDeuda(null);
        }
    };

    // Al dar clic sobre un residente de la lista de resultados
    const seleccionarResidente = async (residente) => {
        setDatosDeuda(residente);
        setIdResidenteActivo(residente.id_residente);
        setEstadoCorrelativo(null);
        setListaResidentes([]); // Limpia la lista de búsqueda en pantalla
        setMesesSeleccionados([]);
        setServiciosContrato([]);
        setServiciosSeleccionados([]);
        setNumCuota('0');
        setMontoMora('0');
        setMontoTotalSeleccionado(0);
        setMontoTerrenoSeleccionado(0);
        setMontoInteresSeleccionado(0);
        setMorasPendientes([]);
        setMorasSeleccionadas([]);
        setMontoServiciosSeleccionado(0);
        setResumenServiciosIniciales(null);

        try {
            await consultarSiguienteCorrelativo(residente.id_contrato);
            const res = await axios.get(`${API_BASE_URL}/api/caja/meses-pendientes?id_contrato=${residente.id_contrato}`);
            const meses = res?.data?.meses || [];
            setMesesPendientes(meses);
            
            // ✅ Seleccionar mes actual y el siguiente (si existe)
            const mesesASeleccionar = [];
            if (meses.length > 0) {
                mesesASeleccionar.push(meses[0]); // Mes actual
                if (meses.length > 1) {
                    mesesASeleccionar.push(meses[1]); // Mes siguiente
                }
            }
            setMesesSeleccionados(mesesASeleccionar);
            setNumCuota(meses.length ? '1' : '0');
            
            if (meses.length) {
                setMesPagado(meses[0]);
            } else {
                setMesPagado('');
            }
            setOpcionesCuota(meses.length ? meses.map((mes, index) => ({ value: String(index + 1), label: `Cuota ${index + 1} - ${mes}` })) : [{ value: '0', label: 'Sin cuotas pendientes' }]);

            const primerMes = mesesASeleccionar[0] || meses[0] || '';
            if (primerMes) {
                try {
                    const serviciosRes = await axios.get(`${API_BASE_URL}/api/caja/servicios-contrato/${residente.id_contrato}?mes=${encodeURIComponent(primerMes)}`);
                    const servicios = filtrarServiciosMostrables(serviciosRes?.data?.servicios || []);
                    setServiciosContrato(servicios);

                    const seleccionInicialServicios = servicios
                        .filter((s) => !s.ya_pagado_mes)
                        .map((s) => s.id_servicio);

                    setServiciosSeleccionados(seleccionInicialServicios);
                    recalcularTotalesCobro(mesesASeleccionar, seleccionInicialServicios, residente, servicios);
                } catch (serviciosError) {
                    console.error('Error al obtener servicios del contrato:', serviciosError);
                    setServiciosContrato([]);
                    setServiciosSeleccionados([]);
                    // Mantener meses pendientes aunque servicios falle, para no bloquear el cobro de terreno.
                    recalcularTotalesCobro(mesesASeleccionar, [], residente, []);
                }
            } else {
                recalcularTotalesCobro(mesesASeleccionar, [], residente);
            }

            try {
                const morasRes = await axios.get(`${API_BASE_URL}/api/caja/moras-pendientes/${residente.id_contrato}`);
                const moras = Array.isArray(morasRes?.data?.moras) ? morasRes.data.moras : [];
                setMorasPendientes(moras);
                setMorasSeleccionadas(moras.map((mora) => Number(mora.id_morosidad)).filter((id) => Number.isInteger(id) && id > 0));
            } catch (moraError) {
                console.error('Error al consultar moras pendientes:', moraError);
                setMorasPendientes([]);
                setMorasSeleccionadas([]);
                setMontoMora('0');
            }

            const saldoPendienteResidente = parseFloat(residente?.saldo_pendiente || 0);
            if (saldoPendienteResidente <= 0) {
                mostrarToast('Contrato de terreno solvente. Solo se mostrarán servicios pendientes de cobro.', 'info');
            }
            if (saldoPendienteResidente > 0 && meses.length === 0) {
                mostrarToast('La cuenta ya se encuentra solvente para cuotas de terreno.', 'info');
            }
        } catch (error) {
            console.error('Error al obtener meses pendientes:', error);
            setMesesPendientes([]);
            setMesesSeleccionados([]);
            setMesPagado('');
            setOpcionesCuota([{ value: '0', label: 'Sin cuotas pendientes' }]);
            recalcularTotalesCobro([], [], residente);
        }
    };

    const actualizarMontoParaSeleccion = (seleccionados) => {
        recalcularTotalesCobro(seleccionados, serviciosSeleccionados, datosDeuda);
    };

    const toggleMesSeleccionado = (mes) => {
        setMesesSeleccionados(prev => {
            const next = prev.includes(mes) ? prev.filter(item => item !== mes) : [...prev, mes];
            const siguienteMes = next.length ? next[0] : (mesesPendientes[0] || '');
            setMesPagado(siguienteMes);
            actualizarMontoParaSeleccion(next);
            return next;
        });
    };

    const toggleServicioSeleccionado = (idServicio) => {
        setServiciosSeleccionados(prev => {
            const next = prev.includes(idServicio) ? prev.filter(id => id !== idServicio) : [...prev, idServicio];
            recalcularTotalesCobro(mesesSeleccionados, next, datosDeuda);
            return next;
        });
    };

    const toggleMoraSeleccionada = (idMorosidad) => {
        setMorasSeleccionadas((actuales) => {
            if (actuales.includes(idMorosidad)) {
                return actuales.filter((id) => id !== idMorosidad);
            }
            return [...actuales, idMorosidad];
        });
    };

    useEffect(() => {
        if (!Array.isArray(morasPendientes) || !morasPendientes.length) {
            setMontoMora('0');
            return;
        }

        const totalSeleccionado = morasPendientes
            .filter((mora) => morasSeleccionadas.includes(Number(mora.id_morosidad)))
            .reduce((sum, mora) => sum + Number(mora.monto_mora || 0), 0);

        setMontoMora(String(Number(totalSeleccionado).toFixed(2)));
    }, [morasPendientes, morasSeleccionadas]);

    // Procesar Cobro utilizando el puerto correcto 3001 y Generar PDF
    const ejecutarCobro = async (e) => {
        e.preventDefault();

        const saldoPendienteActual = parseFloat(datosDeuda?.saldo_pendiente || 0);
        const montoSolicitado = parseFloat(montoAPagar || 0);
        const montoTerreno = parseFloat(montoTerrenoSeleccionado || 0);

        if (!contratoTieneAsignacionValida(datosDeuda)) {
            mostrarToast('No se puede generar cobro: el contrato no tiene empresa y/o proyecto asignado.', 'warning');
            return;
        }

        if (!usuarioTienePermisoCobro(datosDeuda)) {
            mostrarToast('No se puede generar cobro: este contrato no pertenece a tus correlativos asignados.', 'warning');
            return;
        }

        if (!Number.isFinite(montoSolicitado) || montoSolicitado <= 0) {
            mostrarToast('El monto a cobrar debe ser mayor a cero.', 'warning');
            return;
        }

        if (!mesesSeleccionados.length) {
            mostrarToast('Debe seleccionar al menos un mes pendiente para generar el cobro.', 'warning');
            return;
        }

        if (montoTerreno > 0 && saldoPendienteActual <= 0) {
            mostrarToast('Este contrato ya está solvente para cuota de terreno.', 'warning');
            return;
        }

        if (montoTerreno > saldoPendienteActual) {
            mostrarToast(`El monto excede el saldo pendiente (Q${saldoPendienteActual.toFixed(2)}).`, 'warning');
            return;
        }

        const serviciosPayload = (serviciosContrato || [])
            .filter((servicio) => serviciosSeleccionados.includes(servicio.id_servicio))
            .map((servicio) => ({
                id_servicio: servicio.es_extraordinario ? null : servicio.id_servicio,
                id_pago_extra: servicio.id_pago_extra || null,
                es_extraordinario: Boolean(servicio.es_extraordinario),
                nombre_servicio: servicio.nombre_servicio,
                subtotal: parseFloat(servicio.costo_servicio || 0),
                periodicidad: servicio.periodicidad || 'mensual',
                es_cobro_unico: Boolean(servicio.es_cobro_unico)
            }));
        
        const payload = {
            id_residente: idResidenteActivo,
            id_contrato: datosDeuda.id_contrato,
            id_tipo_contrato: datosDeuda.id_tipo_contrato || 1, 
            id_usuario: obtenerUsuarioActivo(), 
            monto_pagar: montoSolicitado,
            monto_terreno_pagar: montoTerreno,
            monto_interes: parseFloat(montoInteresSeleccionado || 0),
            monto_mora: parseFloat(montoMora),
            metodo_pago: metodoPago,
            no_referencia: metodoPago === 'Efectivo' ? 'N/A' : referencia, 
            observaciones: `Pago de cuota de terreno mes de ${mesesSeleccionados.join(', ') || mesPagado}`,
            mes_pagado: mesesSeleccionados[0] || mesPagado,
            meses_pagados: mesesSeleccionados.length ? mesesSeleccionados : [mesPagado],
            numero_cuota: parseInt(numCuota),
            servicios_pagados: serviciosPayload,
            moras_aplicadas: (morasPendientes || [])
                .filter((mora) => morasSeleccionadas.includes(Number(mora.id_morosidad)))
                .map((mora) => ({
                    id_morosidad: Number(mora.id_morosidad || 0),
                    mes_atrasado: String(mora.mes_atrasado || ''),
                    monto_mora: Number(mora.monto_mora || 0)
                }))
        };

        try {
            const response = await axios.post(`${API_BASE_URL}/api/caja/procesar-pago`, payload);
            
            if (response?.data?.success) {
                mostrarToast("¡Cobro realizado con éxito! Generando recibo...", "success");
                const empresaPdf = {
                    ...(response.data?.empresa || {}),
                    logo_empresa: datosDeuda?.logo_empresa_pdf || response.data?.empresa?.logo_empresa || response.data?.empresa?.logo || null,
                    logo_proyecto: datosDeuda?.logo_proyecto || response.data?.empresa?.logo_proyecto || response.data?.empresa?.logo || null,
                    logo: datosDeuda?.logo_empresa_pdf || response.data?.empresa?.logo_empresa || response.data?.empresa?.logo || null,
                    nombre_empresa: datosDeuda?.nombre_marca_pdf || response.data?.empresa?.nombre_empresa || response.data?.empresa?.nombre || null,
                    nombre_proyecto: datosDeuda?.nombre_proyecto_pdf || datosDeuda?.nombre_proyecto || response.data?.empresa?.nombre_proyecto || null,
                    nombre: datosDeuda?.nombre_marca_pdf || response.data?.empresa?.nombre || response.data?.empresa?.nombre_empresa || null
                };

                generarPDF(response.data, {
                    ...datosDeuda,
                    nombre: datosDeuda?.nombre || 'Residente',
                    dpi: datosDeuda?.dpi || 'N/A',
                    codigo_contrato: datosDeuda?.codigo_contrato || 'N/A',
                    nombre_contrato: datosDeuda?.nombre_contrato || 'Contrato',
                    saldo_pendiente: datosDeuda?.saldo_pendiente || 0
                }, empresaPdf);
                
                setDatosDeuda(prev => ({
                    ...prev,
                    saldo_pendiente: Math.max(parseFloat(prev?.saldo_pendiente || 0) - montoTerreno, 0)
                }));

                if (Number(response?.data?.monto_servicios_mes_inicial || 0) > 0) {
                    const serviciosIniciales = Array.isArray(response?.data?.servicios_cobrados_mes_inicial)
                        ? response.data.servicios_cobrados_mes_inicial
                        : [];
                    setResumenServiciosIniciales({
                        monto: Number(response.data.monto_servicios_mes_inicial || 0),
                        servicios: serviciosIniciales
                    });

                    Swal.fire({
                        icon: 'info',
                        title: 'Servicios iniciales agregados automáticamente',
                        text: `Se cobraron Q${Number(response.data.monto_servicios_mes_inicial || 0).toFixed(2)} por amenidades del mes inicial en este mismo recibo.`,
                        timer: 2800,
                        showConfirmButton: false
                    });
                } else {
                    setResumenServiciosIniciales(null);
                }
                
                // RECARGAR MESES PENDIENTES DESPUÉS DEL PAGO
                try {
                    const resMeses = await axios.get(`${API_BASE_URL}/api/caja/meses-pendientes?id_contrato=${datosDeuda.id_contrato}`);
                    const mesesActualizados = resMeses?.data?.meses || [];
                    setMesesPendientes(mesesActualizados);
                    setMesesSeleccionados(mesesActualizados.length ? [mesesActualizados[0]] : []);
                    setNumCuota(mesesActualizados.length ? '1' : '0');
                    setOpcionesCuota(mesesActualizados.length ? mesesActualizados.map((mes, index) => ({ value: String(index + 1), label: `Cuota ${index + 1} - ${mes}` })) : [{ value: '0', label: 'Sin cuotas pendientes' }]);
                    if (mesesActualizados.length) {
                        setMesPagado(mesesActualizados[0]);
                    }
                    const primerMes = mesesActualizados[0] || '';
                    const serviciosRes = await axios.get(`${API_BASE_URL}/api/caja/servicios-contrato/${datosDeuda.id_contrato}?mes=${encodeURIComponent(primerMes)}`);
                    const servicios = filtrarServiciosMostrables(serviciosRes?.data?.servicios || []);
                    setServiciosContrato(servicios);
                    const serviciosActivos = servicios.filter((s) => !s.ya_pagado_mes).map((s) => s.id_servicio);
                    setServiciosSeleccionados(serviciosActivos);
                    recalcularTotalesCobro(mesesActualizados.length ? [mesesActualizados[0]] : [], serviciosActivos, {
                        ...datosDeuda,
                        saldo_pendiente: Math.max(parseFloat(datosDeuda?.saldo_pendiente || 0) - montoTerreno, 0)
                    }, servicios);
                } catch (errMeses) {
                    console.error('Error al recargar meses pendientes:', errMeses);
                }

                try {
                    const morasRes = await axios.get(`${API_BASE_URL}/api/caja/moras-pendientes/${datosDeuda.id_contrato}`);
                    const moras = Array.isArray(morasRes?.data?.moras) ? morasRes.data.moras : [];
                    setMorasPendientes(moras);
                    setMorasSeleccionadas(moras.map((mora) => Number(mora.id_morosidad)).filter((id) => Number.isInteger(id) && id > 0));
                } catch (moraError) {
                    console.error('Error al recargar moras pendientes:', moraError);
                }
                
                setReferencia(''); 
                setShowModalCobro(false);
                await consultarSiguienteCorrelativo(datosDeuda.id_contrato);
            } else {
                mostrarToast("El cobro no se completó correctamente.", "error");
            }
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            const mensajeBackend = error?.response?.data;
            const esFallaComunicacion = !error?.response || status === 502 || status === 503 || status === 504;
            const mensaje = esFallaComunicacion
                ? 'No hay comunicacion con el servidor de Caja. Verifica que el backend este en linea e intenta de nuevo en unos segundos.'
                : `Error al procesar el cobro: ${mensajeBackend || error?.message || 'Error desconocido'}`;
            mostrarToast(mensaje, "error");
        }
    };

    // Generador de recibo estilo formato institucional (modelo proporcionado)
    const generarPDF = (recibo, residente, empresa) => {
        try {
            const doc = new jsPDF();
            const logoEmpresa = normalizeImageDataUrl(empresa?.logo || '');
            const detalleCobro = Array.isArray(recibo?.detalle_cobro) ? recibo.detalle_cobro : [];
            const montoPrincipal = parseFloat(recibo?.monto_pagado || 0);
            const montoTotalCobrado = parseFloat(recibo?.total_cobrado || montoPrincipal || 0);
            const montoAbonoExtra = Math.max(parseFloat(recibo?.monto_servicios_pagado || 0) + parseFloat(recibo?.monto_mora || 0), 0);
            const fechaRecibo = recibo?.fecha ? new Date(recibo.fecha) : new Date();

            const referencia = String(recibo?.no_referencia || '').trim();
            let serie = 'B';
            let numeroRecibo = String(recibo?.numero_recibo || '').replace(/\D/g, '').slice(-5);
            const matchSerie = referencia.match(/^([A-Za-z]+)-([0-9]+)$/);
            if (matchSerie) {
                serie = matchSerie[1].toUpperCase();
                numeroRecibo = matchSerie[2].slice(-5);
            }
            if (!numeroRecibo) {
                numeroRecibo = String(Date.now()).slice(-5);
            }

            const mesesPagados = Array.isArray(recibo?.meses_pagados) ? recibo.meses_pagados : [];
            const mesesTexto = mesesPagados.length ? mesesPagados.join(', ') : (recibo?.mes_pagado || 'N/A');
            const conceptoResumen = detalleCobro.length
                ? [...new Set(detalleCobro.map((item) => String(item?.concepto || '').trim()).filter(Boolean))].join(', ')
                : `Pago de cuota (${mesesTexto})`;

            const metodo = String(recibo?.metodo_pago || metodoPago || '').toLowerCase();

            const x = 10;
            const w = 190;
            let y = 10;

            const drawLabelBand = (label, top, height = 8) => {
                doc.setFillColor(245, 211, 69);
                doc.rect(x, top, w, height, 'F');
                doc.setDrawColor(80, 80, 80);
                doc.rect(x, top, w, height);
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(10);
                doc.text(label, x + 2, top + height - 2.5);
            };

            const drawField = (label, value, top, height = 12) => {
                doc.setDrawColor(80, 80, 80);
                doc.rect(x, top, w, height);
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(9);
                doc.text(label, x + 2, top + 4.5);
                doc.setFont('Helvetica', 'normal');
                doc.setFontSize(11);
                const text = doc.splitTextToSize(String(value || 'N/A'), w - 42);
                doc.text(text, x + 22, top + 8);
            };

            // Header del recibo
            doc.setFillColor(240, 228, 167);
            doc.rect(x, y, w, 30, 'F');
            doc.setDrawColor(120, 120, 120);
            doc.rect(x, y, w, 30);

            if (logoEmpresa) {
                try {
                    const logoFormat = getImageFormatFromDataUrl(logoEmpresa);
                    doc.addImage(logoEmpresa, logoFormat, x + 3, y + 3, 22, 22, `logo-recibo-${Date.now()}`, 'FAST');
                } catch (e) {
                    console.warn('No se pudo cargar el logo del recibo:', e);
                }
            }

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(11);
            const nombreEmpresa = String(empresa?.nombre || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase();
            doc.text(doc.splitTextToSize(nombreEmpresa, 92), x + 28, y + 8);

            doc.setFontSize(12);
            doc.text('RECIBO DE CAJA', x + 145, y + 8);
            doc.setFontSize(11);
            doc.text(`Serie "${serie}"`, x + 145, y + 15);
            doc.setTextColor(170, 35, 35);
            doc.text(`N. ${String(numeroRecibo).padStart(5, '0')}`, x + 173, y + 15);
            doc.setTextColor(0, 0, 0);

            const direccion = String(empresa?.direccion || '15 Avenida "A" 24-22, Zona 13, Oficina #5');
            const telefonoEmpresa = String(empresa?.telefono || 'PBX: 2220-6406  Telefono: 5825-5903');
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.text(doc.splitTextToSize(`${direccion}  ${telefonoEmpresa}`, 120), x + 67, y + 25, { align: 'center' });

            y += 38;
            drawLabelBand('Datos del cliente:', y);
            y += 10;
            drawField('Nombre:', residente?.nombre || 'N/A', y);

            y += 16;
            doc.setFillColor(245, 211, 69);
            doc.rect(x, y, 145, 8, 'F');
            doc.rect(x + 145, y, 45, 8, 'F');
            doc.rect(x, y, 145, 8);
            doc.rect(x + 145, y, 45, 8);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('Fecha:', x + 2, y + 5.5);
            doc.text('Por:', x + 147, y + 5.5);

            y += 8;
            doc.rect(x, y, 145, 11);
            doc.rect(x + 145, y, 45, 11);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10.5);
            doc.text(`Guatemala, ${fechaLargaGuatemala(fechaRecibo)}`, x + 2, y + 7);
            doc.setFont('Helvetica', 'bold');
            doc.text(`Q ${montoTotalCobrado.toFixed(2)}`, x + 147, y + 7);

            y += 16;
            doc.rect(x, y, w, 11);
            doc.setFont('Helvetica', 'bold');
            doc.text('Paga la cantidad de:', x + 2, y + 7);
            doc.setFont('Helvetica', 'normal');
            doc.text(doc.splitTextToSize(montoALetrasRecibo(montoTotalCobrado), 106), x + 45, y + 7);

            y += 15;
            doc.rect(x, y, w, 11);
            doc.setFont('Helvetica', 'bold');
            doc.text('Por cancelacion de:', x + 2, y + 7);
            doc.setFont('Helvetica', 'normal');
            doc.text(doc.splitTextToSize(conceptoResumen, 138), x + 43, y + 7);

            y += 15;
            doc.rect(x, y, 65, 11);
            doc.rect(x + 65, y, 125, 11);
            doc.setFont('Helvetica', 'bold');
            doc.text('Cuota:', x + 2, y + 7);
            doc.setFontSize(14);
            doc.setTextColor(170, 35, 35);
            doc.text(String(recibo?.numero_cuota || 'N/A'), x + 38, y + 7);
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.text('Abono extraordinario:', x + 67, y + 7);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(12);
            doc.text(`Q. ${montoAbonoExtra.toFixed(2)}`, x + 112, y + 7);

            y += 16;
            doc.rect(x, y, 60, 28);
            doc.rect(x + 65, y, 60, 28);
            doc.rect(x + 130, y, 60, 28);

            const drawCheck = (cx, cy, checked, label) => {
                doc.rect(cx, cy, 4.5, 4.5);
                if (checked) {
                    doc.setTextColor(190, 0, 0);
                    doc.text('X', cx + 1.4, cy + 3.6);
                    doc.setTextColor(0, 0, 0);
                }
                doc.setFont('Helvetica', 'normal');
                doc.setFontSize(9);
                doc.text(label, cx + 6, cy + 3.7);
            };

            drawCheck(x + 2, y + 2, metodo.includes('efectivo'), 'Efectivo');
            drawCheck(x + 2, y + 9, metodo.includes('transfer'), 'Transferencia');
            drawCheck(x + 2, y + 16, metodo.includes('deposit'), 'Deposito');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Referencia bancaria:', x + 67, y + 7);
            doc.setFont('Helvetica', 'normal');
            doc.text(String(recibo?.no_referencia || 'N/A'), x + 67, y + 14);
            doc.text(`Contrato: ${residente?.codigo_contrato || 'N/A'}`, x + 67, y + 21);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Meses pagados:', x + 132, y + 7);
            doc.setFont('Helvetica', 'normal');
            doc.text(doc.splitTextToSize(mesesTexto, 56), x + 132, y + 13);

            y += 34;
            autoTable(doc, {
                startY: y,
                head: [['Detalle aplicado', 'Mes', 'Total (Q)']],
                body: (detalleCobro.length ? detalleCobro : [{ concepto: 'Pago aplicado', mes: mesesTexto, total: montoTotalCobrado }]).map((item) => ([
                    String(item?.concepto || 'Pago aplicado'),
                    String(item?.mes || mesesTexto || 'N/A'),
                    parseFloat(item?.total || 0).toFixed(2)
                ])),
                theme: 'grid',
                styles: { fontSize: 9 },
                headStyles: { fillColor: [245, 211, 69], textColor: [0, 0, 0] },
                margin: { left: x, right: 10 }
            });

            const footerY = doc.lastAutoTable.finalY + 10;
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.text(
                doc.splitTextToSize(
                    'Los pagos mediante cheque estan sujetos a verificacion bancaria. Este recibo electronico se extiende previo a la confirmacion de la transaccion y conserva el detalle completo del cobro realizado.',
                    188
                ),
                x,
                footerY
            );

            const fileName = `Recibo_${String(recibo?.no_referencia || recibo?.numero_recibo || 'sin_numero').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error('Error al generar PDF:', error);
            mostrarToast('El cobro se registró, pero no se pudo generar el PDF automáticamente.', 'warning');
        }

    };

        const criterioBusqueda = normalizeSearchValue(busqueda);
        const listaFiltrada = listaResidentesPendientes.filter((r) => {
            if (!criterioBusqueda) return true;

            return [r.nombre, r.dpi, r.numero_identificacion, r.codigo_contrato]
                .some((valor) => normalizeSearchValue(valor).includes(criterioBusqueda));
        });

    const handleBusquedaChange = (e) => {
      setBusqueda(e.target.value);
      setCurrentPage(1);
    };

    const { paginatedItems: listaResidentesPaginada, totalPages, startIndex, endIndex } = getPaginatedData(listaFiltrada, currentPage, itemsPerPage);
    const planFinancieroContrato = calcularPlanFinancieroContrato(datosDeuda || {});
    const saldoTerrenoPendiente = planFinancieroContrato.saldoPendiente;
    const porcentajeInteresContrato = planFinancieroContrato.interesPorcentaje;
    const interesCalculadoContrato = planFinancieroContrato.interesTotalContrato;
    const interesPorCuotaContrato = planFinancieroContrato.interesPorCuota;
    const totalContratoConInteres = planFinancieroContrato.totalContratoConInteres;

    const capitalSeleccionado = parseFloat(montoTerrenoSeleccionado || 0);
    const interesCalculadoSeleccion = parseFloat(montoInteresSeleccionado || 0);
    const totalSeleccionCapitalInteres = parseFloat((capitalSeleccionado + interesCalculadoSeleccion).toFixed(2));
    const montoMoraActual = Math.max(parseFloat(montoMora || 0), 0);
    const tieneServiciosPendientes = (serviciosContrato || []).some((s) => !s.ya_pagado_mes);
    const tieneMesesPendientesTerreno = saldoTerrenoPendiente > 0;
    const tienePermisoCobroSeleccion = usuarioTienePermisoCobro(datosDeuda || {});
    const puedeGenerarCobro = !!datosDeuda && (tieneMesesPendientesTerreno || tieneServiciosPendientes) && tienePermisoCobroSeleccion;
    const posibleCobroServiciosIniciales =
        !!datosDeuda
        && mesesSeleccionados.includes(mesesPendientes[0] || '')
        && montoTerrenoSeleccionado > 0
        && (serviciosContrato || []).some((s) => !s.ya_pagado_mes);

    return (
        <div className="container mt-4">
            {estadoCorrelativoUsuario && estadoCorrelativoUsuario.disponible && (
                <div className="alert alert-info text-center fw-bold mb-3">
                    <div>{estadoCorrelativoUsuario.mensaje || 'Tienes correlativos asignados.'}</div>
                    <div className="small mt-1">
                        <strong>Inicio:</strong> {estadoCorrelativoUsuario.correlativo_inicio || estadoCorrelativoUsuario.correlativo || 'N/A'}
                        {' | '}
                        <strong>Fin:</strong> {estadoCorrelativoUsuario.correlativo_fin || 'N/A'}
                    </div>
                </div>
            )}

            {estadoCorrelativoUsuario && !estadoCorrelativoUsuario.disponible && (
                <div className="alert alert-warning text-center fw-bold mb-4">
                    {estadoCorrelativoUsuario.mensaje || 'No tienes correlativos asignados.'}
                </div>
            )}

            <div className="module-header">
            <div className="row align-items-center bg-light p-3 rounded shadow-sm">
                <div className="col-md-5">
                    <h3 className="fw-bold m-0">💰 MÓDULO DE CAJA</h3>
                </div>
                <div className="col-md-7">
                    <div className="input-group">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por nombre, apellido, DPI o número de contrato..."
                            value={busqueda}
                            onChange={handleBusquedaChange}
                            onKeyDown={(e) => e.key === 'Enter' && buscarResidente()}
                        />
                        <button className="btn btn-primary fw-bold" onClick={buscarResidente}>
                            🔍 Buscar
                        </button>
                        <button className="btn btn-secondary fw-bold" onClick={limpiarBusquedaCaja}>
                            🧹 Limpiar
                        </button>
                    </div>
                </div>
            </div>
            </div>

            {/* ✅ Lista inicial de residentes (pendientes y solventes) */}
            {!datosDeuda && !listaResidentes.length && listaResidentesPendientes.length > 0 && (
                <div className="card mb-4 shadow-sm border-info">
                    <div className="card-header bg-info text-white fw-bold">
                        📋 Residentes activos (pendientes y solventes) - click para seleccionar
                    </div>
                    <ul className="list-group list-group-flush" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {listaResidentesPaginada.map((r) => (
                            (() => {
                                const tieneAsignacion = contratoTieneAsignacionValida(r);
                                return (
                            <li
                                key={r.id_residente}
                                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                                onClick={() => seleccionarResidente(r)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div>
                                    <strong className="fs-6">📦 {r.nombre}</strong>
                                    <br />
                                    <span className="text-muted">DPI: {r.dpi} | Contrato: {r.codigo_contrato}</span>
                                    <br />
                                    <span className="text-muted">Proyecto: {r.nombre_proyecto || 'Sin proyecto'} | Empresa: {r.nombre_marca_pdf || 'Sin empresa'}</span>
                                    {!tieneAsignacion && (
                                        <>
                                            <br />
                                            <span className="text-danger fw-bold">Sin asignacion de empresa/proyecto: visible para control, cobro bloqueado.</span>
                                        </>
                                    )}
                                    {tieneAsignacion && !usuarioTienePermisoCobro(r) && (
                                        <>
                                            <br />
                                            <span className="text-warning fw-bold">Sin correlativo asignado para esta empresa: puede ver, no cobrar.</span>
                                        </>
                                    )}
                                </div>
                                <span className={`badge ${parseFloat(r.saldo_pendiente || 0) <= 0 ? 'bg-success' : 'bg-warning text-dark'}`}>
                                    {parseFloat(r.saldo_pendiente || 0) <= 0 ? 'SOLVENTE' : 'PENDIENTE'}
                                </span>
                            </li>
                                );
                            })()
                        ))}
                    </ul>
                    <div className="card-footer bg-white">
                        <PaginationControls
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            totalItems={listaFiltrada.length}
                        />
                    </div>
                </div>
            )}

            {/* Resultados de búsqueda */}
            {!datosDeuda && listaResidentes.length > 0 && (
                <div className="card mb-4 shadow-sm border-primary">
                    <div className="card-header bg-primary text-white fw-bold">
                        🔎 Resultados de búsqueda
                    </div>
                    <ul className="list-group list-group-flush">
                        {listaResidentes.map((r) => (
                            (() => {
                                const tieneAsignacion = contratoTieneAsignacionValida(r);
                                return (
                            <li
                                key={r.id_residente}
                                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                                onClick={() => seleccionarResidente(r)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div>
                                    <strong>{r.nombre}</strong>
                                    <br />
                                    <small className="text-muted">DPI: {r.dpi} | Contrato: {r.codigo_contrato}</small>
                                    <br />
                                    <small className="text-muted">Proyecto: {r.nombre_proyecto || 'Sin proyecto'} | Empresa: {r.nombre_marca_pdf || 'Sin empresa'}</small>
                                    {!tieneAsignacion && (
                                        <>
                                            <br />
                                            <small className="text-danger fw-bold">Sin asignacion de empresa/proyecto: visible para control, cobro bloqueado.</small>
                                        </>
                                    )}
                                    {tieneAsignacion && !usuarioTienePermisoCobro(r) && (
                                        <>
                                            <br />
                                            <small className="text-warning fw-bold">Sin correlativo asignado para esta empresa: puede ver, no cobrar.</small>
                                        </>
                                    )}
                                </div>
                                <span className={`badge ${!tieneAsignacion ? 'bg-danger' : usuarioTienePermisoCobro(r) ? 'bg-secondary' : 'bg-warning text-dark'}`}>
                                    {!tieneAsignacion ? 'Solo consulta' : usuarioTienePermisoCobro(r) ? 'Seleccionar' : 'Ver sin cobro'}
                                </span>
                            </li>
                                );
                            })()
                        ))}
                    </ul>
                </div>
            )}

            {/* Resumen del residente seleccionado */}
            {datosDeuda && (
                <div className="card mb-4 shadow-sm border-success">
                    <div className="card-header bg-success text-white fw-bold">✅ Residente seleccionado</div>
                    <div className="card-body">
                        <div className="row">
                            <div className="col-md-8">
                                <h5 className="mb-1">{datosDeuda.nombre}</h5>
                                <div><strong>Contrato:</strong> {datosDeuda.codigo_contrato}</div>
                                <div><strong>DPI:</strong> {datosDeuda.dpi || 'N/A'}</div>
                                <div><strong>NIT:</strong> {getNitDisplay(datosDeuda.nit)}</div>
                            </div>
                            <div className="col-md-4 text-md-end mt-3 mt-md-0">
                                <div><strong>Saldo pendiente:</strong> Q{totalContratoConInteres.toFixed(2)}</div>
                                <div><strong>Capital pendiente:</strong> Q{getSaldoDisplay(datosDeuda?.saldo_pendiente).toFixed(2)}</div>
                                <div><strong>Capital por cuota:</strong> Q{planFinancieroContrato.capitalPorCuota.toFixed(2)}</div>
                                <div><strong>Interés total ({porcentajeInteresContrato.toFixed(2)}%):</strong> Q{interesCalculadoContrato.toFixed(2)}</div>
                                <div><strong>Interés por cuota:</strong> Q{interesPorCuotaContrato.toFixed(2)}</div>
                                <div><strong>Total financiado:</strong> Q{totalContratoConInteres.toFixed(2)}</div>
                            </div>
                        </div>
                        <hr />
                        {!puedeGenerarCobro && (
                            <div className="alert alert-success text-center fw-bold mb-3">
                                ✅ LA CUENTA YA SE ENCUENTRA SOLVENTE. No hay cobros pendientes por generar.
                            </div>
                        )}
                        {saldoTerrenoPendiente <= 0 && tieneServiciosPendientes && (
                            <div className="alert alert-info text-center fw-bold mb-3">
                                ℹ️ Terreno solvente. Puede cobrar únicamente servicios (agua/drenaje u otros asignados).
                            </div>
                        )}
                        {!contratoTieneAsignacionValida(datosDeuda) && (
                            <div className="alert alert-warning text-center fw-bold mb-3">
                                ⚠️ Este contrato no tiene empresa y/o proyecto asignado. Puede consultarse, pero no se permite generar cobro.
                            </div>
                        )}
                        {contratoTieneAsignacionValida(datosDeuda) && !tienePermisoCobroSeleccion && (
                            <div className="alert alert-warning text-center fw-bold mb-3">
                                ⚠️ Este contrato no está dentro de tus correlativos asignados. Puedes verlo en Caja, pero no generar cobro.
                            </div>
                        )}
                        <div className="d-flex justify-content-end">
                            <button
                                className="btn btn-success fw-bold"
                                onClick={() => setShowModalCobro(true)}
                                disabled={!puedeGenerarCobro || !contratoTieneAsignacionValida(datosDeuda) || !tienePermisoCobroSeleccion}
                            >
                                💳 Generar Cobro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showModalCobro && datosDeuda && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                    <div className="modal-dialog modal-lg modal-dialog-scrollable">
                        <div className="modal-content shadow-lg">
                            <div className="modal-header bg-success text-white">
                                <h5 className="modal-title fw-bold">💳 Generar Cobro — {datosDeuda.nombre}</h5>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowModalCobro(false)}></button>
                            </div>

                            <div className="modal-body">
                                {/* Resumen del residente dentro del modal */}
                                <div className="alert alert-success py-2 mb-3">
                                    <div className="row">
                                        <div className="col-md-6">
                                            <small><strong>Contrato:</strong> {datosDeuda.codigo_contrato}</small><br />
                                            <small><strong>N° Identificación:</strong> {datosDeuda.numero_identificacion || 'Sin asignar'}</small>
                                            <br /><small><strong>NIT:</strong> {getNitDisplay(datosDeuda.nit)}</small>
                                        </div>
                                        <div className="col-md-6 text-end">
                                            <small><strong>Saldo pendiente:</strong> Q{totalContratoConInteres.toFixed(2)}</small><br />
                                            <small><strong>Capital pendiente:</strong> Q{getSaldoDisplay(datosDeuda?.saldo_pendiente).toFixed(2)}</small><br />
                                            <small><strong>Cuota con interés:</strong> Q{planFinancieroContrato.cuotaTotalConInteres.toFixed(2)}</small><br />
                                            <small><strong>Mora aplicada:</strong> Q{montoMoraActual.toFixed(2)}</small>
                                        </div>
                                    </div>
                                </div>

                                {estadoCorrelativo && (
                                    <div className={`alert ${estadoCorrelativo.disponible ? 'alert-info' : 'alert-warning'} py-2 mb-3`}>
                                        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                                            <div>
                                                <div className="fw-bold">Siguiente correlativo disponible</div>
                                                <div>{estadoCorrelativo.correlativo || 'No disponible'}</div>
                                                <small>{estadoCorrelativo.mensaje || ''}</small>
                                            </div>
                                            <div className="text-end small">
                                                <div><strong>Origen:</strong> {estadoCorrelativo.origen || 'N/A'}</div>
                                                {estadoCorrelativo.id_asignacion && <div><strong>Lote:</strong> {estadoCorrelativo.id_asignacion}</div>}
                                                {estadoCorrelativo.correlativo_fin && <div><strong>Hasta:</strong> {estadoCorrelativo.correlativo_fin}</div>}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={ejecutarCobro} id="formCobro">
                                    {posibleCobroServiciosIniciales && (
                                        <div className="alert alert-warning py-2 mb-3">
                                            ⚠️ Al incluir el primer mes del contrato en este cobro, el sistema puede agregar automáticamente amenidades/servicios iniciales en el mismo recibo.
                                        </div>
                                    )}

                                    {resumenServiciosIniciales && (
                                        <div className="alert alert-info py-2 mb-3">
                                            <strong>Servicios iniciales agregados:</strong> Q{Number(resumenServiciosIniciales.monto || 0).toFixed(2)}
                                            {Array.isArray(resumenServiciosIniciales.servicios) && resumenServiciosIniciales.servicios.length > 0 && (
                                                <div className="small mt-1">
                                                    {resumenServiciosIniciales.servicios.map((item) => item?.nombre_servicio).filter(Boolean).join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Qué está pagando */}
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">¿Qué está pagando?</label>
                                        <select 
                                            className="form-select" 
                                            value={numCuota} 
                                            onChange={(e) => {
                                                const nuevaCuota = e.target.value;
                                                setNumCuota(nuevaCuota);

                                                if (nuevaCuota === '0') {
                                                    setMesesSeleccionados([]);
                                                    setMesPagado('');
                                                    recalcularTotalesCobro([], serviciosSeleccionados, datosDeuda);
                                                    return;
                                                }
                                                
                                                // Obtener índice de la cuota seleccionada (0-based)
                                                const indexCuota = parseInt(nuevaCuota) - 1;
                                                
                                                // Seleccionar el mes actual y el siguiente (si existe)
                                                const mesesASeleccionar = [];
                                                if (indexCuota < mesesPendientes.length) {
                                                    mesesASeleccionar.push(mesesPendientes[indexCuota]); // Mes actual
                                                }
                                                if (indexCuota + 1 < mesesPendientes.length) {
                                                    mesesASeleccionar.push(mesesPendientes[indexCuota + 1]); // Mes siguiente
                                                }
                                                
                                                // Actualizar meses seleccionados
                                                setMesesSeleccionados(mesesASeleccionar);
                                                recalcularTotalesCobro(mesesASeleccionar, serviciosSeleccionados, datosDeuda);
                                                
                                                // Actualizar mes pagado al primer mes seleccionado
                                                if (mesesASeleccionar.length > 0) {
                                                    setMesPagado(mesesASeleccionar[0]);
                                                }
                                            }} 
                                            required
                                            disabled={!mesesPendientes.length}
                                        >
                                            {opcionesCuota.map((opcion) => (
                                                <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Monto fijo y total a pagar */}
                                    <div className="alert alert-info py-2 mb-3 d-flex justify-content-between align-items-center">
                                        <span>
                                            <strong>Capital por mes:</strong> Q{planFinancieroContrato.capitalPorCuota.toFixed(2)}
                                            <br />
                                            <strong>Servicios seleccionados:</strong> Q{(mesesSeleccionados.length ? (montoServiciosSeleccionado / Math.max(mesesSeleccionados.length, 1)) : 0).toFixed(2)} / mes
                                            <br />
                                            <strong>Total financiado seleccionado ({porcentajeInteresContrato.toFixed(2)}%):</strong> Q{capitalSeleccionado.toFixed(2)} + Q{interesCalculadoSeleccion.toFixed(2)}
                                        </span>
                                        <span className="fw-bold text-success">
                                            Total ({mesesSeleccionados.length} mes(es)): Q{montoTotalSeleccionado.toFixed(2)}
                                            <br />
                                            Total financiado: Q{totalSeleccionCapitalInteres.toFixed(2)}
                                            <br />
                                            Servicios: Q{montoServiciosSeleccionado.toFixed(2)}
                                            {montoMoraActual > 0 && (
                                                <>
                                                    <br />
                                                    Total con mora: Q{(montoTotalSeleccionado + montoMoraActual).toFixed(2)}
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {/* Servicios asignados al contrato */}
                                    <div className="mb-4">
                                        <label className="form-label fw-bold">🧾 Servicios del contrato (agua/drenaje y otros activos):</label>
                                        <div className="border rounded-3 p-3 bg-light">
                                            {serviciosContrato.length > 0 ? (
                                                <div className="d-flex flex-column gap-2">
                                                    {serviciosContrato.map((servicio) => (
                                                        (() => {
                                                            const esUnico = esServicioCobroUnico(servicio.periodicidad, servicio.nombre_servicio);
                                                            return (
                                                        <div
                                                            key={servicio.id_servicio}
                                                            className={`d-flex align-items-center p-3 border rounded-2 ${serviciosSeleccionados.includes(servicio.id_servicio) ? 'bg-success bg-opacity-10 border-success border-2' : 'bg-white border-secondary'} ${servicio.ya_pagado_mes ? 'opacity-75' : ''}`}
                                                            style={{ cursor: servicio.ya_pagado_mes ? 'not-allowed' : 'pointer' }}
                                                            onClick={() => !servicio.ya_pagado_mes && toggleServicioSeleccionado(servicio.id_servicio)}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input me-3"
                                                                checked={serviciosSeleccionados.includes(servicio.id_servicio)}
                                                                disabled={servicio.ya_pagado_mes}
                                                                onChange={() => !servicio.ya_pagado_mes && toggleServicioSeleccionado(servicio.id_servicio)}
                                                                style={{ cursor: servicio.ya_pagado_mes ? 'not-allowed' : 'pointer', width: '20px', height: '20px' }}
                                                            />
                                                            <div className="flex-grow-1">
                                                                <span className="fw-bold fs-6 text-dark">{servicio.nombre_servicio}</span>
                                                                <span className={`badge ms-2 ${esUnico ? 'bg-secondary' : 'bg-info text-dark'}`}>
                                                                    {esUnico ? 'Cobro unico' : 'Mensual'}
                                                                </span>
                                                                <br />
                                                                {servicio.ya_pagado_mes && <small className="text-success fw-bold">Ya pagado en el mes seleccionado</small>}
                                                            </div>
                                                            <span className="badge bg-primary">Q{parseFloat(servicio.costo_servicio || 0).toFixed(2)}{esUnico ? ' pago unico' : ' / mes'}</span>
                                                        </div>
                                                            );
                                                        })()
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-3 text-muted">No hay servicios activos asignados a este contrato.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Selección de meses pendientes como lista de items */}
                                    <div className="mb-4">
                                        <label className="form-label fw-bold">📅 Meses a Pagar (seleccione cuáles paga el residente):</label>
                                        <div className="border rounded-3 p-3 bg-light">
                                            {mesesPendientes.length > 0 ? (
                                                <div className="d-flex flex-column gap-2">
                                                    {mesesPendientes.map((mes) => (
                                                        <div 
                                                            key={mes} 
                                                            className={`d-flex align-items-center p-3 border rounded-2 cursor-pointer transition ${
                                                                mesesSeleccionados.includes(mes) 
                                                                    ? 'bg-success bg-opacity-10 border-success border-2' 
                                                                    : 'bg-white border-secondary'
                                                            }`}
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() => toggleMesSeleccionado(mes)}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input me-3"
                                                                checked={mesesSeleccionados.includes(mes)}
                                                                onChange={() => toggleMesSeleccionado(mes)}
                                                                style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                                                            />
                                                            <div className="flex-grow-1">
                                                                <span className="fw-bold fs-5 text-dark">{mes}</span>
                                                            </div>
                                                            <span className="badge bg-primary">Q{parseFloat(datosDeuda?.monto_cuota || 0).toFixed(2)}</span>
                                                            {mesesSeleccionados.includes(mes) && (
                                                                <span className="ms-2 text-success fw-bold">✓ Seleccionado</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-4 text-muted">
                                                    <p className="mb-0">✓ No hay meses pendientes - Todo pagado</p>
                                                </div>
                                            )}
                                        </div>
                                        {mesesSeleccionados.length > 0 && (
                                            <div className="alert alert-success mt-3 mb-0">
                                                <strong>Resumen:</strong> Terreno Q{montoTerrenoSeleccionado.toFixed(2)} + Servicios Q{montoServiciosSeleccionado.toFixed(2)} = Q{montoTotalSeleccionado.toFixed(2)}
                                            </div>
                                        )}
                                    </div>

                                    <div className="row mb-3">
                                        {/* Mes principal */}
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Mes que se está cobrando:</label>
                                            <select className="form-select" value={mesPagado} onChange={async (e) => {
                                                const mesSeleccionado = e.target.value;
                                                setMesPagado(mesSeleccionado);
                                                try {
                                                    const serviciosRes = await axios.get(`${API_BASE_URL}/api/caja/servicios-contrato/${datosDeuda.id_contrato}?mes=${encodeURIComponent(mesSeleccionado)}`);
                                                    const servicios = serviciosRes?.data?.servicios || [];
                                                    setServiciosContrato(servicios);
                                                    const seleccionables = servicios
                                                        .filter((s) => !s.ya_pagado_mes && serviciosSeleccionados.includes(s.id_servicio))
                                                        .map((s) => s.id_servicio);
                                                    setServiciosSeleccionados(seleccionables);
                                                    recalcularTotalesCobro(mesesSeleccionados, seleccionables, datosDeuda, servicios);
                                                } catch (error) {
                                                    console.error('No se pudieron refrescar servicios por mes:', error);
                                                }
                                            }} disabled={!mesesPendientes.length}>
                                                {(mesesPendientes.length > 0 ? mesesPendientes : ['Sin meses pendientes']).map((mes) => (
                                                    <option key={mes} value={mes}>{mes}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {/* Monto */}
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">{mesesSeleccionados.length > 1 ? 'Monto total a abonar (Q):' : 'Monto a abonar (Q):'}</label>
                                            <input className="form-control" type="number" step="0.01" required value={montoAPagar} onChange={(e) => setMontoAPagar(e.target.value)} />
                                            {mesesSeleccionados.length > 1 && (
                                                <small className="text-muted">El monto fijo se aplica por cada mes seleccionado.</small>
                                            )}
                                        </div>
                                    </div>

                                    <div className="row mb-3">
                                        {/* Mora */}
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Recargo por mora (Q):</label>
                                            <input className="form-control" type="number" step="0.01" value={montoMora} readOnly />
                                            {morasPendientes.length > 0 && (
                                                <div className="border rounded p-2 mt-1 bg-light" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                                    {morasPendientes.map((mora) => (
                                                        <label key={mora.id_morosidad} className="form-check d-flex justify-content-between align-items-center mb-1">
                                                            <div>
                                                                <input
                                                                    type="checkbox"
                                                                    className="form-check-input me-2"
                                                                    checked={morasSeleccionadas.includes(Number(mora.id_morosidad))}
                                                                    onChange={() => toggleMoraSeleccionada(Number(mora.id_morosidad))}
                                                                />
                                                                <span className="form-check-label">{mora.mes_atrasado}</span>
                                                            </div>
                                                            <span className="badge bg-danger">Q{Number(mora.monto_mora || 0).toFixed(2)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                            {morasPendientes.length === 0 && (
                                                <small className="text-muted d-block mt-1">
                                                    No hay moras pendientes registradas para este contrato.
                                                </small>
                                            )}
                                        </div>
                                        {/* Método de pago */}
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">Método de pago:</label>
                                            <select className="form-select" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                                                <option value="Efectivo">Efectivo</option>
                                                <option value="Depósito">Depósito Bancario</option>
                                                <option value="Transferencia">Transferencia</option>
                                            </select>
                                        </div>
                                    </div>

                                    {metodoPago !== 'Efectivo' && (
                                        <div className="mb-3">
                                            <label className="form-label fw-bold">No. de Referencia / Boleta:</label>
                                            <input
                                                className="form-control"
                                                type="text"
                                                required
                                                placeholder="Ej. # Boleta o Transferencia"
                                                value={referencia}
                                                onChange={(e) => setReferencia(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Marca de Empresa en PDF:</label>
                                        <input className="form-control" type="text" value="Automática (usa la empresa ya asociada al contrato)" readOnly />
                                        <small className="text-muted">El sistema toma automáticamente el logo y nombre ya registrados para ese contrato/residente.</small>
                                    </div>
                                </form>
                            </div>

                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowModalCobro(false)}>Cancelar</button>
                                <button type="submit" form="formCobro" className="btn btn-success fw-bold px-4">
                                    ✅ Procesar Cobro y Descargar PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Caja;