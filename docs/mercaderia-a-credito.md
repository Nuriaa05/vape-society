# Mercadería a crédito y proveedores

## Uso

- En **Compras**, elegí **Pagada** (fecha de pago) o **A crédito** (un vencimiento). Las nuevas compras pagadas se registran con medio **Sin especificar**. Guardar un borrador no ingresa mercadería ni genera deuda. Registrar la compra guarda el stock y la obligación en una misma transacción.
- En **Proveedores → Cuenta**, consultá deudas, vencimientos, pagos y reintegros. **Pagar total** cancela una obligación completa. Los pagos erróneos se revierten con motivo; se conserva el historial.
- En **Stock**, cada producto y el resumen muestran unidades y valor pagado, a crédito, sin clasificar y total. Las reservas se muestran aparte. Los valores corresponden al costo de cada ingreso, aunque cambie después el costo del catálogo.
- Para mercadería antigua, cargá primero una **deuda inicial** del proveedor y luego elegí **Clasificar stock existente** desde las acciones del producto. Se vinculan las unidades que todavía quedan; la deuda puede incluir mercadería ya vendida. El costo vinculado no puede superar la deuda inicial. Clasificar no modifica existencias ni crea otro pago.
- Una clasificación equivocada puede revertirse desde los movimientos de Stock mientras sus unidades originales sigan disponibles. Luego se registra la clasificación correcta.

Ejemplo: comprar diez unidades a crédito y vender cuatro deja seis unidades a crédito en Stock y la deuda por diez en Proveedores. Al pagarla, esas seis pasan a pagadas.

## Anulaciones y compatibilidad

Una compra registrada solo se anula si sus unidades originales siguen disponibles y se respetan las reservas. Si estaba pagada, la cuenta conserva el pago y muestra un reintegro pendiente: se registra su recepción cuando el proveedor efectivamente devuelve el dinero.

Las ventas entregadas, componentes de combos y ajustes de egreso usan los ingresos más antiguos (FIFO). Sus anulaciones restauran sus orígenes. La clasificación conserva las fechas de ingreso. La opción preexistente de venta con stock negativo se conserva: los faltantes no se contabilizan como mercadería disponible.

El inventario previo a esta actualización se migra a **Sin clasificar**, al costo actual como estimación inicial. Las compras anteriores mantienen **Sin seguimiento**; no se inventan pagos ni deudas. Se pueden cargar saldos iniciales sin modificar compras ni ventas.

Los respaldos incluyen lotes, asignaciones, deudas, pagos, reintegros y protección de reintentos. Los archivos compatibles anteriores se migran en una copia temporal y se validan antes del reemplazo. Los reportes de compras conservan el importe de la compra; los pagos se registran por separado en la cuenta e historial, sin duplicar compras.

## Alcance

Un vencimiento y un pago total por deuda, sin anticipos, pagos parciales ni intereses automáticos. Medios: efectivo, transferencia y QR. Importes en centavos enteros; fechas comerciales en America/Argentina/Buenos_Aires.

## Verificación

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:VAPE_SOCIETY_SMOKE_SUPPLIERS_ONLY='1'
node scripts/smoke.cjs
```

El recorrido de interfaz usa una base temporal. La evidencia se guarda en `.verification/supplier-credit-smoke.json` y capturas `supplier-*.png`.
