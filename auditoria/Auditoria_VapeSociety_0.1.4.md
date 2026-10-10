# Auditoría de consistencia de Vape Society 0.1.4

Fecha: 10 de octubre de 2026. Código revisado: `1cd8ebcbf4c69e28f4dfe0bf472f2b5459515107`.

Se confirmaron diez inconsistencias. La más urgente permite modificar involuntariamente el importe de una compra al guardarla. También hay diferencias entre las fechas, los indicadores de stock y las opciones que permite la interfaz.

La revisión comparó formularios, repositorios del frontend, validaciones y servicios del backend. Se navegó por las once pantallas: Dashboard, Nueva venta, Ventas, Productos, Combos, Stock, Compras, Proveedores, Historial, Reportes y Configuración. Las reproducciones se ejecutaron con la aplicación compilada, Playwright y una base nueva con datos ficticios en `127.0.0.1:43138`. La base de trabajo conservó el mismo SHA-256 antes y después de las pruebas. No se modificó código funcional.

## Hallazgos

### A01 · Alta · Editar una compra con centavos altera el costo

**Reproducción:** crear una compra pendiente con una unidad a $1.250,25, abrir Editar y pulsar Guardar cambios sin modificar el costo. El campo se carga como `1250.25`; el formulario muestra $125.025 y guarda ese nuevo importe. El costo pasa de 125.025 centavos a 12.502.500 centavos, cien veces más.

**Causa:** `frontend/src/routes/-pages/compras.tsx:772` convierte el costo con `String(i.cost)`, que utiliza punto decimal. `frontend/src/lib/money.ts:16` elimina todos los puntos porque el formato de entrada es argentino. La creación de compras sí utiliza `Intl.NumberFormat("es-AR")`, por lo que crear y editar usan formatos distintos.

**Recomendación:** utilizar el mismo formato argentino al cargar ambos formularios y verificar que abrir y guardar una compra mantenga exactamente sus importes. Es la primera corrección que conviene realizar.

[Captura del importe original y el formulario que lo multiplica](evidencia/compra-decimales.png).

### A02 · Alta · La fecha de compra cambia de día en Historial y Reportes

**Reproducción:** registrar una compra de $1.500 con fecha 01/10/2026. Se guarda como `2026-10-01T00:00:00.000Z`. En Argentina ese instante corresponde al 30/09/2026 a las 21:00. Historial la incluye el 30 de septiembre y el resumen comercial de octubre informa $0 en compras cuando debería incluir esos $1.500.

**Causa:** `backend/src/modules/purchases/purchases.service.ts:102` y `:146` convierten una fecha sin hora con `new Date(dto.date)`. Reportes aplica límites de mes en horario argentino (`backend/src/modules/reports/reports.service.ts:154`), e Historial utiliza esos límites y la fecha de compra (`backend/src/modules/history/history.service.ts:174` y `:237`).

**Recomendación:** definir un criterio común para las fechas calendario de compras que preserve el día elegido, tanto al guardar como al consultar. La corrección debe contemplar las compras existentes.

### A03 · Media · El filtro de fecha de Ventas usa un día diferente al mostrado

**Reproducción:** una venta del 10/10/2026 a las 23:30 se muestra correctamente con esa fecha. Filtrar por 10/10 no la encuentra; filtrar por 11/10 sí la muestra.

**Causa:** `frontend/src/lib/repositories/sales-repository.ts:293` filtra con `sale.date.startsWith(date)`, sobre el ISO en UTC. La tabla usa `formatDateTimeAR`, que convierte al horario argentino.

**Recomendación:** aplicar el filtro sobre el mismo día argentino que muestra la tabla. El problema afecta las ventas entre las 21:00 y las 23:59.

### A04 · Media · “Resumen del mes” suma todo el historial de compras

**Reproducción:** con cuatro compras de octubre y una de septiembre, la tarjeta muestra $8.750,25 y cinco compras. El total de octubre con la misma regla de excluir únicamente anuladas sería $7.750,25. Además, ese total mezcla compras pendientes y registradas; las registradas de octubre suman $3.500.

**Causa:** `frontend/src/routes/-pages/compras.tsx:253` pasa toda la lista a `getActiveTotal`. `frontend/src/lib/repositories/purchases-repository.ts:95` y `:101` solo excluyen anuladas; no filtran por mes ni separan borradores.

**Recomendación:** filtrar total y cantidad por el mes correspondiente. Identificar por separado los importes registrados y pendientes para que la tarjeta pueda compararse con Reportes.

**Corrección posterior a la auditoría:** aplicada el 10 de octubre de 2026. El total y la cantidad se calculan sobre el historial completo, filtrado por mes y año de la fecha de compra. El mes actual se determina en horario argentino. Se incluyen pendientes y registradas, y se excluyen anuladas. Siete pruebas de regresión cubren los límites de mes y año, los importes con centavos y los meses sin compras activas. La comprobación con Playwright y una base temporal de 14 compras mostró $6.500,25 y 4 compras para octubre; $3.600 y 7 compras para noviembre; y cero para enero de 2027. Anular una compra actualizó el resumen a $5.250 y 3 compras. La base de trabajo conservó el mismo SHA-256. La separación visual entre pendientes y registradas continúa como propuesta.

### A05 · Media · Productos y Stock muestran estados diferentes para el mismo pod

**Reproducción:** un producto tiene 13 unidades físicas, 10 reservadas, 3 disponibles y mínimo 5. Productos informa “OK”; Stock informa “Bajo stock”. La diferencia persiste después de cargar nuevamente ambas pantallas.

**Causa:** `frontend/src/lib/repositories/products-repository.ts:35` transforma únicamente el stock físico, sin reservas ni disponible. `frontend/src/routes/-pages/productos.tsx:335` utiliza el mismo evaluador de estado que Stock, pero con esos datos incompletos. `frontend/src/lib/repositories/stock-repository.ts:141` utiliza el disponible solo cuando está presente.

**Recomendación:** usar un criterio común para el estado del inventario y distinguir explícitamente stock físico, reservado y disponible.

### A06 · Media · Un combo sigue disponible aunque tenga un producto archivado

**Reproducción:** crear un combo, archivar uno de sus productos y buscar el combo en Nueva venta. Sigue apareciendo y puede agregarse al carrito, pero el servidor rechaza la cotización con “El combo contiene productos archivados”.

**Causa:** `backend/src/modules/combos/combos.service.ts:58` filtra únicamente el estado del combo. Archivar el producto no cambia la disponibilidad del combo (`backend/src/modules/products/products.service.ts:203`). Ventas sí valida el estado de los componentes (`backend/src/modules/sales/sales.service.ts:651`).

**Recomendación:** mostrar el combo como no disponible, con el motivo, cuando alguno de sus componentes esté archivado; mantener la validación del servidor.

### A07 · Media · La confirmación de stock negativo falla al compartir un producto con un combo

**Reproducción:** un pod tiene 10 unidades disponibles. Agregar 6 unidades directas y un combo que contiene otras 6. El pedido necesita 12. No aparece la advertencia de stock negativo ni se ofrece la confirmación correspondiente: la cotización se rechaza y Confirmar venta queda deshabilitado. El servidor acepta cotizar exactamente el mismo carrito cuando se envía la autorización explícita de stock negativo.

**Causa:** `frontend/src/lib/sale-cart.ts:94` calcula faltantes por cada línea por separado. Cada línea demanda 6 y parece válida, aunque juntas requieren 12. `frontend/src/routes/-pages/nueva-venta.tsx:219` decide si habilita la confirmación según esa lista. El backend sí suma los consumos por producto.

**Recomendación:** sumar por producto todas las cantidades directas y los componentes de combos antes de calcular faltantes y mostrar la confirmación.

[Captura del carrito bloqueado sin la opción de confirmar el faltante](evidencia/stock-compartido.png).

### A08 · Media · Los métodos de pago predeterminados eliminados reaparecen al iniciar

**Reproducción:** eliminar el método QR, sin ventas asociadas. La API confirma la eliminación y QR desaparece. Ejecutar sobre la misma base temporal el inicializador que corre en cada arranque vuelve a crear QR, habilitado.

**Causa:** `backend/src/base-data.ts:40` a `:50` vuelve a insertar cualquier método predeterminado que falte. `backend/src/base-data.service.ts:10` llama a ese inicializador en cada arranque. La eliminación del usuario no queda representada para ese proceso.

**Recomendación:** respetar las decisiones de configuración al volver a iniciar. Desactivar el método conserva su registro y evita este caso; la opción Eliminar debería tener un comportamiento persistente o una restricción explícita.

### A09 · Baja · Local exige dirección y teléfono sin indicarlo en el formulario

**Reproducción:** en una instalación nueva, escribir únicamente el nombre del local y pulsar Guardar. El botón está habilitado, pero la API rechaza toda la operación con `address should not be empty` y `phone should not be empty`. El nombre tampoco se guarda.

**Causa:** `backend/src/modules/settings/dto/settings.dto.ts:18` y `:27` exigen valores no vacíos. `frontend/src/routes/-pages/configuracion.tsx:739` y `:762` no indican esa obligatoriedad ni validan esos campos antes de enviar.

**Recomendación:** si ambos datos son obligatorios, indicarlo y validar con mensajes en español junto a los campos. Si pueden omitirse, permitir el vacío en el servidor. El CUIT opcional corregido sí funciona.

### A10 · Baja · La vista previa permite un pie de ticket vacío, pero no se puede guardar

**Reproducción:** borrar Pie del ticket en Comprobantes. La vista previa muestra automáticamente la leyenda predeterminada. Pulsar Guardar devuelve HTTP 400 con `footer should not be empty` y mantiene el valor anterior.

**Causa:** `frontend/src/lib/receipt-view.ts:28` aplica un texto de respaldo al pie vacío. `backend/src/modules/settings/dto/settings.dto.ts:38` a `:41` rechaza ese mismo valor.

**Recomendación:** alinear la validación y la vista previa. Permitir guardar el vacío con el texto de respaldo, o indicar y validar que el campo debe completarse.

## Verificaciones

Las diez reproducciones terminaron correctamente, sin errores de JavaScript en el navegador ni errores del script de auditoría. También se comprobó la navegación de las once pantallas, el cambio de apariencia Claro/Oscuro, el nombre automático del comprobante y el guardado de campos opcionales de proveedores.

`npm run typecheck`, `npm run lint`, `npm run build` y `npm test`: correctos. Pasaron las 187 pruebas del frontend (36 archivos) y las 208 pruebas del backend (31 suites): 395 en total. Las reproducciones de esta auditoría son comprobaciones adicionales; los hallazgos siguen presentes aunque la suite existente pase.

**Verificación posterior de A04:** typecheck, lint, build y tests completos correctos. Pasaron las 194 pruebas del frontend (37 archivos) y las 208 del backend (31 suites): 402 en total. La comprobación del resumen mensual con Playwright también pasó, sin errores de JavaScript en el navegador y sin modificar la base de trabajo.

Evidencia estructurada: [reproducciones.json](evidencia/reproducciones.json). Script utilizado: `.verification/auditoria-0.1.4/verify.cjs`. Logs de las verificaciones: `.verification/auditoria-0.1.4/`.

## Orden recomendado de corrección

1. Preservar importes al editar compras.
2. Unificar fechas de compras y filtros de ventas.
3. Corregir el resumen mensual y los cálculos de stock compartido.
4. Unificar disponibilidad de combos y estados del inventario.
5. Respetar la eliminación de métodos de pago y alinear los formularios de configuración.

Cada corrección debería incorporar una prueba que reproduzca su caso antes de cambiar el comportamiento. El filtro mensual de A04 ya está corregido; las demás recomendaciones están pendientes de implementación.
