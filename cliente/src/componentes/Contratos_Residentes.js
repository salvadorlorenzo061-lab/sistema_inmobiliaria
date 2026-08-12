import { useState, useEffect, useCallback, useRef } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { calcularCuotaFija } from '../utils/amortizacion';
import { descargarPdfContrato, imprimirPdfContrato } from '../utils/contractPdfGenerator';
import { descargarPdfFiniquito } from '../utils/finiquitoPdfGenerator';
import PdfPreview from './PdfPreview';

function Contratos_Residentes() {
  const calcularMontoCuotaContrato = (montoTotalValue, engancheValue, interesValue, cuotasValue, plazoValue) => {
    const montoTotalNumero = Number(montoTotalValue || 0);
    const engancheNumero = Number(engancheValue || 0);
    const interesNumero = Number(interesValue || 0);
   
    // El divisor de la cuota es el "Numero de Cuotas" que escribe el usuario; el
    // "Plazo Total (meses)" solo es respaldo. Antes mandaba el plazo, por eso al aperturar
    // un contrato (cuotas vacio y plazo precargado en 60) la cuota se calculaba sobre 60
    // meses y no sobre las cuotas realmente pactadas.
    const cuotasIngresadas = Number(cuotasValue || 0);
    const plazoIngresado = Number(plazoValue || 0);
    const cuotasNumero = Number.isFinite(cuotasIngresadas) && cuotasIngresadas > 0
      ? cuotasIngresadas
      : ((Number.isFinite(plazoIngresado) && plazoIngresado > 0) ? plazoIngresado : 0);

    if (!Number.isFinite(montoTotalNumero) || !Number.isFinite(engancheNumero) || !Number.isFinite(interesNumero) || !Number.isFinite(cuotasNumero) || cuotasNumero <= 0) {
      return "";
    }

    const capitalFinanciado = Math.max(montoTotalNumero - engancheNumero, 0);
    if (capitalFinanciado <= 0) {
      return "0.00";
    }

    return Number(calcularCuotaFija(capitalFinanciado, interesNumero, cuotasNumero) || 0).toFixed(2);
  };

  const obtenerInicioPagosAutomatico = (fechaCompraValue, fechaFirmaValue) => {
    const base = fechaCompraValue || fechaFirmaValue;
    if (!String(base || '').trim()) {
      return { mes: '', anio: '' };
    }
    const partesFecha = String(base || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const parsed = partesFecha
      ? new Date(Number(partesFecha[1]), Number(partesFecha[2]) - 1, Number(partesFecha[3]))
      : new Date();

    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
      const hoy = new Date();
      return { mes: String(hoy.getMonth() + 1), anio: String(hoy.getFullYear()) };
    }

    const primerPago = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1);
    return {
      // "Mes Inicio de Pagos" en este formulario representa el inicio del plan de pagos:
      // la primera cuota financiada siempre arranca en 1. El mes calendario real para el
      // contrato/PDF se deriva desde fecha_compra/fecha_firma para no afectar Caja.
      mes: '1',
      anio: String(primerPago.getFullYear())
    };
  };

  // Campos básicos del formulario
  const [id_contrato, setId_contrato] = useState("");
  const [codigo_contrato, setCodigo_contrato] = useState("");
  const [id_residente, setId_residente] = useState("");
  const [id_empresa_marca, setId_empresa_marca] = useState("");
  const [id_proyecto, setId_proyecto] = useState("");
  const [id_tipo_contrato, setId_tipo_contrato] = useState("");
  const [monto_total, setMonto_total] = useState("120000");
  const [cuotas_pactadas, setCuotas_pactadas] = useState("");
  const [dia_pago_limite, setDia_pago_limite] = useState("5");
  const [fecha_firma, setFecha_firma] = useState("");
  const [fecha_compra, setFecha_compra] = useState("");
  const [fecha_fin, setFecha_fin] = useState("");
  const [estado, setEstado] = useState("");
  const [documento_contrato, setDocumento_contrato] = useState("");

  // Datos del Vendedor / Empresa (para el PDF)
  const [nombre_vendedor, setNombre_vendedor] = useState("DULCE MARIA OSORIO SABAN DE PEREZ");
  const [edad_vendedor, setEdad_vendedor] = useState("veintinueve");
  const [estado_civil_vendedor, setEstado_civil_vendedor] = useState("casada");
  const [profesion_vendedor, setProfesion_vendedor] = useState("ejecutiva de negocios");
  const [dpi_vendedor, setDpi_vendedor] = useState("3003 09864 0101");
  const [empresa_vendedor, setEmpresa_vendedor] = useState("CORPORACION DE PROYECTOS Y VIVIENDAS, SOCIEDAD ANONIMA");
  const [notario, setNotario] = useState("Alma Karina Aguilar Chávez");
  const [fecha_nombramiento, setFecha_nombramiento] = useState("siete de octubre del año dos mil veinticinco");
  const [registro_numero, setRegistro_numero] = useState("810,559");
  const [registro_folio, setRegistro_folio] = useState("120");
  const [registro_libro, setRegistro_libro] = useState("853");

  // Datos de la Propiedad (para el PDF)
  const [numero_finca, setNumero_finca] = useState("30052");
  const [folio_propiedad, setFolio_propiedad] = useState("133");
  const [libro_propiedad, setLibro_propiedad] = useState("268");
  const [numero_lote, setNumero_lote] = useState("1");
  const [manzana_propiedad, setManzana_propiedad] = useState("A");
  const [area_propiedad, setArea_propiedad] = useState("89.65");
  const [proyecto_propiedad, setProyecto_propiedad] = useState("VILLAS DE TAPACUN");

  // Medidas de la propiedad (para el PDF)
  const [medida_norte, setMedida_norte] = useState("15.00");
  const [medida_sur, setMedida_sur] = useState("15.00");
  const [medida_oriente, setMedida_oriente] = useState("15.00");
  const [medida_poniente, setMedida_poniente] = useState("15.00");

  // Datos económicos adicionales (para el PDF)
  const [enganche, setEnganche] = useState("20000");
  const [interes_porcentaje, setInteres_porcentaje] = useState("14");
  const [mora, setMora] = useState("600");
  const [porcentaje_dominio, setPorcentaje_dominio] = useState("80");
  const [plazo_meses, setPlazo_meses] = useState("");
  const [mes_inicio_pagos, setMes_inicio_pagos] = useState("");
  const [anio_inicio_pagos, setAnio_inicio_pagos] = useState("");
  const ultimoInicioPagosAutoRef = useRef({ mes: '', anio: '' });

  // Listas de datos
  const [contratosList, setContratosList] = useState([]);
  const [residentesList, setResidentesList] = useState([]);
  const [tiposContratoList, setTiposContratoList] = useState([]);
  const [proyectosList, setProyectosList] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  // Modales
  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(true); // Vista previa PDF habilitada por defecto
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; 

  const API_URL = `${API_BASE_URL}/api/contratos_residentes`;

  // Carga inicial de datos relacionales
  const cargarCatalogos = useCallback(async () => {
    try {
      const resContratos = await Axios.get(API_URL);
      setContratosList(resContratos.data);

      // Traer los residentes de su respectivo endpoint
      const resResidentes = await Axios.get(`${API_BASE_URL}/api/residentes`);
      setResidentesList(resResidentes.data);

      // Traer los tipos de contratos configurados en el sistema
      const resTipos = await Axios.get(`${API_BASE_URL}/api/tipos_contratos`);
      setTiposContratoList(resTipos.data);

      // Traer proyectos reales para persistir id_proyecto/id_empresa_marca
      const resProyectos = await Axios.get(`${API_BASE_URL}/api/proyectos`);
      setProyectosList(Array.isArray(resProyectos?.data) ? resProyectos.data : []);
    } catch (error) {
      console.error("Error al cargar catálogos del sistema", error);
    }
  }, [API_URL]);

  const seleccionarProyectoContrato = (proyectoId) => {
    const idProyectoValue = String(proyectoId || '').trim();
    setId_proyecto(idProyectoValue);

    if (!idProyectoValue) {
      setId_empresa_marca('');
      setProyecto_propiedad('');
      return;
    }

    const proyectoSel = proyectosList.find((p) => String(p.id_proyecto) === idProyectoValue);
    if (proyectoSel) {
      setId_empresa_marca(String(proyectoSel.id_empresa || ''));
      setProyecto_propiedad(String(proyectoSel.nombre || proyectoSel.nombre_proyecto || '').trim());
    }
  };

  const resolverProyectoContrato = (contrato = {}) => {
    const idProyectoContrato = String(contrato.id_proyecto || '').trim();
    if (idProyectoContrato) {
      const proyectoPorId = proyectosList.find((p) => String(p.id_proyecto) === idProyectoContrato);
      return {
        idProyecto: idProyectoContrato,
        idEmpresa: contrato.id_empresa_marca ? String(contrato.id_empresa_marca) : String(proyectoPorId?.id_empresa || ''),
        nombreProyecto: String(contrato.nombre_proyecto || proyectoPorId?.nombre || proyectoPorId?.nombre_proyecto || '').trim()
      };
    }

    const nombreObjetivo = String(contrato.nombre_proyecto || contrato.nombre_proyecto_pdf || '').trim().toLowerCase();
    if (!nombreObjetivo) {
      return {
        idProyecto: '',
        idEmpresa: contrato.id_empresa_marca ? String(contrato.id_empresa_marca) : '',
        nombreProyecto: ''
      };
    }

    const proyectoPorNombre = proyectosList.find((p) => {
      const nombre = String(p.nombre || p.nombre_proyecto || '').trim().toLowerCase();
      return nombre && nombre === nombreObjetivo;
    });

    if (proyectoPorNombre) {
      return {
        idProyecto: String(proyectoPorNombre.id_proyecto || ''),
        idEmpresa: String(contrato.id_empresa_marca || proyectoPorNombre.id_empresa || ''),
        nombreProyecto: String(proyectoPorNombre.nombre || proyectoPorNombre.nombre_proyecto || '').trim()
      };
    }

    return {
      idProyecto: '',
      idEmpresa: contrato.id_empresa_marca ? String(contrato.id_empresa_marca) : '',
      nombreProyecto: String(contrato.nombre_proyecto || contrato.nombre_proyecto_pdf || '').trim()
    };
  };

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    if (!showEditModal) return;
    if (id_proyecto || !proyecto_propiedad || !proyectosList.length) return;

    const proyectoPorNombre = proyectosList.find((p) => {
      const nombre = String(p.nombre || p.nombre_proyecto || '').trim().toLowerCase();
      return nombre && nombre === String(proyecto_propiedad || '').trim().toLowerCase();
    });

    if (proyectoPorNombre) {
      setId_proyecto(String(proyectoPorNombre.id_proyecto || ''));
      setId_empresa_marca(String(proyectoPorNombre.id_empresa || id_empresa_marca || ''));
      setProyecto_propiedad(String(proyectoPorNombre.nombre || proyectoPorNombre.nombre_proyecto || '').trim());
    }
  }, [showEditModal, id_proyecto, proyecto_propiedad, proyectosList, id_empresa_marca]);

  useEffect(() => {
    const inicioAutomatico = obtenerInicioPagosAutomatico(fecha_compra, fecha_firma);
    const inicioAnterior = ultimoInicioPagosAutoRef.current || { mes: '', anio: '' };
    const mesActual = String(mes_inicio_pagos || '').trim();
    const anioActual = String(anio_inicio_pagos || '').trim();

    if (!mesActual || mesActual === inicioAnterior.mes) {
      setMes_inicio_pagos(inicioAutomatico.mes);
    }

    if (!anioActual || anioActual === inicioAnterior.anio) {
      setAnio_inicio_pagos(inicioAutomatico.anio);
    }

    ultimoInicioPagosAutoRef.current = inicioAutomatico;
  }, [fecha_compra, fecha_firma, mes_inicio_pagos, anio_inicio_pagos]);

  // "Numero de Cuotas" y "Plazo Total (meses)" son el mismo dato para el flujo de cobros:
  // Caja resuelve las cuotas del contrato con COALESCE(plazo_meses, cuotas_pactadas). Si se
  // guardan distintos (p. ej. 36 cuotas con plazo 60), la cuota del contrato no coincide con
  // las cuotas que cobra Caja. Se sincronizan al editarlos, en alta y en modificacion.
  const actualizarCuotasPactadas = (valor) => {
    setCuotas_pactadas(valor);
    setPlazo_meses(valor);
  };

  const actualizarPlazoMeses = (valor) => {
    setPlazo_meses(valor);
    setCuotas_pactadas(valor);
  };

  const obtenerCuotasEnvio = () => String(cuotas_pactadas || plazo_meses || '').trim();
  const obtenerPlazoEnvio = () => String(plazo_meses || cuotas_pactadas || '').trim();
  const montoCuotaCalculado = calcularMontoCuotaContrato(monto_total, enganche, interes_porcentaje, cuotas_pactadas, plazo_meses);
  const inicioPagosAutomatico = obtenerInicioPagosAutomatico(fecha_compra, fecha_firma);

  const normalizarMesInicioPagos = (valor) => {
    const numero = parseInt(String(valor || '').trim(), 10);
    const respaldo = parseInt(String(inicioPagosAutomatico.mes || '1').trim(), 10) || 1;
    if (!Number.isFinite(numero)) return String(respaldo);
    return String(Math.max(1, Math.min(12, numero)));
  };

  const normalizarAnioInicioPagos = (valor) => {
    const numero = parseInt(String(valor || '').trim(), 10);
    const respaldo = parseInt(String(inicioPagosAutomatico.anio || new Date().getFullYear()).trim(), 10) || new Date().getFullYear();
    if (!Number.isFinite(numero)) return String(respaldo);
    return String(Math.max(2000, numero));
  };

  const validarContrato = () => {
    if (!codigo_contrato.trim()) return "Debe generar o escribir el código del contrato.";
    if (!id_residente) return "Debe seleccionar un residente.";
    if (!id_tipo_contrato) return "Debe seleccionar el tipo de contrato.";
    if (!String(monto_total || '').trim()) return "Debe ingresar el precio total del contrato.";
    if (!String(obtenerCuotasEnvio() || '').trim()) return "Debe ingresar la cantidad de cuotas.";
    if (dia_pago_limite === '') return "Debe indicar los días de gracia.";
    if (!fecha_firma) return "Debe ingresar la fecha de firma.";
    if (!fecha_compra) return "Debe ingresar la fecha de compra.";
    if (!estado) return "Debe seleccionar el estado del contrato.";
    return '';
  };

  const construirPayloadContrato = (incluirId = false) => {
    const cuotasEnvio = obtenerCuotasEnvio();
    const plazoEnvio = obtenerPlazoEnvio();
    const montoCuotaCalculado = calcularMontoCuotaContrato(
      monto_total,
      enganche,
      interes_porcentaje,
      cuotasEnvio,
      plazoEnvio
    );
    const mesInicioPagosNormalizado = normalizarMesInicioPagos(mes_inicio_pagos);
    const anioInicioPagosNormalizado = normalizarAnioInicioPagos(anio_inicio_pagos);

    const payload = {
      codigo_contrato: String(codigo_contrato || '').trim(),
      id_residente,
      id_empresa_marca: id_empresa_marca || null,
      id_proyecto: id_proyecto || null,
      id_tipo_contrato,
      monto_total,
      enganche,
      cuotas_pactadas: cuotasEnvio,
      monto_cuota: montoCuotaCalculado || "0.00",
      interes_porcentaje,
      mora,
      plazo_meses: plazoEnvio,
      mes_inicio_pagos: mesInicioPagosNormalizado,
      anio_inicio_pagos: anioInicioPagosNormalizado,
      dia_pago_limite,
      fecha_firma,
      fecha_compra: fecha_compra || null,
      fecha_fin: fecha_fin || null,
      estado,
      documento_contrato: documento_contrato || null
    };

    if (incluirId) {
      payload.id_contrato = id_contrato;
    }

    return payload;
  };

  // Generar código de contrato automático al seleccionar residente
  const seleccionarResidenteContrato = (idResidente) => {
    setId_residente(idResidente);
    if (!idResidente) { setCodigo_contrato(''); return; }
    const residente = residentesList.find(r => String(r.id_residente) === String(idResidente));
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const aleatorio = String(Math.floor(100 + Math.random() * 900));
    const iniciales = residente ? residente.nombre.trim().split(' ').map(p => p[0].toUpperCase()).join('').slice(0, 3) : 'RES';
    setCodigo_contrato(`CON-${iniciales}-${anio}${mes}-${aleatorio}`);
  };

  const addContrato = () => {
    const mensajeValidacion = validarContrato();
    if (mensajeValidacion) {
      Swal.fire({ icon: "warning", title: "CAMPOS INCOMPLETOS", text: mensajeValidacion });
      return;
    }

    const payload = construirPayloadContrato(false);

    Axios.post(`${API_URL}/crear`, payload)
    .then(async () => {
      // Obtener datos del residente para el PDF
      const residente = residentesList.find(r => String(r.id_residente) === String(id_residente));
      
      // Generar PDF automáticamente
      if (residente) {
        try {
          const datosParaPdf = {
            codigo_contrato,
            monto_total,
            cuotas_pactadas: payload.cuotas_pactadas,
            monto_cuota: payload.monto_cuota,
            dia_pago_limite,
            fecha_firma,
            fecha_compra,
            dia_firma: fecha_firma ? new Date(fecha_firma).getDate() : '18',
            mes_firma: fecha_firma ? (new Date(fecha_firma).getMonth() + 1) : '7',
            anio_firma: fecha_firma ? new Date(fecha_firma).getFullYear() : '2025',
            // Datos vendedor
            nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
            dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
            registro_numero, registro_folio, registro_libro,
            // Datos propiedad
            numero_finca, folio_propiedad, libro_propiedad, numero_lote,
            manzana_propiedad, area_propiedad, proyecto_propiedad,
            // Medidas
            medida_norte, medida_sur, medida_oriente, medida_poniente,
            // Datos económicos
            enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
            mes_inicio_pagos: payload.mes_inicio_pagos, anio_inicio_pagos: payload.anio_inicio_pagos
          };
          
          // Descargar PDF automáticamente
          descargarPdfContrato(datosParaPdf, residente);
        } catch (pdfError) {
          console.error('Error al generar PDF:', pdfError);
        }
      }

      try {
        await Axios.post(`${API_BASE_URL}/api/morosidad/generar-automatico`);
      } catch (moraErr) {
        console.error('No se pudo generar mora automatica tras crear contrato:', moraErr);
      }

      cargarCatalogos();
      limpiarCampos();
      setShowRegModal(false);
      Swal.fire({ icon: "success", title: "Contrato Establecido Correctamente", text: "El PDF se ha generado y descargado automáticamente", timer: 3000, showConfirmButton: false });
    })
    .catch((error) => {
      Swal.fire({ icon: "error", title: "Error", text: error.response?.data?.message || "Error de servidor" });
    });
  };

  const actualizarContrato = () => {
    const mensajeValidacion = validarContrato();
    if (mensajeValidacion) {
      Swal.fire({ icon: "warning", title: "CAMPOS INCOMPLETOS", text: mensajeValidacion });
      return;
    }

    const payload = construirPayloadContrato(true);

    Axios.put(`${API_URL}/actualizar`, payload)
    .then(async () => {
      try {
        await Axios.post(`${API_BASE_URL}/api/morosidad/generar-automatico`);
      } catch (moraErr) {
        console.error('No se pudo regenerar mora automatica tras actualizar contrato:', moraErr);
      }

      cargarCatalogos();
      limpiarCampos();
      setShowEditModal(false);
      Swal.fire({ icon: "success", title: "Contrato Actualizado", timer: 2500, showConfirmButton: false });
    })
    .catch(() => Swal.fire({ icon: "error", title: "Error al modificar" }));
  };

  const deleteContrato = (val) => {
    Swal.fire({
      title: "¿Eliminar contrato?",
      text: `Se dará de baja el código ${val.codigo_contrato}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, removerlo"
    }).then((result) => {
      if (result.isConfirmed) {
        Axios.delete(`${API_URL}/delete/${val.id_contrato}`)
        .then(() => {
          cargarCatalogos();
          Swal.fire("Eliminado", "Registro removido", "success");
        })
        .catch((err) => Swal.fire("Bloqueado", err.response?.data?.message, "warning"));
      }
    });
  };

  const imprimirContrato = (val) => {
    try {
      const residente = residentesList.find(r => String(r.id_residente) === String(val.id_residente));
      
      if (!residente) {
        Swal.fire({ icon: "error", title: "Error", text: "No se encontraron datos del residente" });
        return;
      }

      const datosParaPdf = {
        codigo_contrato: val.codigo_contrato,
        monto_total: val.monto_total,
        cuotas_pactadas: val.cuotas_pactadas,
        monto_cuota: val.monto_cuota,
        dia_pago_limite: val.dia_pago_limite,
        fecha_firma: val.fecha_firma,
        fecha_compra: val.fecha_compra,
        dia_firma: new Date(val.fecha_firma).getDate(),
        mes_firma: new Date(val.fecha_firma).getMonth() + 1,
        anio_firma: new Date(val.fecha_firma).getFullYear(),
        // Datos vendedor
        nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
        dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
        registro_numero, registro_folio, registro_libro,
        // Datos propiedad
        numero_finca, folio_propiedad, libro_propiedad, numero_lote,
        manzana_propiedad, area_propiedad, proyecto_propiedad,
        // Medidas
        medida_norte, medida_sur, medida_oriente, medida_poniente,
        // Datos económicos
        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
        mes_inicio_pagos: val.mes_inicio_pagos, anio_inicio_pagos: val.anio_inicio_pagos
      };
      
      // Generar e imprimir PDF
      imprimirPdfContrato(datosParaPdf, residente);
      
      Swal.fire({ icon: "success", title: "Enviando a Impresora", text: "El PDF se está abriendo para imprimir", timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error('Error al imprimir contrato:', error);
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo generar el PDF para imprimir" });
    }
  };

  const descargarContratoPdf = (val) => {
    try {
      const residente = residentesList.find(r => String(r.id_residente) === String(val.id_residente));

      if (!residente) {
        Swal.fire({ icon: "error", title: "Error", text: "No se encontraron datos del residente" });
        return;
      }

      const datosParaPdf = {
        codigo_contrato: val.codigo_contrato,
        monto_total: val.monto_total,
        cuotas_pactadas: val.cuotas_pactadas,
        monto_cuota: val.monto_cuota,
        dia_pago_limite: val.dia_pago_limite,
        fecha_firma: val.fecha_firma,
        fecha_compra: val.fecha_compra,
        dia_firma: new Date(val.fecha_firma).getDate(),
        mes_firma: new Date(val.fecha_firma).getMonth() + 1,
        anio_firma: new Date(val.fecha_firma).getFullYear(),
        // Datos vendedor
        nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
        dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
        registro_numero, registro_folio, registro_libro,
        // Datos propiedad
        numero_finca, folio_propiedad, libro_propiedad, numero_lote,
        manzana_propiedad, area_propiedad, proyecto_propiedad,
        // Medidas
        medida_norte, medida_sur, medida_oriente, medida_poniente,
        // Datos económicos
        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
        mes_inicio_pagos: val.mes_inicio_pagos, anio_inicio_pagos: val.anio_inicio_pagos
      };

      // Generar y descargar PDF automático con el formato programado.
      descargarPdfContrato(datosParaPdf, residente);

      Swal.fire({ icon: "success", title: "PDF generado", text: "El contrato se descargó en formato PDF.", timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error('Error al generar PDF del contrato:', error);
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo generar el PDF del contrato" });
    }
  };

  const obtenerNombreDocumentoContrato = (valorDocumento = '') => {
    const raw = String(valorDocumento || '').trim();
    if (!raw) return '';
    if (raw.startsWith('db|')) {
      return raw.slice(3).trim();
    }
    const partes = raw.split('|').map((item) => String(item || '').trim()).filter(Boolean);
    if (partes.length >= 2) return partes[1];
    return partes[0] || '';
  };

  const truncarTexto = (texto = '', limite = 28) => {
    const limpio = String(texto || '').trim();
    if (!limpio) return '';
    if (limpio.length <= limite) return limpio;
    return `${limpio.slice(0, limite - 1)}…`;
  };

  const extensionDesdeMime = (mime = '') => {
    const mimeBase = String(mime || '').toLowerCase().split(';')[0].trim();
    const mapa = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'text/plain': '.txt',
      'application/rtf': '.rtf',
      'application/zip': '.zip'
    };
    return mapa[mimeBase] || '';
  };

  const subirArchivoContrato = async (contrato, forzarReemplazo = false) => {
    const inputResultado = await Swal.fire({
      title: forzarReemplazo ? 'Reemplazar archivo del contrato' : 'Subir archivo del contrato',
      text: 'Puedes subir cualquier formato de archivo (PDF, Word, imágenes, ZIP, etc.).',
      input: 'file',
      inputAttributes: {
        'aria-label': 'Seleccionar archivo del contrato'
      },
      showCancelButton: true,
      confirmButtonText: forzarReemplazo ? 'Reemplazar archivo' : 'Subir archivo',
      cancelButtonText: 'Cancelar'
    });

    const archivo = inputResultado.value;
    if (!archivo) return;

    if (archivo.size > 15 * 1024 * 1024) {
      Swal.fire({ icon: 'warning', title: 'Archivo muy grande', text: 'El archivo no puede superar 15 MB.' });
      return;
    }

    const formData = new FormData();
    formData.append('archivo', archivo);
    if (forzarReemplazo) {
      formData.append('replace_existing', '1');
    }

    try {
      await Axios.post(`${API_URL}/subir-word/${contrato.id_contrato}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      await cargarCatalogos();
      Swal.fire({
        icon: 'success',
        title: forzarReemplazo ? 'Archivo reemplazado' : 'Archivo subido',
        text: `${archivo.name} guardado correctamente en el contrato.`
      });
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      const mensaje = error?.response?.data?.message || 'No se pudo guardar el archivo.';

      if (status === 409) {
        const confirmacion = await Swal.fire({
          icon: 'question',
          title: 'Este contrato ya tiene archivo',
          text: '¿Deseas reemplazar el archivo existente con este nuevo archivo?',
          showCancelButton: true,
          confirmButtonText: 'Sí, reemplazar',
          cancelButtonText: 'Cancelar'
        });

        if (!confirmacion.isConfirmed) return;

        const formDataReemplazo = new FormData();
        formDataReemplazo.append('archivo', archivo);
        formDataReemplazo.append('replace_existing', '1');

        try {
          await Axios.post(`${API_URL}/subir-word/${contrato.id_contrato}`, formDataReemplazo, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

          await cargarCatalogos();
          Swal.fire({ icon: 'success', title: 'Archivo reemplazado', text: `${archivo.name} reemplazó el archivo anterior.` });
        } catch (replaceErr) {
          Swal.fire({
            icon: 'error',
            title: 'No se pudo reemplazar',
            text: replaceErr?.response?.data?.message || 'Error al reemplazar archivo del contrato.'
          });
        }

        return;
      }

      Swal.fire({ icon: 'error', title: 'Error al subir archivo', text: mensaje });
    }
  };

  const descargarArchivoContrato = async (contrato) => {
    try {
      const response = await Axios.get(`${API_URL}/descargar-word/${contrato.id_contrato}`, {
        responseType: 'blob'
      });

      const contentDisposition = String(response.headers?.['content-disposition'] || '');
      const matchUtf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const matchSimple = contentDisposition.match(/filename="?([^";]+)"?/i);
      const mimeDescarga = String(response.headers?.['content-type'] || response.data?.type || 'application/octet-stream');
      let nombreDescarga = decodeURIComponent(matchUtf8?.[1] || matchSimple?.[1] || `${contrato.codigo_contrato || 'contrato'}_archivo`);

      if (!/\.[A-Za-z0-9]{2,8}$/.test(nombreDescarga)) {
        const ext = extensionDesdeMime(mimeDescarga);
        if (ext) {
          nombreDescarga = `${nombreDescarga}${ext}`;
        }
      }

      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: mimeDescarga || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', nombreDescarga);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      Swal.fire({ icon: 'success', title: 'Descarga iniciada', text: `Archivo descargado: ${nombreDescarga}` });
    } catch (error) {
      Swal.fire({
        icon: 'warning',
        title: 'No se pudo descargar',
        text: error?.response?.data?.message || 'Este contrato no tiene archivo cargado o no fue posible descargarlo.'
      });
    }
  };

  const generarFiniquito = async (contrato) => {
    const confirmacion = await Swal.fire({
      icon: 'warning',
      title: 'Confirmar solvencia total',
      html: `El finiquito declara que el contrato <strong>${contrato.codigo_contrato}</strong> esta totalmente pagado. Confirma esta informacion con Caja y Estado de Cuenta antes de generarlo.`,
      showCancelButton: true,
      confirmButtonText: 'Confirmar y generar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmacion.isConfirmed) return;

    try {
      descargarPdfFiniquito(contrato);
      Swal.fire({ icon: 'success', title: 'Finiquito generado', text: 'El PDF quedo listo para revision y firma.' });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'No se pudo generar', text: 'Ocurrio un error al preparar el finiquito.' });
    }
  };

  const subirFiniquito = async (contrato, forzarReemplazo = false) => {
    const inputResultado = await Swal.fire({
      title: forzarReemplazo ? 'Reemplazar finiquito firmado' : 'Subir finiquito firmado',
      text: 'Adjunta el finiquito revisado y firmado. El archivo del contrato no sera modificado.',
      input: 'file',
      inputAttributes: { 'aria-label': 'Seleccionar finiquito firmado' },
      showCancelButton: true,
      confirmButtonText: forzarReemplazo ? 'Reemplazar finiquito' : 'Subir finiquito',
      cancelButtonText: 'Cancelar'
    });

    const archivo = inputResultado.value;
    if (!archivo) return;
    if (archivo.size > 15 * 1024 * 1024) {
      Swal.fire({ icon: 'warning', title: 'Archivo muy grande', text: 'El finiquito no puede superar 15 MB.' });
      return;
    }

    const guardarArchivo = async (reemplazar) => {
      const formData = new FormData();
      formData.append('archivo', archivo);
      if (reemplazar) formData.append('replace_existing', '1');
      return Axios.post(`${API_URL}/subir-finiquito/${contrato.id_contrato}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    };

    try {
      await guardarArchivo(forzarReemplazo);
      await cargarCatalogos();
      Swal.fire({ icon: 'success', title: 'Finiquito guardado', text: `${archivo.name} quedo asociado al contrato.` });
    } catch (error) {
      if (Number(error?.response?.status || 0) === 409 && !forzarReemplazo) {
        const reemplazo = await Swal.fire({
          icon: 'question',
          title: 'Ya existe un finiquito',
          text: 'Deseas reemplazar el finiquito firmado existente?',
          showCancelButton: true,
          confirmButtonText: 'Si, reemplazar',
          cancelButtonText: 'Cancelar'
        });
        if (!reemplazo.isConfirmed) return;
        try {
          await guardarArchivo(true);
          await cargarCatalogos();
          Swal.fire({ icon: 'success', title: 'Finiquito reemplazado' });
        } catch (replaceError) {
          Swal.fire({ icon: 'error', title: 'No se pudo reemplazar', text: replaceError?.response?.data?.message || 'Error al guardar el finiquito.' });
        }
        return;
      }
      Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: error?.response?.data?.message || 'Error al subir el finiquito.' });
    }
  };

  const descargarFiniquito = async (contrato) => {
    try {
      const response = await Axios.get(`${API_URL}/descargar-finiquito/${contrato.id_contrato}`, { responseType: 'blob' });
      const disposition = String(response.headers?.['content-disposition'] || '');
      const matchUtf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const matchSimple = disposition.match(/filename="?([^";]+)"?/i);
      const nombre = decodeURIComponent(matchUtf8?.[1] || matchSimple?.[1] || `Finiquito_${contrato.codigo_contrato}.pdf`);
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = nombre;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      Swal.fire({ icon: 'warning', title: 'No se pudo descargar', text: error?.response?.data?.message || 'Este contrato no tiene finiquito firmado.' });
    }
  };

  const abrirEditarModal = (val) => {
    const proyectoResuelto = resolverProyectoContrato(val);

    setId_contrato(val.id_contrato);
    setCodigo_contrato(val.codigo_contrato);
    setId_residente(val.id_residente);
    setId_empresa_marca(proyectoResuelto.idEmpresa);
    setId_proyecto(proyectoResuelto.idProyecto);
    setProyecto_propiedad(proyectoResuelto.nombreProyecto);
    setId_tipo_contrato(val.id_tipo_contrato);
    setMonto_total(val.monto_total);
    // Las cuotas pactadas manda; el plazo se alinea a ellas para que la cuota que calcula el
    // contrato sea la misma que cobra Caja (contratos antiguos podian traer 36 cuotas / 60 meses).
    setCuotas_pactadas(val.cuotas_pactadas || val.plazo_meses || '');
    setDia_pago_limite(val.dia_pago_limite);
    setFecha_firma(val.fecha_firma.split('T')[0]);
    setFecha_compra(val.fecha_compra ? val.fecha_compra.split('T')[0] : '');
    setFecha_fin(val.fecha_fin ? val.fecha_fin.split('T')[0] : '');
    setEnganche(val.enganche ?? '20000');
    setInteres_porcentaje(val.interes_porcentaje ?? '14');
    setMora(val.mora ?? '600');
    setPlazo_meses(val.cuotas_pactadas || val.plazo_meses || '');
    setMes_inicio_pagos(String(val.mes_inicio_pagos ?? ''));
    setAnio_inicio_pagos(String(val.anio_inicio_pagos ?? ''));
    ultimoInicioPagosAutoRef.current = obtenerInicioPagosAutomatico(
      val.fecha_compra ? val.fecha_compra.split('T')[0] : '',
      val.fecha_firma ? val.fecha_firma.split('T')[0] : ''
    );
    setEstado(val.estado);
    setDocumento_contrato(val.documento_contrato || '');
    setShowEditModal(true);
  };

  const manejarAccionContrato = (accion, contrato) => {
    if (!accion) return;
    if (accion === 'editar') {
      abrirEditarModal(contrato);
      return;
    }
    if (accion === 'imprimir') {
      imprimirContrato(contrato);
      return;
    }
    if (accion === 'pdf') {
      descargarContratoPdf(contrato);
      return;
    }
    if (accion === 'borrar') {
      deleteContrato(contrato);
      return;
    }
    if (accion === 'subir_archivo') {
      subirArchivoContrato(contrato, false);
      return;
    }
    if (accion === 'reemplazar_archivo') {
      subirArchivoContrato(contrato, true);
      return;
    }
    if (accion === 'descargar_archivo') {
      descargarArchivoContrato(contrato);
      return;
    }
    if (accion === 'generar_finiquito') {
      generarFiniquito(contrato);
      return;
    }
    if (accion === 'subir_finiquito') {
      subirFiniquito(contrato, false);
      return;
    }
    if (accion === 'reemplazar_finiquito') {
      subirFiniquito(contrato, true);
      return;
    }
    if (accion === 'descargar_finiquito') {
      descargarFiniquito(contrato);
    }
  };

  const limpiarCampos = () => {
    setId_contrato(""); setCodigo_contrato(""); setId_residente("");
    setId_empresa_marca(""); setId_proyecto(""); setId_tipo_contrato("");
    // En alta se dejan vacios para no mostrar una cuota "automatica" con 60 meses que el
    // usuario no ha pactado todavia. Edicion sigue cargando los valores reales del contrato.
    setMonto_total(""); setCuotas_pactadas(""); setDia_pago_limite("5");
    setFecha_firma(""); setFecha_compra(""); setFecha_fin(""); setEstado(""); setDocumento_contrato("");
    // Restablecer valores del vendedor/empresa a los valores por defecto
    setNombre_vendedor("DULCE MARIA OSORIO SABAN DE PEREZ");
    setEdad_vendedor("veintinueve");
    setEstado_civil_vendedor("casada");
    setProfesion_vendedor("ejecutiva de negocios");
    setDpi_vendedor("3003 09864 0101");
    setEmpresa_vendedor("CORPORACION DE PROYECTOS Y VIVIENDAS, SOCIEDAD ANONIMA");
    setNotario("Alma Karina Aguilar Chávez");
    setFecha_nombramiento("siete de octubre del año dos mil veinticinco");
    setRegistro_numero("810,559"); setRegistro_folio("120"); setRegistro_libro("853");
    // Propiedad
    setNumero_finca("30052"); setFolio_propiedad("133"); setLibro_propiedad("268");
    setNumero_lote("1"); setManzana_propiedad("A"); setArea_propiedad("89.65");
    setProyecto_propiedad("");
    // Medidas
    setMedida_norte("15.00"); setMedida_sur("15.00"); setMedida_oriente("15.00"); setMedida_poniente("15.00");
    // Económicos
    setEnganche("20000"); setInteres_porcentaje("14"); setMora("600");
    setPorcentaje_dominio("80"); setPlazo_meses("");
    setMes_inicio_pagos(""); setAnio_inicio_pagos("");
    ultimoInicioPagosAutoRef.current = { mes: '', anio: '' };
  };

  const filtrados = contratosList.filter(c => 
    c.codigo_contrato.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.nombre_residente?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Paginación
  const { paginatedItems: contratosPaginados, totalPages, startIndex, endIndex } = getPaginatedData(filtrados, currentPage, itemsPerPage);

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setCurrentPage(1);
  };

  const thCompacto = {
    fontSize: '0.88rem',
    padding: '0.45rem 0.35rem',
    lineHeight: 1.15,
    whiteSpace: 'normal',
    verticalAlign: 'middle'
  };

  const tdCompacto = {
    fontSize: '0.9rem',
    padding: '0.45rem 0.35rem',
    verticalAlign: 'middle'
  };

  return (
    <div className="container mt-4">
      <div className="module-header">
      {/* HEADER */}
      <div className="row bg-light p-3 rounded shadow-sm align-items-center">
        <div className="col-md-4"><h3 className="fw-bold m-0 text-primary">📑 CONTRATOS DE RESIDENTES</h3></div>
        <div className="col-md-5">
          <input type="text" placeholder="Buscar por código de contrato o residente..." className="form-control" value={busqueda} onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-3 text-end">
          <button className="btn btn-primary fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>➕ APERTURAR CONTRATO</button>
        </div>
      </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
      <table className="table table-sm table-striped table-bordered shadow-sm align-middle" style={{ width: '100%', tableLayout: 'auto', marginBottom: '0' }}>
        <thead className="table-dark">
          <tr>
            <th style={thCompacto}>CÓDIGO</th>
            <th style={thCompacto}>RESIDENTE</th>
            <th style={thCompacto}>IDENTIFICACIÓN</th>
            <th style={thCompacto}>TIPO CONTRATO</th>
            <th style={thCompacto}>MONTO TOTAL</th>
            <th style={thCompacto}>CUOTAS</th>
            <th style={thCompacto}>VALOR CUOTA</th>
            <th style={thCompacto}>DÍA LÍMITE</th>
            <th style={thCompacto}>FECHA FIRMA</th>
            <th style={thCompacto}>FECHA COMPRA</th>
            <th style={thCompacto}>FECHA FIN</th>
            <th style={thCompacto}>ESTADO</th>
            <th style={{ ...thCompacto, width: '190px' }}>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length > 0 ? (
            contratosPaginados.map(val => (
              <tr key={val.id_contrato}>
                <td className="fw-bold text-primary" style={tdCompacto}>{val.codigo_contrato}</td>
                <td style={tdCompacto}>{val.nombre_residente?.toUpperCase()}</td>
                <td style={tdCompacto}><span className="fw-bold text-primary">{val.numero_identificacion || 'Sin asignar'}</span></td>
                <td style={tdCompacto}><span className="badge bg-info text-dark">{val.nombre_tipo_contrato}</span></td>
                <td className="fw-bold" style={tdCompacto}>Q {parseFloat(val.monto_total).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td className="text-center" style={tdCompacto}>{val.cuotas_pactadas}</td>
                <td className="text-success fw-bold" style={tdCompacto}>Q {parseFloat(val.monto_cuota).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td className="text-center fw-bold text-danger" style={tdCompacto}>{val.dia_pago_limite} días de gracia</td>
                <td className="text-center text-muted" style={tdCompacto}>{val.fecha_firma ? new Date(val.fecha_firma).toLocaleDateString('es-GT') : '-'}</td>
                <td className="text-center text-muted" style={tdCompacto}>{val.fecha_compra ? new Date(val.fecha_compra).toLocaleDateString('es-GT') : <span className="text-info fw-bold">-</span>}</td>
                <td className="text-center text-muted" style={tdCompacto}>{val.fecha_fin ? new Date(val.fecha_fin).toLocaleDateString('es-GT') : <span className="text-warning fw-bold">Indefinida</span>}</td>
                <td style={tdCompacto}>
                  <span className={`badge ${val.estado === 'activo' ? 'bg-success' : val.estado === 'finalizado' ? 'bg-secondary' : 'bg-warning'}`}>
                    {val.estado.toUpperCase()}
                  </span>
                </td>
                <td style={{ ...tdCompacto, width: '190px' }}>
                  {!!val.documento_contrato && (
                    <div
                      className="small text-success fw-semibold mb-1"
                      title={obtenerNombreDocumentoContrato(val.documento_contrato)}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      📎 {truncarTexto(obtenerNombreDocumentoContrato(val.documento_contrato), 22)}
                    </div>
                  )}
                  {!!val.nombre_finiquito && (
                    <div
                      className="small text-primary fw-semibold mb-1"
                      title={val.nombre_finiquito}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      Finiquito: {truncarTexto(val.nombre_finiquito, 18)}
                    </div>
                  )}
                  <select
                    className="form-select form-select-sm"
                    defaultValue=""
                    onChange={(e) => {
                      manejarAccionContrato(e.target.value, val);
                      e.target.value = '';
                    }}
                    aria-label={`Acciones para contrato ${val.codigo_contrato}`}
                  >
                    <option value="">Seleccione acción</option>
                    <option value="editar">Editar</option>
                    <option value="pdf">PDF contrato automático</option>
                    <option value="imprimir">Imprimir</option>
                    <option value="subir_archivo">Subir archivo</option>
                    <option value="reemplazar_archivo">Reemplazar archivo</option>
                    <option value="descargar_archivo">Descargar archivo</option>
                    <option value="generar_finiquito">Generar finiquito PDF</option>
                    <option value="subir_finiquito">Subir finiquito firmado</option>
                    <option value="reemplazar_finiquito">Reemplazar finiquito</option>
                    <option value="descargar_finiquito">Descargar finiquito</option>
                    <option value="borrar">Borrar</option>
                  </select>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="13" className="text-center text-muted py-3">No hay contratos registrados.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* PAGINACIÓN */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        startIndex={startIndex}
        endIndex={endIndex}
        itemsCount={filtrados.length}
      />

      {/* MODAL: REGISTRO */}
      {showRegModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-primary text-white"><h5 className="fw-bold m-0">Aperturar Nuevo Contrato Legal</h5></div>
              <div className="modal-body row">
                {/* SECCIÓN 1: DATOS BÁSICOS DEL CONTRATO */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-primary border-bottom pb-1">📑 DATOS BÁSICOS DEL CONTRATO</h6></div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Seleccionar Residente:</label>
                  <select className="form-select" value={id_residente} onChange={e => seleccionarResidenteContrato(e.target.value)}>
                    <option value="">-- Seleccione un Residente --</option>
                    {residentesList.map(r => <option key={r.id_residente} value={r.id_residente}>{r.nombre} {r.numero_identificacion ? `· ${r.numero_identificacion}` : ''}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Código de Contrato <small className="text-muted fw-normal">(auto-generado)</small>:</label>
                  <input type="text" className="form-control" value={codigo_contrato} onChange={e => setCodigo_contrato(e.target.value)} placeholder="Seleccione un residente para generar" />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Tipo de Contrato:</label>
                  <select className="form-select" value={id_tipo_contrato} onChange={e => setId_tipo_contrato(e.target.value)}>
                    <option value="">-- Seleccione Tipo --</option>
                    {tiposContratoList.map(t => <option key={t.id_tipo_contrato} value={t.id_tipo_contrato}>{t.nombre_tipo_contrato}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Estado del Contrato:</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="">-- Seleccione --</option>
                    <option value="activo">Activo</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="finalizado">Finalizado (Pagado)</option>
                    <option value="rescindido">Rescindido / Cancelado</option>
                  </select>
                </div>

                {/* SECCIÓN 2: DATOS DE LA PROPIEDAD */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-success border-bottom pb-1">🏘️ DATOS DE LA PROPIEDAD (Cláusula Primera y Segunda)</h6></div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Número de Finca:</label>
                  <input type="text" className="form-control" value={numero_finca} onChange={e => setNumero_finca(e.target.value)} placeholder="Ej: 30052" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Folio:</label>
                  <input type="text" className="form-control" value={folio_propiedad} onChange={e => setFolio_propiedad(e.target.value)} placeholder="Ej: 133" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Libro:</label>
                  <input type="text" className="form-control" value={libro_propiedad} onChange={e => setLibro_propiedad(e.target.value)} placeholder="Ej: 268" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Número de Lote:</label>
                  <input type="text" className="form-control" value={numero_lote} onChange={e => setNumero_lote(e.target.value)} placeholder="Ej: 1" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Manzana:</label>
                  <input type="text" className="form-control" value={manzana_propiedad} onChange={e => setManzana_propiedad(e.target.value)} placeholder="Ej: A" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Área (m²):</label>
                  <input type="text" className="form-control" value={area_propiedad} onChange={e => setArea_propiedad(e.target.value)} placeholder="Ej: 89.65" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Proyecto:</label>
                  <select className="form-control" value={id_proyecto} onChange={e => seleccionarProyectoContrato(e.target.value)}>
                    <option value="">-- Seleccionar Proyecto --</option>
                    {proyectosList.map((proyecto) => (
                      <option key={proyecto.id_proyecto} value={proyecto.id_proyecto}>
                        {proyecto.nombre || proyecto.nombre_proyecto}
                      </option>
                    ))}
                  </select>
                </div>

                {/* MEDIDAS */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-secondary border-bottom pb-1">📐 MEDIDAS Y COLINDANCIAS</h6></div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Norte (mts):</label>
                  <input type="text" className="form-control" value={medida_norte} onChange={e => setMedida_norte(e.target.value)} placeholder="15.00" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Sur (mts):</label>
                  <input type="text" className="form-control" value={medida_sur} onChange={e => setMedida_sur(e.target.value)} placeholder="15.00" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Oriente (mts):</label>
                  <input type="text" className="form-control" value={medida_oriente} onChange={e => setMedida_oriente(e.target.value)} placeholder="15.00" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Poniente (mts):</label>
                  <input type="text" className="form-control" value={medida_poniente} onChange={e => setMedida_poniente(e.target.value)} placeholder="15.00" />
                </div>

                {/* SECCIÓN 3: TÉRMINOS FINANCIEROS */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-danger border-bottom pb-1">💰 TÉRMINOS FINANCIEROS (Cláusula Cuarta)</h6></div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Precio Total del Inmueble (Q):</label>
                  <input type="number" className="form-control" value={monto_total} onChange={e => setMonto_total(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Enganche / 1ra Cuota (Q):</label>
                  <input type="number" className="form-control" value={enganche} onChange={e => setEnganche(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Interés Anual (%):</label>
                  <input type="number" className="form-control" value={interes_porcentaje} onChange={e => setInteres_porcentaje(e.target.value)} placeholder="14" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Número de Cuotas:</label>
                  <input type="number" className="form-control" value={cuotas_pactadas} onChange={e => actualizarCuotasPactadas(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Monto de Cuota (Auto):</label>
                  <input type="text" className="form-control bg-light text-success fw-bold" value={montoCuotaCalculado} readOnly />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Mora por mes vencido (Q):</label>
                  <input type="number" className="form-control" value={mora} onChange={e => setMora(e.target.value)} placeholder="600" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Días de gracia después del vencimiento:</label>
                  <input type="number" min="0" max="31" className="form-control" value={dia_pago_limite} onChange={e => setDia_pago_limite(e.target.value)} placeholder="5" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Plazo Total (meses):</label>
                  <input type="number" className="form-control" value={plazo_meses} onChange={e => actualizarPlazoMeses(e.target.value)} placeholder="60" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">% Reserva Dominio:</label>
                  <input type="number" className="form-control" value={porcentaje_dominio} onChange={e => setPorcentaje_dominio(e.target.value)} placeholder="80" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Mes Inicio de Pagos:</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    className="form-control"
                    value={mes_inicio_pagos}
                    onChange={e => setMes_inicio_pagos(e.target.value)}
                  />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Año Inicio de Pagos:</label>
                  <input
                    type="number"
                    min="2000"
                    className="form-control"
                    value={anio_inicio_pagos}
                    onChange={e => setAnio_inicio_pagos(e.target.value)}
                  />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha de Firma Legal:</label>
                  <input type="date" className="form-control" value={fecha_firma} onChange={e => setFecha_firma(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha de Compra:</label>
                  <input type="date" className="form-control" value={fecha_compra} onChange={e => setFecha_compra(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha Fin (Opcional):</label>
                  <input type="date" className="form-control" value={fecha_fin} onChange={e => setFecha_fin(e.target.value)} />
                </div>

                {/* SECCIÓN 4: DATOS DEL VENDEDOR */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-warning border-bottom pb-1">👤 DATOS DEL VENDEDOR / EMPRESA (Parte Vendedora)</h6></div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Nombre Completo Vendedor:</label>
                  <input type="text" className="form-control" value={nombre_vendedor} onChange={e => setNombre_vendedor(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Edad (en letras):</label>
                  <input type="text" className="form-control" value={edad_vendedor} onChange={e => setEdad_vendedor(e.target.value)} placeholder="veintinueve" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Estado Civil:</label>
                  <input type="text" className="form-control" value={estado_civil_vendedor} onChange={e => setEstado_civil_vendedor(e.target.value)} placeholder="casada" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Profesión:</label>
                  <input type="text" className="form-control" value={profesion_vendedor} onChange={e => setProfesion_vendedor(e.target.value)} placeholder="ejecutiva de negocios" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">DPI / CUI Vendedor:</label>
                  <input type="text" className="form-control" value={dpi_vendedor} onChange={e => setDpi_vendedor(e.target.value)} placeholder="3003 09864 0101" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Notario Legalizador:</label>
                  <input type="text" className="form-control" value={notario} onChange={e => setNotario(e.target.value)} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Nombre de la Empresa:</label>
                  <input type="text" className="form-control" value={empresa_vendedor} onChange={e => setEmpresa_vendedor(e.target.value)} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Fecha del Nombramiento Notarial (en letras):</label>
                  <input type="text" className="form-control" value={fecha_nombramiento} onChange={e => setFecha_nombramiento(e.target.value)} placeholder="siete de octubre del año dos mil veinticinco" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Número Registro Mercantil:</label>
                  <input type="text" className="form-control" value={registro_numero} onChange={e => setRegistro_numero(e.target.value)} placeholder="810,559" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Folio Registro Mercantil:</label>
                  <input type="text" className="form-control" value={registro_folio} onChange={e => setRegistro_folio(e.target.value)} placeholder="120" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Libro Registro Mercantil:</label>
                  <input type="text" className="form-control" value={registro_libro} onChange={e => setRegistro_libro(e.target.value)} placeholder="853" />
                </div>

                {/* SEPARADOR Y BOTÓN PARA VER VISTA PREVIA */}
                <div className="col-12">
                  <hr className="my-2" />
                  <button 
                    type="button" 
                    className="btn btn-info btn-sm w-100 mb-3"
                    onClick={() => setShowPdfPreview(!showPdfPreview)}
                  >
                    {showPdfPreview ? '📄 Ocultar Vista Previa del PDF' : '📄 Mostrar Vista Previa del PDF'}
                  </button>
                </div>

                {/* VISTA PREVIA DEL PDF */}
                {showPdfPreview && (
                  <div className="col-12">
                    <PdfPreview 
                      datosContrato={{
                        codigo_contrato, monto_total, cuotas_pactadas, monto_cuota: montoCuotaCalculado, dia_pago_limite,
                        fecha_firma, fecha_compra,
                        dia_firma: fecha_firma ? new Date(fecha_firma).getDate() : '',
                        mes_firma: fecha_firma ? (new Date(fecha_firma).getMonth() + 1) : '',
                        anio_firma: fecha_firma ? new Date(fecha_firma).getFullYear() : '',
                        nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
                        dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
                        registro_numero, registro_folio, registro_libro,
                        numero_finca, folio_propiedad, libro_propiedad, numero_lote,
                        manzana_propiedad, area_propiedad, proyecto_propiedad,
                        medida_norte, medida_sur, medida_oriente, medida_poniente,
                        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
                        mes_inicio_pagos, anio_inicio_pagos
                      }}
                      datosResidente={residentesList.find(r => String(r.id_residente) === String(id_residente)) || {}}
                      mostrar={true}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowRegModal(false)}>Cancelar</button>
                <button className="btn btn-primary fw-bold" onClick={addContrato}>Establecer Contrato</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDICIÓN */}
      {showEditModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-warning text-dark"><h5 className="fw-bold m-0">Modificar Contrato Financiero</h5></div>
              <div className="modal-body row">
                {/* SECCIÓN 1: DATOS BÁSICOS */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-primary border-bottom pb-1">📑 DATOS BÁSICOS DEL CONTRATO</h6></div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Código de Contrato:</label>
                  <input type="text" className="form-control" value={codigo_contrato} onChange={e => setCodigo_contrato(e.target.value)} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Residente:</label>
                  <select className="form-select" value={id_residente} onChange={e => setId_residente(e.target.value)}>
                    <option value="">-- Seleccione un Residente --</option>
                    {residentesList.map(r => <option key={r.id_residente} value={r.id_residente}>{r.nombre} {r.numero_identificacion ? `· ${r.numero_identificacion}` : ''}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Tipo de Contrato:</label>
                  <select className="form-select" value={id_tipo_contrato} onChange={e => setId_tipo_contrato(e.target.value)}>
                    <option value="">-- Seleccione Tipo --</option>
                    {tiposContratoList.map(t => <option key={t.id_tipo_contrato} value={t.id_tipo_contrato}>{t.nombre_tipo_contrato}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Estado del Contrato:</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="">-- Seleccione --</option>
                    <option value="activo">Activo</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="finalizado">Finalizado (Pagado)</option>
                    <option value="rescindido">Rescindido / Cancelado</option>
                  </select>
                </div>

                {/* SECCIÓN 2: DATOS DE LA PROPIEDAD */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-success border-bottom pb-1">🏘️ DATOS DE LA PROPIEDAD</h6></div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Número de Finca:</label>
                  <input type="text" className="form-control" value={numero_finca} onChange={e => setNumero_finca(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Folio:</label>
                  <input type="text" className="form-control" value={folio_propiedad} onChange={e => setFolio_propiedad(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Libro:</label>
                  <input type="text" className="form-control" value={libro_propiedad} onChange={e => setLibro_propiedad(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Número de Lote:</label>
                  <input type="text" className="form-control" value={numero_lote} onChange={e => setNumero_lote(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Manzana:</label>
                  <input type="text" className="form-control" value={manzana_propiedad} onChange={e => setManzana_propiedad(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Área (m²):</label>
                  <input type="text" className="form-control" value={area_propiedad} onChange={e => setArea_propiedad(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Proyecto:</label>
                  <select className="form-control" value={id_proyecto} onChange={e => seleccionarProyectoContrato(e.target.value)}>
                    <option value="">-- Seleccionar Proyecto --</option>
                    {proyectosList.map((proyecto) => (
                      <option key={proyecto.id_proyecto} value={proyecto.id_proyecto}>
                        {proyecto.nombre || proyecto.nombre_proyecto}
                      </option>
                    ))}
                  </select>
                </div>

                {/* MEDIDAS */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-secondary border-bottom pb-1">📐 MEDIDAS Y COLINDANCIAS</h6></div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Norte (mts):</label>
                  <input type="text" className="form-control" value={medida_norte} onChange={e => setMedida_norte(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Sur (mts):</label>
                  <input type="text" className="form-control" value={medida_sur} onChange={e => setMedida_sur(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Oriente (mts):</label>
                  <input type="text" className="form-control" value={medida_oriente} onChange={e => setMedida_oriente(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Poniente (mts):</label>
                  <input type="text" className="form-control" value={medida_poniente} onChange={e => setMedida_poniente(e.target.value)} />
                </div>

                {/* SECCIÓN 3: TÉRMINOS FINANCIEROS */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-danger border-bottom pb-1">💰 TÉRMINOS FINANCIEROS</h6></div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Precio Total del Inmueble (Q):</label>
                  <input type="number" className="form-control" value={monto_total} onChange={e => setMonto_total(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Enganche / 1ra Cuota (Q):</label>
                  <input type="number" className="form-control" value={enganche} onChange={e => setEnganche(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Interés Anual (%):</label>
                  <input type="number" className="form-control" value={interes_porcentaje} onChange={e => setInteres_porcentaje(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Número de Cuotas:</label>
                  <input type="number" className="form-control" value={cuotas_pactadas} onChange={e => actualizarCuotasPactadas(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Monto de Cuota (Auto):</label>
                  <input type="text" className="form-control bg-light text-success fw-bold" value={montoCuotaCalculado} readOnly />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Mora por mes vencido (Q):</label>
                  <input type="number" className="form-control" value={mora} onChange={e => setMora(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Días de gracia después del vencimiento:</label>
                  <input type="number" min="0" max="31" className="form-control" value={dia_pago_limite} onChange={e => setDia_pago_limite(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Plazo Total (meses):</label>
                  <input type="number" className="form-control" value={plazo_meses} onChange={e => actualizarPlazoMeses(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">% Reserva Dominio:</label>
                  <input type="number" className="form-control" value={porcentaje_dominio} onChange={e => setPorcentaje_dominio(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Mes Inicio de Pagos:</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    className="form-control"
                    value={mes_inicio_pagos}
                    onChange={e => setMes_inicio_pagos(e.target.value)}
                  />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Año Inicio de Pagos:</label>
                  <input
                    type="number"
                    min="2000"
                    className="form-control"
                    value={anio_inicio_pagos}
                    onChange={e => setAnio_inicio_pagos(e.target.value)}
                  />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha de Firma Legal:</label>
                  <input type="date" className="form-control" value={fecha_firma} onChange={e => setFecha_firma(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha de Compra:</label>
                  <input type="date" className="form-control" value={fecha_compra} onChange={e => setFecha_compra(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha Fin (Opcional):</label>
                  <input type="date" className="form-control" value={fecha_fin} onChange={e => setFecha_fin(e.target.value)} />
                </div>

                {/* SECCIÓN 4: DATOS DEL VENDEDOR */}
                <div className="col-12 mb-2"><h6 className="fw-bold text-warning border-bottom pb-1">👤 DATOS DEL VENDEDOR / EMPRESA</h6></div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Nombre Completo Vendedor:</label>
                  <input type="text" className="form-control" value={nombre_vendedor} onChange={e => setNombre_vendedor(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Edad (en letras):</label>
                  <input type="text" className="form-control" value={edad_vendedor} onChange={e => setEdad_vendedor(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Estado Civil:</label>
                  <input type="text" className="form-control" value={estado_civil_vendedor} onChange={e => setEstado_civil_vendedor(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Profesión:</label>
                  <input type="text" className="form-control" value={profesion_vendedor} onChange={e => setProfesion_vendedor(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">DPI / CUI Vendedor:</label>
                  <input type="text" className="form-control" value={dpi_vendedor} onChange={e => setDpi_vendedor(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Notario:</label>
                  <input type="text" className="form-control" value={notario} onChange={e => setNotario(e.target.value)} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Empresa:</label>
                  <input type="text" className="form-control" value={empresa_vendedor} onChange={e => setEmpresa_vendedor(e.target.value)} />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Fecha Nombramiento (en letras):</label>
                  <input type="text" className="form-control" value={fecha_nombramiento} onChange={e => setFecha_nombramiento(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Número Registro Mercantil:</label>
                  <input type="text" className="form-control" value={registro_numero} onChange={e => setRegistro_numero(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Folio Registro:</label>
                  <input type="text" className="form-control" value={registro_folio} onChange={e => setRegistro_folio(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Libro Registro:</label>
                  <input type="text" className="form-control" value={registro_libro} onChange={e => setRegistro_libro(e.target.value)} />
                </div>

                {/* BOTÓN VISTA PREVIA */}
                <div className="col-12">
                  <hr className="my-2" />
                  <button type="button" className="btn btn-info btn-sm w-100 mb-3" onClick={() => setShowPdfPreview(!showPdfPreview)}>
                    {showPdfPreview ? '📄 Ocultar Vista Previa del PDF' : '📄 Mostrar Vista Previa del PDF'}
                  </button>
                </div>

                {showPdfPreview && (
                  <div className="col-12">
                    <PdfPreview 
                      datosContrato={{
                        codigo_contrato, monto_total, cuotas_pactadas, monto_cuota: montoCuotaCalculado, dia_pago_limite,
                        fecha_firma, fecha_compra,
                        dia_firma: fecha_firma ? new Date(fecha_firma).getDate() : '',
                        mes_firma: fecha_firma ? (new Date(fecha_firma).getMonth() + 1) : '',
                        anio_firma: fecha_firma ? new Date(fecha_firma).getFullYear() : '',
                        nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
                        dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
                        registro_numero, registro_folio, registro_libro,
                        numero_finca, folio_propiedad, libro_propiedad, numero_lote,
                        manzana_propiedad, area_propiedad, proyecto_propiedad,
                        medida_norte, medida_sur, medida_oriente, medida_poniente,
                        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
                        mes_inicio_pagos, anio_inicio_pagos
                      }}
                      datosResidente={residentesList.find(r => String(r.id_residente) === String(id_residente)) || {}}
                      mostrar={true}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button className="btn btn-warning fw-bold text-dark" onClick={actualizarContrato}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Contratos_Residentes;
