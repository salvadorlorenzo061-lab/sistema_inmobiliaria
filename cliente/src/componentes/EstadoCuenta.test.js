import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import EstadoCuenta from './EstadoCuenta';

jest.mock('axios');
jest.mock('sweetalert2', () => ({ fire: jest.fn() }));
jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 216 } },
    lastAutoTable: { finalY: 100 },
    setTextColor: jest.fn(), setFont: jest.fn(), setFontSize: jest.fn(),
    text: jest.fn(), setFillColor: jest.fn(), rect: jest.fn(),
    setDrawColor: jest.fn(), line: jest.fn(), splitTextToSize: jest.fn(() => []),
    output: jest.fn(() => 'data:application/pdf;base64,PDF'), save: jest.fn()
  }))
}));
jest.mock('jspdf-autotable', () => jest.fn());

const crearEstado = (abonoCapital) => ({
  contrato: {
    id_contrato: 1, codigo_contrato: 'C-1', nombre: 'Cliente',
    monto_total: 14000, enganche: 2000, interes_porcentaje: 12,
    cuotas_pactadas: 12, monto_cuota: 1120, abono_capital_total: abonoCapital
  },
  cuotasDetalle: [{ id_pago: 1, numero_cuota: 1, monto_total_detalle: 1120, fecha_pago: '2026-01-01' }],
  otrosPagos: [
    { id_pago: 2, tipo_concepto: 'abono_capital', monto: 1500, fecha_pago: '2026-02-01' },
    { id_pago: 3, tipo_concepto: 'servicio', monto: 50, fecha_pago: '2026-03-01' }
  ],
  totalPagado: 6670,
  saldoPendiente: 8770
});

const cargarYGenerar = async (estado) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('buscar-residente')) return Promise.resolve({ data: [{ id_contrato: 1, nombre: 'Cliente' }] });
    if (url.includes('estado-cuenta/')) return Promise.resolve({ data: estado });
    return Promise.resolve({ data: [] });
  });
  axios.post.mockResolvedValue({ data: {} });
  Swal.fire.mockResolvedValue({ isConfirmed: true, value: 'Observación' });

  render(<EstadoCuenta />);
  fireEvent.change(screen.getByPlaceholderText(/Buscar por cliente/), { target: { value: 'Cliente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: /Cliente/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Generar PDF' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
  return autoTable.mock.calls.map(([, options]) => options);
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('refleja todos los abonos vigentes en el capital y muestra el abono en los movimientos y el PDF', async () => {
  const tablas = await cargarYGenerar(crearEstado(5000));
  const resumen = tablas[0].body;
  expect(resumen[2]).toEqual(['Capital pagado', 'Q 6,000.00', 'Cuotas liquidadas', '1', 'Saldo de capital', 'Q 6,000.00']);
  expect(resumen[3][5]).toBe('Q 8,770.00');
  expect(resumen[4]).toContain('Q 5,000.00');
  const abono = tablas[1].body.find((fila) => fila[3] === 'Abono a capital');
  expect(abono[7]).toBe('Q 1,500.00');
  expect(tablas[1].body.find((fila) => fila[3] === 'servicio')[7]).toBe('Q 0.00');
  expect(axios.post.mock.calls[0][1].datos.resumen.saldoCapital).toBe(6000);
});

test('limita el capital pagado al capital financiado', async () => {
  const tablas = await cargarYGenerar(crearEstado(15000));
  expect(tablas[0].body[2][1]).toBe('Q 12,000.00');
  expect(tablas[0].body[2][5]).toBe('Q 0.00');
});

test('mantiene el cálculo de las cuotas cuando no hay abonos a capital', async () => {
  const estado = crearEstado(0);
  estado.otrosPagos = [];
  const tablas = await cargarYGenerar(estado);
  expect(tablas[0].body[2][1]).toBe('Q 1,000.00');
  expect(tablas[0].body[2][5]).toBe('Q 11,000.00');
});

test('no muestra cuotas pendientes cuando el financiamiento se liquidó con abonos, aunque exista mora', async () => {
  const estado = crearEstado(11000);
  estado.saldoFinanciamiento = 0;
  estado.saldoInmueble = 0;
  estado.contrato.mora_registrada = 300;
  const tablas = await cargarYGenerar(estado);
  expect(tablas[0].body[2][3]).toBe('12');
  expect(axios.post.mock.calls[0][1].datos.resumen.cuotasPagadas).toBe(1);
  expect(tablas[0].body[3]).toEqual(['Próxima cuota', 'N/A', 'Cuotas pendientes', '0', 'Saldo inmueble', 'Q 0.00']);
  expect(tablas[0].body[4][1]).toBe('Q 300.00');
});

test('mantiene cuotas pendientes si aún se deben intereses, aunque el capital esté pagado', async () => {
  const estado = crearEstado(11000);
  estado.saldoFinanciamiento = 1320;
  estado.saldoInmueble = 1320;
  const tablas = await cargarYGenerar(estado);
  expect(tablas[0].body[2][5]).toBe('Q 0.00');
  expect(tablas[0].body[3]).toEqual(['Próxima cuota', '2', 'Cuotas pendientes', '11', 'Saldo inmueble', 'Q 1,320.00']);
});

test('no muestra una próxima cuota cuando se pagaron todas las cuotas', async () => {
  const estado = crearEstado(0);
  estado.cuotasDetalle = Array.from({ length: 12 }, (_, indice) => ({
    id_pago: indice + 1, numero_cuota: indice + 1, monto_total_detalle: 1120, fecha_pago: '2026-01-01'
  }));
  estado.otrosPagos = [];
  estado.saldoFinanciamiento = 0;
  estado.saldoInmueble = 0;
  const tablas = await cargarYGenerar(estado);
  expect(tablas[0].body[3].slice(0, 4)).toEqual(['Próxima cuota', 'N/A', 'Cuotas pendientes', '0']);
});

test('muestra 18 cuotas liquidadas al completar la última con abonos a capital', async () => {
  const estado = crearEstado(16610);
  Object.assign(estado.contrato, {
    monto_total: 360000, enganche: 60000, interes_porcentaje: 0,
    cuotas_pactadas: 18, monto_cuota: 16670
  });
  estado.cuotasDetalle = Array.from({ length: 17 }, (_, indice) => ({
    id_pago: indice + 1, numero_cuota: indice + 1, monto_total_detalle: 16670, fecha_pago: '2026-01-01'
  }));
  estado.saldoFinanciamiento = 0;
  estado.saldoInmueble = 0;
  const tablas = await cargarYGenerar(estado);
  expect(tablas[0].body[2]).toEqual(['Capital pagado', 'Q 300,000.00', 'Cuotas liquidadas', '18', 'Saldo de capital', 'Q 0.00']);
  expect(tablas[0].body[3].slice(0, 4)).toEqual(['Próxima cuota', 'N/A', 'Cuotas pendientes', '0']);
  expect(axios.post.mock.calls[0][1].datos.resumen.cuotasPagadas).toBe(17);
});

test('mantiene una cuota pendiente cuando hay saldo aunque existan registros para todas las cuotas', async () => {
  const estado = crearEstado(0);
  estado.cuotasDetalle = Array.from({ length: 12 }, (_, indice) => ({
    id_pago: indice + 1, numero_cuota: indice + 1, monto_total_detalle: 1000, fecha_pago: '2026-01-01'
  }));
  estado.saldoFinanciamiento = 1440;
  estado.saldoInmueble = 1440;
  const tablas = await cargarYGenerar(estado);
  expect(tablas[0].body[3].slice(0, 4)).toEqual(['Próxima cuota', '12', 'Cuotas pendientes', '1']);
});
