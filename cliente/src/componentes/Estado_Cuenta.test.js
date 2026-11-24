import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import EstadoCuenta from './Estado_Cuenta';

jest.mock('axios');
jest.mock('sweetalert2', () => ({ fire: jest.fn() }));
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => jest.fn());

const cargarEstado = async (saldoFinanciamiento) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('buscar-residente')) {
      return Promise.resolve({ data: [{ id_contrato: 1, nombre: 'Cliente', codigo_contrato: 'C-1' }] });
    }
    return Promise.resolve({ data: {
      contrato: {
        id_contrato: 1, nombre: 'Cliente', codigo_contrato: 'C-1', fecha_firma: '2025-01-01',
        monto_total: 2000, enganche: 0, cuotas_pactadas: 2, interes_porcentaje: 0,
        monto_cuota: 1000, abono_capital_total: 1000
      },
      cuotasDetalle: [{ id_pago: 1, numero_cuota: 1, tipos_concepto: 'cuota_terreno', monto_total_detalle: 1000 }],
      pagos: [], otrosPagos: [], mesesPagados: [], totalPagado: 2000,
      saldoPendiente: saldoFinanciamiento, saldoFinanciamiento
    } });
  });
  render(<EstadoCuenta />);
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: 'Cliente' } });
  fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Cliente.*Contrato/ }));
  fireEvent.click(screen.getByRole('button', { name: /Ver Todo/ }));
  return (await screen.findByText('Cuota 2')).closest('tr');
};

beforeEach(() => jest.clearAllMocks());

test('muestra la cuota como liquidada por abono sin inventar un recibo', async () => {
  const fila = await cargarEstado(0);
  expect(within(fila).getByText('LIQUIDADO POR ABONO')).toBeTruthy();
  expect(within(fila).getAllByText('N/A')).toHaveLength(4);
});

test('mantiene la cuota pendiente cuando el financiamiento tiene saldo', async () => {
  const fila = await cargarEstado(1000);
  expect(within(fila).getByText('PENDIENTE')).toBeTruthy();
});
