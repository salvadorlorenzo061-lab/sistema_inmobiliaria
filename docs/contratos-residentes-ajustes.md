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

### Cuota manual y última cuota

La cuota manual entera debe superar el interés mensual y no puede hacer negativa
la última cuota: para un plan de más de una cuota, su máximo es la parte entera
de `total financiado con intereses / (número de cuotas - 1)`. La última cuota es
el total financiado menos las cuotas anteriores; puede ser cero. Un importe
superior a ese máximo liquidaría el saldo antes del plazo y no se admite.

Cuando la cuota agota el capital antes de la última cuota según el reparto
anterior, se redistribuye el capital entre las cuotas y se asigna a intereses el
resto de cada pago. Esto mantiene el total de capital, intereses y pagos, y
permite cobrar también una última cuota positiva menor o igual a Q 0.50. Los
planes que ya cumplían la validación anterior conservan su reparto original;
si su última cuota es de Q 0.50 o menos, el saldo se conserva hasta cobrarla.
Sin un indicador persistente no es posible distinguir los contratos nuevos de
los históricos: una cuota histórica antes considerada inválida puede empezar a
utilizarse con esta regla.

Ejemplo: capital Q 164,000, interés anual 14 %, 180 cuotas y cuota manual
Q 2,830 dan 179 cuotas de Q 2,830 y una última cuota de Q 1,830, para un
total financiado de Q 508,400.

En casos extremos se rechaza la cuota si no es posible asignar al menos Q 0.01
de capital a cada cuota positiva redistribuida: Caja requiere capital positivo
para procesar una cuota financiada.

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
