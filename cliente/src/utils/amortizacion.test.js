import { calcularTotalPlanPlano, generarTablaAmortizacion, validarCuotaPersonalizada } from './amortizacion';

const backend = require('../../../server/utils/amortizacion');
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const verificarPlan = (capital, tasa, cuotas, cuota, ultimaEsperada) => {
  const tabla = generarTablaAmortizacion(capital, tasa, cuotas, 0, cuota);
  expect(tabla).toEqual(backend.generarTablaPlana(capital, tasa, cuotas, 0, cuota));
  expect(tabla).toHaveLength(cuotas);
  expect(tabla[tabla.length - 1].cuota_estimada).toBe(ultimaEsperada);
  expect(tabla[tabla.length - 1].saldo_final).toBe(0);
  tabla.forEach((fila) => {
    expect(fila.capital_cuota).toBeGreaterThanOrEqual(0);
    expect(fila.interes_mes).toBeGreaterThanOrEqual(0);
    expect(round(fila.capital_cuota + fila.interes_mes)).toBe(fila.cuota_estimada);
  });
  expect(round(tabla.reduce((sum, fila) => sum + fila.capital_cuota, 0))).toBe(capital);
  expect(round(tabla.reduce((sum, fila) => sum + fila.cuota_estimada, 0)))
    .toBe(calcularTotalPlanPlano(capital, tasa, cuotas));
  return tabla;
};

test('permite Q 2,830 y conserva el total con una última cuota de Q 1,830', () => {
  expect(validarCuotaPersonalizada(164000, 14, 180, 2830)).toBe(true);
  expect(backend.validarCuotaPersonalizada(164000, 14, 180, 2830)).toBe(true);
  const tabla = verificarPlan(164000, 14, 180, 2830, 1830);
  expect(tabla.slice(0, -1).every((fila) => fila.cuota_estimada === 2830)).toBe(true);
  expect(tabla[179].capital_cuota).toBeGreaterThan(0);
  expect(round(tabla.reduce((sum, fila) => sum + fila.interes_mes, 0))).toBe(344400);
  verificarPlan(164000, 14, 180, 2840, 40);
  expect(validarCuotaPersonalizada(164000, 14, 180, 2841)).toBe(false);
  expect(backend.validarCuotaPersonalizada(164000, 14, 180, 2841)).toBe(false);
});

test('admite una última cuota cero o de un centavo y rechaza una negativa', () => {
  verificarPlan(17900, 0, 180, 100, 0);
  const tabla = verificarPlan(17900.01, 0, 180, 100, 0.01);
  expect(tabla[179].capital_cuota).toBe(0.01);
  expect(validarCuotaPersonalizada(17900, 0, 180, 101)).toBe(false);
  expect(backend.validarCuotaPersonalizada(17900, 0, 180, 101)).toBe(false);
  expect(validarCuotaPersonalizada(0.01, 120000, 2, 2)).toBe(false);
  expect(backend.validarCuotaPersonalizada(0.01, 120000, 2, 2)).toBe(false);
  const centavos = verificarPlan(0.02, 60000, 2, 2, 0.02);
  expect(centavos.every((fila) => fila.capital_cuota >= 0.01)).toBe(true);
});

test('mantiene el plan automático y las cuotas manuales anteriormente válidas', () => {
  const automatica = verificarPlan(164000, 14, 180, 2824, 2904);
  expect(automatica[0].capital_cuota).toBe(910.67);
  expect(automatica[0].interes_mes).toBe(1913.33);
  const manual = verificarPlan(164000, 14, 180, 2825, 2725);
  expect(manual[0].capital_cuota).toBe(911.67);
  expect(manual[0].interes_mes).toBe(1913.33);
  expect(validarCuotaPersonalizada(164000, 14, 180, 1913)).toBe(false);
});
