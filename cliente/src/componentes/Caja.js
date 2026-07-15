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
};

const normalizeSearchValue = (value = '') => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const cientosALetras = (n) => {
    if (n === 100) return 'cien';
    const c = Math.floor(n / 100);
    const r = n % 100;
    if (r === 0) return CENTENAS[c];
    if (r < 30) return `${CENTENAS[c]} ${UNIDADES[r]}`.trim();
    const d = Math.floor(r / 10);
    const u = r % 10;
    return `${CENTENAS[c]} ${DECENAS[d]}${u ? ` y ${UNIDADES[u]}` : ''}`.trim();
};

const numeroALetrasRecibo = (n) => {
    const numero = Math.floor(Number(n || 0));
    if (!Number.isFinite(numero) || numero <= 0) return 'cero';
    let restante = numero;
    let salida = '';

    if (restante >= 1000000) {
        const millones = Math.floor(restante / 1000000);
        salida += `${numeroALetrasRecibo(millones)} ${millones === 1 ? 'millon' : 'millones'} `;
        restante %= 1000000;
    }
    if (restante >= 1000) {
        const miles = Math.floor(restante / 1000);
        salida += `${miles === 1 ? 'mil' : `${cientosALetras(miles)} mil`} `;
        restante %= 1000;
    }
    if (restante > 0) salida += cientosALetras(restante);
    return salida.trim();
};

const montoALetrasRecibo = (monto) => {
    const base = numeroALetrasRecibo(monto);
    return `${base.charAt(0).toUpperCase()}${base.slice(1)} quetzales exactos`;
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

const getUsuarioSesion = () => {
    try {
        return JSON.parse(localStorage.getItem('usuario') || '{}');
    } catch {
        return {};
    }
};

const esRolJuridico = (usuario = {}) => {
    const rol = String(usuario?.nombre_rol || '').toLowerCase();
    return rol.includes('jurid') || rol.includes('legal');
};

const Caja = () => {
    const getNitDisplay = (nit) => (nit && String(nit).trim() ? String(nit).trim() : 'C/F');
    const getSaldoDisplay = (saldo) => Math.max(parseFloat(saldo || 0), 0);
    const esServicioCobroUnico = (periodicidad = '', nombreServicio = '') => {
        const periodicidadNormalizada = String(periodicidad || '').trim().toLowerCase();
        if (periodicidadNormalizada === 'unico') {
            return true;
        }
        if (periodicidadNormalizada === 'mensual') {
            return false;
        }

        const nombre = String(nombreServicio || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        return ['derecho', 'paja', 'instalacion', 'conexion', 'matricula', 'inscripcion']
            .some((fragmento) => nombre.includes(fragmento));
    };

    const filtrarServiciosMostrables = (servicios = []) => {
        return (Array.isArray(servicios) ? servicios : []).filter((servicio) => {
            const esUnico = esServicioCobroUnico(servicio?.periodicidad, servicio?.nombre_servicio);
            const yaPagadoAlgunaVez = Boolean(servicio?.ya_pagado_alguna_vez);
            return !(esUnico && yaPagadoAlgunaVez);
        });
    };

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
    const [montoInteresSeleccionado, setMontoInteresSeleccionado] = useState(0);
    const [morasPendientes, setMorasPendientes] = useState([]);
    const [morasSeleccionadas, setMorasSeleccionadas] = useState([]);
    const [serviciosContrato, setServiciosContrato] = useState([]);
    const [serviciosSeleccionados, setServiciosSeleccionados] = useState([]);
    const [montoServiciosSeleccionado, setMontoServiciosSeleccionado] = useState(0);
    const [showModalCobro, setShowModalCobro] = useState(false);
    const [estadoCorrelativoUsuario, setEstadoCorrelativoUsuario] = useState(null);
    const [estadoCorrelativo, setEstadoCorrelativo] = useState(null);
    const [resumenServiciosIniciales, setResumenServiciosIniciales] = useState(null);
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

    const contratoTieneAsignacionValida = (registro = {}) => {
        const idProyecto = Number(registro?.id_proyecto || 0);
        const idEmpresaFacturacion = Number(registro?.id_empresa_facturacion || 0);
        return Number.isInteger(idProyecto) && idProyecto > 0 && Number.isInteger(idEmpresaFacturacion) && idEmpresaFacturacion > 0;
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
            const idUsuario = obtenerUsuarioActivo();
            try {
                const res = await axios.get(`${API_BASE_URL}/api/caja/residentes-pendientes`, {
                    params: idUsuario ? { id_usuario: idUsuario } : {}
                });
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
        setMontoMora('0');
        setMontoTotalSeleccionado(0);
        setMontoTerrenoSeleccionado(0);
        setMontoInteresSeleccionado(0);
        setMorasPendientes([]);
        setMorasSeleccionadas([]);
        setServiciosContrato([]);
        setServiciosSeleccionados([]);
        setMontoServiciosSeleccionado(0);
        setShowModalCobro(false);
        setEstadoCorrelativo(null);
        setResumenServiciosIniciales(null);

        try {
            const idUsuario = obtenerUsuarioActivo();
            const res = await axios.get(`${API_BASE_URL}/api/caja/residentes-pendientes`, {
                params: idUsuario ? { id_usuario: idUsuario } : {}
            });
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
        const interesPorcentaje = Math.max(parseFloat(residenteActual?.interes_porcentaje || 0), 0);
        const totalMesesPendientes = Math.max((mesesPendientes || []).length, 1);

        // No permitir cobrar terreno por encima del saldo pendiente real del contrato.
        const cuotasRestantes = (saldoPendiente > 0 && montoCuota > 0)
            ? Math.ceil(saldoPendiente / montoCuota)
            : 0;
        const mesesTerrenoACobrar = Math.min(cantidadMeses, cuotasRestantes);
        const terrenoCalculado = saldoPendiente > 0 && mesesTerrenoACobrar > 0 ? (montoCuota * mesesTerrenoACobrar) : 0;
        const terrenoTotal = Math.min(terrenoCalculado, Math.max(saldoPendiente, 0));
        const serviciosSeleccionadosDetalle = (serviciosDisponibles || [])
            .filter((s) => serviciosIds.includes(s.id_servicio));
        const costoServiciosMensual = serviciosSeleccionadosDetalle
            .filter((s) => !esServicioCobroUnico(s.periodicidad, s.nombre_servicio))
            .reduce((sum, s) => sum + parseFloat(s.costo_servicio || 0), 0);
        const costoServiciosUnicos = serviciosSeleccionadosDetalle
            .filter((s) => esServicioCobroUnico(s.periodicidad, s.nombre_servicio))
            .reduce((sum, s) => sum + parseFloat(s.costo_servicio || 0), 0);
        const serviciosTotal = cantidadMeses > 0 ? ((costoServiciosMensual * cantidadMeses) + costoServiciosUnicos) : 0;
        const interesTotalContrato = parseFloat(((Math.max(saldoPendiente, 0) * interesPorcentaje) / 100).toFixed(2));
        const interesPorMes = totalMesesPendientes > 0
            ? parseFloat((interesTotalContrato / totalMesesPendientes).toFixed(2))
            : 0;
        const interesSeleccionado = parseFloat((interesPorMes * mesesTerrenoACobrar).toFixed(2));
        const total = terrenoTotal + serviciosTotal + interesSeleccionado;

        setMontoTerrenoSeleccionado(terrenoTotal);
        setMontoServiciosSeleccionado(serviciosTotal);
        setMontoInteresSeleccionado(interesSeleccionado);
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
            const idUsuario = obtenerUsuarioActivo();
            setDatosDeuda(null); // Resetea selecciones anteriores
            setListaResidentesPendientes([]); // Limpia la lista inicial
            const res = await axios.get(`${API_BASE_URL}/api/caja/buscar-residente`, {
                params: {
                    criterio: busqueda.trim(),
                    ...(idUsuario ? { id_usuario: idUsuario } : {})
                }
            });
            
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

    // Generador de recibo estilo formato institucional
    const generarPDF = (recibo, residente, empresa) => {
        try {
            // Carta completa (landscape) para evitar salto a segunda hoja
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
            const logoEmpresa = normalizeImageDataUrl(empresa?.logo_empresa || residente?.logo_empresa_pdf || empresa?.logo || '');
            const logoProyecto = normalizeImageDataUrl(empresa?.logo_proyecto || residente?.logo_proyecto || '');
            const detalleCobro = Array.isArray(recibo?.detalle_cobro) ? recibo.detalle_cobro : [];
            const montoTotal = parseFloat(recibo?.total_cobrado || recibo?.monto_pagado || 0);
            const abonoExtra = parseFloat(recibo?.monto_servicios_pagado || 0) + parseFloat(recibo?.monto_mora || 0);
            const interesAplicado = parseFloat(recibo?.monto_interes_pagado || 0);
            const referencia = String(recibo?.no_referencia || '').trim();
            const matchRef = referencia.match(/^([A-Za-z]+)-([0-9]+)$/);
            const serie = matchRef ? matchRef[1].toUpperCase() : 'B';
            const numero = matchRef ? matchRef[2].slice(-5) : String(Date.now()).slice(-5);
            const fecha = recibo?.fecha ? new Date(recibo.fecha) : new Date();
            const mesesPagadosRecibo = Array.isArray(recibo?.meses_pagados)
                ? recibo.meses_pagados.map((mes) => String(mes || '').trim()).filter(Boolean)
                : [];
            const cuotaInicio = Number(recibo?.numero_cuota_inicio || recibo?.numero_cuota || 0);
            const cuotaFin = Number(recibo?.numero_cuota_fin || cuotaInicio || 0);
            const cantidadCuotasPagadas = Number(recibo?.cantidad_cuotas_pagadas || 0);
            const cuotaDisplay = Number.isInteger(cuotaInicio) && cuotaInicio > 0
                ? ((Number.isInteger(cuotaFin) && cuotaFin > cuotaInicio)
                    ? `${cuotaInicio}-${cuotaFin}`
                    : String(cuotaInicio))
                : 'N/A';
            const conceptos = detalleCobro.length ? [...new Set(detalleCobro.map((d) => String(d?.concepto || '').trim()).filter(Boolean))].join(', ') : 'Pago de cuota de financiamiento';
            const metodo = String(recibo?.metodo_pago || metodoPago || '').toLowerCase();
            const usuarioActivo = getUsuarioSesion();
            const usarFormatoJuridico = esRolJuridico(usuarioActivo);

            if (usarFormatoJuridico) {
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margenX = 8;
                const ancho = pageW - (margenX * 2);
                const contenidoY = 36;
                const contenidoH = 145;
                const nombreEmpresa = String(empresa?.nombre_empresa || empresa?.nombre || residente?.nombre_marca_pdf || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase();
                const nombreProyecto = String(empresa?.nombre_proyecto || residente?.nombre_proyecto_pdf || 'Proyecto');
                const fechaDoc = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
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
                        doc.addImage(logoEmpresa, getImageFormatFromDataUrl(logoEmpresa), margenX + 3, 8.5, 31, 18, `jur-logo-${Date.now()}`, 'FAST');
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
                doc.text(`NO. ${String(numero).padStart(5, '0')}`, pageW - 23.8, 23.9, { align: 'center' });
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
                doc.text(montoTotal.toFixed(2), amountBoxX + 2, rY - 0.2);

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
                doc.text(doc.splitTextToSize(String(residente?.nombre || 'N/A'), filaAncho - 34).slice(0, 1), filaX + 30, rY + 6.8);
                doc.text(doc.splitTextToSize(montoALetrasRecibo(montoTotal), filaAncho - 34).slice(0, 1), filaX + 30, rY + 17.3);
                doc.text(doc.splitTextToSize(String(conceptos), filaAncho - 40).slice(0, 1), filaX + 40, rY + 27.8);
                doc.text(doc.splitTextToSize(nombreProyecto, filaAncho - 34).slice(0, 1), filaX + 23, rY + 38.3);

                const mesesJuridicoTexto = mesesPagadosRecibo.length ? mesesPagadosRecibo.join(', ') : (String(recibo?.mes_pagado || '').trim() || 'N/A');
                const resumenCuotasInteres = `Cuota(s): ${cuotaDisplay} | Mes(es): ${mesesJuridicoTexto} | Interes aplicado: Q${Math.max(interesAplicado, 0).toFixed(2)}`;
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(7.7);
                doc.text(doc.splitTextToSize(resumenCuotasInteres, filaAncho - 4).slice(0, 1), filaX + 2, rY + (filaH * 4) - 1.2);

                const pagosY = rY + (filaH * 4);
                doc.rect(filaX, pagosY, filaAncho, 24);
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(8.2);
                doc.text('Boleta:', filaX + 2, pagosY + 5.6);
                doc.text('Transferencia:', filaX + 52, pagosY + 5.6);
                doc.text('Cheque:', filaX + 114, pagosY + 5.6);
                doc.text('Efectivo:', filaX + 156, pagosY + 5.6);

                const referenciaBase = String(recibo?.no_referencia || '').trim();
                const boletaValor = metodo.includes('deposit') ? referenciaBase : '';
                const transferenciaValor = metodo.includes('transfer') ? referenciaBase : '';
                const chequeValor = metodo.includes('cheque') ? referenciaBase : '';
                const efectivoValor = metodo.includes('efectivo') ? 'X' : '';
                doc.setFont('Helvetica', 'normal');
                doc.setFontSize(10.1);
                doc.text(doc.splitTextToSize(boletaValor || '', 44).slice(0, 1), filaX + 2, pagosY + 16);
                doc.text(doc.splitTextToSize(transferenciaValor || '', 56).slice(0, 1), filaX + 52, pagosY + 16);
                doc.text(doc.splitTextToSize(chequeValor || '', 40).slice(0, 1), filaX + 114, pagosY + 16);
                doc.text(efectivoValor, filaX + 160, pagosY + 16);

                const firmaY = pagosY + 24;
                doc.rect(filaX, firmaY, filaAncho, 22);
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.text('Firma:', filaX + 2, firmaY + 6.2);
                if (logoProyecto) {
                    try {
                        doc.addImage(logoProyecto, getImageFormatFromDataUrl(logoProyecto), filaX + 62, firmaY + 1.8, 32, 13.2, `jur-proy-${Date.now()}`, 'FAST');
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

                const juridicoFileName = `Recibo_Juridico_${String(recibo?.no_referencia || recibo?.numero_recibo || 'sin_numero').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
                doc.save(juridicoFileName);
                return;
            }

            const x = 10;
            const w = 190;
            let y = 10;
            const headerHeight = 22;
            const rightHeaderWidth = 68;
            const leftHeaderWidth = w - rightHeaderWidth;
            const rightHeaderX = x + leftHeaderWidth;

            doc.setFillColor(240, 228, 167);
            doc.rect(x, y, w, headerHeight, 'F');
            doc.rect(x, y, w, headerHeight);
            doc.line(rightHeaderX, y, rightHeaderX, y + headerHeight);

            const logoX = x + 3;
            const logoY = y + 1.2;
            const logoW = 24;
            const logoH = 19;
            if (logoEmpresa) {
                try {
                    doc.addImage(logoEmpresa, getImageFormatFromDataUrl(logoEmpresa), logoX, logoY, logoW, logoH, `rec-logo-${Date.now()}`, 'FAST');
                } catch {
                    // no-op
                }
            }

            const leftTextX = logoEmpresa ? (logoX + logoW + 3) : (x + 3);
            const leftTextWidth = logoEmpresa ? (leftHeaderWidth - (logoW + 9)) : (leftHeaderWidth - 6);
            const rightCenterX = rightHeaderX + (rightHeaderWidth / 2);

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9.6);
            doc.text(doc.splitTextToSize(String(empresa?.nombre_empresa || empresa?.nombre || residente?.nombre_marca_pdf || 'CORPORACION DE INVERSION INMOBILIARIA').toUpperCase(), leftTextWidth), leftTextX + (leftTextWidth / 2), y + 7, { align: 'center' });
            doc.setFontSize(10.5);
            doc.text('RECIBO DE CAJA', rightCenterX, y + 7, { align: 'center' });
            doc.setFontSize(9.5);
            doc.text(`Serie "${serie}"`, rightHeaderX + 6, y + 13.5);
            doc.setTextColor(166, 35, 35);
            doc.text(`N. ${String(numero).padStart(5, '0')}`, x + w - 2, y + 13.5, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.text('15 Avenida "A" 24-22, Zona 13, Oficina #5', x + (w / 2), y + headerHeight + 4.5, { align: 'center' });
            doc.text('PBX: 2220-6406  Telefono: 5825-5903', x + (w / 2), y + headerHeight + 8.2, { align: 'center' });

            y += headerHeight + 10;
            doc.setFillColor(245, 211, 69);
            doc.rect(x, y, w, 6, 'F');
            doc.rect(x, y, w, 6);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.8);
            doc.text('Datos del cliente:', x + 2, y + 4.3);

            y += 7;
            const nombreLineas = doc.splitTextToSize(String(residente?.nombre || 'N/A'), 158).slice(0, 1);
            const nombreAltura = 9;
            doc.rect(x, y, w, nombreAltura);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Nombre:', x + 2, y + 5);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(nombreLineas, x + 22, y + 5);

            y += nombreAltura + 2.5;
            doc.setFillColor(245, 211, 69);
            doc.rect(x, y, 145, 6, 'F');
            doc.rect(x + 145, y, 45, 6, 'F');
            doc.rect(x, y, 145, 6);
            doc.rect(x + 145, y, 45, 6);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.8);
            doc.text('Fecha:', x + 2, y + 4.3);
            doc.text('Por:', x + 147, y + 4.3);

            y += 6;
            const fechaLineas = doc.splitTextToSize(`Guatemala, ${fechaLargaGT(fecha)}`, 139).slice(0, 1);
            const fechaAltura = 9;
            doc.rect(x, y, 145, fechaAltura);
            doc.rect(x + 145, y, 45, fechaAltura);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(9.3);
            doc.text(fechaLineas, x + 2, y + 5);
            doc.setFont('Helvetica', 'bold');
            doc.text(`Q ${montoTotal.toFixed(2)}`, x + 147, y + 5);

            y += fechaAltura + 2.5;
            const pagaLineas = doc.splitTextToSize(montoALetrasRecibo(montoTotal), 143).slice(0, 1);
            const pagaAltura = 9;
            doc.rect(x, y, w, pagaAltura);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Paga la cantidad de:', x + 2, y + 5);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(pagaLineas, x + 45, y + 5);

            y += pagaAltura + 2.5;
            const conceptosLineas = doc.splitTextToSize(conceptos, 143).slice(0, 2);
            const conceptosAltura = Math.max(10, (conceptosLineas.length * 4.2) + 2.2);
            doc.rect(x, y, w, conceptosAltura);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Por cancelacion de:', x + 2, y + 4.9);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(9.8);
            doc.text(conceptosLineas, x + 43, y + 4.9);

            y += conceptosAltura + 2.5;
            doc.rect(x, y, 65, 8);
            doc.rect(x + 65, y, 125, 8);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Cuota(s):', x + 2, y + 5.2);
            doc.setTextColor(166, 35, 35);
            doc.setFontSize(12);
            doc.text(cuotaDisplay, x + 29, y + 5.2);
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            const detalleCuotasTexto = cantidadCuotasPagadas > 0
                ? `${cantidadCuotasPagadas} cuota(s) | ${mesesPagadosRecibo.join(', ')}`
                : '';
            const mesesReciboTexto = mesesPagadosRecibo.length ? mesesPagadosRecibo.join(', ') : (String(recibo?.mes_pagado || '').trim() || 'N/A');
            doc.text('Abono extraordinario:', x + 67, y + 3.8);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Q.${Math.max(abonoExtra, 0).toFixed(2)}`, x + 112, y + 3.8);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(7.1);
            doc.text(`Mes(es): ${mesesReciboTexto}`, x + 67, y + 7.1);
            doc.text(`Interes aplicado: Q${Math.max(interesAplicado, 0).toFixed(2)}`, x + 125, y + 7.1);
            doc.setFont('Helvetica', 'normal');
            if (detalleCuotasTexto) {
                doc.setFontSize(6.8);
                doc.text(doc.splitTextToSize(detalleCuotasTexto, 118).slice(0, 1), x + 67, y + 10.2);
            }

            const boxY = Math.min(Math.max(y + 38, 140), 160);
            const boxH = 22;
            doc.rect(x, boxY, 60, boxH);
            doc.rect(x + 65, boxY, 60, boxH);

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8.6);
            doc.text(`${metodo.includes('deposit') ? 'X' : ' '}  Boleta No.`, x + 3, boxY + 4.8);
            doc.text(`${metodo.includes('transfer') ? 'X' : ' '}  Transferencia.`, x + 3, boxY + 10.2);
            if (!metodo.includes('efectivo')) {
                doc.text(`NO. ${String(recibo?.no_referencia || 'N/A')}`, x + 3, boxY + 15.8);
            }

            if (logoProyecto) {
                try {
                    doc.addImage(logoProyecto, getImageFormatFromDataUrl(logoProyecto), x + 81, boxY + 9, 28, 11, `rec-logo-proyecto-${Date.now()}`, 'FAST');
                } catch {
                    // no-op
                }
            }
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.8);
            doc.text(doc.splitTextToSize(String(empresa?.nombre_proyecto || residente?.nombre_proyecto_pdf || 'Proyecto').toUpperCase(), 54), x + 95, boxY + 4.6, { align: 'center' });

            const footerY = 205;
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(6.8);
            doc.text(
                doc.splitTextToSize('Los pagos mediante cheque estan regulados por las disposiciones contenidas en el Articulo 494 al 543 del Codigo de Comercio. Es importante tener en cuenta que todo cheque recibido se acepta bajo reserva de cobro; en caso de presentarse un cheque sin fondos disponibles, se aplicara un recargo de Q75.00 y se debitara en el proximo pago. Este recibo electronico se extiende previo a la confirmacion de la transaccion bancaria, quedando pendiente de dicha confirmacion para su validez.', 188).slice(0, 2),
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
    const saldoTerrenoPendiente = parseFloat(datosDeuda?.saldo_pendiente || 0);
    const porcentajeInteresContrato = Math.max(parseFloat(datosDeuda?.interes_porcentaje || 0), 0);
    const interesCalculadoContrato = parseFloat(((saldoTerrenoPendiente * porcentajeInteresContrato) / 100).toFixed(2));
    const totalContratoConInteres = parseFloat((saldoTerrenoPendiente + interesCalculadoContrato).toFixed(2));

    const capitalSeleccionado = parseFloat(montoTerrenoSeleccionado || 0);
    const interesCalculadoSeleccion = parseFloat(montoInteresSeleccionado || 0);
    const totalSeleccionCapitalInteres = parseFloat((capitalSeleccionado + interesCalculadoSeleccion).toFixed(2));
    const montoMoraActual = Math.max(parseFloat(montoMora || 0), 0);
    const tieneServiciosPendientes = (serviciosContrato || []).some((s) => !s.ya_pagado_mes);
    const tieneMesesPendientesTerreno = saldoTerrenoPendiente > 0;
    const puedeGenerarCobro = !!datosDeuda && (tieneMesesPendientesTerreno || tieneServiciosPendientes);
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
                                </div>
                                <span className={`badge ${tieneAsignacion ? 'bg-secondary' : 'bg-danger'}`}>{tieneAsignacion ? 'Seleccionar' : 'Solo consulta'}</span>
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
                                <div><strong>Saldo pendiente:</strong> Q{getSaldoDisplay(datosDeuda?.saldo_pendiente).toFixed(2)}</div>
                                <div><strong>Cuota:</strong> Q{parseFloat(datosDeuda?.monto_cuota || 0).toFixed(2)}</div>
                                <div><strong>Interés ({porcentajeInteresContrato.toFixed(2)}%):</strong> Q{interesCalculadoContrato.toFixed(2)}</div>
                                <div><strong>Capital + Interés:</strong> Q{totalContratoConInteres.toFixed(2)}</div>
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
                        <div className="d-flex justify-content-end">
                            <button
                                className="btn btn-success fw-bold"
                                onClick={() => setShowModalCobro(true)}
                                disabled={!puedeGenerarCobro || !contratoTieneAsignacionValida(datosDeuda)}
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
                                            <strong>Terreno por mes:</strong> Q{parseFloat(datosDeuda?.monto_cuota || 0).toFixed(2)}
                                            <br />
                                            <strong>Servicios seleccionados:</strong> Q{(mesesSeleccionados.length ? (montoServiciosSeleccionado / Math.max(mesesSeleccionados.length, 1)) : 0).toFixed(2)} / mes
                                            <br />
                                            <strong>Capital + interés ({porcentajeInteresContrato.toFixed(2)}%):</strong> Q{capitalSeleccionado.toFixed(2)} + Q{interesCalculadoSeleccion.toFixed(2)}
                                        </span>
                                        <span className="fw-bold text-success">
                                            Total ({mesesSeleccionados.length} mes(es)): Q{montoTotalSeleccionado.toFixed(2)}
                                            <br />
                                            Capital + interés: Q{totalSeleccionCapitalInteres.toFixed(2)}
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