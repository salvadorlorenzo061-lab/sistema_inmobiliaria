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
    <div className="container-fluid py-3" style={{ background: '#f3f5f9', minHeight: '100vh' }}>
      <div className="mb-3 card border-0 shadow-sm" style={{ background: '#f8fafc', borderRadius: 12, padding: '0.9rem 1rem' }}>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <div className="text-uppercase fw-bold" style={{ letterSpacing: '0.08em', fontSize: '0.72rem', color: '#2563eb' }}>Operación financiera</div>
            <h1 className="mb-0 mt-1 fw-bold" style={{ fontSize: '1.7rem', lineHeight: 1.2, color: '#0f172a' }}>Dashboard financiero</h1>
            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
              {data ? data.rango.etiqueta : 'Cargando indicadores...'}
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="btn-group" role="group" style={{ boxShadow: '0 4px 12px rgba(59,130,246,0.08)' }}>
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`btn btn-sm px-3 ${periodo === option.value ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setPeriodo(option.value)}
                  style={{ borderRadius: '8px', marginRight: '2px', fontWeight: 600, fontSize: '0.78rem' }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button className="btn btn-success btn-sm px-3" onClick={exportarExcel} style={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.78rem' }}>Exportar Excel</button>
            <button className="btn btn-danger btn-sm px-3" onClick={exportarPDF} style={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.78rem' }}>Exportar PDF</button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
          <div className="mt-3 text-secondary" style={{ fontSize: '0.82rem' }}>Generando indicadores...</div>
        </div>
      ) : (
        <>
          <div className="row g-2 mb-3">
            {kpis.map((kpi, index) => (
              <div className="col-xl-3 col-md-6" key={kpi.label}>
                <div className="card border-0 h-100 shadow-sm" style={{ borderRadius: 12, background: '#ffffff', overflow: 'hidden' }}>
                  <div className="card-body p-2 px-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="text-muted fw-semibold" style={{ fontSize: '0.73rem' }}>{kpi.label}</span>
                      <span className="badge rounded-pill" style={{ backgroundColor: kpi.color, color: '#fff', fontSize: '0.62rem' }}>
                        {index + 1}
                      </span>
                    </div>
                    <div className="fw-bold" style={{ color: kpi.color, fontSize: '1.35rem', lineHeight: 1.2 }}>{kpi.value}</div>
                    <div className="text-secondary mt-1" style={{ fontSize: '0.7rem' }}>{kpi.helper}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row g-3 mb-3">
            <div className="col-xl-5">
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#ffffff' }}>
                <div className="card-header border-0 bg-white pt-2 pb-0 px-3">
                  <h5 className="fw-bold mb-0" style={{ color: '#0f172a', fontSize: '0.95rem' }}>Receptoras con mayor cobro</h5>
                </div>
                <div className="card-body px-3 py-2">
                  {data.top_cobradores.length === 0 ? (
                    <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>Sin datos para este período.</p>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {data.top_cobradores.map((item, index) => (
                        <div key={`${item.nombre}-${index}`} className="d-flex justify-content-between align-items-center px-2 py-2 rounded-3" style={{ background: index % 2 === 0 ? '#f8fafc' : '#ffffff', border: '1px solid #edf2f7' }}>
                          <div className="d-flex align-items-center gap-2">
                            <span className="rounded-circle text-white d-flex align-items-center justify-content-center" style={{ width: 28, height: 28, background: BAR_COLORS[index % BAR_COLORS.length], fontSize: 11, fontWeight: 700 }}>
                              {item.nombre?.slice(0, 1)?.toUpperCase() || 'U'}
                            </span>
                            <div>
                              <div className="fw-semibold" style={{ color: '#111827', fontSize: '0.8rem' }}>{item.nombre}</div>
                              <small className="text-muted" style={{ fontSize: '0.68rem' }}>{item.cuotas_financiadas} cuotas</small>
                            </div>
                          </div>
                          <strong style={{ color: '#0f172a', fontSize: '0.8rem' }}>{currency(item.total_recaudado)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="col-xl-4">
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#ffffff' }}>
                <div className="card-header border-0 bg-white pt-2 pb-0 px-3">
                  <h5 className="fw-bold mb-0" style={{ color: '#0f172a', fontSize: '0.95rem' }}>Facturas por cajero / receptor</h5>
                </div>
                <div className="card-body px-3 py-2">
                  {data.facturas_por_usuario.length === 0 ? (
                    <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>Sin facturas en este período.</p>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {data.facturas_por_usuario.map((item, index) => (
                        <div key={`${item.nombre}-${index}`}>
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="fw-semibold" style={{ color: '#111827', fontSize: '0.78rem' }}>{item.nombre}</span>
                            <small className="text-muted" style={{ fontSize: '0.68rem' }}>{item.emitidas} / {item.anuladas}</small>
                          </div>
                          <div className="progress" style={{ height: 10, borderRadius: 8, background: '#edf2f7' }}>
                            <div
                              className="progress-bar"
                              role="progressbar"
                              style={{ width: `${Math.min((item.emitidas / Math.max(item.total_facturas || 1, 1)) * 100, 100)}%`, background: BAR_COLORS[index % BAR_COLORS.length], borderRadius: 8 }}
                            />
                          </div>
                          <div className="d-flex justify-content-between mt-1 text-muted" style={{ fontSize: '0.68rem' }}>
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

            <div className="col-xl-3">
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#ffffff' }}>
                <div className="card-header border-0 bg-white pt-2 pb-0 px-3">
                  <h5 className="fw-bold mb-0" style={{ color: '#0f172a', fontSize: '0.95rem' }}>Resumen operativo</h5>
                </div>
                <div className="card-body px-3 py-2">
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ fontSize: '0.76rem' }}>
                    <span className="text-secondary">Total cobrado</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.76rem' }}>{currency(data.resumen.total_cobrado)}</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ fontSize: '0.76rem' }}>
                    <span className="text-secondary">Mora</span>
                    <strong style={{ color: '#e11d48', fontSize: '0.76rem' }}>{currency(data.resumen.total_mora)}</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ fontSize: '0.76rem' }}>
                    <span className="text-secondary">Cuotas</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.76rem' }}>{formatNumber(data.resumen.cuotas_financiadas_cobradas)}</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ fontSize: '0.76rem' }}>
                    <span className="text-secondary">Emitidas</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.76rem' }}>{formatNumber(data.resumen.total_facturas_emitidas)}</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ fontSize: '0.76rem' }}>
                    <span className="text-secondary">Anuladas</span>
                    <strong style={{ color: '#f59e0b', fontSize: '0.76rem' }}>{formatNumber(data.resumen.total_facturas_anuladas)}</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2" style={{ fontSize: '0.76rem' }}>
                    <span className="text-secondary">Activos</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.76rem' }}>{formatNumber(data.resumen.contratos_activos)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#ffffff' }}>
                <div className="card-header border-0 bg-white pt-2 pb-0 px-3">
                  <h5 className="fw-bold mb-0" style={{ color: '#0f172a', fontSize: '0.95rem' }}>Clientes</h5>
                </div>
                <div className="card-body px-3 py-2">
                  <div className="d-flex flex-column gap-2">
                    {data.chart_clientes.map((item) => (
                      <div key={item.label}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="small fw-semibold text-secondary" style={{ fontSize: '0.72rem' }}>{item.label}</span>
                          <strong style={{ color: '#111827', fontSize: '0.76rem' }}>{formatNumber(item.value)}</strong>
                        </div>
                        <div className="progress" style={{ height: 8, borderRadius: 8, background: '#edf2f7' }}>
                          <div
                            className="progress-bar"
                            style={{ width: `${getWidth(item.value, maxClientChart)}%`, background: item.color, borderRadius: 8 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12, background: '#ffffff' }}>
                <div className="card-header border-0 bg-white pt-2 pb-0 px-3">
                  <h5 className="fw-bold mb-0" style={{ color: '#0f172a', fontSize: '0.95rem' }}>Contratos</h5>
                </div>
                <div className="card-body px-3 py-2">
                  <div className="d-flex flex-column gap-2">
                    {data.chart_contratos.map((item) => (
                      <div key={item.label}>
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="small fw-semibold text-secondary" style={{ fontSize: '0.72rem' }}>{item.label}</span>
                          <strong style={{ color: '#111827', fontSize: '0.76rem' }}>{formatNumber(item.value)}</strong>
                        </div>
                        <div className="progress" style={{ height: 8, borderRadius: 8, background: '#edf2f7' }}>
                          <div
                            className="progress-bar"
                            style={{ width: `${getWidth(item.value, maxContractChart)}%`, background: item.color, borderRadius: 8 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
