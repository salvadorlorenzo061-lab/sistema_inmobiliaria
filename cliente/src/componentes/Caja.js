import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import 'bootstrap/dist/css/bootstrap.min.css';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { buildConsolidatedInvoiceRows, renderFacturaComprobante } from '../utils/facturaPdf';
import { API_BASE_URL } from '../config';

// El sistema emite un unico formato de documento (FACTURA / COMPROBANTE DE COBRO).
// Los layouts de Recibo Juridico y Recibo de Caja se conservan mas abajo, desactivados.
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

const BANCOS_GUATEMALA = [
    'Banco Industrial',
    'Banco G&T Continental',
    'Banco Agromercantil de Guatemala',
    'Banco Internacional',
    'Banco Promerica',
    'Banrural',
    'Banco Ficohsa Guatemala',
    'Banco Cuscatlan Guatemala',
    'Banco de los Trabajadores',
    'Banco Azteca Guatemala',
    'Banco Inmobiliario',
    'Banco CHN',
    'Banco Americano',
    'Banco Industrial Internacional',
    'Banco Lafise',
    'Credibanco',
    'Otro'
];

const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const etiquetaMesDesdeFecha = (fecha) => {
    if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
        return '';
    }
    return `${NOMBRES_MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
};

const PREFILL_CAJA_KEY = 'prefill_caja_desde_cuenta_estado';

const Caja = () => {
    const getNitDisplay = (nit) => (nit && String(nit).trim() ? String(nit).trim() : 'C/F');
    const getSaldoDisplay = (saldo) => Math.max(parseFloat(saldo || 0), 0);
    const redondear2 = (valor) => parseFloat((Number(valor || 0)).toFixed(2));
    // Caja NO define su propio plan financiero: consume el mismo que pacta el modulo de Contratos.
    // Base acordada (identica a Contratos_Residentes.calcularMontoCuotaContrato):
    //   capital financiado = Precio Total del contrato (saldo/monto_total) - Enganche
    //   cuota mensual      = calcularCuotaFija(capital financiado, interes anual, cuotas pactadas)
    // De esa forma la "Cuota 1+ (capital + interes)" de Caja coincide con el
    // "Monto de Cuota (Auto)" que muestra y guarda el contrato.
    const calcularPlanFinancieroContrato = (contrato = {}) => {
        const tieneConvenioActivo = Number(contrato?.id_convenio_activo || 0) > 0;
        const saldoPendiente = Math.max(parseFloat(contrato?.saldo_pendiente || 0), 0);
        const enganche = tieneConvenioActivo
            ? 0
            : Math.max(parseFloat(contrato?.enganche ?? contrato?.enganche_total ?? 0), 0);
        const enganchePagado = tieneConvenioActivo ? enganche : Math.max(parseFloat(contrato?.enganche_pagado || 0), 0);
        const capitalPagadoTotal = Math.max(parseFloat(contrato?.capital_pagado_total || 0), 0);
        const cuotasPactadas = Math.max(parseInt(contrato?.plazo_meses || contrato?.cuotas_pactadas || 0, 10), 0);
        const cuotasPagadas = Math.max(parseInt(contrato?.cuotas_pagadas || 0, 10), 0);
        const cuotasPendientes = Math.max(cuotasPactadas - cuotasPagadas, 0);
        const enganchePendiente = tieneConvenioActivo ? 0 : Math.max(parseFloat(contrato?.enganche_pendiente || 0), 0);
        const cuotaEnganchePagada = !tieneConvenioActivo && enganche > 0 && enganchePagado >= (enganche - 0.01) ? 1 : 0;
        const cuotasFinanciadasPagadas = Math.max(cuotasPagadas - cuotaEnganchePagada, 0);
        const interesPorcentaje = tieneConvenioActivo
            ? 0
            : Math.max(parseFloat(contrato?.interes_porcentaje || 0), 0);

        // El precio original nunca se reconstruye desde el saldo pendiente. El saldo ya
        // incluye capital e interés pendiente y descontarle otra vez el enganche altera la cuota.
        const precioOriginal = Math.max(parseFloat(contrato?.monto_total_original || 0), 0);
        const capitalTotalContrato = tieneConvenioActivo
            ? parseFloat(precioOriginal.toFixed(2))
            : parseFloat(Math.max(precioOriginal - enganche, 0).toFixed(2));
        const capitalPagadoFinanciado = tieneConvenioActivo
            ? 0
            : Math.max(parseFloat((capitalPagadoTotal - enganchePagado).toFixed(2)), 0);
        // saldoPendiente (monto_total) ya viene neto de lo abonado, por eso el capital
        // financiado pactado es tambien el capital que queda por cobrar.
        const capitalPendienteFinanciado = capitalTotalContrato;
        const capitalBaseInteres = capitalTotalContrato;
        const interesTotalPactado = tieneConvenioActivo
            ? 0
            : redondear2(capitalBaseInteres * (interesPorcentaje / 100) * (cuotasPactadas / 12));
        const totalFinanciadoPactado = redondear2(capitalBaseInteres + interesTotalPactado);
        const cuotaRegularGuardada = Math.round(Math.max(parseFloat(contrato?.monto_cuota || 0), 0));
        const cuotaGuardadaValida = cuotaRegularGuardada > 0
            && (cuotasPactadas <= 1 || (cuotaRegularGuardada * (cuotasPactadas - 1)) < totalFinanciadoPactado);
        const cuotaRegular = cuotaGuardadaValida
            ? cuotaRegularGuardada
            : Math.ceil(totalFinanciadoPactado / Math.max(cuotasPactadas, 1));
        const interesRegular = cuotasPactadas > 0 ? redondear2(interesTotalPactado / cuotasPactadas) : 0;
        let capitalRestantePlan = capitalBaseInteres;
        let interesRestantePlan = interesTotalPactado;
        const tablaContratoCompleta = [];
        for (let indice = 1; indice <= cuotasPactadas; indice += 1) {
            const esUltima = indice === cuotasPactadas;
            const pagoCuota = esUltima
                ? redondear2(totalFinanciadoPactado - (cuotaRegular * (cuotasPactadas - 1)))
                : cuotaRegular;
            const interesCuota = esUltima ? redondear2(interesRestantePlan) : Math.min(interesRegular, interesRestantePlan);
            const capitalCuota = esUltima
                ? redondear2(capitalRestantePlan)
                : redondear2(Math.max(pagoCuota - interesCuota, 0));
            tablaContratoCompleta.push({
                indice,
                numero_cuota: indice,
                capital_cuota: capitalCuota,
                interes_mes: interesCuota,
                cuota_estimada: pagoCuota
            });
            capitalRestantePlan = redondear2(Math.max(capitalRestantePlan - capitalCuota, 0));
            interesRestantePlan = redondear2(Math.max(interesRestantePlan - interesCuota, 0));
        }
        const tablaAmortizacion = tieneConvenioActivo
            ? tablaContratoCompleta
            : tablaContratoCompleta.filter((fila) => Number(fila?.numero_cuota || 0) > cuotasFinanciadasPagadas);
        const cuotaMensualConInteres = tablaAmortizacion[0]?.cuota_estimada || 0;
        // Capital de la cuota = cuota pactada - interes de la cuota (mismo desglose del contrato).
        const capitalPorCuota = parseFloat(Number(tablaAmortizacion[0]?.capital_cuota || 0).toFixed(2));
        const interesTotalContrato = parseFloat(
            tablaAmortizacion.reduce((sum, fila) => sum + Number(fila.interes_mes || 0), 0).toFixed(2)
        );
        const interesPorCuota = tablaAmortizacion.length > 0
            ? parseFloat((interesTotalContrato / tablaAmortizacion.length).toFixed(2))
            : 0;
        const cuotaTotalConInteres = tablaAmortizacion.length > 0 ? cuotaMensualConInteres : 0;
        const cuotasRestantes = tablaAmortizacion.length;
        const totalContratoConInteres = parseFloat(((capitalPendienteFinanciado + enganchePendiente) + interesTotalContrato).toFixed(2));

        return {
            saldoPendiente,
            precioTotalContrato: parseFloat((capitalTotalContrato + enganche).toFixed(2)),
            enganche,
            enganchePagado,
            capitalPorCuota,
            capitalPagadoTotal,
            capitalPagadoFinanciado,
            capitalPendienteFinanciado,
            cuotasPactadas,
            cuotasPagadas,
            cuotasPendientes,
            interesPorcentaje,
            capitalTotalContrato,
            capitalBaseInteres,
            interesTotalContrato,
            interesPorCuota,
            cuotaTotalConInteres,
            tablaAmortizacion,
            cuotasRestantes,
            totalContratoConInteres
        };
    };

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
            const esUnico = typeof servicio?.es_cobro_unico === 'boolean'
                ? servicio.es_cobro_unico
                : esServicioCobroUnico(servicio?.periodicidad, servicio?.nombre_servicio);
            const yaPagadoAlgunaVez = Boolean(servicio?.ya_pagado_alguna_vez);

            // El flujo funcional del sistema exige que los servicios activos sigan visibles y
            // seleccionables en cada mes. Si el usuario desmarca un servicio, entonces el cobro
            // queda limitado a la cuota financiada y a la mora según corresponda.
            if (esUnico && yaPagadoAlgunaVez) {
                return true;
            }

            return true;
        });
    };

    const esCobroUnicoServicio = (servicio = {}) => {
        if (typeof servicio?.es_cobro_unico === 'boolean') {
            return servicio.es_cobro_unico;
        }

        return esServicioCobroUnico(servicio?.periodicidad, servicio?.nombre_servicio);
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
    const [datosDeuda, setDatosDeuda] = useState(null); // Cliente seleccionado actualmente
    const [idResidenteActivo, setIdResidenteActivo] = useState(''); // Guarda el ID del seleccionado para el pago

    // Estados del formulario de cobro
    const [montoAPagar, setMontoAPagar] = useState('');
    const [montoMora, setMontoMora] = useState('0');
    const [mesPagado, setMesPagado] = useState('Enero');
    const [numCuota, setNumCuota] = useState('1');
    const [opcionesCuota, setOpcionesCuota] = useState([]);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [referencia, setReferencia] = useState('');
    const [bancoPago, setBancoPago] = useState('');
    const [fechaOperacion, setFechaOperacion] = useState('');
    const [mesesPendientes, setMesesPendientes] = useState([]);
    const [mesesDetalleMap, setMesesDetalleMap] = useState({});
    // Mes al que pertenece la cuota 0 (enganche): mes de compra/firma del contrato.
    // Lo envia /meses-pendientes para que Caja no lo confunda con el primer mes pendiente.
    const [mesEngancheContrato, setMesEngancheContrato] = useState('');
    const [mesesSeleccionados, setMesesSeleccionados] = useState([]);
    const [montoTotalSeleccionado, setMontoTotalSeleccionado] = useState(0);
    const [montoTerrenoSeleccionado, setMontoTerrenoSeleccionado] = useState(0);
    const [montoEngancheContratoSeleccionado, setMontoEngancheContratoSeleccionado] = useState(0);
    const [montoEngancheContratoAplicado, setMontoEngancheContratoAplicado] = useState(0);
    const [montoEngancheSeleccionado, setMontoEngancheSeleccionado] = useState(0);
    const [montoInteresSeleccionado, setMontoInteresSeleccionado] = useState(0);
    const [morasPendientes, setMorasPendientes] = useState([]);
    const [morasSeleccionadas, setMorasSeleccionadas] = useState([]);
    const [quitarMoraTodo, setQuitarMoraTodo] = useState(false);
    const [quitarMoraMesesSeleccionados, setQuitarMoraMesesSeleccionados] = useState(false);
    const [serviciosContrato, setServiciosContrato] = useState([]);
    const [serviciosSeleccionados, setServiciosSeleccionados] = useState([]);
    const [montoServiciosSeleccionado, setMontoServiciosSeleccionado] = useState(0);
    const [montoCargosExtraSeleccionado, setMontoCargosExtraSeleccionado] = useState(0);
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

    const obtenerPrefillCaja = () => {
        try {
            const raw = localStorage.getItem(PREFILL_CAJA_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch {
            return null;
        }
    };

    const limpiarPrefillCaja = () => {
        try {
            localStorage.removeItem(PREFILL_CAJA_KEY);
        } catch {
            // noop
        }
    };

    const contratoTieneAsignacionValida = (registro = {}) => {
        const idProyecto = Number(registro?.id_proyecto || 0);
        const idEmpresaFacturacion = Number(registro?.id_empresa_facturacion || 0);
        return Number.isInteger(idProyecto) && idProyecto > 0 && Number.isInteger(idEmpresaFacturacion) && idEmpresaFacturacion > 0;
    };

    const usaCuotaCeroEnganche = Number(datosDeuda?.id_convenio_activo || 0) <= 0
        && Math.max(parseFloat(datosDeuda?.enganche || 0), 0) > 0;

    const obtenerNumeroCuotaVisual = (numeroCuotaReal) => {
        const numero = Number(numeroCuotaReal || 0);
        if (!Number.isInteger(numero) || numero < 0) {
            return null;
        }

        return numero;
    };

    const normalizarMesClave = (valor = '') => String(valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const obtenerClaveMesBase = (valor = '') => normalizarMesClave(String(valor || '').split(' ')[0] || '');
    const tieneAnioEnEtiquetaMes = (valor = '') => /\b(19|20)\d{2}\b/.test(String(valor || ''));

    const parsearEtiquetaMes = (valor = '') => {
        const limpio = String(valor || '').trim().replace(/\s+/g, ' ');
        if (!limpio) return null;

        const conAnio = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
        if (conAnio) {
            const indice = obtenerIndiceMesLocal(conAnio[1]);
            if (indice >= 0) {
                return new Date(Number(conAnio[2]), indice, 1);
            }
        }

        const soloMes = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)$/);
        if (soloMes) {
            const indice = obtenerIndiceMesLocal(soloMes[1]);
            if (indice >= 0) {
                return new Date(new Date().getFullYear(), indice, 1);
            }
        }

        const indice = obtenerIndiceMesLocal(limpio);
        if (indice >= 0) {
            return new Date(new Date().getFullYear(), indice, 1);
        }

        return null;
    };

    // La cuota 0 (enganche) es SIEMPRE el mes de compra/firma del contrato que envia el backend.
    // Antes se tomaba "el primer mes pendiente", por eso la etiqueta y el monto cambiaban segun
    // los meses que el cajero marcaba. Ahora depende solo de datos del contrato.
    const esMesEngancheVisual = (mesEtiqueta = '', enganchePendienteValor = null, mesesBase = null, mesEngancheBase = null, numeroCuotaReal = null) => {
        if (Number(datosDeuda?.id_convenio_activo || 0) > 0) {
            return false;
        }
        if (!mesEtiqueta) return false;

        const cuotaRealNumero = Number(numeroCuotaReal || 0);
        if (Number.isInteger(cuotaRealNumero) && cuotaRealNumero > 0) {
            return false;
        }

        const engancheActual = enganchePendienteValor == null
            ? Math.max(Number(datosDeuda?.enganche_pendiente || 0), 0)
            : Math.max(Number(enganchePendienteValor || 0), 0);
        if (!(engancheActual > 0)) return false;

        const mesEngancheActual = mesEngancheBase == null ? mesEngancheContrato : mesEngancheBase;
        if (mesEngancheActual) {
            const mesesLista = Array.isArray(mesesBase) ? mesesBase : (mesesPendientes || []);
            const hayCuotaFinanciadaEnEseMes = mesesLista.some((mes) => String(mes || '').trim() === String(mesEtiqueta || '').trim());
            if (hayCuotaFinanciadaEnEseMes) {
                return false;
            }
            return mesEtiqueta === mesEngancheActual;
        }

        // Respaldo para contratos históricos sin mes de enganche explícito.
        const mesesLista = Array.isArray(mesesBase) ? mesesBase : (mesesPendientes || []);
        const primerMesPendiente = mesesLista[0] || '';
        return Boolean(primerMesPendiente) && mesEtiqueta === primerMesPendiente;
    };

    const obtenerMesKeyLocal = (mesTexto = '') => {
        const limpio = String(mesTexto || '').trim().replace(/\s+/g, ' ');
        if (!limpio) return null;

        const conAnio = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
        if (conAnio) {
            return {
                mes: normalizarMesClave(conAnio[1]),
                anio: Number(conAnio[2])
            };
        }

        const soloMes = limpio.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)$/);
        if (soloMes) {
            return {
                mes: normalizarMesClave(soloMes[1]),
                anio: null
            };
        }

        return {
            mes: normalizarMesClave(limpio),
            anio: null
        };
    };

    const obtenerEtiquetaInicioFinanciadoContrato = () => {
        const mesInicioContrato = Number(datosDeuda?.mes_inicio_pagos || 0);
        const anioInicioContrato = Number(datosDeuda?.anio_inicio_pagos || 0);
        if (!Number.isInteger(mesInicioContrato) || mesInicioContrato < 1 || mesInicioContrato > 12) {
            return null;
        }
        if (!Number.isInteger(anioInicioContrato) || anioInicioContrato < 1900) {
            return null;
        }

        const fechaInicio = new Date(anioInicioContrato, mesInicioContrato - 1, 1);
        return etiquetaMesDesdeFecha(fechaInicio);
    };

    const esMesVencidoParaMoraLocal = (mesTexto = '', fechaContratoRaw = datosDeuda?.fecha_compra || datosDeuda?.fecha_firma, diasGraciaRaw = datosDeuda?.dia_pago_limite ?? 5) => {
        const limpio = String(mesTexto || '').trim().replace(/\s+/g, ' ');
        if (!limpio) return false;

        const fechaContratoMatch = String(fechaContratoRaw || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        const fechaContrato = fechaContratoMatch
            ? new Date(Number(fechaContratoMatch[1]), Number(fechaContratoMatch[2]) - 1, Number(fechaContratoMatch[3]))
            : (fechaContratoRaw ? new Date(fechaContratoRaw) : null);
        const mesCuota = parsearEtiquetaMes(mesTexto);

        if (!(fechaContrato instanceof Date) || Number.isNaN(fechaContrato.getTime())) return false;
        if (!(mesCuota instanceof Date) || Number.isNaN(mesCuota.getTime())) return false;

        const primerMesCuota = new Date(fechaContrato.getFullYear(), fechaContrato.getMonth() + 1, 1);
        const mesEvaluado = new Date(mesCuota.getFullYear(), mesCuota.getMonth(), 1);
        if (mesEvaluado < primerMesCuota) return false;

        const hoy = new Date();
        const mesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        // El mes calendario actual no esta vencido para mora, aunque ya haya
        // transcurrido el dia contractual. Se evalua a partir del mes siguiente.
        if (mesEvaluado >= mesActual) return false;

        const ultimoDiaMes = new Date(mesCuota.getFullYear(), mesCuota.getMonth() + 1, 0).getDate();
        const fechaVencimiento = new Date(
            mesCuota.getFullYear(),
            mesCuota.getMonth(),
            Math.min(fechaContrato.getDate(), ultimoDiaMes)
        );
        const diasGracia = Math.max(0, Math.min(31, Number(diasGraciaRaw ?? 5)));
        const fechaInicioMora = new Date(fechaVencimiento.getFullYear(), fechaVencimiento.getMonth(), fechaVencimiento.getDate());
        fechaInicioMora.setDate(fechaInicioMora.getDate() + diasGracia + 1);

        return hoy >= fechaInicioMora;
    };

    const compararMesesMoraLocal = (mesA = '', mesB = '') => {
        const keyA = obtenerMesKeyLocal(mesA);
        const keyB = obtenerMesKeyLocal(mesB);

        if (!keyA || !keyB) return false;

        if (keyA.anio && keyB.anio) {
            return keyA.mes === keyB.mes && keyA.anio === keyB.anio;
        }

        if (keyA.anio || keyB.anio) {
            return false;
        }

        return keyA.mes === keyB.mes;
    };

    const obtenerIndiceMesLocal = (mesTexto = '') => {
        const objetivo = normalizarMesClave(mesTexto);
        if (!objetivo) return -1;
        const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return nombres.findIndex((nombre) => nombre === objetivo);
    };

    const getEtiquetaCuotaMes = (mesEtiqueta = '', numeroCuotaReal = null, enganchePendienteValor = null, mesesBase = null, mesEngancheBase = null) => {
        const cuotaRealNumero = Number(numeroCuotaReal || 0);
        const esEnganchePorNumero = Number.isInteger(cuotaRealNumero) && cuotaRealNumero === 0;
        if (esEnganchePorNumero || esMesEngancheVisual(mesEtiqueta, enganchePendienteValor, mesesBase, mesEngancheBase, cuotaRealNumero)) {
            return 'Enganche / Cuota 0';
        }

        const numeroVisual = obtenerNumeroCuotaVisual(numeroCuotaReal);
        return `Cuota ${numeroVisual ?? '-'} - ${mesEtiqueta}`;
    };

    const getValorCuotaMes = (mesEtiqueta = '', numeroCuotaReal = null, enganchePendienteValor = null, mesesBase = null, mesEngancheBase = null) => {
        const cuotaRealNumero = Number(numeroCuotaReal || 0);
        const esEnganchePorNumero = Number.isInteger(cuotaRealNumero) && cuotaRealNumero === 0;
        if (esEnganchePorNumero || esMesEngancheVisual(mesEtiqueta, enganchePendienteValor, mesesBase, mesEngancheBase, cuotaRealNumero)) {
            return '0';
        }

        const numeroVisual = obtenerNumeroCuotaVisual(numeroCuotaReal);
        return Number.isInteger(numeroVisual) && numeroVisual >= 0 ? String(numeroVisual) : '';
    };

    const obtenerMorasAplicables = (mesesLista = []) => {
        if (!Array.isArray(morasPendientes) || !morasPendientes.length) {
            return [];
        }
        // Mora solo aplica sobre cuota financiada, no sobre el enganche
        const mesesFinanciados = (Array.isArray(mesesLista) ? mesesLista : [])
            .filter((mes) => !esMesEngancheVisual(mes));

        if (!mesesFinanciados.length) {
            return [];
        }

        return mesesFinanciados.reduce((morasAplicables, mesSeleccionado) => {
            const esMesMarcadoParaPago = (mesesSeleccionados || [])
                .some((mesMarcado) => compararMesesMoraLocal(mesSeleccionado, mesMarcado));
            if (quitarMoraTodo
                || (quitarMoraMesesSeleccionados && esMesMarcadoParaPago)) {
                return morasAplicables;
            }
            const moraMes = morasPendientes.find((mora) => {
                const mesMora = String(mora?.mes_atrasado || '').trim();
                return mesMora
                    && esMesVencidoParaMoraLocal(mesMora, datosDeuda?.fecha_compra || datosDeuda?.fecha_firma, datosDeuda?.dia_pago_limite ?? 5)
                    && compararMesesMoraLocal(mesSeleccionado, mesMora);
            });

            if (moraMes) {
                morasAplicables.push(moraMes);
            }
            return morasAplicables;
        }, []);
    };

    const usuarioTienePermisoCobro = (registro = {}) => Number(registro?.permiso_cobro_usuario || 0) === 1;

    useEffect(() => {
        const prefill = obtenerPrefillCaja();
        if (!prefill?.codigo_contrato) return;

        setBusqueda(String(prefill.codigo_contrato));

        const ejecutarBusquedaPrefill = async () => {
            try {
                const idUsuario = obtenerUsuarioActivo();
                setDatosDeuda(null);
                setListaResidentesPendientes([]);
                const res = await axios.get(`${API_BASE_URL}/api/caja/buscar-residente`, {
                    params: {
                        criterio: String(prefill.codigo_contrato).trim(),
                        ...(idUsuario ? { id_usuario: idUsuario } : {})
                    }
                });

                const lista = Array.isArray(res?.data) ? res.data : [];
                setListaResidentes(lista);

                const candidato = lista.find((item) => Number(item?.id_contrato || 0) === Number(prefill?.id_contrato || 0))
                    || lista.find((item) => String(item?.codigo_contrato || '').trim() === String(prefill.codigo_contrato).trim())
                    || null;

                if (candidato) {
                    await seleccionarResidente(candidato);
                    await abrirModalCobroConDatosActualizados();
                }
            } catch (error) {
                console.error('No se pudo aplicar prefill desde Cuenta Estado:', error);
            }
        };

        ejecutarBusquedaPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        setMesesDetalleMap({});
        setMesEngancheContrato('');
        setMesesSeleccionados([]);
        setMontoAPagar('');
        setMontoMora('0');
        setMontoTotalSeleccionado(0);
        setMontoTerrenoSeleccionado(0);
        setMontoEngancheContratoSeleccionado(0);
        setMontoEngancheContratoAplicado(0);
        setMontoEngancheSeleccionado(0);
        setMontoInteresSeleccionado(0);
        setMorasPendientes([]);
        setMorasSeleccionadas([]);
        setQuitarMoraTodo(false);
        setQuitarMoraMesesSeleccionados(false);
        setServiciosContrato([]);
        setServiciosSeleccionados([]);
        setMontoServiciosSeleccionado(0);
        setMontoCargosExtraSeleccionado(0);
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

    const recalcularTotalesCobro = (
        meses = mesesSeleccionados,
        serviciosIds = serviciosSeleccionados,
        residenteActual = datosDeuda,
        serviciosDisponibles = serviciosContrato,
        engancheOverride = null,
        engancheContratoOverride = null,
        mesEngancheOverride = null
    ) => {
        const cantidadMeses = (meses || []).length;
        const planContrato = calcularPlanFinancieroContrato(residenteActual || {});
        const tieneConvenioActivo = Number(residenteActual?.id_convenio_activo || 0) > 0;
        const saldoPendiente = planContrato.saldoPendiente;
        const tablaAmortizacion = planContrato.tablaAmortizacion || [];

        const obtenerNumeroCuotaMes = (mesEtiqueta = '') => {
            const mapNumero = Number(mesesDetalleMap?.[mesEtiqueta] || 0);
            if (Number.isInteger(mapNumero) && mapNumero > 0) {
                return mapNumero;
            }

            const idx = (mesesPendientes || []).indexOf(mesEtiqueta);
            return idx >= 0 ? idx + 1 : null;
        };

        const obtenerFilaAmortizacion = (numeroCuota) => (
            tablaAmortizacion.find((fila) => fila.numero_cuota === numeroCuota) || null
        );
        const obtenerFilaAmortizacionMes = (mesEtiqueta = '') => {
            const numeroCuota = obtenerNumeroCuotaMes(mesEtiqueta);
            const filaPorNumero = obtenerFilaAmortizacion(numeroCuota);
            if (filaPorNumero) return filaPorNumero;
            const indicePendiente = (mesesPendientes || []).indexOf(mesEtiqueta);
            return indicePendiente >= 0 ? (tablaAmortizacion[indicePendiente] || null) : null;
        };

        // No permitir cobrar terreno por encima del saldo pendiente real del contrato.
        const cuotasRestantes = planContrato.cuotasRestantes;
        const serviciosSeleccionadosDetalle = (serviciosDisponibles || [])
            .filter((s) => serviciosIds.includes(s.id_servicio));
        const costoServiciosMensual = serviciosSeleccionadosDetalle
            .filter((s) => !esCobroUnicoServicio(s))
            .reduce((sum, s) => sum + parseFloat(s.costo_servicio || 0), 0);
        const costoServiciosUnicos = serviciosSeleccionadosDetalle
            .filter((s) => esCobroUnicoServicio(s) && !s.es_extraordinario)
            .reduce((sum, s) => sum + parseFloat(s.costo_servicio || 0), 0);
        const costoCargosExtra = serviciosSeleccionadosDetalle
            .filter((s) => Boolean(s.es_extraordinario))
            .reduce((sum, s) => sum + parseFloat(s.costo_servicio || 0), 0);

        const enganchePendienteContrato = Math.max(Number(residenteActual?.enganche_pendiente || 0), 0);
        const abonoManualBase = engancheOverride == null
            ? parseFloat(montoEngancheSeleccionado || 0)
            : parseFloat(engancheOverride || 0);
        const abonoCapitalManualAplicado = Math.max(abonoManualBase, 0);
        const serviciosTotal = cantidadMeses > 0 ? ((costoServiciosMensual * cantidadMeses) + costoServiciosUnicos + costoCargosExtra) : 0;
        const mesesOrdenados = [...(meses || [])]
            .sort((a, b) => (mesesPendientes.indexOf(a) - mesesPendientes.indexOf(b)));
        // Mes de la cuota 0: viene del contrato (mes de compra/firma), no del primer mes marcado.
        const mesEngancheBase = mesEngancheOverride == null ? mesEngancheContrato : mesEngancheOverride;
        const primerMesConEnganche = (!tieneConvenioActivo && enganchePendienteContrato > 0)
            ? (mesEngancheBase || (mesesPendientes || [])[0] || '')
            : '';
        const engancheContratoBase = engancheContratoOverride == null
            ? parseFloat(tieneConvenioActivo ? 0 : (montoEngancheContratoSeleccionado || residenteActual?.enganche_pendiente || 0))
            : parseFloat(engancheContratoOverride || 0);
        const soloEngancheSeleccionado = String(numCuota || '') === '0' && !mesesOrdenados.length;
        const engancheContratoAplicado = (enganchePendienteContrato > 0 && (soloEngancheSeleccionado || (primerMesConEnganche && mesesOrdenados.includes(primerMesConEnganche))))
            ? Math.max(Math.min(engancheContratoBase, enganchePendienteContrato), 0)
            : 0;
        const mesesElegiblesTerreno = mesesOrdenados.filter((mes) => {
            if (!(enganchePendienteContrato > 0) || !primerMesConEnganche) return true;
            if (mes !== primerMesConEnganche) return true;
            const numeroCuotaMes = Number(mesesDetalleMap?.[mes] || 0);
            return !Number.isInteger(numeroCuotaMes) || numeroCuotaMes <= 0;
        });
        const mesesTerrenoReales = Math.min(mesesElegiblesTerreno.length, cuotasRestantes);
        const mesesConTerreno = mesesElegiblesTerreno.slice(0, mesesTerrenoReales);
        const terrenoCalculadoAjustado = mesesConTerreno.reduce((sum, mes) => {
            return sum + redondear2(obtenerFilaAmortizacionMes(mes)?.capital_cuota || 0);
        }, 0);
        const terrenoTotalAjustado = Math.min(parseFloat(terrenoCalculadoAjustado.toFixed(2)), Math.max(saldoPendiente, 0));
        const interesSeleccionado = parseFloat(
            mesesConTerreno
                .reduce((acc, mes) => {
                    return acc + redondear2(obtenerFilaAmortizacionMes(mes)?.interes_mes || 0);
                }, 0)
                .toFixed(2)
        );
        const total = terrenoTotalAjustado + engancheContratoAplicado + abonoCapitalManualAplicado + serviciosTotal + interesSeleccionado;

        setMontoTerrenoSeleccionado(terrenoTotalAjustado);
        setMontoEngancheContratoAplicado(engancheContratoAplicado);
        setMontoEngancheSeleccionado(abonoCapitalManualAplicado);
        setMontoServiciosSeleccionado(serviciosTotal);
        setMontoCargosExtraSeleccionado(costoCargosExtra);
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
            mostrarToast(error.response?.data || "Error al buscar cliente", "error");
            setListaResidentes([]);
            setDatosDeuda(null);
        }
    };

    const obtenerDatosContratoActualizados = async (residenteBase) => {
        if (!residenteBase?.codigo_contrato) return residenteBase;

        try {
            const idUsuario = obtenerUsuarioActivo();
            const res = await axios.get(`${API_BASE_URL}/api/caja/buscar-residente`, {
                params: {
                    criterio: String(residenteBase.codigo_contrato || '').trim(),
                    ...(idUsuario ? { id_usuario: idUsuario } : {})
                }
            });

            const lista = Array.isArray(res?.data) ? res.data : [];
            const actualizado = lista.find((item) => Number(item?.id_contrato) === Number(residenteBase?.id_contrato));
            return actualizado ? { ...residenteBase, ...actualizado } : residenteBase;
        } catch (error) {
            console.error('No se pudo refrescar el contrato en Caja, se usara la version actual en memoria:', error);
            return residenteBase;
        }
    };

    // Al dar clic sobre un residente de la lista de resultados
    const seleccionarResidente = async (residente) => {
        const residenteActualizado = await obtenerDatosContratoActualizados(residente);

        setDatosDeuda(residenteActualizado);
        setIdResidenteActivo(residenteActualizado.id_residente);
        setEstadoCorrelativo(null);
        setListaResidentes([]); // Limpia la lista de búsqueda en pantalla
        setMesesSeleccionados([]);
        setServiciosContrato([]);
        setServiciosSeleccionados([]);
        setNumCuota('0');
        setMontoMora('0');
        setMontoTotalSeleccionado(0);
        setMontoTerrenoSeleccionado(0);
        setMontoEngancheContratoSeleccionado(0);
        setMontoEngancheContratoAplicado(0);
        setMontoEngancheSeleccionado(0);
        setMontoInteresSeleccionado(0);
        setMorasPendientes([]);
        setMorasSeleccionadas([]);
        setQuitarMoraTodo(false);
        setQuitarMoraMesesSeleccionados(false);
        setMontoServiciosSeleccionado(0);
        setMontoCargosExtraSeleccionado(0);
        setResumenServiciosIniciales(null);

        try {
            await consultarSiguienteCorrelativo(residenteActualizado.id_contrato);
            const res = await axios.get(`${API_BASE_URL}/api/caja/meses-pendientes?id_contrato=${residenteActualizado.id_contrato}`);
            const meses = res?.data?.meses || [];
            const mesesDetalle = Array.isArray(res?.data?.meses_detalle) ? res.data.meses_detalle : [];
            const mapaMeses = {};
            mesesDetalle.forEach((item) => {
                const mes = String(item?.mes || '').trim();
                const numero = Number(item?.numero_cuota || 0);
                if (mes && Number.isInteger(numero) && numero > 0) {
                    mapaMeses[mes] = numero;
                }
            });
            const mesEngancheApi = String(res?.data?.mes_enganche || '').trim();
            const mesInicioPagosApi = Number(res?.data?.mes_inicio_pagos ?? residenteActualizado?.mes_inicio_pagos ?? 0);
            const anioInicioPagosApi = Number(res?.data?.anio_inicio_pagos ?? residenteActualizado?.anio_inicio_pagos ?? 0);
            const enganchePendienteApi = Math.max(Number(res?.data?.enganche_pendiente ?? residenteActualizado?.enganche_pendiente ?? 0), 0);
            setMesesPendientes(meses);
            setMesesDetalleMap(mapaMeses);
            setMesEngancheContrato(mesEngancheApi);
            setDatosDeuda((prev) => ({
                ...(prev || residenteActualizado),
                mes_inicio_pagos: Number.isInteger(mesInicioPagosApi) && mesInicioPagosApi >= 1 && mesInicioPagosApi <= 12 ? mesInicioPagosApi : (prev?.mes_inicio_pagos ?? residenteActualizado?.mes_inicio_pagos ?? null),
                anio_inicio_pagos: Number.isInteger(anioInicioPagosApi) && anioInicioPagosApi >= 1900 ? anioInicioPagosApi : (prev?.anio_inicio_pagos ?? residenteActualizado?.anio_inicio_pagos ?? null),
                cuotas_pagadas: Number(res?.data?.cuotas_pagadas || 0),
                cuotas_pendientes: Number(res?.data?.cuotas_pendientes || 0),
                enganche_pendiente: enganchePendienteApi
            }));
            
            const engancheInicial = enganchePendienteApi;
            const debePriorizarEnganche = engancheInicial > 0 && (!meses.length || String(mesEngancheApi || '').trim() || mesInicioPagosApi > 0);
            const mesesASeleccionar = debePriorizarEnganche ? [] : (meses.length > 0 ? [meses[0]] : []);
            setMesesSeleccionados(mesesASeleccionar);
            
            if (mesesASeleccionar.length) {
                setMesPagado(mesesASeleccionar[0]);
            } else {
                setMesPagado('');
            }
            setMontoEngancheContratoSeleccionado(engancheInicial);
            const opcionEnganche = engancheInicial > 0
                ? [{ value: '0', mes: mesEngancheApi || '', label: 'Enganche / Cuota 0' }]
                : [];
            const opcionesMeses = meses.map((mes, index) => {
                const numeroCuotaReal = Number(mapaMeses?.[mes] || index + 1);
                return {
                    value: getValorCuotaMes(mes, numeroCuotaReal, engancheInicial, meses, mesEngancheApi),
                    mes,
                    label: getEtiquetaCuotaMes(mes, numeroCuotaReal, engancheInicial, meses, mesEngancheApi)
                };
            });
            const opciones = [...opcionEnganche, ...opcionesMeses];
            setOpcionesCuota(opciones.length ? opciones : [{ value: 'sin-cuotas', mes: '', label: 'Sin cuotas pendientes' }]);
            setNumCuota(debePriorizarEnganche ? '0' : (opciones[0]?.value || '0'));

            const primerMes = mesesASeleccionar[0] || meses[0] || '';
            if (primerMes) {
                try {
                    const serviciosRes = await axios.get(`${API_BASE_URL}/api/caja/servicios-contrato/${residenteActualizado.id_contrato}?mes=${encodeURIComponent(primerMes)}`);
                    const servicios = filtrarServiciosMostrables(serviciosRes?.data?.servicios || []);
                    setServiciosContrato(servicios);

                    const seleccionInicialServicios = servicios
                        .filter((s) => !s.ya_pagado_mes)
                        .map((s) => s.id_servicio);

                    setServiciosSeleccionados(seleccionInicialServicios);
                    recalcularTotalesCobro(mesesASeleccionar, seleccionInicialServicios, residenteActualizado, servicios, null, engancheInicial, mesEngancheApi);
                } catch (serviciosError) {
                    console.error('Error al obtener servicios del contrato:', serviciosError);
                    setServiciosContrato([]);
                    setServiciosSeleccionados([]);
                    // Mantener meses pendientes aunque servicios falle, para no bloquear el cobro de terreno.
                    recalcularTotalesCobro(mesesASeleccionar, [], residenteActualizado, [], null, engancheInicial, mesEngancheApi);
                }
            } else {
                recalcularTotalesCobro(mesesASeleccionar, [], residenteActualizado, undefined, null, engancheInicial, mesEngancheApi);
            }

            try {
                await axios.post(`${API_BASE_URL}/api/morosidad/generar-automatico`, {
                    id_contrato: residente.id_contrato
                });
                const morasRes = await axios.get(`${API_BASE_URL}/api/caja/moras-pendientes/${residente.id_contrato}`);
                const moras = Array.isArray(morasRes?.data?.moras) ? morasRes.data.moras : [];
                setMorasPendientes(moras);
                setMorasSeleccionadas([]);
            } catch (moraError) {
                console.error('Error al consultar moras pendientes:', moraError);
                setMorasPendientes([]);
                setMorasSeleccionadas([]);
                setMontoMora('0');
            }

            const saldoPendienteResidente = parseFloat(residenteActualizado?.saldo_pendiente || 0);
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
            setOpcionesCuota([{ value: 'sin-cuotas', mes: '', label: 'Sin cuotas pendientes' }]);
            recalcularTotalesCobro([], [], residente);
        }
    };

    const agregarAbonoCapital = () => {
        const valor = Math.max(parseFloat(montoEngancheSeleccionado || 0), 0);
        if (valor <= 0) {
            mostrarToast('Ingresa un monto de abono a capital mayor a cero.', 'warning');
            return;
        }

        let mesesAUsar = Array.isArray(mesesSeleccionados) ? [...mesesSeleccionados] : [];
        if (Array.isArray(mesesPendientes) && mesesPendientes.length > 0) {
            const primerMes = mesesPendientes[0];
            if (!mesesAUsar.includes(primerMes)) {
                mesesAUsar = [primerMes, ...mesesAUsar];
            }
            setMesesSeleccionados(mesesAUsar);
            setMesPagado(primerMes);
            setNumCuota(getValorCuotaMes(primerMes, obtenerNumeroCuotaRealMesVista(primerMes)));
        }

        recalcularTotalesCobro(mesesAUsar, serviciosSeleccionados, datosDeuda, serviciosContrato, valor);
    };

    const abrirModalCobroConDatosActualizados = async () => {
        if (!datosDeuda) return;

        const actualizado = await obtenerDatosContratoActualizados(datosDeuda);
        const seleccionBase = Array.isArray(mesesSeleccionados) && mesesSeleccionados.length
            ? mesesSeleccionados
            : ((Array.isArray(mesesPendientes) && mesesPendientes.length)
                ? [mesesPendientes[0]]
                : []);
        const engancheActualizado = Math.max(Number(actualizado?.enganche_pendiente || 0), 0);

        setDatosDeuda(actualizado);
        setMontoEngancheContratoSeleccionado(engancheActualizado);
        if (seleccionBase.length) {
            setMesesSeleccionados(seleccionBase);
            setMesPagado(seleccionBase[0]);
            setNumCuota(getValorCuotaMes(seleccionBase[0], obtenerNumeroCuotaRealMesVista(seleccionBase[0]), engancheActualizado));
        }
        recalcularTotalesCobro(
            seleccionBase,
            serviciosSeleccionados,
            actualizado,
            serviciosContrato,
            parseFloat(montoEngancheSeleccionado || 0),
            engancheActualizado
        );

        const prefill = obtenerPrefillCaja();
        if (prefill
            && Number(prefill?.id_contrato || 0) === Number(actualizado?.id_contrato || 0)
        ) {
            const cuotaObjetivo = Number(prefill?.cuota_objetivo || 0);
            const mesObjetivo = (mesesPendientes || []).find((mes, idx) => {
                const cuotaReal = Number(mesesDetalleMap?.[mes] || (idx + 1));
                return cuotaObjetivo > 0 && cuotaReal === cuotaObjetivo;
            });

            const seleccionPrefill = mesObjetivo ? [mesObjetivo] : seleccionBase;
            const abonoCapitalPrefill = String(prefill?.tipo || '').toLowerCase() === 'liquidacion'
                ? Math.max(Number(prefill?.monto_capital || 0), 0)
                : 0;

            if (seleccionPrefill.length) {
                setMesesSeleccionados(seleccionPrefill);
                setMesPagado(seleccionPrefill[0]);
                setNumCuota(getValorCuotaMes(seleccionPrefill[0], obtenerNumeroCuotaRealMesVista(seleccionPrefill[0]), engancheActualizado));
            }

            if (abonoCapitalPrefill > 0) {
                setMontoEngancheSeleccionado(abonoCapitalPrefill);
            }

            recalcularTotalesCobro(
                seleccionPrefill,
                serviciosSeleccionados,
                actualizado,
                serviciosContrato,
                abonoCapitalPrefill,
                engancheActualizado
            );

            mostrarToast('Prefill aplicado desde Cuenta Estado. Verifica y confirma el cobro.', 'info');
            limpiarPrefillCaja();
        }

        setShowModalCobro(true);
    };

    const actualizarMontoParaSeleccion = (seleccionados) => {
        recalcularTotalesCobro(seleccionados, serviciosSeleccionados, datosDeuda);
    };

    const toggleMesSeleccionado = (mes) => {
        setMesesSeleccionados(prev => {
            const next = prev.includes(mes) ? prev.filter(item => item !== mes) : [...prev, mes];
            const siguienteMes = next.length ? next[0] : (mesesPendientes[0] || '');
            setMesPagado(siguienteMes);
            setNumCuota(siguienteMes ? getValorCuotaMes(siguienteMes, obtenerNumeroCuotaRealMesVista(siguienteMes)) : '0');
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

    useEffect(() => {
        if (!Array.isArray(morasPendientes) || !morasPendientes.length) {
            setMorasSeleccionadas([]);
            setMontoMora('0');
            return;
        }

        const morasAplicables = obtenerMorasAplicables(mesesSeleccionados);
        setMorasSeleccionadas(morasAplicables.map((mora) => Number(mora.id_morosidad)).filter((id) => Number.isInteger(id) && id > 0));

        const totalSeleccionado = morasAplicables
            .reduce((sum, mora) => sum + Number(mora.monto_mora || 0), 0);

        setMontoMora(String(Number(totalSeleccionado).toFixed(2)));
        setMontoAPagar(String((Number(montoTotalSeleccionado || 0) + Number(totalSeleccionado || 0)).toFixed(2)));
    }, [morasPendientes, mesesSeleccionados, montoTotalSeleccionado, quitarMoraTodo, quitarMoraMesesSeleccionados]);

    // Procesar Cobro utilizando el puerto correcto 3001 y Generar PDF
    const ejecutarCobro = async (e) => {
        e.preventDefault();

        const saldoPendienteActual = parseFloat(datosDeuda?.saldo_pendiente || 0);
        const montoSolicitado = parseFloat(montoAPagar || 0);
        const montoTerreno = parseFloat(montoTerrenoSeleccionado || 0);
        const mesesParaPago = (Array.isArray(mesesSeleccionados) && mesesSeleccionados.length)
            ? mesesSeleccionados
            : ((Array.isArray(mesesPendientes) && mesesPendientes.length)
                ? [mesesPendientes[0]]
                : (mesPagado ? [mesPagado] : []));
        const mesesFinanciadosParaPago = mesesParaPago.filter((mes) => !esMesEngancheVisual(mes));
        const morasSeleccionadasPayload = obtenerMorasAplicables(mesesFinanciadosParaPago)
            .map((mora) => ({
                id_morosidad: Number(mora.id_morosidad || 0),
                mes_atrasado: String(mora.mes_atrasado || ''),
                monto_mora: Number(mora.monto_mora || 0)
            }));
        const montoMoraPayload = parseFloat(morasSeleccionadasPayload.reduce((sum, mora) => sum + Number(mora.monto_mora || 0), 0).toFixed(2));

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

        const esSoloAbonoCapital = (parseFloat(montoEngancheContratoAplicado || 0) > 0 || parseFloat(montoEngancheSeleccionado || 0) > 0)
            && montoTerreno <= 0
            && parseFloat(montoServiciosSeleccionado || 0) <= 0
            && parseFloat(montoMora || 0) <= 0;

        if (!mesesParaPago.length && !esSoloAbonoCapital) {
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
            monto_mora: montoMoraPayload,
            monto_enganche_pagar: parseFloat(montoEngancheContratoAplicado || 0),
            monto_abono_capital: parseFloat(montoEngancheSeleccionado || 0),
            metodo_pago: metodoPago,
            banco_pago: metodoPago === 'Efectivo' ? '' : bancoPago,
            fecha_operacion: metodoPago === 'Efectivo' ? '' : fechaOperacion,
            no_referencia: metodoPago === 'Efectivo' ? 'N/A' : referencia, 
            boleta_referencia: metodoPago === 'Efectivo' ? '' : referencia,
            observaciones: `Pago de cuota de terreno mes de ${mesesParaPago.join(', ') || mesPagado}`,
            mes_pagado: mesesParaPago[0] || mesPagado,
            meses_pagados: mesesParaPago,
            numero_cuota: parseInt(numCuota),
            servicios_pagados: serviciosPayload,
            moras_aplicadas: morasSeleccionadasPayload
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
                    nombre: datosDeuda?.nombre || 'Cliente',
                    dpi: datosDeuda?.dpi || 'N/A',
                    codigo_contrato: datosDeuda?.codigo_contrato || 'N/A',
                    nombre_contrato: datosDeuda?.nombre_contrato || 'Contrato',
                    saldo_pendiente: datosDeuda?.saldo_pendiente || 0
                }, empresaPdf);
                
                const montoCuotaFinanciadaCobrada = Math.max(parseFloat(montoTerreno || 0) + parseFloat(montoInteresSeleccionado || 0), 0);
                const cuotasPagadasPrevias = Number(datosDeuda?.cuotas_pagadas ?? 0);
                const cuotasPendientesPrevias = Number(datosDeuda?.cuotas_pendientes ?? 0);
                const cuotasPagadasActualizadas = Math.max(Number(response?.data?.cuotas_pagadas ?? cuotasPagadasPrevias), 0);
                const cuotasPendientesActualizadas = Math.max(Number(response?.data?.cuotas_pendientes ?? cuotasPendientesPrevias), 0);
                setDatosDeuda(prev => ({
                    ...prev,
                    saldo_pendiente: Math.max(parseFloat(prev?.saldo_pendiente || 0) - montoCuotaFinanciadaCobrada, 0),
                    enganche_pendiente: Math.max(parseFloat(prev?.enganche_pendiente || 0) - parseFloat(montoEngancheContratoAplicado || 0), 0),
                    cuotas_pagadas: cuotasPagadasActualizadas,
                    cuotas_pendientes: cuotasPendientesActualizadas
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
                    const mesesDetalleActualizados = Array.isArray(resMeses?.data?.meses_detalle) ? resMeses.data.meses_detalle : [];
                    const mapaMesesActualizados = {};
                    mesesDetalleActualizados.forEach((item) => {
                        const mes = String(item?.mes || '').trim();
                        const numero = Number(item?.numero_cuota || 0);
                        if (mes && Number.isInteger(numero) && numero > 0) {
                            mapaMesesActualizados[mes] = numero;
                        }
                    });
                    const mesEngancheActualizado = String(resMeses?.data?.mes_enganche || '').trim();
                    setMesesPendientes(mesesActualizados);
                    setMesesDetalleMap(mapaMesesActualizados);
                    setMesEngancheContrato(mesEngancheActualizado);
                    setMesesSeleccionados(mesesActualizados.length ? [mesesActualizados[0]] : []);
                    const engancheRefrescado = Math.max(Number((response?.data?.enganche_pendiente_restante ?? datosDeuda?.enganche_pendiente) || 0), 0);
                    setMontoEngancheContratoSeleccionado(engancheRefrescado);
                    const opcionEngancheActualizada = engancheRefrescado > 0
                        ? [{ value: '0', mes: mesEngancheActualizado || '', label: 'Enganche / Cuota 0' }]
                        : [];
                    const opcionesMesesActualizadas = mesesActualizados.map((mes, index) => {
                        const numeroCuotaReal = Number(mapaMesesActualizados?.[mes] || index + 1);
                        return {
                            value: getValorCuotaMes(mes, numeroCuotaReal, engancheRefrescado, mesesActualizados, mesEngancheActualizado),
                            mes,
                            label: getEtiquetaCuotaMes(mes, numeroCuotaReal, engancheRefrescado, mesesActualizados, mesEngancheActualizado)
                        };
                    });
                    const opcionesActualizadas = [...opcionEngancheActualizada, ...opcionesMesesActualizadas];
                    setOpcionesCuota(opcionesActualizadas.length ? opcionesActualizadas : [{ value: 'sin-cuotas', mes: '', label: 'Sin cuotas pendientes' }]);
                    setNumCuota(opcionesActualizadas[0]?.value || '0');
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
                        saldo_pendiente: Math.max(parseFloat(datosDeuda?.saldo_pendiente || 0) - montoTerreno - parseFloat(montoEngancheSeleccionado || 0), 0),
                        enganche_pendiente: engancheRefrescado
                    }, servicios, null, engancheRefrescado, mesEngancheActualizado);
                } catch (errMeses) {
                    console.error('Error al recargar meses pendientes:', errMeses);
                }

                try {
                    await axios.post(`${API_BASE_URL}/api/morosidad/generar-automatico`, {
                        id_contrato: datosDeuda.id_contrato
                    });
                    const morasRes = await axios.get(`${API_BASE_URL}/api/caja/moras-pendientes/${datosDeuda.id_contrato}`);
                    const moras = Array.isArray(morasRes?.data?.moras) ? morasRes.data.moras : [];
                    setMorasPendientes(moras);
                    setMorasSeleccionadas(moras.map((mora) => Number(mora.id_morosidad)).filter((id) => Number.isInteger(id) && id > 0));
                } catch (moraError) {
                    console.error('Error al recargar moras pendientes:', moraError);
                }
                
                setReferencia(''); 
                setBancoPago('');
                setFechaOperacion('');
                setMontoEngancheContratoSeleccionado(0);
                setMontoEngancheContratoAplicado(0);
                setMontoEngancheSeleccionado(0);
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
            const bancoPago = String(recibo?.banco_pago || '').trim();
            const fechaOperacion = String(recibo?.fecha_operacion || '').trim();
            const boletaReferencia = String(recibo?.boleta_referencia || referencia || '').trim();
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
            const saldoRestante = Number(recibo?.saldo_pendiente_restante || residente?.saldo_pendiente || 0);
            const cuotaDisplay = Number.isInteger(cuotaInicio) && cuotaInicio > 0
                ? ((Number.isInteger(cuotaFin) && cuotaFin > cuotaInicio)
                    ? `${cuotaInicio}-${cuotaFin}`
                    : String(cuotaInicio))
                : 'N/A';
            const conceptos = detalleCobro.length ? [...new Set(detalleCobro.map((d) => String(d?.concepto || '').trim()).filter(Boolean))].join(', ') : 'Pago de cuota de financiamiento';
            const metodo = String(recibo?.metodo_pago || metodoPago || '').toLowerCase();
            const usuarioActivo = getUsuarioSesion();
            const usarFormatoJuridico = USAR_FORMATO_RECIBO_JURIDICO && esRolJuridico(usuarioActivo);

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
                const resumenCuotasInteres = `Cuota(s): ${cuotaDisplay} | Mes(es): ${mesesJuridicoTexto} | Interes aplicado: Q${Math.max(interesAplicado, 0).toFixed(2)} | Saldo restante: Q${Math.max(saldoRestante, 0).toFixed(2)}`;
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

                if (metodo.includes('deposit') || metodo.includes('transfer')) {
                    doc.setFont('Helvetica', 'bold');
                    doc.setFontSize(7.6);
                    doc.text(`Banco: ${bancoPago || 'N/A'}`, filaX + 2, pagosY + 22.4);
                    doc.text(`Fecha op.: ${fechaOperacion || 'N/A'}`, filaX + 82, pagosY + 22.4);
                    doc.text(`Ref.: ${boletaReferencia || 'N/A'}`, filaX + 132, pagosY + 22.4);
                }

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

            renderFacturaComprobante(doc, {
                logo: logoEmpresa,
                empresa: {
                    nombre: empresa?.nombre_empresa || empresa?.nombre || residente?.nombre_marca_pdf || "CORPORACION DE INVERSION INMOBILIARIA",
                    nit: empresa?.nit,
                    pais: empresa?.pais,
                    moneda: empresa?.moneda
                },
                documentoNo: referencia || recibo?.numero_recibo,
                fechaEmision: fecha,
                cliente: {
                    nombre: residente?.nombre,
                    direccion: residente?.direccion_notificacion || residente?.direccion,
                    identificacion: residente?.numero_identificacion,
                    dpi: residente?.dpi,
                    nit: residente?.nit
                },
                contrato: residente?.codigo_contrato,
                pago: {
                    metodo: recibo?.metodo_pago || metodoPago,
                    referencia,
                    banco: bancoPago,
                    fechaOperacion,
                    boletaReferencia
                },
                filas: detalleCobro.length
                    ? buildConsolidatedInvoiceRows(detalleCobro, {
                        usarCuotaCeroEnganche: Math.max(parseFloat(residente?.enganche || 0), 0) > 0,
                        numeroCuotaInicio: cuotaInicio
                    })
                    : [[conceptos, mesesPagadosRecibo.join(", ") || "N/A", `Q ${montoTotal.toFixed(2)}`]],
                resumen: [
                    { label: "Subtotal deuda pagada", valor: montoTotal },
                    { label: "Total Cobrado Hoy", valor: montoTotal, bold: true }
                ],
                anulada: false
            });

            const fileName = `Factura_${String(recibo?.no_referencia || recibo?.numero_recibo || "sin_numero").replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
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
    const enganchePendienteContrato = Math.max(Number(datosDeuda?.enganche_pendiente || 0), 0);
    const enganchePendiente = Math.max(
        enganchePendienteContrato,
        Math.max(parseFloat(montoEngancheContratoSeleccionado || 0), 0),
        Math.max(parseFloat(montoEngancheContratoAplicado || 0), 0)
    );
    const tieneCuotaCeroPendiente = Number(datosDeuda?.id_convenio_activo || 0) <= 0 && enganchePendiente > 0;
    const porcentajeInteresContrato = planFinancieroContrato.interesPorcentaje;
    const interesCalculadoContrato = planFinancieroContrato.interesTotalContrato;
    const totalContratoConInteres = planFinancieroContrato.totalContratoConInteres;
    const cuotaInicioFinanciadaVista = 1;
    const tablaAmortizacionVista = planFinancieroContrato?.tablaAmortizacion || [];
    const primeraCuotaFinanciada = tablaAmortizacionVista[0] || {};
    const capitalPorCuotaRegular = Number(primeraCuotaFinanciada.capital_cuota || 0);
    const interesPorCuotaRegular = Number(primeraCuotaFinanciada.interes_mes || 0);
    const cuotaRegularSinDecimales = Number(primeraCuotaFinanciada.cuota_estimada || 0);
    const obtenerFilaAmortizacionVista = (numeroCuota) => (
        tablaAmortizacionVista.find((fila) => fila.numero_cuota === numeroCuota) || null
    );
    const obtenerInteresPorNumeroCuotaVista = (numeroCuota) => (
        redondear2(obtenerFilaAmortizacionVista(numeroCuota)?.interes_mes || 0)
    );

    const obtenerNumeroCuotaMesVista = (mesEtiqueta = '') => {
        const numeroMap = Number(mesesDetalleMap?.[mesEtiqueta] || 0);
        if (Number.isInteger(numeroMap) && numeroMap > 0) {
            return obtenerNumeroCuotaVisual(numeroMap);
        }
        const idx = (mesesPendientes || []).indexOf(mesEtiqueta);
        return idx >= 0 ? idx + 1 : null;
    };

    const obtenerNumeroCuotaRealMesVista = (mesEtiqueta = '') => {
        const numeroMap = Number(mesesDetalleMap?.[mesEtiqueta] || 0);
        if (Number.isInteger(numeroMap) && numeroMap > 0) {
            return numeroMap;
        }
        const idx = (mesesPendientes || []).indexOf(mesEtiqueta);
        return idx >= 0 ? idx + 1 : null;
    };

    const primerMesSeleccionado = mesesSeleccionados.length ? mesesSeleccionados[0] : '';
    const numeroCuotaPrimerMes = obtenerNumeroCuotaMesVista(primerMesSeleccionado);
    const interesMensualSeleccionado = obtenerInteresPorNumeroCuotaVista(numeroCuotaPrimerMes);
    // En la lista de cuotas pactadas se muestra un único importe contractual:
    // cuota financiada + recargo vencido. La mora conserva su desglose interno
    // para recibos, auditoría y anulaciones, pero no se presenta por separado.
    const obtenerCuotaPactadaConRecargoVista = (mesEtiqueta = '') => {
        const esCuotaEnganche = esMesEngancheVisual(mesEtiqueta);
        let cuotaFinanciada = 0;
        if (esCuotaEnganche) {
            cuotaFinanciada = Math.max(
                Math.min(parseFloat(montoEngancheContratoSeleccionado || enganchePendiente || 0), enganchePendiente),
                0
            );
        } else {
            const numeroCuota = obtenerNumeroCuotaMesVista(mesEtiqueta);
            const indicePendiente = (mesesPendientes || []).indexOf(mesEtiqueta);
            const filaFinanciera = obtenerFilaAmortizacionVista(numeroCuota)
                || (indicePendiente >= 0 ? tablaAmortizacionVista[indicePendiente] : null);
            cuotaFinanciada = Number(filaFinanciera?.capital_cuota || 0)
                + Number(filaFinanciera?.interes_mes || 0);
        }
        const recargoVencido = esCuotaEnganche
            ? 0
            : obtenerMorasAplicables([mesEtiqueta])
                .reduce((sum, item) => sum + Number(item?.monto_mora || 0), 0);
        const mesSeleccionado = (mesesSeleccionados || []).includes(mesEtiqueta);
        const serviciosMensuales = mesSeleccionado
            ? serviciosSeleccionadosDetalleVista
                .filter((servicio) => !servicio.es_extraordinario && !esCobroUnicoServicio(servicio))
                .reduce((sum, servicio) => sum + Number(servicio.costo_servicio || 0), 0)
            : 0;
        const esPrimerMesSeleccionado = mesSeleccionado && mesEtiqueta === primerMesSeleccionado;
        const serviciosUnicos = esPrimerMesSeleccionado
            ? serviciosSeleccionadosDetalleVista
                .filter((servicio) => !servicio.es_extraordinario && esCobroUnicoServicio(servicio))
                .reduce((sum, servicio) => sum + Number(servicio.costo_servicio || 0), 0)
            : 0;
        const cargosExtra = esPrimerMesSeleccionado ? Number(montoCargosExtraSeleccionado || 0) : 0;
        const abonoCapital = esPrimerMesSeleccionado ? Number(montoEngancheSeleccionado || 0) : 0;
        return redondear2(
            cuotaFinanciada + recargoVencido + serviciosMensuales + serviciosUnicos + cargosExtra + abonoCapital
        );
    };
    const capitalSeleccionado = parseFloat(montoTerrenoSeleccionado || 0);
    const engancheSeleccionado = parseFloat(montoEngancheContratoAplicado || 0);
    const abonoCapitalSeleccionado = parseFloat(montoEngancheSeleccionado || 0);
    const interesCalculadoSeleccion = parseFloat(montoInteresSeleccionado || 0);
    const totalSeleccionCapitalInteres = parseFloat((capitalSeleccionado + engancheSeleccionado + abonoCapitalSeleccionado + interesCalculadoSeleccion).toFixed(2));
    const serviciosSeleccionadosDetalleVista = (serviciosContrato || [])
        .filter((servicio) => serviciosSeleccionados.includes(servicio.id_servicio));
    const serviciosMensualesVista = serviciosSeleccionadosDetalleVista
        .filter((servicio) => !servicio.es_extraordinario && !esCobroUnicoServicio(servicio))
        .reduce((sum, servicio) => sum + parseFloat(servicio.costo_servicio || 0), 0);
    const serviciosUnicosVista = serviciosSeleccionadosDetalleVista
        .filter((servicio) => !servicio.es_extraordinario && esCobroUnicoServicio(servicio))
        .reduce((sum, servicio) => sum + parseFloat(servicio.costo_servicio || 0), 0);
    const moraTotalDistribuidaVista = parseFloat((mesesSeleccionados || [])
        .filter((mes) => !esMesEngancheVisual(mes))
        .reduce((sum, mes) => sum + Number(obtenerMorasAplicables([mes]).reduce((acc, mora) => acc + Number(mora?.monto_mora || 0), 0)), 0)
        .toFixed(2));
    const tieneMesesPendientesTerreno = saldoTerrenoPendiente > 0;
    const tieneEnganchePendiente = enganchePendiente > 0;
    const tienePermisoCobroSeleccion = usuarioTienePermisoCobro(datosDeuda || {});
    const tieneServiciosPendientes = (serviciosContrato || []).some((s) => !s.ya_pagado_mes);
    const puedeGenerarCobro = !!datosDeuda && (tieneMesesPendientesTerreno || tieneServiciosPendientes || tieneEnganchePendiente) && tienePermisoCobroSeleccion;
    const financiamientoSolvente = !!datosDeuda && saldoTerrenoPendiente <= 0;
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
                        📋 Clientes activos (pendientes y solventes) - click para seleccionar
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
                    <div className="card-header bg-success text-white fw-bold">✅ Cliente seleccionado</div>
                    <div className="card-body">
                        <div className="row">
                            <div className="col-md-8">
                                <h5 className="mb-1">{datosDeuda.nombre}</h5>
                                <div><strong>Contrato:</strong> {datosDeuda.codigo_contrato}</div>
                                <div><strong>DPI:</strong> {datosDeuda.dpi || 'N/A'}</div>
                                <div><strong>NIT:</strong> {getNitDisplay(datosDeuda.nit)}</div>
                            </div>
                            <div className="col-md-4 text-md-end mt-3 mt-md-0">
                                <div><strong>Saldo pendiente:</strong> Q{Math.round(totalContratoConInteres)}</div>
                                <div><strong>Capital pendiente:</strong> Q{Math.round(getSaldoDisplay(datosDeuda?.saldo_pendiente))}</div>
                                <div><strong>Capital financiado:</strong> Q{Math.round(planFinancieroContrato.capitalBaseInteres)}</div>
                                {tieneCuotaCeroPendiente && (
                                    <div><strong>Cuota 0:</strong> Enganche Q{Math.round(enganchePendienteContrato)}</div>
                                )}
                                <div><strong>Capital por cuota:</strong> Q{Math.round(capitalPorCuotaRegular)}</div>
                                <div><strong>Interés pendiente ({porcentajeInteresContrato.toFixed(2)}%):</strong> Q{interesCalculadoContrato.toFixed(2)}</div>
                                <div><strong>Interés por cuota:</strong> Q{Math.round(interesPorCuotaRegular)}</div>
                                <div><strong>Cuota {cuotaInicioFinanciadaVista}+ (capital + interés):</strong> Q{Math.round(cuotaRegularSinDecimales)}</div>
                            </div>
                        </div>
                        <hr />
                        {financiamientoSolvente && (
                            <div className="alert alert-success text-center fw-bold mb-3">
                                ✅ FINANCIAMIENTO SOLVENTE. La cuota financiada se encuentra en cero y el contrato puede generar finiquito.
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
                                onClick={abrirModalCobroConDatosActualizados}
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
                                            <small><strong>Cuota fija:</strong> Q{Math.round(planFinancieroContrato.capitalPorCuota)}</small><br />
                                            <small><strong>Interés por cuota:</strong> Q{Math.round(interesMensualSeleccionado)}</small><br />
                                            <small><strong>Cuota pactada:</strong> Q{Math.round(planFinancieroContrato.cuotaTotalConInteres)}</small>
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

                                                const opcionSeleccionada = (opcionesCuota || []).find((opcion) => String(opcion?.value) === String(nuevaCuota));
                                                const mesObjetivo = String(opcionSeleccionada?.mes || '').trim();
                                                if (!mesObjetivo || String(nuevaCuota) === '0') {
                                                    setMesesSeleccionados([]);
                                                    setMesPagado('');
                                                    recalcularTotalesCobro([], serviciosSeleccionados, datosDeuda, serviciosContrato, null, montoEngancheContratoSeleccionado);
                                                    return;
                                                }

                                                const mesesASeleccionar = [mesObjetivo];

                                                setMesesSeleccionados(mesesASeleccionar);
                                                recalcularTotalesCobro(mesesASeleccionar, serviciosSeleccionados, datosDeuda, serviciosContrato, null, montoEngancheContratoSeleccionado);
                                                setMesPagado(mesObjetivo);
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
                                            <strong>Capital por mes (cuota {cuotaInicioFinanciadaVista}+):</strong> Q{Math.round(capitalPorCuotaRegular)}
                                            <br />
                                            <strong>Interés ({porcentajeInteresContrato.toFixed(1)}% anual):</strong> Q{Math.round(interesMensualSeleccionado)} / cuota
                                            {tieneCuotaCeroPendiente && (
                                                <>
                                                    <br />
                                                    <strong>Cuota 0 (enganche):</strong> Q{enganchePendienteContrato.toFixed(2)}
                                                    <br />
                                                    <strong>Enganche pendiente:</strong> Q{enganchePendiente.toFixed(2)}
                                                </>
                                            )}
                                            <br />
                                            <strong>Servicios mensuales seleccionados:</strong> Q{serviciosMensualesVista.toFixed(2)} / mes
                                            <br />
                                            <strong>Servicios únicos seleccionados:</strong> Q{serviciosUnicosVista.toFixed(2)}
                                            <br />
                                            <strong>Cargos extraordinarios:</strong> Q{montoCargosExtraSeleccionado.toFixed(2)}
                                            <br />
                                            <strong>Total financiado seleccionado ({porcentajeInteresContrato.toFixed(2)}%):</strong> Q{capitalSeleccionado.toFixed(2)} + Q{engancheSeleccionado.toFixed(2)} + Q{abonoCapitalSeleccionado.toFixed(2)} + Q{interesCalculadoSeleccion.toFixed(2)}
                                        </span>
                                        <span className="fw-bold text-success">
                                            Total ({mesesSeleccionados.length} mes(es)): Q{montoTotalSeleccionado.toFixed(2)}
                                            <br />
                                            Total financiado: Q{totalSeleccionCapitalInteres.toFixed(2)}
                                            <br />
                                            Servicios: Q{montoServiciosSeleccionado.toFixed(2)}
                                            {moraTotalDistribuidaVista > 0 && (
                                                <>
                                                    <br />
                                                    Total seleccionado: Q{(montoTotalSeleccionado + moraTotalDistribuidaVista).toFixed(2)}
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {tieneCuotaCeroPendiente && (
                                        <div className="mb-3 border rounded p-3 bg-light">
                                            <label className="form-label fw-bold">Enganche del contrato:</label>
                                            <div className="input-group">
                                                <span className="input-group-text">Q</span>
                                                <input
                                                    className="form-control"
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max={enganchePendiente}
                                                    value={montoEngancheContratoSeleccionado}
                                                    onChange={(e) => {
                                                        const valor = Math.max(parseFloat(e.target.value || 0), 0);
                                                        setMontoEngancheContratoSeleccionado(valor);
                                                        recalcularTotalesCobro(mesesSeleccionados, serviciosSeleccionados, datosDeuda, serviciosContrato, null, valor);
                                                    }}
                                                />
                                            </div>
                                            <small className="text-muted">Este valor viene del contrato y se aplica a la cuota 0 mientras el enganche siga pendiente.</small>
                                        </div>
                                    )}

                                    <div className="mb-3 border rounded p-3 bg-light">
                                        <label className="form-label fw-bold">Abono a capital (sin interés):</label>
                                        <div className="input-group">
                                            <span className="input-group-text">Q</span>
                                            <input
                                                className="form-control"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={montoEngancheSeleccionado}
                                                onChange={(e) => {
                                                    const valor = Math.max(parseFloat(e.target.value || 0), 0);
                                                    setMontoEngancheSeleccionado(valor);
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-outline-primary"
                                                onClick={agregarAbonoCapital}
                                            >
                                                Agregar
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary"
                                                onClick={() => {
                                                    setMontoEngancheSeleccionado(0);
                                                    recalcularTotalesCobro(mesesSeleccionados, serviciosSeleccionados, datosDeuda, serviciosContrato, 0);
                                                }}
                                            >
                                                Limpiar
                                            </button>
                                        </div>
                                        <small className="text-muted">El abono a capital es adicional al enganche: reduce saldo y no genera interés.</small>
                                    </div>

                                    {/* Servicios asignados al contrato */}
                                    <div className="mb-4">
                                        <label className="form-label fw-bold">🧾 Servicios del contrato (agua/drenaje y otros activos):</label>
                                        <div className="border rounded-3 p-3 bg-light">
                                            {serviciosContrato.length > 0 ? (
                                                <div className="d-flex flex-column gap-2">
                                                    {serviciosContrato.map((servicio) => (
                                                        (() => {
                                                            const esUnico = esCobroUnicoServicio(servicio);
                                                            return (
                                                        <div
                                                            key={servicio.id_servicio}
                                                            className={`d-flex align-items-center p-3 border rounded-2 ${serviciosSeleccionados.includes(servicio.id_servicio) ? 'bg-success bg-opacity-10 border-success border-2' : 'bg-white border-secondary'}`}
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() => toggleServicioSeleccionado(servicio.id_servicio)}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input me-3"
                                                                checked={serviciosSeleccionados.includes(servicio.id_servicio)}
                                                                onChange={() => toggleServicioSeleccionado(servicio.id_servicio)}
                                                                style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                                                            />
                                                            <div className="flex-grow-1">
                                                                <span className="fw-bold fs-6 text-dark">{servicio.nombre_servicio}</span>
                                                                <span className={`badge ms-2 ${esUnico ? 'bg-secondary' : 'bg-info text-dark'}`}>
                                                                    {esUnico ? 'Cobro unico' : 'Mensual'}
                                                                </span>
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
                                        <label className="form-label fw-bold">📅 Meses a Pagar (seleccione cuáles paga el cliente):</label>
                                        {morasPendientes.length > 0 && (
                                            <div className="border rounded-3 p-3 mb-3 bg-warning bg-opacity-10">
                                                <div className="fw-bold mb-2">Opciones de mora para este cobro</div>
                                                <div className="form-check mb-2">
                                                    <input
                                                        id="quitar-mora-todo"
                                                        type="checkbox"
                                                        className="form-check-input"
                                                        checked={quitarMoraTodo}
                                                        onChange={(e) => {
                                                            setQuitarMoraTodo(e.target.checked);
                                                            if (e.target.checked) setQuitarMoraMesesSeleccionados(false);
                                                        }}
                                                    />
                                                    <label className="form-check-label" htmlFor="quitar-mora-todo">
                                                        Quitar mora a todo el cobro
                                                    </label>
                                                </div>
                                                <div className="form-check">
                                                    <input
                                                        id="quitar-mora-mes"
                                                        type="checkbox"
                                                        className="form-check-input"
                                                        checked={quitarMoraMesesSeleccionados}
                                                        disabled={quitarMoraTodo || mesesSeleccionados.length === 0}
                                                        onChange={(e) => setQuitarMoraMesesSeleccionados(e.target.checked)}
                                                    />
                                                    <label className="form-check-label" htmlFor="quitar-mora-mes">
                                                        Quitar mora de todos los meses seleccionados
                                                    </label>
                                                </div>
                                                <small className="text-muted">
                                                    Esta opción solo exonera la mora en este cobro; no elimina el historial del contrato.
                                                </small>
                                            </div>
                                        )}
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
                                                                <span className="fw-bold fs-5 text-dark">
                                                                    {getEtiquetaCuotaMes(mes, obtenerNumeroCuotaRealMesVista(mes))}
                                                                </span>
                                                            </div>
                                                            <div className="text-end">
                                                                <span className="badge bg-primary fs-6">Q{Math.round(obtenerCuotaPactadaConRecargoVista(mes))}</span>
                                                            </div>
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
                                                <strong>Total seleccionado:</strong> Q{Math.round(montoTotalSeleccionado + moraTotalDistribuidaVista)}
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
                                        <div className="col-md-12">
                                            <label className="form-label fw-bold">Método de pago:</label>
                                            <select
                                                className="form-select"
                                                value={metodoPago}
                                                onChange={(e) => {
                                                    const siguienteMetodo = e.target.value;
                                                    setMetodoPago(siguienteMetodo);
                                                    if (siguienteMetodo === 'Efectivo') {
                                                        setBancoPago('');
                                                        setFechaOperacion('');
                                                        setReferencia('');
                                                    }
                                                }}
                                            >
                                                <option value="Efectivo">Efectivo</option>
                                                <option value="Depósito">Depósito Bancario</option>
                                                <option value="Transferencia">Transferencia</option>
                                            </select>
                                        </div>
                                    </div>

                                    {metodoPago !== 'Efectivo' && (
                                        <div className="row mb-3 g-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">Banco:</label>
                                                <select
                                                    className="form-select"
                                                    required
                                                    value={bancoPago}
                                                    onChange={(e) => setBancoPago(e.target.value)}
                                                >
                                                    <option value="">Seleccione un banco</option>
                                                    {BANCOS_GUATEMALA.map((banco) => (
                                                        <option key={banco} value={banco}>{banco}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">Fecha de depósito / transferencia:</label>
                                                <input
                                                    className="form-control"
                                                    type="date"
                                                    required
                                                    value={fechaOperacion}
                                                    onChange={(e) => setFechaOperacion(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12">
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
                                        </div>
                                    )}

                                    <div className="mb-3">
                                        <label className="form-label fw-bold">Marca de Empresa en PDF:</label>
                                        <input className="form-control" type="text" value="Automática (usa la empresa ya asociada al contrato)" readOnly />
                                        <small className="text-muted">El sistema toma automáticamente el logo y nombre ya registrados para ese contrato/cliente.</small>
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
