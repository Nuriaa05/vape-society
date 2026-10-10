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

**Corrección posterior a la auditoría:** aplicada el 10 de octubre de 2026. Nueva compra y Editar compra utilizan el mismo formato argentino para cargar los costos: coma decimal y sin separadores de miles. La edición conserva el costo original de cada ítem, aunque el precio del catálogo haya cambiado. Siete pruebas de regresión verifican importes enteros, centavos y cero. La comprobación con Playwright y respuestas de API aisladas confirmó que dos guardados sucesivos y Guardar y registrar conservan costos, cantidades y total: `1250,25` se envía como 125.025 centavos. No se modificaron datos reales.

### A02 · Alta · La fecha de compra cambia de día en Historial y Reportes

**Reproducción:** registrar una compra de $1.500 con fecha 01/10/2026. Se guarda como `2026-10-01T00:00:00.000Z`. En Argentina ese instante corresponde al 30/09/2026 a las 21:00. Historial la incluye el 30 de septiembre y el resumen comercial de octubre informa $0 en compras cuando debería incluir esos $1.500.

**Causa:** `backend/src/modules/purchases/purchases.service.ts:102` y `:146` convierten una fecha sin hora con `new Date(dto.date)`. Reportes aplica límites de mes en horario argentino (`backend/src/modules/reports/reports.service.ts:154`), e Historial utiliza esos límites y la fecha de compra (`backend/src/modules/history/history.service.ts:174` y `:237`).

**Recomendación:** definir un criterio común para las fechas calendario de compras que preserve el día elegido, tanto al guardar como al consultar. La corrección debe contemplar las compras existentes.

**Corrección posterior a la auditoría:** aplicada el 10 de octubre de 2026. Crear o editar una fecha calendario guarda el inicio del día argentino (03:00 UTC); las fechas ISO con hora explícita conservan su instante. El formulario toma el día argentino como fecha automática y la consulta de compras utiliza ese mismo criterio, incluida la exportación. La migración `20261010000000_purchase_calendar_dates` corrigió las tres compras existentes y recalculó la última compra de sus proveedores. Antes de aplicarla se creó un respaldo en `backend/backups/antes-corregir-fechas-compras-2026-10-11T03-01-15-136Z-1f0b6b18-ecb1-4f8b-9bef-984d31d99d03.db`; ambas bases pasaron la comprobación de integridad. La comparación completa de las tablas confirmó que se conservaron importes, estados, ítems, stock y fechas operativas. Playwright comprobó creación, edición, fecha automática después de las 21:00, Historial y Reportes en octubre y enero. En la base de trabajo, el filtro del 01/10/2026 devuelve su compra a las 00:00 y Reportes suma $31.500 en compras registradas de octubre.

### A03 · Media · El filtro de fecha de Ventas usa un día diferente al mostrado

**Reproducción:** una venta del 10/10/2026 a las 23:30 se muestra correctamente con esa fecha. Filtrar por 10/10 no la encuentra; filtrar por 11/10 sí la muestra.

**Causa:** `frontend/src/lib/repositories/sales-repository.ts:293` filtra con `sale.date.startsWith(date)`, sobre el ISO en UTC. La tabla usa `formatDateTimeAR`, que convierte al horario argentino.

**Recomendación:** aplicar el filtro sobre el mismo día argentino que muestra la tabla. El problema afecta las ventas entre las 21:00 y las 23:59.

**Corrección posterior a la auditoría:** aplicada el 10 de octubre de 2026. El filtro utiliza `formatDateInputAR` para comparar el día en `America/Argentina/Buenos_Aires`, igual que la fecha visible en la tabla. Ocho pruebas de regresión cubren ventas antes y después de las 21:00, ventas posteriores a las 22:00, medianoche argentina, cambios de mes y año y la consulta sin fecha seleccionada. Las pruebas del filtro y de los formateadores también pasaron con la zona horaria del proceso configurada en `Pacific/Honolulu`.

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

**Verificación posterior de A02:** typecheck, lint, build y tests completos correctos. Pasaron las 202 pruebas del frontend (37 archivos) y las 220 del backend (32 suites): 422 en total. También pasaron las cuatro pruebas del runtime de Windows, incluida la conservación de la fecha original en el respaldo previo a la actualización y su corrección en la base actualizada. Las comprobaciones de Playwright sobre una base temporal y sobre la base de trabajo finalizaron sin errores de JavaScript. Las regresiones cubren límites de mes y año, fechas automáticas, creación, edición, registro, anulación, días inválidos, timestamps ISO y repetición del despliegue. La migración identifica las fechas antiguas por su codificación exacta a 00:00 UTC, que coincide con las tres fechas calendario revisadas en la base de trabajo. Evidencia adicional local: `.verification/fechas-compras/`.

**Verificación posterior de A03:** typecheck, lint, build y tests completos correctos. Pasaron las 210 pruebas del frontend (37 archivos) y las 220 del backend (32 suites): 430 en total. Seis de los nuevos casos de regresión fallaron por el desfase de fecha antes de aplicar la corrección; después pasaron los ocho casos añadidos. Las 33 pruebas del filtro, búsqueda y formateadores también pasaron con `TZ=Pacific/Honolulu`. Logs locales de tests y build: `.verification/filtro-fecha-ventas/`.

**Verificación posterior de A01:** typecheck, lint, build y tests completos correctos. Pasaron las 217 pruebas del frontend (37 archivos) y las 220 del backend (32 suites): 437 en total. También pasaron las 24 pruebas específicas de borradores, importes y compras. La reproducción en el navegador detectó la alteración de los costos antes de la corrección; después, los tres guardados conservaron los importes originales, sin errores de JavaScript. Se utilizó la interfaz real con respuestas de API aisladas y se bloquearon las mutaciones ajenas a los datos simulados.

Evidencia estructurada: [reproducciones.json](evidencia/reproducciones.json). Script utilizado: `.verification/auditoria-0.1.4/verify.cjs`. Logs de las verificaciones: `.verification/auditoria-0.1.4/`.

## Orden recomendado de corrección

1. Preservar importes al editar compras.
2. Unificar fechas de compras y filtros de ventas.
3. Corregir el resumen mensual y los cálculos de stock compartido.
4. Unificar disponibilidad de combos y estados del inventario.
5. Respetar la eliminación de métodos de pago y alinear los formularios de configuración.

Cada corrección debería incorporar una prueba que reproduzca su caso antes de cambiar el comportamiento. La conservación de importes al editar compras de A01, las fechas de compras de A02, el filtro de fecha de ventas de A03 y el filtro mensual de A04 ya están corregidos; las demás recomendaciones están pendientes de implementación.
