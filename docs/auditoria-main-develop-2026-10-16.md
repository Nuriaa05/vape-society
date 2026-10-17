# Revisión de main y develop — 16 de octubre de 2026

## Conclusión

`develop` agrega clientes y cuentas por cobrar, cuotas directas, seguimiento manual de acreditaciones de tarjetas y reintegros. **No implementa recibir mercadería de un proveedor en consignación**, que es la necesidad aclarada durante esta revisión.

No se cambió lógica de negocio ni se aplicaron migraciones a una base de trabajo. Este documento registra el análisis y las verificaciones, sin implementar una solución de consignación.

## Ramas e integraciones

Referencias verificadas después de actualizar el remoto:

| Referencia | Commit | Estado |
| --- | --- | --- |
| `main` / `origin/main` | `e0a4157` | Versión 0.1.4 |
| `origin/develop` | `29c436e` | Contiene todo main y dos commits adicionales |
| `audit/clientes-cobranzas-develop` | `29c436e` | Rama local de esta revisión, creada desde origin/develop |

Los dos commits adicionales son del 15 de octubre de 2026:

1. `f834138`: cambia la versión de la aplicación a 0.1.5.
2. `29c436e`: integra clientes, planes directos, cobranzas, tarjetas, reintegros y compatibilidad de respaldos.

La comparación completa tiene 77 archivos modificados o agregados, 9.938 líneas agregadas y 412 eliminadas. No hay commits exclusivos de main que falten en develop. Los cambios recientes de main sobre fechas argentinas, costos decimales en compras y reportes siguen incluidos.

La revisión quedó aislada en `C:\Users\Gonzalo\.codex\worktrees\auditoria-cobranzas\vape-society`. Durante las verificaciones, una operación externa cambió el checkout original de main a `refactor/simplificar-cobranzas`; las pruebas de backend que coincidieron con ese cambio se descartaron como evidencia de main.

## Base del sistema

El frontend es una SPA React/Vite con TanStack Router y React Query. Los repositorios de `frontend/src/lib/repositories` se comunican con una API NestJS. El backend persiste mediante Prisma y SQLite.

El núcleo existente administra productos, combos, proveedores, compras, ventas, reservas, stock, reportes, historial, configuración y respaldos. La base de desarrollo corresponde a `backend/prisma/core.db`; los tests preparan bases temporales.

## Qué significa cada función nueva

| Función | Para qué sirve | Efecto |
| --- | --- | --- |
| Cliente | Identificar al comprador y consultar su cuenta | Agrupa ventas, deuda y movimientos |
| Deuda inicial | Registrar una deuda anterior conocida | Crea cuotas; no crea ventas ni modifica stock |
| Cuotas directas | Financiar una venta desde el negocio | Crea una cuenta por cobrar al cliente |
| Cobrar | Registrar pagos de cuotas directas | Reduce la deuda; no registra otra venta |
| Cuotas con tarjeta | Registrar una venta financiada por una tarjeta | Crea seguimiento del dinero que acreditará el procesador |
| Completar acreditaciones | Definir depósitos esperados del procesador | Fija calendario, bruto y comisión estimada; no registra un ingreso |
| Registrar acreditación | Registrar el depósito efectivamente recibido | Suma bruto menos comisión real a los cobros |
| Reintegro | Resolver dinero a devolver tras una anulación | Registra egreso y/o cancelación de acreditaciones pendientes |
| Revertir | Corregir un movimiento financiero conservando historial | Excluye su efecto activo y permite registrar una corrección |

La venta, la entrega y el cobro tienen responsabilidades distintas. Una entrega pendiente reserva mercadería; al entregarla se descuenta el stock físico. Pagar una cuota después no vuelve a descontarlo. Esto ya existía para las entregas y continúa siendo independiente de la financiación.

## Recorridos de uso

### Venta inmediata

En Nueva venta se eligen productos, modalidad inmediata, medio de pago y estado de entrega. El comprador registrado es opcional. Al confirmar desde la interfaz nueva se registra la venta y su cobro inmediato. Con efectivo se guarda lo recibido y el vuelto.

### Deudor por una venta nueva

En Nueva venta se selecciona o crea un cliente, se elige Cuotas directas y se completan cantidad de cuotas, primer vencimiento, recargo opcional y anticipo opcional.

Ejemplo sin recargo: venta de $100.000, anticipo de $20.000 y cuatro cuotas. Se registra una venta por $100.000, un cobro de $20.000 y deuda por $80.000 distribuida en cuatro cuotas de $20.000.

Después se entra a Clientes y cobranzas, se busca al cliente y se usa Cobrar o Cuenta → Registrar cobro. El operador asigna explícitamente cuánto paga cada cuota. Se admiten pagos parciales y anticipados; no se aceptan sobrepagos ni saldo a favor.

Las cuotas son mensuales y fijas, de 1 a 120. El recargo se aplica una vez sobre el precio después del descuento. El anticipo se resta antes de dividir el saldo y los centavos sobrantes se agregan a la última cuota. No hay interés automático por atraso ni reprogramación de planes confirmados.

### Deudor anterior a la actualización

Se crea el cliente y desde Cuenta → Deuda inicial se carga concepto, importe, cantidad de cuotas y primer vencimiento. No debe registrarse otra venta para representar esa deuda anterior.

Las ventas históricas conservan sus datos sin seguimiento financiero. La actualización no interpreta automáticamente si están cobradas o adeudadas. Tampoco transforma nombres históricos de compradores en cuentas de clientes.

### Venta con tarjeta

En Nueva venta → Cuotas con tarjeta se seleccionan el medio habilitado, la procesadora, la referencia opcional y la cantidad de cuotas del comprador.

La venta aparece en Clientes y cobranzas → Tipo de movimiento → Tarjetas como Por completar. Luego se cargan las acreditaciones esperadas. El número de depósitos al comercio es independiente del número de cuotas del comprador.

Ejemplo: el cliente paga $100.000 en tres cuotas a su tarjeta; el procesador puede depositar al comercio una sola vez, descontando $5.000 de comisión. El negocio registra una acreditación bruta de $100.000 y un ingreso neto de $95.000. No debe usar Cobrar sobre esas tres cuotas: el cliente las paga a la tarjeta.

No hay conexión con procesadores o bancos. Los calendarios y depósitos se registran manualmente. Las ventas sin calendario permanecen visibles como Por completar aunque se filtre otro mes.

### Anulación y reintegro

Anular una venta resuelve el efecto comercial y cancela sus cuotas directas pendientes. La devolución de lo cobrado se registra por separado en Reintegros, incluso en varios movimientos.

En tarjetas se distingue dinero entregado de bruto pendiente cancelado. Una acreditación cancelada no representa dinero que salió de caja. Si todavía no existe calendario de tarjeta, hay que completarlo antes de registrar el reintegro.

Para corregir el cobro inicial o anticipo de una venta activa, el sistema exige anular primero la venta. No se incluyó devolución parcial de productos.

## Qué falta para la consignación recibida de proveedores

La consignación indicada por el usuario sigue este circuito: recibir mercadería que pertenece al proveedor, vender una parte, liquidar lo vendido y devolver o conservar lo restante.

Ejemplo: recibir 100 unidades, vender 30, liquidar al proveedor esas 30 y mantener o devolver las otras 70. Hoy el sistema no puede relacionar esos pasos como una consignación.

La evidencia del código es concreta:

- La migración nueva agrega `Customer`, `ReceivablePlan`, `ReceivableInstallment`, `Collection`, `CollectionAllocation`, `CardSettlement`, `CardAccreditation`, `Refund`, `RefundCancellation` y `FinancialOperation`.
- Los planes y cobros se vinculan con clientes y ventas, sin una cuenta por pagar al proveedor.
- Las compras existentes ingresan unidades al stock general. No distinguen propiedad del proveedor, lotes consignados, unidades vendidas por liquidar ni devoluciones de remanentes.
- `Product.supplierId` identifica un proveedor asociado al producto, pero no permite distribuir existencias del mismo producto entre distintos lotes o condiciones de propiedad.
- No se encontraron modelos, endpoints ni pantallas de consignación o liquidación a proveedores.

Registrar una recepción consignada como una compra común suma stock, pero no conserva las obligaciones específicas de la consignación. Crear al proveedor como cliente tampoco representa ese circuito: invertiría el sentido de la deuda.

## Por qué la integración puede resultar confusa

1. La palabra cuota se usa tanto para deuda directa como para tarjeta; en cada caso el dinero lo debe una contraparte distinta.
2. El resumen reúne saldos acumulados y movimientos del mes. Deuda de clientes y tarjetas pendientes abarcan todos los vencimientos; los cobros y egresos usan su fecha efectiva.
3. Los reportes de ventas siguen midiendo ventas. No pasan a representar dinero efectivamente cobrado por agregar el módulo financiero.
4. Por completar es un dato pendiente de carga, no un depósito recibido ni una cuota vencida.
5. Los medios personalizados necesitan habilitar las capacidades correspondientes en Configuración: Admite cobranzas directas o Admite cuotas con tarjeta.
6. La integración es grande y llegó en un solo commit funcional. La existencia de deuda inicial y cuotas no implica que se haya implementado consignación.

## Propuestas, sin implementar

- Acordar un ejemplo real de recepción, venta, liquidación y devolución al proveedor antes de modificar el sistema.
- Tratar la consignación recibida como un circuito separado que pueda relacionarse con productos, proveedores y ventas existentes.
- Aclarar en la interfaz la contraparte de cada saldo y qué indicadores corresponden al mes o al acumulado.
- Validar primero con un caso pequeño: 10 unidades recibidas, 3 vendidas y liquidadas, 2 devueltas y 5 todavía en consignación.

La documentación funcional previa de esta integración está en `docs/clientes-y-cobranzas.md`.

## Verificaciones

En main, antes del cambio externo de rama, pasaron `npm run typecheck`, `npm run lint`, `npm run build` y los 217 tests del frontend. No se certifica la suite del backend de main: fue interrumpida por la mezcla de referencias del checkout compartido.

En la rama aislada de develop:

| Verificación | Resultado |
| --- | --- |
| `npm run typecheck` | Aprobada en frontend y backend |
| `npm run lint` | Aprobada en frontend y backend |
| `npm run build` | Aprobada en frontend y backend |
| Tests frontend | 41 archivos, 298 tests aprobados |
| Tests backend | 39 suites, 274 tests aprobados; 514,73 segundos |
| `npm run test:smoke` | Aprobada: 12 pantallas, sin errores de página ni API |

`npm test` terminó con código 0: 572 tests aprobados entre frontend y backend. El smoke verificó creación de clientes desde Nueva venta, financiación sin anticipo, reintento tras respuesta perdida, deuda inicial, cuotas mensuales, cobro parcial, acreditación de tarjeta, reintegro, comprobantes imprimibles y restauración de respaldo financiero. También verificó compras, ventas, stock, anulaciones, historial, reportes y desplazamiento de pantallas. La evidencia está en `.verification/smoke.json` y las capturas de esa carpeta, dentro del worktree.

Se usó Node.js 24.15.0, dependencias de los lockfiles existentes y generación local del cliente Prisma. Se deshabilitó la comprobación externa de actualizaciones de Prisma para las verificaciones mediante variables de entorno del proceso. No se ejecutaron setup, db:init, dev ni start sobre una base de trabajo. Los tests y el smoke utilizaron bases temporales.

Estos resultados cubren las pruebas existentes; no equivalen a una aceptación manual del negocio ni prueban una función de consignación que no está implementada. No se hicieron commits, push ni publicaciones.
