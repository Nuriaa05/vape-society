# Simplificar compras a crédito y proveedores

## Alcance

Continuar en `simplificar-mayorista`, conservando su trabajo local. Mejorar el circuito existente de compras a crédito sin introducir consignación, pagos parciales, cambios de API ni migraciones.

- [x] Proveedores: resumen con el patrón visual existente, búsqueda y filtro por deuda, acciones centradas y cuenta fácil de encontrar.
- [x] Cuenta del proveedor: deudas pendientes primero, historial secundario, carga de deuda anterior separada de compras nuevas; revisar pago antes de confirmar y mostrar el resultado.
- [x] Compras: condición de pago clara y acceso desde una cuenta con el proveedor seleccionado. Resumen de la compra en curso: importe pendiente o pagado, unidades y vencimiento.
- [x] Stock: pagado / a crédito / total, importes al costo y cantidades auxiliares en el detalle. Aclarar y simplificar identificación de existencias anteriores sin inventar deuda.
- [x] Pruebas de filtros y smoke del circuito comprar 10 a crédito, vender 4, conservar la deuda por 10 y pagarla para que las 6 restantes pasen a pagadas. Verificar reversión, deuda anterior, clasificación y reintegros; revisar escritorio/celular y ejecutar typecheck, lint, tests y build.

## Reglas que se conservan

La deuda nace al registrar la compra por su importe completo. Vender reduce existencias y no cancela esa deuda. Registrar el pago completo convierte las unidades restantes a pagadas sin aumentar el stock. Una carga de deuda anterior y su identificación de stock son operaciones distintas, sin duplicar compras ni unidades. Las correcciones conservan historial e idempotencia. Las pruebas usan bases temporales; la vista de trabajo conserva su copia aislada. Sin commits ni push.

## Verificación

- Typecheck, lint y build de frontend y backend: correctos.
- Frontend: 49 archivos y 331 pruebas correctas. Se verificó primero el fallo por ausencia del nuevo filtro y luego su comportamiento con deuda pendiente, historial y reintegros.
- Backend específico: 3 suites y 23 pruebas correctas (crédito de proveedores, cobranzas y precios mayoristas).
- Smoke de proveedores en escritorio y 390 px: correcto. Incluye selección del proveedor desde su cuenta, resumen de compra, filtros, revisión sin guardar, volver a editar, un único pago, reversión, deuda anterior sin duplicar unidades y reintegros.
- Smoke general: 12 pantallas y cobranzas correctas, sin errores de página ni API. Smoke mayorista: correcto, con sus rechazos simulados esperados y preservación de borradores.
- Vista de trabajo `http://127.0.0.1:51179/compras`: HTTP 200 y resumen nuevo visible, sin errores de página. Conserva la copia aislada de la base.
- Evidencias: `.verification/simplificar-proveedores`, `.verification/simplificar-proveedores-general` y `.verification/simplificar-proveedores-mayorista`.
- `npm test` completo: correcto. Frontend: 49 archivos y 331 pruebas. Backend: 45 suites y 349 pruebas; ejecución global de Jest terminada en 610,674 segundos. Total: 680 pruebas correctas. Sin cambios de backend ni configuración para obtener este resultado.

## Ajuste del estado de pago del stock anterior

La acción visible pasa a ser «Clasificar». Pide elegir «Pagada» o «A crédito»; la cantidad y el costo vienen de las existencias, y la nota es opcional. Para crédito se elige el proveedor y se muestran únicamente sus deudas anteriores pendientes. Si solo hay una, queda identificada en una tarjeta; varias requieren selección explícita.

Se puede cargar una deuda anterior desde el mismo recorrido mediante el formulario existente de Proveedores, conservando cantidad, costo y elección de pago. La deuda se guarda al confirmar ese formulario; identificar el stock es una operación posterior y separada. Se pide la deuda total, sin calcularla automáticamente desde las unidades que quedan. Ambas operaciones conservan sus identificadores estables para permitir reintentos.

La revisión indica las unidades, el estado elegido, el valor al costo y la deuda asociada, además de aclarar que el stock físico no aumenta. Para entradas nuevas hay un acceso a Compras. No se cambiaron APIs, reglas contables ni migraciones.

Verificación del ajuste: typecheck, lint y build correctos; smoke de proveedor ampliado correcto, incluyendo revisión sin guardar, deuda desde Stock sin perder datos, pérdida de respuesta y reintento sin duplicar deuda ni movimiento, selección limitada al proveedor, stock ya pagado sin registrar otro pago, y botones visibles en 390 px. Smoke general de 12 pantallas y mayorista correctos. Detector de diseño: sin hallazgos. Evidencias en `.verification/stock-pago-simple*`. La nueva ejecución completa de `npm test` terminó correctamente: 331 pruebas de frontend y 349 de backend (45 suites, 555,533 segundos). Total: 680 pruebas.

## Ingresos de mercadería desde Stock

Los productos nuevos se crean con stock cero; se elimina el campo de stock inicial del formulario. Stock incorpora «Aumentar stock» en la barra y en cada producto activo. La modal pide producto, proveedor, fecha, unidades, costo y condición Pagada / A crédito, reutilizando los campos financieros de Compras y su API existente. Al confirmar registra una compra: suma existencias pagadas o genera la deuda correspondiente. El ingreso queda visible en Compras y conserva un identificador estable para reintentar sin duplicarlo.

Ajustar stock conserva egresos y conteos físicos. Un conteo superior al stock registrado abre el mismo ingreso con la diferencia precargada; no permite sumar unidades sin identificar su compra. Un conteo menor, incluido cero, sigue siendo una corrección y no cancela deuda. «Clasificar» aparece únicamente cuando quedan existencias anteriores sin clasificar. No se modifican backend, esquema ni APIs.

Verificación: typecheck, lint y build correctos; pruebas de interfaz y API sobre bases temporales para alta con stock cero, ingreso pagado y a crédito, reintento tras pérdida de respuesta, conteo positivo y correcciones. Vista móvil de 390 px sin desbordes. Smoke general de 12 pantallas y cobranzas sin errores de página o API; smoke mayorista correcto. Evidencias en `.verification/stock-ingresos`, `.verification/stock-ingresos-general` y `.verification/stock-ingresos-mayorista`. Se conserva la vista de trabajo y su base aislada, sin commits ni push.

## Publicación de la rama

El usuario autorizó el commit y push de los cambios acumulados en `simplificar-mayorista`. La última ejecución de `npm test` aprobó las 330 pruebas de frontend, pero el proceso de backend terminó con el código nativo de Windows `3221226505`, sin identificar una prueba fallida ni emitir su resumen. No se considera aprobada esa ejecución completa. Se conservan las verificaciones de navegador y se comprueban por separado las suites relacionadas con compras e inventario, sin modificar el backend ni su configuración.

Antes del push se ejecutaron nuevamente typecheck, lint y build de ambos proyectos y las 330 pruebas de frontend, todos correctos. La comprobación separada de backend terminó correctamente: 6 suites y 45 pruebas de productos, compras, stock, reglas de stock, crédito de proveedores y lotes de inventario (109,493 segundos). Las verificaciones no cargan fixtures en la base de trabajo.
