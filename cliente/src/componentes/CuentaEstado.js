import React, { useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { API_BASE_URL } from '../config';
import { generarTablaAmortizacion } from '../utils/amortizacion';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatoMoneda = (value) => {
  const numero = toNumber(value, 0);
  return `Q ${Math.round(numero).toLocaleString('es-GT', { maximumFractionDigits: 0 })}`;
};

const round2 = (value) => Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;

const construirSimulacionLocal = ({
  capital_restante,
  interes_anual,
  cuotas_totales,
  cuotas_pagadas,
  cuota_objetivo
}) => {
  const capitalRestante = Math.round(Math.max(toNumber(capital_restante, 0), 0));
  const interes = Math.max(toNumber(interes_anual, 0), 0);
  const cuotasTotalesNumero = Math.max(parseInt(cuotas_totales || 0, 10), 0);
  const objetivo = Math.max(parseInt(cuota_objetivo || 0, 10), 0);
  const cuotasPagadasNumero = objetivo > 0
    ? Math.max(objetivo - 1, 0)
    : Math.max(parseInt(cuotas_pagadas || 0, 10), 0);
  const mesesPendientes = Math.max(cuotasTotalesNumero - cuotasPagadasNumero, 0);
  const tabla = generarTablaAmortizacion(
    capitalRestante,
    interes,
    mesesPendientes,
    cuotasPagadasNumero
  );
  const interesTotal = round2(tabla.reduce((sum, fila) => sum + toNumber(fila.interes_mes, 0), 0));
  const totalPagos = round2(tabla.reduce((sum, fila) => sum + toNumber(fila.cuota_estimada, 0), 0));

  return {
    cuota_objetivo: objetivo || null,
    cuotas_totales: cuotasTotalesNumero,
    cuotas_pagadas: cuotasPagadasNumero,
    meses_pendientes: mesesPendientes,
    capital_restante: capitalRestante,
    interes_anual: round2(interes),
    tasa_mensual: round2(interes / 12),
    cuota_mensual: tabla[0]?.cuota_estimada || 0,
    interes_por_mes: tabla[0]?.interes_mes || 0,
    interes_total_pendiente: interesTotal,
    total_liquidacion: totalPagos,
    tabla_amortizacion: tabla
  };
};

const CuentaEstado = () => {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [generandoPlan, setGenerandoPlan] = useState(false);
  const [contrato, setContrato] = useState(null);
  const [simulacion, setSimulacion] = useState(null);

  const [capitalRestante, setCapitalRestante] = useState('');
  const [interesAnual, setInteresAnual] = useState('');
  const [cuotasTotales, setCuotasTotales] = useState('');
  const [cuotasPagadas, setCuotasPagadas] = useState('');
  const [cuotaObjetivo, setCuotaObjetivo] = useState('');
  const [engancheRegistrado, setEngancheRegistrado] = useState('');
  const [enganchePagado, setEnganchePagado] = useState('');
  const [precioTotal, setPrecioTotal] = useState('');

  const showToast = (message, icon = 'info') => {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon,
      title: message,
      showConfirmButton: false,
      timer: 2600,
      timerProgressBar: true
    });
  };

  const limpiar = () => {
    setBusqueda('');
    setResultados([]);
    setContrato(null);
    setSimulacion(null);
    setCapitalRestante('');
    setInteresAnual('');
    setCuotasTotales('');
    setCuotasPagadas('');
    setCuotaObjetivo('');
    setEngancheRegistrado('');
    setEnganchePagado('');
    setPrecioTotal('');
  };

  const nuevaSimulacion = () => {
    setBusqueda('');
    setResultados([]);
    setContrato(null);
    setSimulacion(null);
    setPrecioTotal('100000');
    setEngancheRegistrado('0');
    setEnganchePagado('0');
    setCapitalRestante('100000');
    setInteresAnual('15');
    setCuotasTotales('96');
    setCuotasPagadas('0');
    setCuotaObjetivo('');
  };

  const buscarResidente = async () => {
    if (!busqueda.trim()) {
      showToast('Ingresa nombre, DPI, clave o contrato para buscar.', 'warning');
      return;
    }

    setCargando(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/cuenta_estado/buscar-residente`, {
        params: { criterio: busqueda.trim() }
      });
      setResultados(Array.isArray(data) ? data : []);
      setContrato(null);
      setSimulacion(null);
    } catch (error) {
      setResultados([]);
      showToast(String(error?.response?.data || 'No se pudo buscar el residente.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  const cargarContrato = async (idContrato) => {
    setCargando(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/cuenta_estado/detalle-contrato/${idContrato}`);
      const contratoApi = data?.contrato || null;

      if (!contratoApi) {
        showToast('No se pudo obtener el contrato seleccionado.', 'error');
        return;
      }

      setContrato(contratoApi);
      setSimulacion(construirSimulacionLocal({
        capital_restante: contratoApi.capital_restante,
        interes_anual: contratoApi.interes_anual,
        cuotas_totales: contratoApi.cuotas_totales,
        cuotas_pagadas: contratoApi.cuotas_pagadas,
        cuota_objetivo: null
      }));
      setResultados([]);

      setCapitalRestante(String(toNumber(contratoApi.capital_restante, 0)));
      setInteresAnual(String(toNumber(contratoApi.interes_anual, 0)));
      setCuotasTotales(String(toNumber(contratoApi.cuotas_totales, 0)));
      setCuotasPagadas(String(toNumber(contratoApi.cuotas_pagadas, 0)));
      setEngancheRegistrado(String(toNumber(contratoApi.enganche_registrado, 0)));
      setEnganchePagado(String(toNumber(contratoApi.enganche_pagado, 0)));
      setPrecioTotal(String(toNumber(contratoApi.precio_total_terreno, 0)));
      setCuotaObjetivo('');
    } catch (error) {
      showToast(String(error?.response?.data || 'No se pudo cargar el detalle del contrato.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  const calcular = async () => {
    const payload = {
      capital_restante: toNumber(capitalRestante, 0),
      interes_anual: toNumber(interesAnual, 0),
      cuotas_totales: parseInt(cuotasTotales || '0', 10),
      cuotas_pagadas: parseInt(cuotasPagadas || '0', 10),
      cuota_objetivo: cuotaObjetivo ? parseInt(cuotaObjetivo, 10) : null
    };

    if (payload.capital_restante <= 0) {
      showToast('El capital restante debe ser mayor a 0.', 'warning');
      return;
    }

    if (payload.cuotas_totales <= 0) {
      showToast('Las cuotas totales deben ser mayores a 0.', 'warning');
      return;
    }

    setSimulacion(construirSimulacionLocal(payload));
  };

  const resumenEjemplo = useMemo(() => {
    const precio = toNumber(precioTotal, 0);
    const enganche = toNumber(engancheRegistrado, 0);
    const capital = Math.max(precio - enganche, 0);
    return { precio, enganche, capital };
  }, [precioTotal, engancheRegistrado]);

  const irACajaConPrefill = (payload) => {
    if (!contrato?.id_contrato || !contrato?.codigo_contrato) {
      showToast('No hay contrato seleccionado para enviar a Caja.', 'warning');
      return;
    }

    const prefill = {
      source: 'cuenta_estado_capital',
      createdAt: new Date().toISOString(),
      id_contrato: contrato.id_contrato,
      codigo_contrato: contrato.codigo_contrato,
      id_residente: contrato.id_residente || null,
      ...payload
    };

    localStorage.setItem('prefill_caja_desde_cuenta_estado', JSON.stringify(prefill));
    window.location.href = '/caja';
  };

  const enviarCuotaACaja = (row) => {
    if (!row) return;

    if (toNumber(contrato?.enganche_pendiente, 0) > 0.01) {
      showToast('Debe pagar primero la cuota inicial 0 antes de cobrar cuotas del plan.', 'warning');
      return;
    }

    irACajaConPrefill({
      tipo: 'cuota',
      cuota_objetivo: Number(row.numero_cuota || 0),
      monto_capital: toNumber(row.capital_cuota, 0),
      monto_interes: toNumber(row.interes_mes, 0),
      monto_total: toNumber(row.cuota_estimada, 0)
    });
  };

  const enviarLiquidacionACaja = () => {
    if (!simulacion) {
      showToast('Calcula primero la liquidacion.', 'warning');
      return;
    }

    irACajaConPrefill({
      tipo: 'liquidacion',
      cuota_objetivo: cuotaObjetivo ? parseInt(cuotaObjetivo, 10) : null,
      monto_capital: toNumber(simulacion.capital_restante, 0),
      monto_interes: toNumber(simulacion.interes_total_pendiente, 0),
      monto_total: toNumber(simulacion.total_liquidacion, 0)
    });
  };

  const tablaAmortizacionPendiente = useMemo(() => {
    return Array.isArray(simulacion?.tabla_amortizacion)
      ? simulacion.tabla_amortizacion
      : [];
  }, [simulacion]);

  const generarCuotasPactadasEnCaja = async () => {
    if (!contrato?.id_contrato || !simulacion || !tablaAmortizacionPendiente.length) {
      showToast('Calcula primero la tabla de cuotas pendientes.', 'warning');
      return;
    }

    const totalCuotasPlan = tablaAmortizacionPendiente.length;
    const confirmacion = await Swal.fire({
      icon: 'question',
      title: 'Generar cuotas pactadas en Caja',
      html: `Se creara un plan persistente de <strong>${totalCuotasPlan} cuotas</strong>, nombradas desde <strong>Cuota 1</strong> hasta <strong>Cuota ${totalCuotasPlan}</strong>, cada una con su mes y año contractual.<br><br>La <strong>Cuota 0</strong> continuara reservada exclusivamente para el enganche.<br><br>Capital del plan: <strong>${formatoMoneda(simulacion.capital_restante)}</strong>. El interes proyectado de ${formatoMoneda(simulacion.interes_total_pendiente)} seguira visible en esta simulacion y no se sumara al saldo de capital en Caja.`,
      showCancelButton: true,
      confirmButtonText: 'Generar plan',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmacion.isConfirmed) return;

    setGenerandoPlan(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/cuenta_estado/generar-plan-caja`, {
        id_contrato: contrato.id_contrato,
        capital_restante: toNumber(simulacion.capital_restante, 0),
        cuotas_pactadas: totalCuotasPlan
      });

      irACajaConPrefill({
        tipo: 'cuota',
        id_convenio: Number(data?.id_convenio || 0),
        cuota_objetivo: 1,
        monto_capital: toNumber(data?.monto_cuota, tablaAmortizacionPendiente[0]?.capital_cuota),
        monto_interes: 0,
        monto_total: toNumber(data?.monto_cuota, tablaAmortizacionPendiente[0]?.capital_cuota)
      });
    } catch (error) {
      const message = error?.response?.data?.message || error?.response?.data || 'No se pudo generar el plan de cuotas en Caja.';
      await Swal.fire({ icon: 'error', title: 'Plan no generado', text: String(message) });
    } finally {
      setGenerandoPlan(false);
    }
  };

  const exportarTablaPDF = () => {
    if (!simulacion || !tablaAmortizacionPendiente.length) {
      showToast('Primero calcula la liquidacion para exportar.', 'warning');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'letter');
    const pageWidth = doc.internal.pageSize.getWidth();
    const codigoContrato = String(contrato?.codigo_contrato || 'SIN-CODIGO');
    const nombreResidente = String(contrato?.nombre_residente || 'SIN-RESIDENTE');
    const fecha = new Date().toLocaleDateString('es-GT');

    doc.setFontSize(14);
    doc.setTextColor(23, 42, 69);
    doc.text('Liquidacion a Capital - Tabla de Amortizacion Pendiente', 14, 14);
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(`Contrato: ${codigoContrato}`, 14, 20);
    doc.text(`Residente: ${nombreResidente}`, 14, 25);
    doc.text(`Fecha: ${fecha}`, pageWidth - 14, 20, { align: 'right' });

    autoTable(doc, {
      startY: 30,
      head: [[
        'Cuota',
        'Saldo Inicial',
        'Capital Cuota',
        'Interes Mes',
        'Cuota Estimada',
        'Saldo Final',
        'Interes Acumulado'
      ]],
      body: tablaAmortizacionPendiente.map((row) => ([
        String(row.numero_cuota),
        formatoMoneda(row.saldo_inicial),
        formatoMoneda(row.capital_cuota),
        formatoMoneda(row.interes_mes),
        formatoMoneda(row.cuota_estimada),
        formatoMoneda(row.saldo_final),
        formatoMoneda(row.interes_acumulado)
      ])),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [36, 99, 235] },
      margin: { left: 12, right: 12 }
    });

    const lastY = (doc.lastAutoTable?.finalY || 45) + 8;
    doc.setFontSize(10);
    doc.setTextColor(18, 84, 44);
    doc.text(`Total liquidacion estimada: ${formatoMoneda(simulacion.total_liquidacion)}`, 14, lastY);
    doc.text(`Interes total pendiente: ${formatoMoneda(simulacion.interes_total_pendiente)}`, 14, lastY + 5);

    doc.save(`Liquidacion_${codigoContrato}.pdf`);
  };

  const exportarTablaExcel = () => {
    if (!simulacion || !tablaAmortizacionPendiente.length) {
      showToast('Primero calcula la liquidacion para exportar.', 'warning');
      return;
    }

    const encabezados = [
      'Contrato',
      'Residente',
      'Cuota',
      'Saldo Inicial',
      'Capital Cuota',
      'Interes Mes',
      'Cuota Estimada',
      'Saldo Final',
      'Interes Acumulado'
    ];

    const codigoContrato = String(contrato?.codigo_contrato || 'SIN-CODIGO');
    const nombreResidente = String(contrato?.nombre_residente || 'SIN-RESIDENTE');

    const filas = tablaAmortizacionPendiente.map((row) => ([
      codigoContrato,
      nombreResidente,
      row.numero_cuota,
      row.saldo_inicial,
      row.capital_cuota,
      row.interes_mes,
      row.cuota_estimada,
      row.saldo_final,
      row.interes_acumulado
    ]));

    const csvContent = [encabezados, ...filas]
      .map((linea) => linea.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Liquidacion_${codigoContrato}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container-fluid p-4">
      <div className="card shadow-sm">
        <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
          <h4 className="mb-0">Liquidacion a Capital con Interes Pendiente</h4>
          <span className="badge bg-light text-dark">Modulo de simulacion financiera</span>
        </div>

        <div className="card-body">
          <div className="row g-2 align-items-center mb-3">
            <div className="col-md-8">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por nombre, DPI, clave o codigo contrato"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarResidente()}
              />
            </div>
            <div className="col-md-2 d-grid">
              <button type="button" className="btn btn-primary" onClick={buscarResidente} disabled={cargando}>
                {cargando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            <div className="col-md-2 d-grid">
              <button type="button" className="btn btn-outline-success" onClick={nuevaSimulacion}>
                Nueva simulacion
              </button>
            </div>
          </div>

          <div className="d-flex justify-content-end mb-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={limpiar}>Limpiar todo</button>
          </div>

          {resultados.length > 0 && (
            <div className="mb-4">
              <div className="list-group">
                {resultados.map((item) => (
                  <button
                    type="button"
                    key={item.id_contrato}
                    className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    onClick={() => cargarContrato(item.id_contrato)}
                  >
                    <span>
                      <strong>{item.nombre}</strong> | Contrato: {item.codigo_contrato} | DPI: {item.dpi}
                    </span>
                    <span className="badge bg-primary">Seleccionar</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(contrato || precioTotal || capitalRestante) && (
            <>
              {contrato && <div className="row g-3">
                <div className="col-md-6">
                  <div className="card border-primary h-100">
                    <div className="card-header bg-primary text-white">Datos base del contrato</div>
                    <div className="card-body">
                      <p className="mb-1"><strong>Residente:</strong> {contrato.nombre_residente}</p>
                      <p className="mb-1"><strong>Contrato:</strong> {contrato.codigo_contrato}</p>
                      <p className="mb-1"><strong>Precio total terreno:</strong> {formatoMoneda(contrato.precio_total_terreno)}</p>
                      <div className={`alert ${contrato.estado_enganche === 'PAGADO' ? 'alert-success' : 'alert-warning'} py-2 px-3 my-2`}>
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                          <strong>Cuota inicial 0 - Enganche: {formatoMoneda(contrato.enganche_registrado)}</strong>
                          <span className={`badge ${contrato.estado_enganche === 'PAGADO' ? 'bg-success' : 'bg-warning text-dark'}`}>
                            {contrato.estado_enganche || 'PENDIENTE DE PAGO'}
                          </span>
                        </div>
                        <div className="small mt-1">
                          Pagado real: {formatoMoneda(contrato.enganche_pagado)} | Pendiente: {formatoMoneda(contrato.enganche_pendiente)}
                        </div>
                      </div>
                      <p className="mb-1"><strong>Capital inicial financiado:</strong> {formatoMoneda(contrato.capital_inicial_financiado)}</p>
                      <p className="mb-1"><strong>Cuotas pagadas (historico):</strong> {contrato.cuotas_pagadas}</p>
                      <p className="mb-1"><strong>Cuota siguiente:</strong> {contrato.cuota_siguiente}</p>
                      <p className="mb-0"><strong>Convenio activo:</strong> {contrato.id_convenio_activo > 0 ? 'Si' : 'No'}</p>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="card border-info h-100">
                    <div className="card-header bg-info text-dark">Ejemplo rapido de capital</div>
                    <div className="card-body">
                      <p className="mb-1">Precio terreno: <strong>{formatoMoneda(resumenEjemplo.precio)}</strong></p>
                      <p className="mb-1">Cuota inicial 0 - Enganche: <strong>{formatoMoneda(resumenEjemplo.enganche)}</strong></p>
                      <p className="mb-1">Estado: <strong className={contrato.estado_enganche === 'PAGADO' ? 'text-success' : 'text-warning'}>{contrato.estado_enganche || 'PENDIENTE DE PAGO'}</strong></p>
                      <p className="mb-1">Pendiente de cuota 0: <strong>{formatoMoneda(contrato.enganche_pendiente)}</strong></p>
                      <p className="mb-0">Capital inicial: <strong>{formatoMoneda(contrato.capital_inicial_financiado || resumenEjemplo.capital)}</strong></p>
                    </div>
                  </div>
                </div>
              </div>}

              <div className="card mt-3 border-secondary">
                <div className="card-header bg-secondary text-white">
                  {contrato ? 'Parametros del contrato (editables para simulacion)' : 'Calculadora de financiamiento inmobiliario'}
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Precio total terreno (Q)</label>
                      <input type="number" className="form-control" value={precioTotal} onChange={(e) => {
                        const nuevoPrecio = e.target.value;
                        setPrecioTotal(nuevoPrecio);
                        setCapitalRestante(String(round2(Math.max(toNumber(nuevoPrecio, 0) - toNumber(engancheRegistrado, 0), 0))));
                      }} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Enganche establecido (Q)</label>
                      <input type="number" className="form-control" value={engancheRegistrado} onChange={(e) => {
                        const nuevoEnganche = e.target.value;
                        setEngancheRegistrado(nuevoEnganche);
                        setCapitalRestante(String(round2(Math.max(toNumber(precioTotal, 0) - toNumber(nuevoEnganche, 0), 0))));
                      }} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Enganche pagado real (Q)</label>
                      <input type="number" className="form-control bg-light" value={enganchePagado} readOnly />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Capital restante (Q)</label>
                      <input type="number" className="form-control" value={capitalRestante} onChange={(e) => setCapitalRestante(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Interes anual (%)</label>
                      <input type="number" className="form-control" value={interesAnual} onChange={(e) => setInteresAnual(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Cuotas totales</label>
                      <input type="number" className="form-control" value={cuotasTotales} onChange={(e) => setCuotasTotales(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Cuotas pagadas</label>
                      <input type="number" className="form-control" value={cuotasPagadas} onChange={(e) => setCuotasPagadas(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Cuota objetivo de liquidacion</label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="Ej: 41"
                        value={cuotaObjetivo}
                        onChange={(e) => setCuotaObjetivo(e.target.value)}
                      />
                    </div>
                    <div className="col-md-3 d-grid">
                      <label className="form-label fw-bold">&nbsp;</label>
                      <button type="button" className="btn btn-success" onClick={calcular} disabled={cargando}>
                        {cargando ? 'Calculando...' : 'Calcular liquidacion'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {simulacion && (
            <div className="card mt-3 border-success">
              <div className="card-header bg-success text-white">Resultado de liquidacion a capital</div>
              <div className="card-body">
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button type="button" className="btn btn-outline-danger btn-sm" onClick={exportarTablaPDF}>
                    Imprimir PDF
                  </button>
                  <button type="button" className="btn btn-outline-success btn-sm" onClick={exportarTablaExcel}>
                    Exportar Excel
                  </button>
                  {contrato && <button type="button" className="btn btn-primary btn-sm" onClick={enviarLiquidacionACaja}>
                    Cobrar Cuota/Liquidacion en Caja
                  </button>}
                  {contrato && <button type="button" className="btn btn-warning btn-sm" onClick={generarCuotasPactadasEnCaja} disabled={generandoPlan || tablaAmortizacionPendiente.length === 0}>
                    {generandoPlan ? 'Generando...' : 'Generar cuotas pactadas en Caja'}
                  </button>}
                </div>

                <div className="row g-3">
                  <div className="col-md-4"><strong>Capital restante:</strong> {formatoMoneda(simulacion.capital_restante)}</div>
                  <div className="col-md-4"><strong>Interes anual:</strong> {toNumber(simulacion.interes_anual, 0).toFixed(2)}%</div>
                  <div className="col-md-4"><strong>Tasa mensual:</strong> {toNumber(simulacion.tasa_mensual, 0).toFixed(4)}%</div>
                  <div className="col-md-4"><strong>Cuotas pagadas:</strong> {simulacion.cuotas_pagadas}</div>
                  <div className="col-md-4"><strong>Meses pendientes:</strong> {simulacion.meses_pendientes}</div>
                  <div className="col-md-4"><strong>Cuota mensual fija:</strong> <span className="text-primary fw-bold">{formatoMoneda(simulacion.cuota_mensual)}</span></div>
                  <div className="col-md-4"><strong>Interes por mes:</strong> {formatoMoneda(simulacion.interes_por_mes)}</div>
                  <div className="col-md-6"><strong>Interes total meses pendientes:</strong> <span className="text-danger fw-bold">{formatoMoneda(simulacion.interes_total_pendiente)}</span></div>
                  <div className="col-md-6"><strong>Total liquidacion (capital + interes):</strong> <span className="text-success fw-bold">{formatoMoneda(simulacion.total_liquidacion)}</span></div>
                </div>

                <hr />

                <p className="mb-1"><strong>Formula aplicada:</strong></p>
                <p className="mb-1">Cuota fija = Capital x [tasa mensual x (1 + tasa mensual)^plazo] / [(1 + tasa mensual)^plazo - 1]</p>
                <p className="mb-0">Cada cuota separa interes sobre saldo y abono a capital; la ultima cuota ajusta cualquier diferencia de redondeo.</p>

                {tablaAmortizacionPendiente.length > 0 && (
                  <>
                    <hr />
                    <h6 className="fw-bold mb-3">Tabla de amortizacion de cuotas pendientes</h6>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered table-striped align-middle">
                        <thead className="table-dark">
                          <tr>
                            <th>Cuota</th>
                            <th>Saldo Inicial</th>
                            <th>Capital Cuota</th>
                            <th>Interes Mes</th>
                            <th>Cuota Estimada</th>
                            <th>Saldo Final</th>
                            <th>Interes Acumulado</th>
                            {contrato && <th>Accion</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {tablaAmortizacionPendiente.map((row) => (
                            <tr key={row.indice}>
                              <td className="fw-bold">{row.numero_cuota}</td>
                              <td>{formatoMoneda(row.saldo_inicial)}</td>
                              <td>{formatoMoneda(row.capital_cuota)}</td>
                              <td>{formatoMoneda(row.interes_mes)}</td>
                              <td>{formatoMoneda(row.cuota_estimada)}</td>
                              <td>{formatoMoneda(row.saldo_final)}</td>
                              <td>{formatoMoneda(row.interes_acumulado)}</td>
                              {contrato && <td>
                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => enviarCuotaACaja(row)}>
                                  Cobrar en Caja
                                </button>
                              </td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {contrato && <div className="alert alert-info mt-3 mb-0">
                  <strong>Enlace con Caja:</strong> puedes generar el plan persistente de Cuota 1 en adelante aunque el enganche siga pendiente. Para cobrar una cuota del plan, primero debe estar pagada la Cuota 0.
                </div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CuentaEstado;
