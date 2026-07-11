import { useState, useEffect, useCallback, useRef } from 'react';
import Axios from "axios";
import 'bootstrap/dist/css/bootstrap.min.css';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';
import { getPaginatedData, PaginationControls } from '../utils/paginationUtils';
import { descargarPdfContrato, imprimirPdfContrato } from '../utils/contractPdfGenerator';
import { CONTRACT_TEMPLATES, resolveContractTemplateId } from '../utils/contractTemplates';
import PdfPreview from './PdfPreview';

const BRANDING_OPTIONS = [
  { value: 'solo_logo', label: 'Solo logotipo (arriba derecha)' },
  { value: 'logo_y_nombre', label: 'Logotipo + nombre (arriba derecha)' },
  { value: 'solo_nombre', label: 'Solo nombre empresa' },
  { value: 'sin_marca', label: 'Sin marca de empresa' },
  { value: 'logo_centrado', label: 'Solo logotipo centrado' }
];

const getBrandingCompanyMap = () => {
  try {
    return JSON.parse(localStorage.getItem('contratos_empresa_marca') || '{}');
  } catch {
    return {};
  }
};

const setBrandingCompanyMap = (map) => {
  localStorage.setItem('contratos_empresa_marca', JSON.stringify(map));
};

function Contratos_Residentes() {
  // Campos básicos del formulario
  const [id_contrato, setId_contrato] = useState("");
  const [codigo_contrato, setCodigo_contrato] = useState("");
  const [id_residente, setId_residente] = useState("");
  const [id_empresa_marca, setId_empresa_marca] = useState("");
  const [id_tipo_contrato, setId_tipo_contrato] = useState("");
  const [formato_contrato, setFormato_contrato] = useState('FORMATO_01');
  const [modo_marca_empresa, setModo_marca_empresa] = useState('solo_logo');
  const [monto_total, setMonto_total] = useState("120000");
  const [cuotas_pactadas, setCuotas_pactadas] = useState("60");
  const [monto_cuota, setMonto_cuota] = useState("");
  const [dia_pago_limite, setDia_pago_limite] = useState("");
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
  const [plazo_meses, setPlazo_meses] = useState("60");
  const [mes_inicio_pagos, setMes_inicio_pagos] = useState("7");
  const [anio_inicio_pagos, setAnio_inicio_pagos] = useState("2026");

  // Listas de datos
  const [contratosList, setContratosList] = useState([]);
  const [residentesList, setResidentesList] = useState([]);
  const [tiposContratoList, setTiposContratoList] = useState([]);
  const [empresasList, setEmpresasLista] = useState([]);
  const [proyectosList, setProyectosList] = useState([]);
  const [serviciosProyectoList, setServiciosProyectoList] = useState([]);
  const [serviciosContratoSeleccionados, setServiciosContratoSeleccionados] = useState([]);
  const [serviciosCatalogoList, setServiciosCatalogoList] = useState([]);
  const [busqueda, setBusqueda] = useState("");

  // Modales
  const [showRegModal, setShowRegModal] = useState(false);  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(true); // Vista previa PDF habilitada por defecto
  const [pdfPreviewRefreshKey, setPdfPreviewRefreshKey] = useState(0);
  const [contratoWordTarget, setContratoWordTarget] = useState(null);
  const [subiendoWordContratoId, setSubiendoWordContratoId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const inputWordRef = useRef(null);

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

      // Traer las empresas para el selector de proyectos
      const resEmpresas = await Axios.get(`${API_BASE_URL}/api/empresas?soloMatrices=1`);
      setEmpresasLista(resEmpresas.data);

      // Traer proyectos desde tabla dedicada (relacionados por NIT)
      const resProyectos = await Axios.get(`${API_BASE_URL}/api/empresa_proyecto/catalogo`);
      setProyectosList(Array.isArray(resProyectos.data?.proyectos) ? resProyectos.data.proyectos : []);
    } catch (error) {
      console.error("Error al cargar catálogos del sistema", error);
    }
  }, [API_URL]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // Cálculo automático del valor de cuota si cambia el monto total o las cuotas
  useEffect(() => {
    if (monto_total && cuotas_pactadas > 0) {
      const calculo = (parseFloat(monto_total) / parseInt(cuotas_pactadas)).toFixed(2);
      setMonto_cuota(calculo);
    } else {
      setMonto_cuota("");
    }
  }, [monto_total, cuotas_pactadas]);

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

    if (residente?.id_empresa) {
      actualizarEmpresaMarcaYProyecto(String(residente.id_empresa));
    }

    if (residente?.formato_contrato_preferido) {
      setFormato_contrato(residente.formato_contrato_preferido);
      return;
    }

    const preferencias = JSON.parse(localStorage.getItem('residentes_formato_preferido') || '{}');
    const formatoSugerido = preferencias[String(idResidente)];
    if (formatoSugerido) {
      setFormato_contrato(formatoSugerido);
    }
  };

  const obtenerEmpresaPorResidente = (idResidente) => {
    const residente = residentesList.find(r => String(r.id_residente) === String(idResidente));
    if (!residente || !residente.id_empresa) {
      return null;
    }
    return empresasList.find(e => String(e.id_empresa) === String(residente.id_empresa)) || null;
  };

  const empresaSeleccionada = obtenerEmpresaPorResidente(id_residente);
  const empresaMarcaSeleccionada = empresasList.find(e => String(e.id_empresa) === String(id_empresa_marca)) || null;
  const empresaParaPdf = empresaMarcaSeleccionada || empresaSeleccionada;

  const getProyectoNombre = (proyecto) => proyecto?.nombre_proyecto || proyecto?.nombre_empresa || '';

  const empresaContextoProyecto = empresaMarcaSeleccionada || empresaSeleccionada;
  const nitEmpresaContexto = empresaContextoProyecto?.nit ? String(empresaContextoProyecto.nit).trim().toUpperCase() : '';

  const proyectosRelacionados = nitEmpresaContexto
    ? proyectosList.filter((p) => String(p.nit_empresa || '').trim().toUpperCase() === nitEmpresaContexto)
    : [];

  const proyectosDisponibles = proyectosRelacionados;
  const proyectoSeleccionado = proyectosDisponibles.find((proyecto) => getProyectoNombre(proyecto) === proyecto_propiedad) || null;

  const formatMoney = (value) => `Q${Number(value || 0).toFixed(2)}`;

  useEffect(() => {
    const idProyecto = Number(proyectoSeleccionado?.id_proyecto || 0);
    Axios.get(`${API_BASE_URL}/api/servicios`)
      .then((resServicios) => {
        const serviciosActivos = Array.isArray(resServicios.data)
          ? resServicios.data.filter((item) => String(item.estado || '').toLowerCase() === 'activo')
          : [];

        setServiciosCatalogoList(serviciosActivos);

        if (!idProyecto) {
          setServiciosProyectoList(serviciosActivos);
          return null;
        }

        return Axios.get(`${API_BASE_URL}/api/proyectos/servicios/${idProyecto}`)
          .then((resProyecto) => {
            const serviciosProyecto = Array.isArray(resProyecto.data?.servicios) ? resProyecto.data.servicios : [];
            const serviciosProyectoMap = new Map(serviciosProyecto.map((item) => [Number(item.id_servicio), item]));

            const serviciosVisibles = serviciosActivos.map((servicio) => {
              const proyectoData = serviciosProyectoMap.get(Number(servicio.id_servicio));
              return {
                ...servicio,
                asignado_al_proyecto: !!proyectoData,
                costo_servicio: proyectoData?.costo_servicio ?? servicio.costo_servicio,
              };
            });

            setServiciosProyectoList(serviciosVisibles);

            const idsDisponibles = new Set(
              serviciosProyecto.map((item) => Number(item.id_servicio)).filter((id) => Number.isInteger(id) && id > 0)
            );
            setServiciosContratoSeleccionados((prev) => prev.filter((id) => idsDisponibles.has(Number(id))));
            return null;
          });
      })
      .catch((error) => {
        console.error('No se pudieron cargar servicios del catálogo/proyecto:', error);
        setServiciosCatalogoList([]);
        setServiciosProyectoList([]);
        setServiciosContratoSeleccionados([]);
      });
  }, [proyectoSeleccionado?.id_proyecto]);

  const actualizarEmpresaMarcaYProyecto = (idEmpresa) => {
    setId_empresa_marca(idEmpresa);

    if (!idEmpresa) {
      setProyecto_propiedad('');
      return;
    }

    const empresaActual = empresasList.find(e => String(e.id_empresa) === String(idEmpresa));
    if (!empresaActual) {
      return;
    }

    const nitEmpresa = empresaActual.nit ? String(empresaActual.nit).trim().toUpperCase() : '';
    const proyectos = nitEmpresa
      ? proyectosList.filter((proyecto) => String(proyecto.nit_empresa || '').trim().toUpperCase() === nitEmpresa)
      : [];

    if (proyectos.length > 0) {
      const proyectoActualValido = proyectos.some((proyecto) => getProyectoNombre(proyecto) === proyecto_propiedad);
      if (!proyectoActualValido) {
        setProyecto_propiedad(getProyectoNombre(proyectos[0]));
      }
    } else {
      setProyecto_propiedad('');
    }
  };

  const sincronizarFormatoPorTipo = (idTipoContrato) => {
    const tipoSeleccionado = tiposContratoList.find(
      (t) => String(t.id_tipo_contrato) === String(idTipoContrato)
    );

    if (!tipoSeleccionado) {
      return;
    }

    const formatoDetectado = resolveContractTemplateId(
      tipoSeleccionado.nombre_tipo_contrato || tipoSeleccionado.nombre_contrato || ''
    );
    setFormato_contrato(formatoDetectado);
  };

  const handleTipoContratoChange = (idTipoContrato) => {
    setId_tipo_contrato(idTipoContrato);
    sincronizarFormatoPorTipo(idTipoContrato);
  };

  const obtenerCamposFaltantesContrato = () => {
    const faltantes = [];

    if (!codigo_contrato.trim()) faltantes.push('Codigo de contrato');
    if (!id_residente) faltantes.push('Residente');
    if (!id_empresa_marca && !empresaSeleccionada?.id_empresa) faltantes.push('Empresa para logotipo en PDF');
    if (!id_tipo_contrato) faltantes.push('Tipo de contrato');
    if (!estado) faltantes.push('Estado inicial');
    if (!proyecto_propiedad.trim()) faltantes.push('Proyecto');
    if (!monto_total) faltantes.push('Precio total del inmueble');
    if (!cuotas_pactadas) faltantes.push('Numero de cuotas');
    if (!dia_pago_limite) faltantes.push('Dia limite de pago mensual');
    if (!fecha_firma) faltantes.push('Fecha de firma legal');
    if (!fecha_compra) faltantes.push('Fecha de compra');

    return faltantes;
  };

  const obtenerNombresServiciosSeleccionados = () => {
    const selected = new Set(serviciosContratoSeleccionados.map((id) => Number(id)));
    return serviciosProyectoList
      .filter((servicio) => selected.has(Number(servicio.id_servicio)))
      .map((servicio) => servicio.nombre_servicio)
      .filter(Boolean);
  };

  const toggleServicioSeleccionado = (idServicio, permitido) => {
    if (!permitido) return;

    setServiciosContratoSeleccionados((prev) => (
      prev.includes(idServicio)
        ? prev.filter((item) => item !== idServicio)
        : [...prev, idServicio]
    ));
  };

  const mostrarAlertaCamposFaltantes = (faltantes) => {
    const htmlLista = faltantes.map((campo) => `<li>${campo}</li>`).join('');
    Swal.fire({
      icon: 'warning',
      title: 'Campos incompletos',
      html: `<p>Debes completar los siguientes campos:</p><ul style="text-align:left; margin:0; padding-left:20px;">${htmlLista}</ul>`
    });
  };

  const addContrato = () => {
    const faltantes = obtenerCamposFaltantesContrato();
    if (faltantes.length > 0) {
      mostrarAlertaCamposFaltantes(faltantes);
      return;
    }

    Axios.post(`${API_URL}/crear`, {
      codigo_contrato, 
      id_residente, 
      id_empresa_marca: id_empresa_marca || empresaSeleccionada?.id_empresa || null,
      id_proyecto: proyectoSeleccionado?.id_proyecto || null,
      id_tipo_contrato,
      formato_contrato,
      monto_total,
      cuotas_pactadas, 
      monto_cuota, 
      dia_pago_limite, 
      fecha_firma,
      fecha_compra: fecha_compra || null,
      fecha_fin: fecha_fin || null,
      estado,
      documento_contrato: documento_contrato || null,
      servicios_contrato: serviciosContratoSeleccionados
    })
    .then(() => {
      const brandingMap = getBrandingCompanyMap();
      brandingMap[codigo_contrato] = id_empresa_marca || empresaSeleccionada?.id_empresa || null;
      setBrandingCompanyMap(brandingMap);

      // Obtener datos del residente para el PDF
      const residente = residentesList.find(r => String(r.id_residente) === String(id_residente));
      
      // Generar PDF automáticamente
      if (residente) {
        try {
          const serviciosClausula = obtenerNombresServiciosSeleccionados();
          const datosParaPdf = {
            formato_contrato,
            modo_marca_empresa,
            empresa_id: empresaParaPdf?.id_empresa || null,
            empresa_nombre: empresaParaPdf?.nombre_empresa || empresaParaPdf?.nombre_corporativo || '',
            empresa_logo: empresaParaPdf?.logo || '',
            codigo_contrato,
            monto_total,
            cuotas_pactadas,
            monto_cuota,
            dia_pago_limite,
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
            servicios_clausula_tercera: serviciosClausula,
            // Medidas
            medida_norte, medida_sur, medida_oriente, medida_poniente,
            // Datos económicos
            enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
            mes_inicio_pagos, anio_inicio_pagos
          };
          
          // Descargar PDF automáticamente
          descargarPdfContrato(datosParaPdf, residente);
        } catch (pdfError) {
          console.error('Error al generar PDF:', pdfError);
        }
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
    const faltantes = obtenerCamposFaltantesContrato();
    if (faltantes.length > 0) {
      mostrarAlertaCamposFaltantes(faltantes);
      return;
    }

    Axios.put(`${API_URL}/actualizar`, {
      id_contrato, codigo_contrato, id_residente, id_empresa_marca: id_empresa_marca || empresaSeleccionada?.id_empresa || null, id_proyecto: proyectoSeleccionado?.id_proyecto || null, id_tipo_contrato, formato_contrato, monto_total,
      cuotas_pactadas, monto_cuota, dia_pago_limite, fecha_firma, fecha_compra: fecha_compra || null, fecha_fin: fecha_fin || null, estado, documento_contrato: documento_contrato || null,
      servicios_contrato: serviciosContratoSeleccionados
    })
    .then(() => {
      const brandingMap = getBrandingCompanyMap();
      brandingMap[codigo_contrato] = id_empresa_marca || empresaSeleccionada?.id_empresa || null;
      setBrandingCompanyMap(brandingMap);

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
      const empresaContrato = obtenerEmpresaPorResidente(val.id_residente);
      const brandingMap = getBrandingCompanyMap();
      const empresaLocal = empresasList.find(e => String(e.id_empresa) === String(brandingMap[val.codigo_contrato])) || null;
      const empresaPersistida = val.id_empresa_marca
        ? {
            id_empresa: val.id_empresa_marca,
            nombre_empresa: val.nombre_empresa_marca,
            logo: val.logo_empresa_marca
          }
        : null;
      const empresaImpresion = empresaPersistida || empresaLocal || empresaMarcaSeleccionada || empresaContrato;
      
      if (!residente) {
        Swal.fire({ icon: "error", title: "Error", text: "No se encontraron datos del residente" });
        return;
      }

      const datosParaPdf = {
        formato_contrato: resolveContractTemplateId(val.formato_contrato || formato_contrato),
        modo_marca_empresa,
        empresa_id: empresaImpresion?.id_empresa || null,
        empresa_nombre: empresaImpresion?.nombre_empresa || empresaImpresion?.nombre_corporativo || '',
        empresa_logo: empresaImpresion?.logo || '',
        codigo_contrato: val.codigo_contrato,
        monto_total: val.monto_total,
        cuotas_pactadas: val.cuotas_pactadas,
        monto_cuota: val.monto_cuota,
        dia_pago_limite: val.dia_pago_limite,
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
        servicios_clausula_tercera: String(val.servicios_contrato_nombres || '')
          .split('||')
          .map((item) => item.trim())
          .filter(Boolean),
        // Medidas
        medida_norte, medida_sur, medida_oriente, medida_poniente,
        // Datos económicos
        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
        mes_inicio_pagos, anio_inicio_pagos
      };
      
      // Generar e imprimir PDF
      imprimirPdfContrato(datosParaPdf, residente);
      
      Swal.fire({ icon: "success", title: "Enviando a Impresora", text: "El PDF se está abriendo para imprimir", timer: 2000, showConfirmButton: false });
    } catch (error) {
      console.error('Error al imprimir contrato:', error);
      Swal.fire({ icon: "error", title: "Error", text: "No se pudo generar el PDF para imprimir" });
    }
  };

  const abrirSelectorWord = (contrato) => {
    setContratoWordTarget(contrato || null);
    if (inputWordRef.current) {
      inputWordRef.current.value = '';
      inputWordRef.current.click();
    }
  };

  const subirWordContrato = async (event) => {
    const archivo = event?.target?.files?.[0] || null;
    const contrato = contratoWordTarget;

    if (!archivo || !contrato?.id_contrato) {
      setContratoWordTarget(null);
      return;
    }

    const formData = new FormData();
    formData.append('archivo', archivo);

    try {
      setSubiendoWordContratoId(contrato.id_contrato);
      await Axios.post(`${API_URL}/subir-word/${contrato.id_contrato}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await cargarCatalogos();
      Swal.fire({ icon: 'success', title: 'Archivo cargado', timer: 1800, showConfirmButton: false });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar el archivo',
        text: error?.response?.data?.message || 'Error al subir el archivo.'
      });
    } finally {
      setSubiendoWordContratoId(null);
      setContratoWordTarget(null);
      if (inputWordRef.current) {
        inputWordRef.current.value = '';
      }
    }
  };

  const descargarWordContrato = async (contrato) => {
    if (!contrato?.id_contrato) return;

    try {
      const response = await Axios.get(`${API_URL}/descargar-word/${contrato.id_contrato}`, {
        responseType: 'blob'
      });

      const contentDisposition = String(response.headers?.['content-disposition'] || '');
      const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const documentoGuardado = String(contrato?.documento_contrato || '').trim();
      const [storedNameRaw, originalNameRaw] = documentoGuardado.split('|');
      const originalName = String(originalNameRaw || '').trim();
      const storedName = String(storedNameRaw || '').trim();
      const fallbackNombre = originalName || storedName || `${contrato.codigo_contrato || 'contrato'}`;
      const nombreArchivo = decodeURIComponent(fileNameMatch?.[1] || fileNameMatch?.[2] || fallbackNombre);

      const blobUrl = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = nombreArchivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo descargar el archivo',
        text: error?.response?.data?.message || 'Error al descargar el archivo del contrato.'
      });
    }
  };

  const abrirEditarModal = (val) => {
    const toDateInput = (dateValue) => (dateValue ? String(dateValue).split('T')[0] : '');

    setId_contrato(val.id_contrato);
    setCodigo_contrato(val.codigo_contrato);
    setId_residente(val.id_residente);
    const residenteContrato = residentesList.find(r => String(r.id_residente) === String(val.id_residente));
    const brandingMap = getBrandingCompanyMap();
    const empresaMarcaLocal = brandingMap[val.codigo_contrato];
    const empresaMarcaAUsar = (
      val.id_empresa_marca
        ? String(val.id_empresa_marca)
        : empresaMarcaLocal
          ? String(empresaMarcaLocal)
          : (residenteContrato?.id_empresa ? String(residenteContrato.id_empresa) : '')
    );
    actualizarEmpresaMarcaYProyecto(empresaMarcaAUsar);
    setId_tipo_contrato(val.id_tipo_contrato);
    setFormato_contrato(resolveContractTemplateId(val.formato_contrato || val.nombre_tipo_contrato || ''));
    setModo_marca_empresa('solo_logo');
    setMonto_total(val.monto_total ?? '');
    setCuotas_pactadas(val.cuotas_pactadas ?? '');
    setMonto_cuota(val.monto_cuota ?? '');
    setDia_pago_limite(val.dia_pago_limite ?? '');
    setFecha_firma(toDateInput(val.fecha_firma));
    setFecha_compra(toDateInput(val.fecha_compra));
    setFecha_fin(toDateInput(val.fecha_fin));
    setEstado(val.estado);
    setDocumento_contrato(val.documento_contrato || '');
    const serviciosIds = String(val.servicios_contrato_ids || '')
      .split(',')
      .map((item) => Number(item))
      .filter((id) => Number.isInteger(id) && id > 0);
    setServiciosContratoSeleccionados(serviciosIds);
    setShowPdfPreview(false);
    setPdfPreviewRefreshKey(0);
    setShowEditModal(true);
  };

  const limpiarCampos = () => {
    setId_contrato(""); setCodigo_contrato(""); setId_residente(""); setId_empresa_marca(""); setId_tipo_contrato("");
    setFormato_contrato('FORMATO_01');
    setModo_marca_empresa('solo_logo');
    setMonto_total(""); setCuotas_pactadas(""); setMonto_cuota(""); setDia_pago_limite("");
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
    setProyecto_propiedad("VILLAS DE TAPACUN");
    setServiciosProyectoList([]);
    setServiciosContratoSeleccionados([]);
    // Medidas
    setMedida_norte("15.00"); setMedida_sur("15.00"); setMedida_oriente("15.00"); setMedida_poniente("15.00");
    // Económicos
    setEnganche("20000"); setInteres_porcentaje("14"); setMora("600");
    setPorcentaje_dominio("80"); setPlazo_meses("60"); setMes_inicio_pagos("7"); setAnio_inicio_pagos("2026");
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

  const ejecutarAccionContrato = (accion, contrato) => {
    if (!accion || !contrato) return;

    if (accion === 'editar') abrirEditarModal(contrato);
    if (accion === 'eliminar') deleteContrato(contrato);
    if (accion === 'pdf') imprimirContrato(contrato);
    if (accion === 'subir') abrirSelectorWord(contrato);
    if (accion === 'descargar') {
      if (!contrato.documento_contrato) {
        Swal.fire({ icon: 'info', title: 'Sin archivo', text: 'Este contrato aun no tiene archivo cargado.' });
        return;
      }
      descargarWordContrato(contrato);
    }
  };

  const handleAccionContratoChange = (event, contrato) => {
    const accion = String(event?.target?.value || '').trim();
    if (!accion) return;
    ejecutarAccionContrato(accion, contrato);
    event.target.value = '';
  };

  return (
    <div className="mt-4 contratos-residentes-view contratos-residentes-ejemplo">
      <input
        ref={inputWordRef}
        type="file"
        style={{ display: 'none' }}
        onChange={subirWordContrato}
      />
      <div className="module-header">
      {/* HEADER */}
      <div className="row g-3 bg-light p-3 rounded shadow-sm align-items-center mx-0">
        <div className="col-md-4"><h3 className="fw-bold m-0 text-primary">📑 CONTRATOS DE RESIDENTES</h3></div>
        <div className="col-md-5">
          <input type="text" placeholder="Buscar por código de contrato o residente..." className="form-control" value={busqueda} onChange={handleBusquedaChange} />
        </div>
        <div className="col-md-1">
          <select
            className="form-select"
            value={itemsPerPage}
            onChange={() => {
              setItemsPerPage(10);
              setCurrentPage(1);
            }}
            disabled
          >
            <option value={10}>10</option>
          </select>
        </div>
        <div className="col-md-2 text-end">
          <button className="btn btn-primary fw-bold w-100" onClick={() => { limpiarCampos(); setShowRegModal(true); }}>➕ APERTURAR CONTRATO</button>
        </div>
      </div>
      </div>

      {/* TABLA CON SCROLL HORIZONTAL */}
      <div className="tabla-contratos-wrapper">
      <table className="table table-striped table-bordered shadow-sm align-middle tabla-contratos" style={{ marginBottom: '0' }}>
        <thead className="table-dark">
          <tr>
            <th>CÓDIGO</th>
            <th>RESIDENTE</th>
            <th>IDENTIFICACIÓN</th>
            <th>TIPO CONTRATO</th>
            <th>EMPRESA MEMBRETE</th>
            <th>MONTO TOTAL</th>
            <th>CUOTAS</th>
            <th>VALOR CUOTA</th>
            <th>DÍA LÍMITE</th>
            <th>FECHA FIRMA</th>
            <th>FECHA COMPRA</th>
            <th>FECHA FIN</th>
            <th>ESTADO</th>
            <th className="sticky-actions-col">ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length > 0 ? (
            contratosPaginados.map(val => (
              <tr key={val.id_contrato}>
                <td className="fw-bold text-primary">{val.codigo_contrato}</td>
                <td>{val.nombre_residente?.toUpperCase()}</td>
                <td><span className="fw-bold text-primary">{val.numero_identificacion || 'Sin asignar'}</span></td>
                <td><span className="badge bg-info text-dark">{val.nombre_tipo_contrato}</span></td>
                <td><span className="fw-semibold text-secondary">{val.nombre_empresa_marca || 'Sin definir'}</span></td>
                <td className="fw-bold">Q {parseFloat(val.monto_total).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td className="text-center">{val.cuotas_pactadas}</td>
                <td className="text-success fw-bold">Q {parseFloat(val.monto_cuota).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                <td className="text-center fw-bold text-danger">Día {val.dia_pago_limite}</td>
                <td className="text-center text-muted" style={{fontSize:'0.85rem'}}>{val.fecha_firma ? new Date(val.fecha_firma).toLocaleDateString('es-GT') : '-'}</td>
                <td className="text-center text-muted" style={{fontSize:'0.85rem'}}>{val.fecha_compra ? new Date(val.fecha_compra).toLocaleDateString('es-GT') : <span className="text-info fw-bold">-</span>}</td>
                <td className="text-center text-muted" style={{fontSize:'0.85rem'}}>{val.fecha_fin ? new Date(val.fecha_fin).toLocaleDateString('es-GT') : <span className="text-warning fw-bold">Indefinida</span>}</td>
                <td>
                  <span className={`badge ${val.estado === 'activo' ? 'bg-success' : val.estado === 'finalizado' ? 'bg-secondary' : 'bg-warning'}`}>
                    {val.estado.toUpperCase()}
                  </span>
                </td>
                <td className="sticky-actions-col actions-buttons-cell">
                  <select
                    className="form-select form-select-sm fw-bold"
                    defaultValue=""
                    onChange={(event) => handleAccionContratoChange(event, val)}
                  >
                    <option value="">ACCIONES</option>
                    <option value="editar">Editar contrato</option>
                    <option value="eliminar">Eliminar contrato</option>
                    <option value="pdf">Descargar PDF</option>
                    <option value="subir" disabled={subiendoWordContratoId === val.id_contrato}>
                      {subiendoWordContratoId === val.id_contrato
                        ? 'Subiendo archivo...'
                        : (val.documento_contrato ? 'Reemplazar archivo' : 'Subir archivo')}
                    </option>
                    <option value="descargar">
                      Descargar archivo
                    </option>
                  </select>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="14" className="text-center text-muted py-3">No hay contratos registrados.</td>
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
        itemLabel="contratos"
        className="paginacion-contratos"
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
                  <label className="form-label fw-bold">Empresa para logotipo en PDF:</label>
                  <select className="form-select" value={id_empresa_marca} onChange={e => actualizarEmpresaMarcaYProyecto(e.target.value)}>
                    <option value="">-- Seleccione empresa para membrete --</option>
                    {empresasList.map((empresa) => (
                      <option key={empresa.id_empresa} value={empresa.id_empresa}>
                        {empresa.nombre_empresa || empresa.nombre_corporativo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Vista de empresa y logo aplicado:</label>
                  {empresaParaPdf ? (
                    <div className="d-flex align-items-center border rounded p-2 bg-light">
                      {empresaParaPdf.logo ? (
                        <img
                          src={empresaParaPdf.logo}
                          alt="Logo empresa"
                          style={{ width: '58px', height: '40px', objectFit: 'contain', borderRadius: '4px', backgroundColor: '#fff', marginRight: '10px' }}
                        />
                      ) : (
                        <div style={{ width: '58px', height: '40px', backgroundColor: '#e9ecef', borderRadius: '4px', marginRight: '10px' }} />
                      )}
                      <div>
                        <div className="fw-bold text-primary">{empresaParaPdf.nombre_empresa || empresaParaPdf.nombre_corporativo}</div>
                        <small className="text-muted">Este logo se usará en el contrato y PDF.</small>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted small border rounded p-2 bg-light">Seleccione una empresa para aplicar su logotipo al PDF.</div>
                  )}
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Código de Contrato <small className="text-muted fw-normal">(auto-generado)</small>:</label>
                  <input type="text" className="form-control" value={codigo_contrato} onChange={e => setCodigo_contrato(e.target.value)} placeholder="Seleccione un residente para generar" />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Tipo de Contrato:</label>
                  <select className="form-select" value={id_tipo_contrato} onChange={e => handleTipoContratoChange(e.target.value)}>
                    <option value="">-- Seleccione Tipo --</option>
                    {tiposContratoList.map(t => <option key={t.id_tipo_contrato} value={t.id_tipo_contrato}>{t.nombre_tipo_contrato}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Modelo de Contrato (texto legal):</label>
                  <select className="form-select" value={formato_contrato} onChange={e => setFormato_contrato(e.target.value)}>
                    {CONTRACT_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                  </select>
                  <small className="text-muted">Seleccione el modelo legal que desea usar. El logo se define con la empresa/proyecto seleccionado.</small>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Marca de Empresa en PDF:</label>
                  <select className="form-select" value={modo_marca_empresa} onChange={e => setModo_marca_empresa(e.target.value)}>
                    {BRANDING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <small className="text-muted">Elige cualquiera de las 5 opciones de presentación para este contrato.</small>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Estado Inicial:</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="">-- Seleccione --</option>
                    <option value="activo">Activo (Vigente)</option>
                    <option value="pendiente">Pendiente de firmas</option>
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
                  <select className="form-control" value={proyecto_propiedad} onChange={e => setProyecto_propiedad(e.target.value)}>
                    <option value="">-- Seleccionar Proyecto --</option>
                    {proyectosDisponibles.map((proyecto) => (
                      <option key={proyecto.id_proyecto} value={getProyectoNombre(proyecto)}>
                        {getProyectoNombre(proyecto)}
                      </option>
                    ))}
                  </select>
                  <small className="text-muted">Se muestran solo proyectos relacionados con la empresa seleccionada desde la tabla de proyectos.</small>
                </div>
                <div className="col-12 mb-3">
                  <label className="form-label fw-bold">Tipos de servicios disponibles para agregar:</label>
                  {!proyectoSeleccionado ? (
                    <div className="text-muted small border rounded p-2 bg-light">
                      Seleccione un proyecto para ver los servicios disponibles.
                    </div>
                  ) : serviciosCatalogoList.length === 0 ? (
                    <div className="text-muted small border rounded p-2 bg-light">
                      No hay servicios registrados en el catálogo.
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-3 p-3 bg-light">
                        <div className="row g-2">
                          {serviciosProyectoList.map((servicio) => {
                            const idServicio = Number(servicio.id_servicio);
                            const seleccionado = serviciosContratoSeleccionados.includes(idServicio);

                            return (
                              <div className="col-md-6" key={idServicio}>
                                <div
                                  className={`d-flex align-items-center justify-content-between border rounded-2 p-2 ${seleccionado ? 'bg-success bg-opacity-10 border-success' : 'bg-white'} ${servicio.asignado_al_proyecto ? '' : 'opacity-50'}`}
                                  style={{ cursor: servicio.asignado_al_proyecto ? 'pointer' : 'not-allowed' }}
                                  onClick={() => toggleServicioSeleccionado(idServicio, servicio.asignado_al_proyecto)}
                                >
                                  <div className="d-flex align-items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="form-check-input m-0"
                                      checked={seleccionado}
                                      disabled={!servicio.asignado_al_proyecto}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={() => toggleServicioSeleccionado(idServicio, servicio.asignado_al_proyecto)}
                                    />
                                    <div>
                                      <div className="fw-bold">{servicio.nombre_servicio}</div>
                                      <small className="text-muted">
                                        {servicio.asignado_al_proyecto ? 'Asignado al proyecto seleccionado' : 'No disponible para este proyecto'}
                                      </small>
                                    </div>
                                  </div>
                                  <span className="badge bg-primary">{formatMoney(servicio.costo_servicio)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <small className="text-muted d-block mt-1">Marque los servicios que desea incluir. La cláusula tercera solo mostrará los servicios seleccionados.</small>

                      {serviciosContratoSeleccionados.length > 0 && (
                        <div className="alert alert-light border mt-2 mb-0 py-2">
                          <div className="fw-bold mb-1">Resumen de amenidades seleccionadas</div>
                          {serviciosProyectoList
                            .filter((servicio) => serviciosContratoSeleccionados.includes(Number(servicio.id_servicio)))
                            .map((servicio) => (
                              <div key={servicio.id_servicio} className="d-flex justify-content-between small">
                                <span>{servicio.nombre_servicio}</span>
                                <span>{formatMoney(servicio.costo_servicio)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
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
                  <input type="number" className="form-control" value={cuotas_pactadas} onChange={e => setCuotas_pactadas(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Monto de Cuota (Auto):</label>
                  <input type="text" className="form-control bg-light text-success fw-bold" value={monto_cuota} readOnly />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Mora por mes vencido (Q):</label>
                  <input type="number" className="form-control" value={mora} onChange={e => setMora(e.target.value)} placeholder="600" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Día Límite de Pago mensual:</label>
                  <input type="number" min="1" max="31" className="form-control" value={dia_pago_limite} onChange={e => setDia_pago_limite(e.target.value)} placeholder="Ej: 5" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Plazo Total (meses):</label>
                  <input type="number" className="form-control" value={plazo_meses} onChange={e => setPlazo_meses(e.target.value)} placeholder="60" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">% Reserva Dominio:</label>
                  <input type="number" className="form-control" value={porcentaje_dominio} onChange={e => setPorcentaje_dominio(e.target.value)} placeholder="80" />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Mes Inicio de Pagos:</label>
                  <select className="form-select" value={mes_inicio_pagos} onChange={e => setMes_inicio_pagos(e.target.value)}>
                    {['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Año Inicio de Pagos:</label>
                  <input type="number" className="form-control" value={anio_inicio_pagos} onChange={e => setAnio_inicio_pagos(e.target.value)} />
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
                  {showPdfPreview && (
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm w-100 mb-3"
                      onClick={() => setPdfPreviewRefreshKey((prev) => prev + 1)}
                    >
                      🔄 Actualizar Vista Previa
                    </button>
                  )}
                </div>

                {/* VISTA PREVIA DEL PDF */}
                {showPdfPreview && (
                  <div className="col-12">
                    <PdfPreview 
                      datosContrato={{
                        formato_contrato,
                        modo_marca_empresa,
                        mostrar_nombre_empresa: modo_marca_empresa === 'logo_y_nombre',
                        empresa_id: empresaParaPdf?.id_empresa || null,
                        empresa_nombre: empresaParaPdf?.nombre_empresa || empresaParaPdf?.nombre_corporativo || '',
                        empresa_logo: empresaParaPdf?.logo || '',
                        codigo_contrato, monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite,
                        dia_firma: fecha_firma ? new Date(fecha_firma).getDate() : '',
                        mes_firma: fecha_firma ? (new Date(fecha_firma).getMonth() + 1) : '',
                        anio_firma: fecha_firma ? new Date(fecha_firma).getFullYear() : '',
                        nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
                        dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
                        registro_numero, registro_folio, registro_libro,
                        numero_finca, folio_propiedad, libro_propiedad, numero_lote,
                        manzana_propiedad, area_propiedad, proyecto_propiedad,
                        servicios_clausula_tercera: obtenerNombresServiciosSeleccionados(),
                        medida_norte, medida_sur, medida_oriente, medida_poniente,
                        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
                        mes_inicio_pagos, anio_inicio_pagos
                      }}
                      datosResidente={residentesList.find(r => String(r.id_residente) === String(id_residente)) || {}}
                      mostrar={true}
                      refreshKey={pdfPreviewRefreshKey}
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
                  <select className="form-select" value={id_residente} onChange={e => seleccionarResidenteContrato(e.target.value)}>
                    {residentesList.map(r => <option key={r.id_residente} value={r.id_residente}>{r.nombre}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Empresa para logotipo en PDF:</label>
                  <select className="form-select" value={id_empresa_marca} onChange={e => actualizarEmpresaMarcaYProyecto(e.target.value)}>
                    <option value="">-- Seleccione empresa para membrete --</option>
                    {empresasList.map((empresa) => (
                      <option key={empresa.id_empresa} value={empresa.id_empresa}>
                        {empresa.nombre_empresa || empresa.nombre_corporativo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Vista de empresa y logo aplicado:</label>
                  {empresaParaPdf ? (
                    <div className="d-flex align-items-center border rounded p-2 bg-light">
                      {empresaParaPdf.logo ? (
                        <img
                          src={empresaParaPdf.logo}
                          alt="Logo empresa"
                          style={{ width: '58px', height: '40px', objectFit: 'contain', borderRadius: '4px', backgroundColor: '#fff', marginRight: '10px' }}
                        />
                      ) : (
                        <div style={{ width: '58px', height: '40px', backgroundColor: '#e9ecef', borderRadius: '4px', marginRight: '10px' }} />
                      )}
                      <div>
                        <div className="fw-bold text-primary">{empresaParaPdf.nombre_empresa || empresaParaPdf.nombre_corporativo}</div>
                        <small className="text-muted">Este logo se usará en el contrato y PDF.</small>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted small border rounded p-2 bg-light">Seleccione una empresa para aplicar su logotipo al PDF.</div>
                  )}
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Tipo de Contrato:</label>
                  <select className="form-select" value={id_tipo_contrato} onChange={e => handleTipoContratoChange(e.target.value)}>
                    {tiposContratoList.map(t => <option key={t.id_tipo_contrato} value={t.id_tipo_contrato}>{t.nombre_tipo_contrato}</option>)}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Modelo de Contrato (texto legal):</label>
                  <select className="form-select" value={formato_contrato} onChange={e => setFormato_contrato(e.target.value)}>
                    {CONTRACT_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                  </select>
                  <small className="text-muted">Puede cambiar el modelo legal aquí; el logotipo depende de la empresa/proyecto seleccionado.</small>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Marca de Empresa en PDF:</label>
                  <select className="form-select" value={modo_marca_empresa} onChange={e => setModo_marca_empresa(e.target.value)}>
                    {BRANDING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">Estado Legal:</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
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
                  <select className="form-control" value={proyecto_propiedad} onChange={e => setProyecto_propiedad(e.target.value)}>
                    <option value="">-- Seleccionar Proyecto --</option>
                    {proyectosDisponibles.map((proyecto) => (
                      <option key={proyecto.id_proyecto} value={getProyectoNombre(proyecto)}>
                        {getProyectoNombre(proyecto)}
                      </option>
                    ))}
                  </select>
                  <small className="text-muted">Se muestran solo proyectos relacionados con la empresa seleccionada desde la tabla de proyectos.</small>
                </div>

                <div className="col-12 mb-3">
                  <label className="form-label fw-bold">Tipos de servicios disponibles para agregar:</label>
                  {!proyectoSeleccionado ? (
                    <div className="text-muted small border rounded p-2 bg-light">
                      Seleccione un proyecto para ver los servicios disponibles.
                    </div>
                  ) : serviciosCatalogoList.length === 0 ? (
                    <div className="text-muted small border rounded p-2 bg-light">
                      No hay servicios registrados en el catálogo.
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-3 p-3 bg-light">
                        <div className="row g-2">
                          {serviciosProyectoList.map((servicio) => {
                            const idServicio = Number(servicio.id_servicio);
                            const seleccionado = serviciosContratoSeleccionados.includes(idServicio);

                            return (
                              <div className="col-md-6" key={idServicio}>
                                <div
                                  className={`d-flex align-items-center justify-content-between border rounded-2 p-2 ${seleccionado ? 'bg-success bg-opacity-10 border-success' : 'bg-white'} ${servicio.asignado_al_proyecto ? '' : 'opacity-50'}`}
                                  style={{ cursor: servicio.asignado_al_proyecto ? 'pointer' : 'not-allowed' }}
                                  onClick={() => toggleServicioSeleccionado(idServicio, servicio.asignado_al_proyecto)}
                                >
                                  <div className="d-flex align-items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="form-check-input m-0"
                                      checked={seleccionado}
                                      disabled={!servicio.asignado_al_proyecto}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={() => toggleServicioSeleccionado(idServicio, servicio.asignado_al_proyecto)}
                                    />
                                    <div>
                                      <div className="fw-bold">{servicio.nombre_servicio}</div>
                                      <small className="text-muted">
                                        {servicio.asignado_al_proyecto ? 'Asignado al proyecto seleccionado' : 'No disponible para este proyecto'}
                                      </small>
                                    </div>
                                  </div>
                                  <span className="badge bg-primary">{formatMoney(servicio.costo_servicio)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <small className="text-muted d-block mt-1">Marque los servicios que desea incluir. La cláusula tercera solo mostrará los servicios seleccionados.</small>

                      {serviciosContratoSeleccionados.length > 0 && (
                        <div className="alert alert-light border mt-2 mb-0 py-2">
                          <div className="fw-bold mb-1">Resumen de amenidades seleccionadas</div>
                          {serviciosProyectoList
                            .filter((servicio) => serviciosContratoSeleccionados.includes(Number(servicio.id_servicio)))
                            .map((servicio) => (
                              <div key={servicio.id_servicio} className="d-flex justify-content-between small">
                                <span>{servicio.nombre_servicio}</span>
                                <span>{formatMoney(servicio.costo_servicio)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
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
                  <label className="form-label fw-bold">Precio Total (Q):</label>
                  <input type="number" className="form-control" value={monto_total} onChange={e => setMonto_total(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Enganche (Q):</label>
                  <input type="number" className="form-control" value={enganche} onChange={e => setEnganche(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Interés Anual (%):</label>
                  <input type="number" className="form-control" value={interes_porcentaje} onChange={e => setInteres_porcentaje(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Cuotas:</label>
                  <input type="number" className="form-control" value={cuotas_pactadas} onChange={e => setCuotas_pactadas(e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Monto de Cuota (Auto):</label>
                  <input type="text" className="form-control bg-light text-success fw-bold" value={monto_cuota} readOnly />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label fw-bold">Mora (Q):</label>
                  <input type="number" className="form-control" value={mora} onChange={e => setMora(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Día Pago:</label>
                  <input type="number" min="1" max="31" className="form-control" value={dia_pago_limite} onChange={e => setDia_pago_limite(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Plazo (meses):</label>
                  <input type="number" className="form-control" value={plazo_meses} onChange={e => setPlazo_meses(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">% Reserva Dominio:</label>
                  <input type="number" className="form-control" value={porcentaje_dominio} onChange={e => setPorcentaje_dominio(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Mes Inicio Pagos:</label>
                  <select className="form-select" value={mes_inicio_pagos} onChange={e => setMes_inicio_pagos(e.target.value)}>
                    {['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Año Inicio Pagos:</label>
                  <input type="number" className="form-control" value={anio_inicio_pagos} onChange={e => setAnio_inicio_pagos(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha Firma:</label>
                  <input type="date" className="form-control" value={fecha_firma} onChange={e => setFecha_firma(e.target.value)} />
                </div>
                <div className="col-md-3 mb-3">
                  <label className="form-label fw-bold">Fecha Compra:</label>
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
                  {showPdfPreview && (
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm w-100 mb-3"
                      onClick={() => setPdfPreviewRefreshKey((prev) => prev + 1)}
                    >
                      🔄 Actualizar Vista Previa
                    </button>
                  )}
                </div>

                {showPdfPreview && (
                  <div className="col-12">
                    <PdfPreview 
                      datosContrato={{
                        formato_contrato,
                        modo_marca_empresa,
                        mostrar_nombre_empresa: modo_marca_empresa === 'logo_y_nombre',
                        empresa_id: empresaParaPdf?.id_empresa || null,
                        empresa_nombre: empresaParaPdf?.nombre_empresa || empresaParaPdf?.nombre_corporativo || '',
                        empresa_logo: empresaParaPdf?.logo || '',
                        codigo_contrato, monto_total, cuotas_pactadas, monto_cuota, dia_pago_limite,
                        dia_firma: fecha_firma ? new Date(fecha_firma).getDate() : '',
                        mes_firma: fecha_firma ? (new Date(fecha_firma).getMonth() + 1) : '',
                        anio_firma: fecha_firma ? new Date(fecha_firma).getFullYear() : '',
                        nombre_vendedor, edad_vendedor, estado_civil_vendedor, profesion_vendedor,
                        dpi_vendedor, empresa_vendedor, notario, fecha_nombramiento,
                        registro_numero, registro_folio, registro_libro,
                        numero_finca, folio_propiedad, libro_propiedad, numero_lote,
                        manzana_propiedad, area_propiedad, proyecto_propiedad,
                        servicios_clausula_tercera: obtenerNombresServiciosSeleccionados(),
                        medida_norte, medida_sur, medida_oriente, medida_poniente,
                        enganche, interes_porcentaje, mora, porcentaje_dominio, plazo_meses,
                        mes_inicio_pagos, anio_inicio_pagos
                      }}
                      datosResidente={residentesList.find(r => String(r.id_residente) === String(id_residente)) || {}}
                      mostrar={true}
                      refreshKey={pdfPreviewRefreshKey}
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