import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
};

const Caja = () => {
    const getNitDisplay = (nit) => (nit && String(nit).trim() ? String(nit).trim() : 'C/F');
    const getSaldoDisplay = (saldo) => Math.max(parseFloat(saldo || 0), 0);

    // ✅ Función helper para mostrar notificaciones flotantes (toast)
    const mostrarToast = (titulo, tipo = 'success') => {
        Swal.fire({
            icon: tipo,
            title: titulo,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });
    };

    // Estados de búsqueda
    const [busqueda, setBusqueda] = useState(''); // Ahora acepta texto o números
    const [listaResidentes, setListaResidentes] = useState([]); // Guarda las coincidencias
    const [listaResidentesPendientes, setListaResidentesPendientes] = useState([]); // Lista inicial de residentes con pagos pendientes
    const [datosDeuda, setDatosDeuda] = useState(null); // Residente seleccionado actualmente
    const [idResidenteActivo, setIdResidenteActivo] = useState(''); // Guarda el ID del seleccionado para el pago

    // Estados del formulario de cobro
    const [montoAPagar, setMontoAPagar] = useState('');
    const [montoMora, setMontoMora] = useState('0');
    const [mesPagado, setMesPagado] = useState('Enero');
    const [numCuota, setNumCuota] = useState('1');
    const [opcionesCuota, setOpcionesCuota] = useState([]);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [referencia, setReferencia] = useState('');
    const [mesesPendientes, setMesesPendientes] = useState([]);
    const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
    const [montoTotalSeleccionado, setMontoTotalSeleccionado] = useState(0);
    const [montoTerrenoSeleccionado, setMontoTerrenoSeleccionado] = useState(0);
    const [serviciosContrato, setServiciosContrato] = useState([]);
    const [serviciosSeleccionados, setServiciosSeleccionados] = useState([]);
    const [montoServiciosSeleccionado, setMontoServiciosSeleccionado] = useState(0);
    const [showModalCobro, setShowModalCobro] = useState(false);
    const [estadoCorrelativoUsuario, setEstadoCorrelativoUsuario] = useState(null);
    const [estadoCorrelativo, setEstadoCorrelativo] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        // Evitar que quede un mes inválido seleccionado al cambiar de residente o al recargar pendientes.
        if (!Array.isArray(mesesPendientes) || !mesesPendientes.length) {
            if (mesPagado) {
                setMesPagado('');
            }
            return;
        }

        if (!mesPagado || !mesesPendientes.includes(mesPagado)) {
            setMesPagado(mesesPendientes[0]);
        }
    }, [mesesPendientes, mesPagado]);

    const obtenerUsuarioActivo = () => {
        try {
            const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
            const id = Number(usuario?.id_usuario);
            return Number.isInteger(id) && id > 0 ? id : null;
        } catch {
            return null;
        }
    };

    useEffect(() => {
        const consultarEstadoCorrelativoUsuario = async () => {
            const idUsuario = obtenerUsuarioActivo();
            if (!idUsuario) {
                setEstadoCorrelativoUsuario(null);
                return;
            }

            try {
                const res = await axios.get(`${API_BASE_URL}/api/asignar_correlativo/estado-usuario?id_usuario=${idUsuario}`);
                setEstadoCorrelativoUsuario(res.data || null);
            } catch (error) {
                console.error('No se pudo consultar el estado general de correlativos del usuario:', error);
                setEstadoCorrelativoUsuario({
                    disponible: false,
                    mensaje: error?.response?.data?.message || 'No se pudo consultar si tienes correlativos asignados.'
                });
            }
        };

        consultarEstadoCorrelativoUsuario();
    }, []);

    // ✅ Cargar lista inicial de residentes con pagos pendientes al iniciar
    useEffect(() => {
        const cargarResidentesPendientes = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/caja/residentes-pendientes`);
                setListaResidentesPendientes(res.data || []);
            } catch (error) {
                console.error("Error al cargar residentes pendientes:", error);
                setListaResidentesPendientes([]);
            }
        };
        
        cargarResidentesPendientes();
    }, []);

    const limpiarBusquedaCaja = async () => {
        setBusqueda('');
        setListaResidentes([]);
        setDatosDeuda(null);
        setIdResidenteActivo('');
        setMesesPendientes([]);
        setMesesSeleccionados([]);
        setMontoAPagar('');
        setMontoTotalSeleccionado(0);
        setMontoTerrenoSeleccionado(0);
        setServiciosContrato([]);
        setServiciosSeleccionados([]);
        setMontoServiciosSeleccionado(0);
        setShowModalCobro(false);
        setEstadoCorrelativo(null);

        try {
            const res = await axios.get(`${API_BASE_URL}/api/caja/residentes-pendientes`);
            setListaResidentesPendientes(res.data || []);
        } catch (error) {
            console.error("Error al recargar residentes pendientes:", error);
            setListaResidentesPendientes([]);
        }
    };

    const recalcularTotalesCobro = (meses = mesesSeleccionados, serviciosIds = serviciosSeleccionados, residenteActual = datosDeuda, serviciosDisponibles = serviciosContrato) => {
        const cantidadMeses = (meses || []).length;
        const saldoPendiente = parseFloat(residenteActual?.saldo_pendiente || 0);
        const montoCuota = parseFloat(residenteActual?.monto_cuota || 0);

        // No permitir cobrar terreno por encima del saldo pendiente real del contrato.
        const cuotasRestantes = (saldoPendiente > 0 && montoCuota > 0)
            ? Math.ceil(saldoPendiente / montoCuota)
            : 0;
        const mesesTerrenoACobrar = Math.min(cantidadMeses, cuotasRestantes);
        const terrenoCalculado = saldoPendiente > 0 && mesesTerrenoACobrar > 0 ? (montoCuota * mesesTerrenoACobrar) : 0;
        const terrenoTotal = Math.min(terrenoCalculado, Math.max(saldoPendiente, 0));
        const costoServiciosMensual = (serviciosDisponibles || [])
            .filter((s) => serviciosIds.includes(s.id_servicio))
            .reduce((sum, s) => sum + parseFloat(s.costo_servicio || 0), 0);
        const serviciosTotal = cantidadMeses > 0 ? (costoServiciosMensual * cantidadMeses) : 0;
        const total = terrenoTotal + serviciosTotal;

        setMontoTerrenoSeleccionado(terrenoTotal);
        setMontoServiciosSeleccionado(serviciosTotal);
        setMontoTotalSeleccionado(total);
        setMontoAPagar(String(total.toFixed(2)));
    };

    const consultarSiguienteCorrelativo = async (idContrato) => {
        const idUsuario = obtenerUsuarioActivo();
        if (!idUsuario || !idContrato) {
            setEstadoCorrelativo(null);
            return;
        }

        try {
            const res = await axios.get(`${API_BASE_URL}/api/asignar_correlativo/siguiente-correlativo?id_usuario=${idUsuario}&id_contrato=${idContrato}`);
            setEstadoCorrelativo(res.data || null);
        } catch (error) {
            console.error('No se pudo consultar el siguiente correlativo:', error);
            setEstadoCorrelativo({
                disponible: false,
                origen: null,
                correlativo: null,
                id_asignacion: null,
                mensaje: error?.response?.data?.message || 'No se pudo consultar el correlativo disponible.'
            });
        }
    };

    // Buscar residentes por el término ingresado utilizando el puerto correcto 3001
    const buscarResidente = async () => {
        if (!busqueda.trim()) return mostrarToast("Ingresa nombre, apellido, DPI o número de contrato para buscar", "warning");
        try {
            setDatosDeuda(null); // Resetea selecciones anteriores
            setListaResidentesPendientes([]); // Limpia la lista inicial
            const res = await axios.get(`${API_BASE_URL}/api/caja/buscar-residente?criterio=${busqueda}`);
            
            setListaResidentes(res.data);
            
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
        setMontoTotalSeleccionado(0);
        setMontoTerrenoSeleccionado(0);
        setMontoServiciosSeleccionado(0);

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
                    const servicios = serviciosRes?.data?.servicios || [];
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

    // Procesar Cobro utilizando el puerto correcto 3001 y Generar PDF
    const ejecutarCobro = async (e) => {
        e.preventDefault();

        const saldoPendienteActual = parseFloat(datosDeuda?.saldo_pendiente || 0);
        const montoSolicitado = parseFloat(montoAPagar || 0);
        const montoTerreno = parseFloat(montoTerrenoSeleccionado || 0);

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
                id_servicio: servicio.id_servicio,
                nombre_servicio: servicio.nombre_servicio,
                subtotal: parseFloat(servicio.costo_servicio || 0)
            }));
        
        const payload = {
            id_residente: idResidenteActivo,
            id_contrato: datosDeuda.id_contrato,
            id_tipo_contrato: datosDeuda.id_tipo_contrato || 1, 
            id_usuario: obtenerUsuarioActivo(), 
            monto_pagar: montoSolicitado,
            monto_terreno_pagar: montoTerreno,
            monto_mora: parseFloat(montoMora),
            metodo_pago: metodoPago,
            no_referencia: metodoPago === 'Efectivo' ? 'N/A' : referencia, 
            observaciones: `Pago de cuota de terreno mes de ${mesesSeleccionados.join(', ') || mesPagado}`,
            mes_pagado: mesesSeleccionados[0] || mesPagado,
            meses_pagados: mesesSeleccionados.length ? mesesSeleccionados : [mesPagado],
            numero_cuota: parseInt(numCuota),
            servicios_pagados: serviciosPayload
        };

        try {
            const response = await axios.post(`${API_BASE_URL}/api/caja/procesar-pago`, payload);
            
            if (response?.data?.success) {
                mostrarToast("¡Cobro realizado con éxito! Generando recibo...", "success");
                generarPDF(response.data, {
                    ...datosDeuda,
                    nombre: datosDeuda?.nombre || 'Residente',
                    dpi: datosDeuda?.dpi || 'N/A',
                    codigo_contrato: datosDeuda?.codigo_contrato || 'N/A',
                    nombre_contrato: datosDeuda?.nombre_contrato || 'Contrato',
                    saldo_pendiente: datosDeuda?.saldo_pendiente || 0
                }, response.data?.empresa);
                
                setDatosDeuda(prev => ({
                    ...prev,
                    saldo_pendiente: Math.max(parseFloat(prev?.saldo_pendiente || 0) - montoTerreno, 0)
                }));
                
                // RECARGAR MESES PENDIENTES DESPUÉS DEL PAGO
                try {
                    const resMeses = await axios.get(`${API_BASE_URL}/api/caja/meses-pendientes?id_contrato=${datosDeuda.id_contrato}`);
                    const mesesActualizados = resMeses?.data?.meses || [];
                    setMesesPendientes(mesesActualizados);
                    setMesesSeleccionados(mesesActualizados.length ? [mesesActualizados[0]] : []);
                    setNumCuota(mesesActualizados.length ? '1' : '0');
                    if (mesesActualizados.length) {
                        setMesPagado(mesesActualizados[0]);
                    }
                    const primerMes = mesesActualizados[0] || '';
                    const serviciosRes = await axios.get(`${API_BASE_URL}/api/caja/servicios-contrato/${datosDeuda.id_contrato}?mes=${encodeURIComponent(primerMes)}`);
                    const servicios = serviciosRes?.data?.servicios || [];
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
                
                setReferencia(''); 
                setShowModalCobro(false);
                await consultarSiguienteCorrelativo(datosDeuda.id_contrato);
            } else {
                mostrarToast("El cobro no se completó correctamente.", "error");
            }
        } catch (error) {
            mostrarToast("Error al procesar el cobro: " + (error?.response?.data || error?.message || "Error desconocido"), "error");
        }
    };

    // Generador Estructurado del PDF
    const generarPDF = (recibo, residente, empresa) => {
        try {
            const doc = new jsPDF();
            const margenX = 14;
            const fechaHora = new Date().toLocaleString();
            const logoEmpresa = normalizeImageDataUrl(empresa?.logo || '');
            const modoMarcaPdf = logoEmpresa
                ? 'logo_y_nombre'
                : (empresa?.nombre ? 'solo_nombre' : 'sin_marca');
            const shouldShowLogo = ['solo_logo', 'logo_y_nombre', 'logo_centrado'].includes(modoMarcaPdf);
            const shouldShowName = ['logo_y_nombre', 'solo_nombre'].includes(modoMarcaPdf);

            // Encabezado con logo
            if (shouldShowLogo && logoEmpresa) {
                try {
                    const logoFormat = getImageFormatFromDataUrl(logoEmpresa);
                    const logoAlias = `caja-logo-${recibo?.numero_recibo || 'tmp'}-${Date.now()}`;
                    if (modoMarcaPdf === 'logo_centrado') {
                        doc.addImage(logoEmpresa, logoFormat, 88, 8, 35, 22, logoAlias, 'FAST');
                    } else {
                        doc.addImage(logoEmpresa, logoFormat, margenX, 10, 35, 25, logoAlias, 'FAST');
                    }
                } catch (e) {
                    console.warn('No se pudo cargar el logo:', e);
                }
            }

            doc.setFont("Helvetica", "bold");
            doc.setFontSize(12);
            const headerRightX = 132;
            let leftMetaStartY = 24;
            if (shouldShowName) {
                if (modoMarcaPdf === 'solo_nombre') {
                    const companyLines = doc.splitTextToSize(empresa?.nombre || "INMOBILIARIA ALFA S.A.", 180);
                    doc.text(companyLines, 105, 18, { align: 'center' });
                    leftMetaStartY = 24 + ((companyLines.length - 1) * 5);
                } else {
                    const companyLines = doc.splitTextToSize(empresa?.nombre || "INMOBILIARIA ALFA S.A.", 64);
                    doc.text(companyLines, 55, 18);
                    leftMetaStartY = 24 + ((companyLines.length - 1) * 5);
                }
            }

            doc.setFont("Helvetica", "normal");
            doc.setFontSize(10);
            if (shouldShowName) {
                if (modoMarcaPdf === 'solo_nombre') {
                    doc.text(`NIT: ${empresa?.nit || 'N/A'}`, 14, leftMetaStartY);
                    doc.text(`País: ${empresa?.pais || 'Guatemala'}`, 14, leftMetaStartY + 5);
                    doc.text(`Moneda: ${empresa?.moneda || 'GTQ'}`, 14, leftMetaStartY + 10);
                } else {
                    doc.text(`NIT: ${empresa?.nit || 'N/A'}`, 55, leftMetaStartY);
                    doc.text(`País: ${empresa?.pais || 'Guatemala'}`, 55, leftMetaStartY + 5);
                    doc.text(`Moneda: ${empresa?.moneda || 'GTQ'}`, 55, leftMetaStartY + 10);
                }
            }

            doc.setFont("Helvetica", "bold");
            doc.setFontSize(10.5);
            const titleLines = doc.splitTextToSize('FACTURA / COMPROBANTE DE COBRO', 56);
            doc.text(titleLines, headerRightX, 16);
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(10);
            const rightMetaStartY = 23 + ((titleLines.length - 1) * 5);
            doc.text(`Documento No: ${recibo?.numero_recibo || 'N/A'}`, headerRightX, rightMetaStartY);
            doc.text(`Fecha emisión: ${recibo?.fecha || new Date().toLocaleDateString()}`, headerRightX, rightMetaStartY + 6);
            doc.text(`Fecha/Hora impresión: ${fechaHora}`, headerRightX, rightMetaStartY + 12);

            const headerBottomY = Math.max(leftMetaStartY + 10, rightMetaStartY + 12) + 5;
            doc.line(14, headerBottomY, 196, headerBottomY);

            // Datos del cliente
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(11);
            const clienteStartY = headerBottomY + 10;
            doc.text("DATOS DEL CLIENTE / RESIDENTE", 14, clienteStartY);
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Nombre: ${residente?.nombre || 'N/A'}`, 14, clienteStartY + 7);
            doc.text(`Identificación: ${residente?.numero_identificacion || 'N/A'}`, 14, clienteStartY + 13);
            doc.text(`DPI: ${residente?.dpi || 'N/A'}`, 14, clienteStartY + 19);
            doc.text(`NIT: ${getNitDisplay(residente?.nit)}`, 14, clienteStartY + 25);
            const direccionLines = doc.splitTextToSize(`Dirección: ${residente?.direccion_notificacion || 'N/A'}`, 88);
            const contratoLines = doc.splitTextToSize(`Contrato: ${residente?.codigo_contrato || 'N/A'} (${residente?.nombre_contrato || 'N/A'})`, 88);
            doc.text(direccionLines, 105, clienteStartY + 7);
            const contratoStartY = clienteStartY + 7 + (direccionLines.length * 5) + 1;
            doc.text(contratoLines, 105, contratoStartY);

            const leftBottomY = clienteStartY + 25;
            const rightBottomY = contratoStartY + ((contratoLines.length - 1) * 5);
            const clienteBottomY = Math.max(leftBottomY, rightBottomY);

            // Datos de pago
            doc.setFont("Helvetica", "bold");
            const pagoStartY = clienteBottomY + 10;
            doc.text("DATOS DE PAGO", 14, pagoStartY);
            doc.setFont("Helvetica", "normal");
            doc.text(`Método de pago: ${recibo?.metodo_pago || metodoPago || 'N/A'}`, 14, pagoStartY + 6);
            doc.text(`Referencia: ${recibo?.no_referencia || referencia || 'N/A'}`, 105, pagoStartY + 6);
            doc.text(`Origen correlativo: ${recibo?.origen_correlativo || 'N/A'}`, 14, pagoStartY + 12);
            if (recibo?.id_asignacion_correlativo) {
                doc.text(`Lote asignado No: ${recibo.id_asignacion_correlativo}`, 105, pagoStartY + 12);
            }

            const detalleCobro = Array.isArray(recibo?.detalle_cobro) ? recibo.detalle_cobro : [];
            const rows = detalleCobro
                .filter((item) => item && Number(item.total || 0) > 0)
                .map((item) => ([
                    String(item?.concepto || 'Concepto cobrado'),
                    String(item?.mes || 'N/A'),
                    `Q${parseFloat(item?.monto_base || 0).toFixed(2)}`,
                    `Q${parseFloat(item?.iva || 0).toFixed(2)}`,
                    `Q${parseFloat(item?.total || 0).toFixed(2)}`
                ]));

            if (!rows.length) {
                const mesesPagados = Array.isArray(recibo?.meses_pagados) && recibo.meses_pagados.length
                    ? recibo.meses_pagados
                    : [recibo?.mes_pagado || 'N/A'];
                const montoPrincipalFallback = parseFloat(recibo?.monto_pagado || 0);
                const ivaFallback = parseFloat(recibo?.iva_total || (montoPrincipalFallback * 0.12));
                rows.push([
                    'Pago aplicado',
                    mesesPagados.join(', '),
                    `Q${montoPrincipalFallback.toFixed(2)}`,
                    `Q${ivaFallback.toFixed(2)}`,
                    `Q${(montoPrincipalFallback + ivaFallback).toFixed(2)}`
                ]);
            }

            const tableStartY = pagoStartY + 19;
            autoTable(doc, {
                startY: tableStartY,
                head: [['Concepto / Cuota', 'Mes Afectado', 'Monto Base', 'IVA 12%', 'Total por Mes']],
                body: rows,
                theme: 'striped',
                headStyles: { fillColor: [36, 125, 188] },
                styles: { fontSize: 10 }
            });

            let finalY = doc.lastAutoTable.finalY + 15;
            doc.setFont("Helvetica", "bold");
            
            const saldoAnterior = parseFloat(residente?.saldo_pendiente || 0);
            const montoPrincipalHoy = parseFloat(recibo?.monto_pagado || 0);
            const ivaTotal = parseFloat(recibo?.iva_total || (montoPrincipalHoy * 0.12));
            const montoPagadoHoy = parseFloat(recibo?.total_cobrado || (montoPrincipalHoy + ivaTotal + parseFloat(recibo?.monto_mora || 0)));
            const nuevoSaldoDeber = saldoAnterior - montoPrincipalHoy;
            
            doc.text(`Saldo Anterior: Q${saldoAnterior.toFixed(2)}`, 130, finalY);
            doc.text(`Subtotal deuda pagada: Q${montoPrincipalHoy.toFixed(2)}`, 130, finalY + 7);
            doc.setFont("Helvetica", "bold");
            doc.text(`IVA 12%: Q${ivaTotal.toFixed(2)}`, 130, finalY + 14);
            doc.text(`Mora Aplicada: Q${parseFloat(recibo?.monto_mora || 0).toFixed(2)}`, 130, finalY + 21);
            doc.text(`Total Cobrado Hoy: Q${montoPagadoHoy.toFixed(2)}`, 130, finalY + 28);
            doc.setFont("Helvetica", "bold");
            doc.setTextColor(200, 0, 0); // Rojo para el saldo final
            doc.text(`SALDO A DEBER: Q${nuevoSaldoDeber.toFixed(2)}`, 130, finalY + 35);
            doc.setTextColor(0, 0, 0); // Volver al negro

            doc.setFontSize(9);
            doc.setFont("Helvetica", "italic");
            doc.text("Gracias por su pago. Conservar este documento para cualquier aclaración fiscal y administrativa.", 14, finalY + 48);

            const fileName = `Recibo_${recibo?.numero_recibo || 'sin_numero'}.pdf`;
            doc.save(fileName);
        } catch (error) {
            console.error('Error al generar PDF:', error);
            mostrarToast('El cobro se registró, pero no se pudo generar el PDF automáticamente.', 'warning');
        }

    };

    const listaFiltrada = listaResidentesPendientes.filter(r => 
      r.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.dpi?.toLowerCase().includes(busqueda.toLowerCase())
    );

    const handleBusquedaChange = (e) => {
      setBusqueda(e.target.value);
      setCurrentPage(1);
    };

    const { paginatedItems: listaResidentesPaginada, totalPages, startIndex, endIndex } = getPaginatedData(listaFiltrada, currentPage, itemsPerPage);
    const saldoTerrenoPendiente = parseFloat(datosDeuda?.saldo_pendiente || 0);
    const montoMoraActual = Math.max(parseFloat(montoMora || 0), 0);
    const tieneServiciosPendientes = (serviciosContrato || []).some((s) => !s.ya_pagado_mes);
    const tieneMesesPendientesTerreno = saldoTerrenoPendiente > 0;
    const puedeGenerarCobro = !!datosDeuda && (tieneMesesPendientesTerreno || tieneServiciosPendientes);

    return (
        <div className="container mt-4">
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
                            <li key={r.id_contrato} className="list-group-item list-group-item-action py-3" style={{ cursor: 'pointer' }} onClick={() => seleccionarResidente(r)}>
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <strong className="fs-4">📦 {r.nombre}</strong>
                                        <span className={`badge ms-2 ${parseFloat(r.saldo_pendiente || 0) <= 0 ? 'bg-success' : 'bg-danger'}`}>
                                            {parseFloat(r.saldo_pendiente || 0) <= 0 ? 'SOLVENTE' : 'PENDIENTE'}
                                        </span>
                                        <br/>
                                        <span className="text-muted fs-5">DPI: {r.dpi} | Contrato: {r.codigo_contrato}</span>
                                    </div>
                                    <div className="text-end">
                                        <span className={`badge fs-6 ${parseFloat(r.saldo_pendiente || 0) <= 0 ? 'bg-success' : 'bg-danger'}`}>
                                            {parseFloat(r.saldo_pendiente || 0) <= 0
                                                ? `Solvente: Q${getSaldoDisplay(r.saldo_pendiente).toFixed(2)}`
                                                : `Pendiente: Q${getSaldoDisplay(r.saldo_pendiente).toFixed(2)}`}
                                        </span>
                                        <br/>
                                        <span className="text-success fw-bold fs-5">Cuota: Q{parseFloat(r.monto_cuota || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        startIndex={startIndex}
                        endIndex={endIndex}
                        itemsCount={listaFiltrada.length}
                    />
                </div>
            )}

            {/* Lista de residentes cuando hay múltiples resultados */}
            {listaResidentes.length > 1 && (
                <div className="card mb-4 shadow-sm border-primary">
                    <div className="card-header bg-primary text-white fw-bold">
                        Seleccione el residente correcto
                    </div>
                    <ul className="list-group list-group-flush">
                        {listaResidentes.map((r) => (
                            <li key={r.id_contrato} className="list-group-item list-group-item-action" style={{ cursor: 'pointer' }} onClick={() => seleccionarResidente(r)}>
                                <strong>ID: {r.id_residente}</strong> — {r.nombre} &nbsp;|&nbsp;
                                Identificación: <span className="text-primary fw-bold">{r.numero_identificacion || 'Sin asignar'}</span> &nbsp;|&nbsp;
                                DPI: {r.dpi} &nbsp;|&nbsp;
                                Contrato: {r.codigo_contrato} &nbsp;|&nbsp;
                                <span className={`badge ${parseFloat(r.saldo_pendiente || 0) <= 0 ? 'bg-success' : 'bg-danger'}`}>
                                    {parseFloat(r.saldo_pendiente || 0) <= 0 ? 'SOLVENTE' : 'PENDIENTE'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Tarjeta de estado del residente seleccionado */}
            {datosDeuda && (
                <div className="card shadow-sm border-success mb-4">
                    <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
                        <span className="fw-bold fs-5">👤 {datosDeuda.nombre}</span>
                        <span className="badge bg-light text-success fs-6">ID: {idResidenteActivo}</span>
                    </div>
                    <div className="card-body">
                        <div className="row">
                            <div className="col-md-6">
                                <p className="mb-1"><strong>Contrato:</strong> {datosDeuda.codigo_contrato} — {datosDeuda.nombre_contrato}</p>
                                <p className="mb-1"><strong>N° Identificación:</strong> <span className="text-primary fw-bold">{datosDeuda.numero_identificacion || 'Sin asignar'}</span></p>
                                <p className="mb-1"><strong>NIT:</strong> <span className="text-primary fw-bold">{getNitDisplay(datosDeuda.nit)}</span></p>
                            </div>
                            <div className="col-md-6">
                                <p className="mb-1"><strong>Saldo pendiente:</strong> <span className="text-danger fw-bold">Q{getSaldoDisplay(datosDeuda?.saldo_pendiente).toFixed(2)}</span></p>
                                <p className="mb-1"><strong>Monto cuota pactada:</strong> <span className="text-success fw-bold">Q{parseFloat(datosDeuda.monto_cuota).toFixed(2)}</span></p>
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
                        <div className="text-center">
                            <button
                                className="btn btn-success btn-lg fw-bold px-5"
                                onClick={() => setShowModalCobro(true)}
                            >
                                {!puedeGenerarCobro ? '✅ CUENTA SOLVENTE' : '💳 GENERAR COBRO'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE COBRO */}
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
                                            <small><strong>Saldo pendiente:</strong> Q{getSaldoDisplay(datosDeuda?.saldo_pendiente).toFixed(2)}</small><br />
                                            <small><strong>Cuota fija:</strong> Q{parseFloat(datosDeuda.monto_cuota).toFixed(2)}</small><br />
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
                                            <strong>Terreno por mes:</strong> Q{parseFloat(datosDeuda?.monto_cuota || 0).toFixed(2)}
                                            <br />
                                            <strong>Servicios seleccionados:</strong> Q{(mesesSeleccionados.length ? (montoServiciosSeleccionado / Math.max(mesesSeleccionados.length, 1)) : 0).toFixed(2)} / mes
                                        </span>
                                        <span className="fw-bold text-success">
                                            Total ({mesesSeleccionados.length} mes(es)): Q{montoTotalSeleccionado.toFixed(2)}
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
                                                                <br />
                                                                {servicio.ya_pagado_mes && <small className="text-success fw-bold">Ya pagado en el mes seleccionado</small>}
                                                            </div>
                                                            <span className="badge bg-primary">Q{parseFloat(servicio.costo_servicio || 0).toFixed(2)} / mes</span>
                                                        </div>
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
                                            <input className="form-control" type="number" step="0.01" value={montoMora} onChange={(e) => setMontoMora(e.target.value)} />
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