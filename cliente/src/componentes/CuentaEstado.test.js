import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import CuentaEstado from './CuentaEstado';

jest.mock('axios');
jest.mock('sweetalert2', () => ({ fire: jest.fn() }));
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => jest.fn());

const cargarContrato = async (liquidado) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('buscar-residente')) {
      return Promise.resolve({ data: [{ id_contrato: 1, nombre: 'Cliente', codigo_contrato: 'C-1' }] });
    }
    return Promise.resolve({ data: {
      contrato: {
        id_contrato: 1, codigo_contrato: 'C-1', nombre_residente: 'Cliente',
        capital_inicial_financiado: 2000, capital_original_plan: 2000,
        capital_restante: liquidado ? 0 : 1000, interes_anual: 0,
        monto_cuota: 1000, cuotas_totales: 2, cuotas_pagadas: 1,
        cuotas_liquidadas: liquidado ? 2 : 1, financiamiento_liquidado: liquidado,
        abono_capital_total: liquidado ? 1000 : 500,
        cuota_siguiente: liquidado ? null : 2
      },
      cuotas_estado_detalle: [{ numero_cuota: 1, estado: 'PAGADO' }]
    } });
  });
  render(<CuentaEstado />);
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: 'Cliente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: /Cliente.*Contrato/ }));
  return (await screen.findByText('Cuota financiada 2')).closest('tr');
};

beforeEach(() => jest.clearAllMocks());

test('muestra la cuota liquidada por abono sin ofrecer otro cobro', async () => {
  const fila = await cargarContrato(true);
  expect(within(fila).getByText('LIQUIDADO POR ABONO')).toBeTruthy();
  expect(within(fila).queryByRole('button', { name: 'Cobrar en Caja' })).toBeNull();
  expect(screen.getByText('Cuotas pagadas (historico):').parentElement.textContent).toContain('1');
});

test('mantiene cobrable la cuota si todavía hay saldo financiado', async () => {
  const fila = await cargarContrato(false);
  expect(within(fila).getByText('PENDIENTE')).toBeTruthy();
  expect(within(fila).getByRole('button', { name: 'Cobrar en Caja' })).toBeTruthy();
});
