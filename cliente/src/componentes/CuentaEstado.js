import React, { useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatoMoneda = (value) => {
  const numero = toNumber(value, 0);
  return `Q ${numero.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const CuentaEstado = () => {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [contrato, setContrato] = useState(null);
  const [simulacion, setSimulacion] = useState(null);

  const [capitalRestante, setCapitalRestante] = useState('0');
  const [interesAnual, setInteresAnual] = useState('14');
  const [cuotasTotales, setCuotasTotales] = useState('0');
  const [cuotasPagadas, setCuotasPagadas] = useState('0');
  const [cuotaObjetivo, setCuotaObjetivo] = useState('');
  const [enganchePagado, setEnganchePagado] = useState('0');
  const [precioTotal, setPrecioTotal] = useState('0');

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
    setCapitalRestante('0');
    setInteresAnual('14');
    setCuotasTotales('0');
    setCuotasPagadas('0');
    setCuotaObjetivo('');
    setEnganchePagado('0');
    setPrecioTotal('0');
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
      const simulacionBase = data?.simulacion_base || null;

      if (!contratoApi) {
        showToast('No se pudo obtener el contrato seleccionado.', 'error');
        return;
      }

      setContrato(contratoApi);
      setSimulacion(simulacionBase);
      setResultados([]);

      setCapitalRestante(String(toNumber(contratoApi.capital_restante, 0)));
      setInteresAnual(String(toNumber(contratoApi.interes_anual, 14)));
      setCuotasTotales(String(toNumber(contratoApi.cuotas_totales, 0)));
      setCuotasPagadas(String(toNumber(contratoApi.cuotas_pagadas, 0)));
      setEnganchePagado(String(toNumber(contratoApi.enganche_pagado, 0)));
      setPrecioTotal(String(toNumber(contratoApi.precio_total_estimado, 0)));
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

    setCargando(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/cuenta_estado/simular-liquidacion`, payload);
      setSimulacion(data || null);
    } catch (error) {
      showToast(String(error?.response?.data || 'No se pudo calcular la liquidacion.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  const resumenEjemplo = useMemo(() => {
    const precio = toNumber(precioTotal, 0);
    const enganche = toNumber(enganchePagado, 0);
    const capital = Math.max(precio - enganche, 0);
    return { precio, enganche, capital };
  }, [precioTotal, enganchePagado]);

  return (
    <div className="container-fluid p-4">
      <div className="card shadow-sm">
        <div className="card-header bg-dark text-white">
          <h4 className="mb-0">Liquidacion a Capital con Interes Pendiente</h4>
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
              <button type="button" className="btn btn-outline-secondary" onClick={limpiar}>
                Limpiar
              </button>
            </div>
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

          {contrato && (
            <>
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="card border-primary h-100">
                    <div className="card-header bg-primary text-white">Datos base del contrato</div>
                    <div className="card-body">
                      <p className="mb-1"><strong>Residente:</strong> {contrato.nombre_residente}</p>
                      <p className="mb-1"><strong>Contrato:</strong> {contrato.codigo_contrato}</p>
                      <p className="mb-1"><strong>Cuotas pagadas (historico):</strong> {contrato.cuotas_pagadas}</p>
                      <p className="mb-0"><strong>Convenio activo:</strong> {contrato.id_convenio_activo > 0 ? 'Si' : 'No'}</p>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="card border-info h-100">
                    <div className="card-header bg-info text-dark">Ejemplo rapido de capital</div>
                    <div className="card-body">
                      <p className="mb-1">Precio terreno: <strong>{formatoMoneda(resumenEjemplo.precio)}</strong></p>
                      <p className="mb-1">Enganche pagado: <strong>{formatoMoneda(resumenEjemplo.enganche)}</strong></p>
                      <p className="mb-0">Capital inicial: <strong>{formatoMoneda(resumenEjemplo.capital)}</strong></p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card mt-3 border-secondary">
                <div className="card-header bg-secondary text-white">Parametros de calculo (editables)</div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Precio total terreno (Q)</label>
                      <input type="number" className="form-control" value={precioTotal} onChange={(e) => setPrecioTotal(e.target.value)} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold">Enganche pagado (Q)</label>
                      <input type="number" className="form-control" value={enganchePagado} onChange={(e) => setEnganchePagado(e.target.value)} />
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
                <div className="row g-3">
                  <div className="col-md-4"><strong>Capital restante:</strong> {formatoMoneda(simulacion.capital_restante)}</div>
                  <div className="col-md-4"><strong>Interes anual:</strong> {toNumber(simulacion.interes_anual, 0).toFixed(2)}%</div>
                  <div className="col-md-4"><strong>Tasa mensual:</strong> {toNumber(simulacion.tasa_mensual, 0).toFixed(4)}%</div>
                  <div className="col-md-4"><strong>Cuotas pagadas:</strong> {simulacion.cuotas_pagadas}</div>
                  <div className="col-md-4"><strong>Meses pendientes:</strong> {simulacion.meses_pendientes}</div>
                  <div className="col-md-4"><strong>Interes por mes:</strong> {formatoMoneda(simulacion.interes_por_mes)}</div>
                  <div className="col-md-6"><strong>Interes total meses pendientes:</strong> <span className="text-danger fw-bold">{formatoMoneda(simulacion.interes_total_pendiente)}</span></div>
                  <div className="col-md-6"><strong>Total liquidacion (capital + interes):</strong> <span className="text-success fw-bold">{formatoMoneda(simulacion.total_liquidacion)}</span></div>
                </div>

                <hr />

                <p className="mb-1"><strong>Formula aplicada:</strong></p>
                <p className="mb-1">Interes pendiente = Capital restante x (Interes anual / 12) x Meses pendientes</p>
                <p className="mb-0">Total a liquidar = Capital restante + Interes pendiente</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CuentaEstado;
