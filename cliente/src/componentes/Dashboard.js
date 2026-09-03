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
      { label: 'Intereses', value: currency(data.resumen.total_interes || 0), color: '#8b5cf6', helper: 'Pagos por intereses' },
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
      ['Intereses', data.resumen.total_interes || 0],
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
        ['Intereses', currency(data.resumen.total_interes || 0)],
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
    <div className="container-fluid p-0" style={{ background: '#eef3f8', minHeight: '100vh' }}>
      <div className="px-3 py-3">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
          <div>
            <div className="text-uppercase fw-bold" style={{ letterSpacing: '0.12em', fontSize: '0.72rem', color: '#2563eb' }}>
              OPERACIÓN FINANCIERA
            </div>
            <h1 className="mb-0 mt-1 fw-bold" style={{ fontSize: '2.2rem', lineHeight: 1.05, letterSpacing: '-0.04em', color: '#111827' }}>
              Dashboard
              <br />
              financiero
            </h1>
            <div className="text-secondary mt-1" style={{ fontSize: '0.82rem' }}>
              {data ? data.rango.etiqueta : 'Cargando indicadores...'}
            </div>
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2">
            <div className="btn-group" role="group" aria-label="Period selector">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`btn btn-sm ${periodo === option.value ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setPeriodo(option.value)}
                  style={{ borderRadius: '8px', marginRight: 2, fontWeight: 600, fontSize: '0.78rem', padding: '0.42rem 1rem' }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button className="btn btn-success btn-sm" onClick={exportarExcel} style={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.78rem', padding: '0.42rem 1rem' }}>
              Exportar Excel
            </button>
            <button className="btn btn-danger btn-sm" onClick={exportarPDF} style={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.78rem', padding: '0.42rem 1rem' }}>
              Exportar PDF
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />
            <div className="mt-3 text-secondary" style={{ fontSize: '0.8rem' }}>Generando indicadores...</div>
          </div>
        ) : (
          <>
            <div className="row g-2 mb-3">
              {kpis.map((kpi, index) => (
                <div className="col-xl col-lg-3 col-md-6 col-sm-6" key={kpi.label}>
                  <div className="card border-0 h-100 shadow-sm" style={{ borderRadius: 14, background: '#f8fafc', minHeight: 135 }}>
                    <div className="card-body p-2 px-3 d-flex flex-column justify-content-between">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-muted fw-semibold" style={{ fontSize: '0.72rem', letterSpacing: '0.02em' }}>{kpi.label}</span>
                        <span className="badge rounded-pill" style={{ backgroundColor: kpi.color, color: '#fff', fontSize: '0.6rem', padding: '0.3rem 0.45rem' }}>
                          {index + 1}
                        </span>
                      </div>
                      <div className="fw-bold" style={{ color: kpi.color, fontSize: '1.45rem', lineHeight: 1.1 }}>{kpi.value}</div>
                      <div className="text-secondary" style={{ fontSize: '0.68rem' }}>{kpi.helper}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="row g-2">
              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Cobro total</div>
                    <div className="fw-bold text-primary" style={{ fontSize: '1.55rem', lineHeight: 1.1 }}>{currency(data.resumen.total_cobrado)}</div>
                    <div className="mt-3">
                      <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '0.68rem' }}>
                        <span>Cuotas</span>
                        <strong className="text-primary">{formatNumber(data.resumen.cuotas_financiadas_cobradas)}</strong>
                      </div>
                      <div className="progress mt-1" style={{ height: 7, borderRadius: 6, background: '#e8edf7' }}>
                        <div className="progress-bar bg-primary" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Mora</div>
                    <div className="fw-bold text-danger" style={{ fontSize: '1.55rem', lineHeight: 1.1 }}>{currency(data.resumen.total_mora)}</div>
                    <div className="mt-3">
                      <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '0.68rem' }}>
                        <span>Clientes</span>
                        <strong className="text-danger">{formatNumber(data.resumen.clientes_con_mora)}</strong>
                      </div>
                      <div className="progress mt-1" style={{ height: 7, borderRadius: 6, background: '#f8e6eb' }}>
                        <div className="progress-bar bg-danger" style={{ width: `${Math.min((data.resumen.clientes_con_mora / Math.max(data.resumen.clientes_total || 1, 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Facturas emitidas</div>
                    <div className="fw-bold text-success" style={{ fontSize: '1.55rem', lineHeight: 1.1 }}>{formatNumber(data.resumen.total_facturas_emitidas)}</div>
                    <div className="mt-3">
                      <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '0.68rem' }}>
                        <span>Anuladas</span>
                        <strong className="text-warning">{formatNumber(data.resumen.total_facturas_anuladas)}</strong>
                      </div>
                      <div className="progress mt-1" style={{ height: 7, borderRadius: 6, background: '#edf5ea' }}>
                        <div className="progress-bar bg-success" style={{ width: `${Math.min((data.resumen.total_facturas_emitidas / Math.max(data.resumen.total_facturas_emitidas + data.resumen.total_facturas_anuladas || 1, 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Receptoras con mayor cobro</div>
                    <div className="d-flex flex-column gap-2 mt-2">
                      {data.top_cobradores.slice(0, 3).map((item, index) => (
                        <div key={`${item.nombre}-${index}`} className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-2">
                            <span className="rounded-circle text-white d-flex align-items-center justify-content-center" style={{ width: 22, height: 22, background: BAR_COLORS[index % BAR_COLORS.length], fontSize: 10, fontWeight: 700 }}>
                              {item.nombre?.slice(0, 1)?.toUpperCase() || 'U'}
                            </span>
                            <span className="text-secondary" style={{ fontSize: '0.68rem' }}>{item.nombre}</span>
                          </div>
                          <strong style={{ fontSize: '0.7rem', color: '#111827' }}>{currency(item.total_recaudado)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Facturas por cajero</div>
                    <div className="d-flex flex-column gap-2 mt-2">
                      {data.facturas_por_usuario.slice(0, 3).map((item, index) => (
                        <div key={`${item.nombre}-${index}`}>
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="text-secondary" style={{ fontSize: '0.68rem' }}>{item.nombre}</span>
                            <strong style={{ fontSize: '0.7rem', color: '#111827' }}>{item.emitidas}</strong>
                          </div>
                          <div className="progress" style={{ height: 6, borderRadius: 6, background: '#edf2f7' }}>
                            <div className="progress-bar" style={{ width: `${Math.min((item.emitidas / Math.max(item.total_facturas || 1, 1)) * 100, 100)}%`, background: BAR_COLORS[index % BAR_COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Clientes</div>
                    <div className="d-flex flex-column gap-2 mt-2">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Al día</span>
                        <strong className="text-success" style={{ fontSize: '0.75rem' }}>{formatNumber(data.resumen.clientes_al_dia)}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Atrasados</span>
                        <strong className="text-warning" style={{ fontSize: '0.75rem' }}>{formatNumber(data.resumen.clientes_atrasados)}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Sin mora</span>
                        <strong className="text-primary" style={{ fontSize: '0.75rem' }}>{formatNumber(data.resumen.clientes_sin_mora)}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Con mora</span>
                        <strong className="text-danger" style={{ fontSize: '0.75rem' }}>{formatNumber(data.resumen.clientes_con_mora)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-2 col-lg-3 col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#f8fafc', minHeight: 180 }}>
                  <div className="card-body p-3">
                    <div className="text-dark fw-bold mb-2" style={{ fontSize: '0.78rem' }}>Contratos</div>
                    <div className="d-flex flex-column gap-2 mt-2">
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Activos</span>
                        <strong className="text-primary" style={{ fontSize: '0.75rem' }}>{formatNumber(data.resumen.contratos_activos)}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Inactivos</span>
                        <strong className="text-warning" style={{ fontSize: '0.75rem' }}>{formatNumber(data.chart_contratos.find((i) => i.label === 'Inactivos')?.value || 0)}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Con mora</span>
                        <strong className="text-danger" style={{ fontSize: '0.75rem' }}>{formatNumber(data.chart_contratos.find((i) => i.label === 'Con mora')?.value || 0)}</strong>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-secondary" style={{ fontSize: '0.68rem' }}>Al día</span>
                        <strong className="text-success" style={{ fontSize: '0.75rem' }}>{formatNumber(data.chart_contratos.find((i) => i.label === 'Al día')?.value || 0)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
