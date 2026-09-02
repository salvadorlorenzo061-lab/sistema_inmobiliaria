import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../config';

const PERIOD_OPTIONS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'semanal', label: 'Semanal' }
];

const BAR_COLORS = ['#0d6efd', '#198754', '#fd7e14', '#6f42c1', '#dc3545', '#17a2b8', '#6610f2', '#20c997'];

const currency = (value = 0) =>
  Number(value || 0).toLocaleString('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatNumber = (value = 0) =>
  Number(value || 0).toLocaleString('es-GT', { maximumFractionDigits: 0 });

const getWidth = (value, max) => (max > 0 ? (Number(value || 0) / max) * 100 : 0);

const Dashboard = () => {
  const [periodo, setPeriodo] = useState('mensual');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargarDashboard = async (periodoActivo = periodo) => {
    try {
      setLoading(true);
      const { data: response } = await axios.get(`${API_BASE_URL}/api/dashboard/resumen?periodo=${encodeURIComponent(periodoActivo)}`);
      setData(response);
    } catch (error) {
      console.error('Error al cargar dashboard:', error);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar el dashboard',
        text: error?.response?.data?.message || 'Intenta nuevamente más tarde.',
        confirmButtonColor: '#0d6efd'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDashboard(periodo);
  }, [periodo]);

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Cobro total', value: currency(data.resumen.total_cobrado), color: '#0d6efd', helper: 'Cuotas y pagos registrados' },
      { label: 'Mora', value: currency(data.resumen.total_mora), color: '#dc3545', helper: 'Cobros con atraso' },
      { label: 'Facturas emitidas', value: formatNumber(data.resumen.total_facturas_emitidas), color: '#198754', helper: 'Emitidas por receptores' },
      { label: 'Facturas anuladas', value: formatNumber(data.resumen.total_facturas_anuladas), color: '#fd7e14', helper: 'Anulaciones del periodo' }
    ];
  }, [data]);

  const maxClientChart = useMemo(() => {
    if (!data?.chart_clientes?.length) return 1;
    return Math.max(...data.chart_clientes.map((item) => Number(item.value || 0)), 1);
  }, [data]);

  const maxContractChart = useMemo(() => {
    if (!data?.chart_contratos?.length) return 1;
    return Math.max(...data.chart_contratos.map((item) => Number(item.value || 0)), 1);
  }, [data]);

  const exportarExcel = () => {
    if (!data) return;

    const rows = [
      ['Métrica', 'Valor'],
      ['Rango', `${data.rango.etiqueta} (${data.rango.inicio} - ${data.rango.fin})`],
      ['Cobro total', data.resumen.total_cobrado],
      ['Mora total', data.resumen.total_mora],
      ['Cuotas financiadas cobradas', data.resumen.cuotas_financiadas_cobradas],
      ['Facturas emitidas', data.resumen.total_facturas_emitidas],
      ['Facturas anuladas', data.resumen.total_facturas_anuladas],
      ['Clientes al día', data.resumen.clientes_al_dia],
      ['Clientes atrasados', data.resumen.clientes_atrasados],
      ['Clientes sin mora', data.resumen.clientes_sin_mora],
      ['Clientes con mora', data.resumen.clientes_con_mora],
      [],
      ['Cajero / Receptor', 'Facturas emitidas', 'Facturas anuladas', 'Monto emitido'],
      ...data.facturas_por_usuario.map((item) => [item.nombre, item.emitidas, item.anuladas, item.monto_emitido]),
      [],
      ['Cobrador', 'Cuotas financiadas', 'Total recaudado'],
      ...data.top_cobradores.map((item) => [item.nombre, item.cuotas_financiadas, item.total_recaudado]),
      [],
      ['Cobranza mora', 'Total mora'],
      ...data.top_cobradores_mora.map((item) => [item.nombre, item.total_mora])
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard');
    XLSX.writeFile(workbook, `dashboard-financiero-${periodo}.xlsx`);
  };

  const exportarPDF = () => {
    if (!data) return;

    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.text('Dashboard Financiero', 14, 18);
    doc.setFontSize(10);
    doc.text(`${data.rango.etiqueta} - ${periodo.toUpperCase()}`, 14, 25);

    autoTable(doc, {
      startY: 32,
      head: [['Métrica', 'Valor']],
      body: [
        ['Cobro total', currency(data.resumen.total_cobrado)],
        ['Mora', currency(data.resumen.total_mora)],
        ['Cuotas financiadas cobradas', formatNumber(data.resumen.cuotas_financiadas_cobradas)],
        ['Facturas emitidas', formatNumber(data.resumen.total_facturas_emitidas)],
        ['Facturas anuladas', formatNumber(data.resumen.total_facturas_anuladas)],
        ['Clientes al día', formatNumber(data.resumen.clientes_al_dia)],
        ['Clientes atrasados', formatNumber(data.resumen.clientes_atrasados)],
        ['Clientes sin mora', formatNumber(data.resumen.clientes_sin_mora)],
        ['Clientes con mora', formatNumber(data.resumen.clientes_con_mora)]
      ],
      theme: 'grid',
    });

    let y = doc.lastAutoTable.finalY + 12;
    autoTable(doc, {
      startY: y,
      head: [['Cajero / Receptor', 'Emitidas', 'Anuladas', 'Monto emitido']],
      body: data.facturas_por_usuario.map((item) => [item.nombre, item.emitidas, item.anuladas, currency(item.monto_emitido)]),
      theme: 'striped'
    });

    y = doc.lastAutoTable.finalY + 10;
    autoTable(doc, {
      startY: y,
      head: [['Cobrador', 'Cuotas financiadas', 'Total recaudado']],
      body: data.top_cobradores.map((item) => [item.nombre, item.cuotas_financiadas, currency(item.total_recaudado)]),
      theme: 'striped'
    });

    doc.save(`dashboard-financiero-${periodo}.pdf`);
  };

  return (
    <div className="container-fluid py-4" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #eef3ff 100%)' }}>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <div className="text-uppercase text-primary small fw-bold mb-2">Operación financiera</div>
          <h2 className="fw-bold mb-1">Dashboard financiero</h2>
          <p className="text-muted mb-0">
            {data ? data.rango.etiqueta : 'Cargando indicadores...'}
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="btn-group" role="group">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`btn ${periodo === option.value ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setPeriodo(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button className="btn btn-success" onClick={exportarExcel}>Exportar Excel</button>
          <button className="btn btn-danger" onClick={exportarPDF}>Exportar PDF</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
          <div className="mt-3 text-secondary">Generando indicadores...</div>
        </div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            {kpis.map((kpi, index) => (
              <div className="col-xl-3 col-md-6" key={kpi.label}>
                <div className="card shadow-sm border-0 h-100">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="text-secondary small fw-semibold">{kpi.label}</span>
                      <span className="badge rounded-pill" style={{ backgroundColor: kpi.color, color: '#fff' }}>
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="fw-bold mb-0" style={{ color: kpi.color }}>{kpi.value}</h3>
                    <div className="small text-muted mt-2">{kpi.helper}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-4 mb-4">
            <div className="col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-0 pb-0">
                  <h5 className="fw-bold mb-0">Receptoras con mayor cobro</h5>
                </div>
                <div className="card-body">
                  {data.top_cobradores.length === 0 ? (
                    <p className="text-muted mb-0">Sin datos para este período.</p>
                  ) : (
                    <div className="list-group list-group-flush">
                      {data.top_cobradores.map((item, index) => (
                        <div key={`${item.nombre}-${index}`} className="list-group-item px-0 d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center gap-3">
                            <span className="rounded-circle text-white d-flex align-items-center justify-content-center" style={{ width: 34, height: 34, background: BAR_COLORS[index % BAR_COLORS.length], fontSize: 12, fontWeight: 700 }}>
                              {item.nombre?.slice(0, 1)?.toUpperCase() || 'U'}
                            </span>
                            <div>
                              <div className="fw-semibold">{item.nombre}</div>
                              <small className="text-muted">{item.cuotas_financiadas} cuotas</small>
                            </div>
                          </div>
                          <strong>{currency(item.total_recaudado)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-0 pb-0">
                  <h5 className="fw-bold mb-0">Cobros con mora</h5>
                </div>
                <div className="card-body">
                  {data.top_cobradores_mora.length === 0 ? (
                    <p className="text-muted mb-0">No hay cobros con mora en este período.</p>
                  ) : (
                    <div className="list-group list-group-flush">
                      {data.top_cobradores_mora.map((item, index) => (
                        <div key={`${item.nombre}-${index}`} className="list-group-item px-0 d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center gap-3">
                            <span className="rounded-circle text-white d-flex align-items-center justify-content-center" style={{ width: 34, height: 34, background: '#dc3545', fontSize: 12, fontWeight: 700 }}>
                              {item.nombre?.slice(0, 1)?.toUpperCase() || 'U'}
                            </span>
                            <div>
                              <div className="fw-semibold">{item.nombre}</div>
                              <small className="text-muted">Mora registrada</small>
                            </div>
                          </div>
                          <strong>{currency(item.total_mora)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="row g-4 mb-4">
            <div className="col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-0 pb-0">
                  <h5 className="fw-bold mb-0">Facturas por cajero / receptor</h5>
                </div>
                <div className="card-body">
                  {data.facturas_por_usuario.length === 0 ? (
                    <p className="text-muted mb-0">Sin facturas en este período.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {data.facturas_por_usuario.map((item, index) => (
                        <div key={`${item.nombre}-${index}`}>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="fw-semibold">{item.nombre}</span>
                            <small className="text-muted">{item.emitidas} emitidas / {item.anuladas} anuladas</small>
                          </div>
                          <div className="progress" style={{ height: 12 }}>
                            <div
                              className="progress-bar"
                              role="progressbar"
                              style={{ width: `${Math.min((item.emitidas / Math.max(item.total_facturas || 1, 1)) * 100, 100)}%`, background: BAR_COLORS[index % BAR_COLORS.length] }}
                            />
                          </div>
                          <div className="d-flex justify-content-between mt-1 text-muted small">
                            <span>{item.total_facturas} total</span>
                            <span>{currency(item.monto_emitido)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-0 pb-0">
                  <h5 className="fw-bold mb-0">Clientes</h5>
                </div>
                <div className="card-body">
                  <div className="d-flex flex-column gap-3">
                    {data.chart_clientes.map((item) => (
                      <div key={item.label}>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="small fw-semibold text-secondary">{item.label}</span>
                          <strong>{formatNumber(item.value)}</strong>
                        </div>
                        <div className="progress" style={{ height: 10 }}>
                          <div
                            className="progress-bar"
                            style={{ width: `${getWidth(item.value, maxClientChart)}%`, background: item.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-0 pb-0">
                  <h5 className="fw-bold mb-0">Contratos</h5>
                </div>
                <div className="card-body">
                  <div className="d-flex flex-column gap-3">
                    {data.chart_contratos.map((item) => (
                      <div key={item.label}>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="small fw-semibold text-secondary">{item.label}</span>
                          <strong>{formatNumber(item.value)}</strong>
                        </div>
                        <div className="progress" style={{ height: 10 }}>
                          <div
                            className="progress-bar"
                            style={{ width: `${getWidth(item.value, maxContractChart)}%`, background: item.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card shadow-sm border-0 h-100">
                <div className="card-header bg-white border-0 pb-0">
                  <h5 className="fw-bold mb-0">Resumen operativo</h5>
                </div>
                <div className="card-body">
                  <table className="table table-sm table-borderless mb-0">
                    <tbody>
                      <tr>
                        <td>Total cobrado</td>
                        <td className="text-end fw-semibold">{currency(data.resumen.total_cobrado)}</td>
                      </tr>
                      <tr>
                        <td>Mora</td>
                        <td className="text-end fw-semibold">{currency(data.resumen.total_mora)}</td>
                      </tr>
                      <tr>
                        <td>Cuotas financiadas cobradas</td>
                        <td className="text-end fw-semibold">{formatNumber(data.resumen.cuotas_financiadas_cobradas)}</td>
                      </tr>
                      <tr>
                        <td>Facturas emitidas</td>
                        <td className="text-end fw-semibold">{formatNumber(data.resumen.total_facturas_emitidas)}</td>
                      </tr>
                      <tr>
                        <td>Facturas anuladas</td>
                        <td className="text-end fw-semibold">{formatNumber(data.resumen.total_facturas_anuladas)}</td>
                      </tr>
                      <tr>
                        <td>Contratos activos</td>
                        <td className="text-end fw-semibold">{formatNumber(data.resumen.contratos_activos)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
