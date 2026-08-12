# Ajustes de contratos residentes

Documento corto para dejar trazabilidad de los cambios aplicados en `crear contrato`, `editar contrato`, `Caja` y PDF, sin alterar el flujo que ya funciona.

## Archivos tocados

- `cliente/src/componentes/Contratos_Residentes.js`
- `cliente/src/componentes/Caja.js`
- `cliente/src/utils/contractPdfGenerator.js`
- `cliente/src/utils/contractPdfGeneratorComplete.js`

## Reglas funcionales

### 1. Crear contrato usa la misma logica que editar contrato

En `Contratos_Residentes.js` se unifico la validacion y el armado de datos:

- `validarContrato()`: valida los datos requeridos antes de guardar.
- `construirPayloadContrato()`: arma el payload tanto para crear como para editar.

Con esto, `crear` y `editar` trabajan con los mismos parametros y la misma estructura de envio.

### 2. Monto de cuota calculado en vivo

El monto mostrado en el formulario ya no depende de estados intermedios. Ahora se calcula directamente con:

- `monto_total`
- `enganche`
- `interes_porcentaje`
- `cuotas_pactadas`
- `plazo_meses`

Referencia:

- `montoCuotaCalculado`

### 3. Cuota 0 siempre representa el enganche

En `Caja.js` se dejo la regla de negocio asi:

- `Cuota 0` es el `enganche`.
- `Cuota 0` no lleva intereses.
- Si el `enganche_pendiente` es mayor a `0`, se debe mostrar `Cuota 0`.
- Si el `enganche_pendiente` ya esta pagado, `Cuota 0` no se muestra.
- Las cuotas financiadas comienzan en `Cuota 1`.

Referencia:

- `getValorCuotaMes(...)`

### 4. Mes inicio de pagos en formulario

En el formulario de contrato, `Mes Inicio de Pagos (Auto)` muestra `1`.

Interpretacion usada:

- `1` significa "primera cuota del plan de pagos".
- No representa el mes calendario real.

El anio sigue calculandose automaticamente segun la fecha base del contrato.

### 5. PDF mantiene el mes calendario real

Para no afectar el documento legal, el PDF no usa el `1` visual del formulario como nombre del mes.

En los generadores PDF se recalcula el primer mes calendario real usando:

- `fecha_compra`
- `fecha_firma`

Referencia:

- `obtenerPrimerPagoCalendario(...)`

## Casos esperados

### Caja

- Si hay enganche pendiente, debe aparecer `Cuota 0`.
- Si no hay enganche pendiente, la seleccion debe iniciar en `Cuota 1`.

### Crear contrato

- Debe calcular la cuota igual que `editar contrato`.
- Debe enviar los mismos parametros que `editar contrato`.

### PDF

- El formulario puede mostrar `Mes Inicio de Pagos (Auto) = 1`.
- El PDF debe seguir mostrando el mes calendario real correspondiente.

## Nota de mantenimiento

Si se vuelve a cambiar la regla de cuotas o de inicio de pagos, revisar siempre estos cuatro puntos juntos:

1. Formulario de crear contrato
2. Formulario de editar contrato
3. Caja
4. Generacion de PDF
