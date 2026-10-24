# Reportes de ganancia

## Objetivo aprobado

Completar Reportes con ganancia diaria, cortes 1–10, 11–20 y 21–último día del mes, y balance mensual. Reutilizar el cálculo de Ganancia de hoy del Dashboard: ventas confirmadas y entregadas, reconocidas en su fecha de entrega, menos costo histórico de las unidades consumidas, incluidos componentes de combos.

## Restricciones

- UTF-8, React/Vite, NestJS, Prisma y SQLite; sin nuevas dependencias ni cambios de esquema previstos.
- Mantener la rama actual y los cambios ajenos. Sin commits, push, instalador ni publicación.
- Conservar los registros originales y la base nueva de prueba abierta en http://127.0.0.1:3003 (C:/Users/nurym/AppData/Local/Temp/vape-stock-demo-3KxnFF/core.db). No volver a abrir la base anterior al finalizar.
- La base de trabajo es backend/prisma/core.db. No cargar fixtures en ella ni acceder a otro proyecto. Las pruebas automatizadas y ventas sintéticas usan bases temporales independientes.
- Importes en centavos enteros. Fechas en America/Argentina/Buenos_Aires, días inclusivos para el usuario e inicio incluido/fin excluido en la API. Fechas visibles dd/mm/aaaa.
- Descuentos y recargos ya incluidos en el total confirmado. Cobros, acreditaciones y pagos a proveedores no duplican ventas ni ganancias. Las compras a crédito conservan su costo aunque el proveedor todavía no haya cobrado.
- Excluir ventas pendientes y anuladas. Anular retira la venta de su período original; los cortes son consultas que se recalculan, no cierres congelados.
- Ante historial de costos inconsistente, conservar ventas conocidas y devolver costo/ganancia null en el grupo afectado y resumen. Mostrar “No disponible”, nunca “Costo pendiente”; no inferir costo a partir del producto actual.

## Contrato de API

GET /api/reports/profit?from=ISO&to=ISO&groupBy=day|tenDays|month

- from y to opcionales juntos; por defecto, primer día del mes actual hasta el fin de hoy en Argentina. groupBy por defecto day.
- Respuesta { from, to, groupBy, summary, buckets }.
- Summary = { salesCount, missingCostSalesCount, revenueAmountCents, costAmountCents: number|null, profitAmountCents: number|null }.
- Bucket = Summary & { from, to, label, partial }. from/to son los límites efectivos recortados al filtro. label describe el día, corte o mes. partial indica un corte o mes incompleto. Incluir períodos vacíos con cero. Mantener ceros y pérdidas.
- Resolver ventas y asignaciones de costo en conjunto y agrupar en memoria sin una consulta por día.

GET /api/reports/profit/sales?from=ISO&to=ISO&page=1&pageSize=10

- Mismos límites de fecha; enteros positivos de paginación, pageSize máximo 100.
- Respuesta { from, to, page, pageSize, total, totalPages, summary, items }.
- summary incluye todas las ventas del intervalo, independientemente de la página.
- Item = { id, number, customerName: string|null, saleDate: ISO, deliveredAt: ISO, revenueAmountCents, costAmountCents: number|null, profitAmountCents: number|null, missingCost: boolean }.
- Orden estable por entrega descendente, con desempate estable. Solo lectura.
- Mantener compatible getSalesProfit(prisma,start,end) y su respuesta para Dashboard.

## Interfaz

- Reportes mantiene el menú y gana las vistas Ventas / Ganancias. El selector Período permanece junto a Exportar; aplicar automáticamente al completar un rango.
- Ganancias abre en Este mes (hasta hoy) si no recibió otro rango. Mostrar el intervalo activo.
- Tres tarjetas con iconos de colores: Ventas entregadas del período, Costo de productos vendidos, Ganancia del período.
- Selector Diario / Cortes de 10 días / Mensual. Tabla con período, cantidad de ventas, ventas, costo, ganancia y Ver ventas. Marcar cortes/meses parciales.
- Ver ventas abre un modal con comprobante, cliente, fecha de entrega, venta, costo y ganancia. Paginación y resumen completo del intervalo. Sin nuevas operaciones financieras.
- Conservar la última respuesta durante actualización con “Actualizando”, sin exportar una respuesta anterior al filtro vigente. Manejar errores y reintentos por vista.
- El enlace Ver reportes del Dashboard abre /reportes?vista=ganancias&desde=YYYY-MM-DD&hasta=YYYY-MM-DD con hoy seleccionado. Usar search validado del router y conservar filtros al recargar.
- Exportar CSV de todos los grupos del filtro y de las ventas del detalle cuando se solicite, no solamente de una página. Imprimir/PDF de la vista activa con período, agrupación y totales; no imprimir menús ni modales cerrados.
- Mantener Ventas menos compras como indicador comercial existente de la vista Ventas.

## Tareas y estado

- [x] 1. Backend: pruebas primero, motor compartido, agrupaciones, API y detalle paginado. Revisar compatibilidad con Dashboard.
- [x] 2. Frontend: contratos, repositorio, búsqueda de URL y exportación, con pruebas de fechas/importes/null y todas las filas.
- [x] 3. Interfaz: vistas, tarjetas, filtros, tabla, modal, impresión y enlace del Dashboard. Implementación y revisión independiente del código completadas; la verificación visual restante se registra en la integración.
- [x] 4. Integración: revisión independiente, pruebas completas con Node 24, recorrido real del navegador y preservación de bases. Instancia de la base nueva conservada en 3003. Hallazgos visuales y evidencia registrados en el informe final.

## Verificación requerida

Límites de cortes, febrero y bisiestos, cambios de año, rangos parciales, Argentina a medianoche, descuentos, mayoristas, recargos, combos, cuotas, anulaciones, falta de historial, modificación posterior de productos y períodos vacíos/negativos. Comprobar suma de días = cortes = meses para el mismo filtro, totales ajenos a paginación, validación de fechas y query, CSV completo, impresión y errores/reintentos.

Ejecutar npm run typecheck, npm run lint, npm test y npm run build con Node >=24.15.0 <25. La última suite completa duró unos 26 minutos; esperar el resultado sin volver a iniciarla innecesariamente. Conservar las bases de trabajo y de prueba. Comprobar sus huellas antes/después de los recorridos de solo lectura.

## Verificación de implementación

- Backend: 46 pruebas focalizadas y suite completa de 49 archivos/413 pruebas aprobadas, con revisión independiente de contrato y calidad. Cálculo FIFO compartido entre Dashboard, agrupaciones y detalle.
- Frontend final: 52 archivos y 424 pruebas aprobadas. Typecheck, lint y build completos aprobados con Node 24.19.0.
- Revisión final de código: aprobada. Corregidas la filtración de propiedades del informe a la URL de exportación, las acciones de exportación durante actualización/error, el calendario argentino histórico, el CSV del intervalo del modal y los límites del calendario visible.
- Recorrido interactivo realizado antes del bloqueo del navegador: vistas Ventas/Ganancias, agrupaciones, calendario de dos clics, períodos parciales, historial sin costo conocido, modal de 101 ventas con páginas de 10 y CSV global de 103 ventas completo. Pruebas realizadas en una copia temporal de la base; no en la base del usuario.
- Smoke adicional por API aprobado: igualdad de totales diarios/cortes/mensuales, paginación completa, costos históricos después de cambiar el costo actual y anulación que corrige el período original.
- Revisión visual final completada con Playwright 1.61.1 y Chromium local 151.0.7922.34, autorizado expresamente por el usuario tras el bloqueo del navegador integrado. Pantallas de 1280, 768, 390 y 320 px; calendario de dos meses, modal, paginación, navegación y enlace del Dashboard aprobados. CSV global de 105 ventas y detalle de 103 ventas completos sobre una copia temporal independiente.
- Ocho escenarios de errores/demoras aprobados: bloqueo de exportaciones durante actualización, error y reintento del informe y del modal, descarte de descargas obsoletas al cambiar filtros o cerrar/reemplazar el detalle, aviso y recuperación de fallos de exportación. Sin excepciones ni errores de consola ajenos a los HTTP 500 simulados.
- PDF diario de dos páginas con los 21 días, PDF por cortes de una página y regresión de Ventas de tres páginas revisados. P3-01 corregido: los controles e instrucciones de pantalla ya no se imprimen. P3-02 documentado como pendiente cosmético preexistente: “1 unidades” en la instantánea de lista de la vista Ventas; no afecta importes. Sin hallazgos P1/P2 en el alcance revisado. No se verificó impresión en una impresora física ni otros motores de navegador.
- Después del ajuste exclusivo de impresión: root typecheck, lint y build aprobados; suite frontend completa de 52 archivos/424 pruebas repetida y aprobada. Backend sin cambios en esta revisión: se conserva la suite completa previa de 49 archivos/413 pruebas, `npm test` con código 0. Total de pruebas vigentes aprobadas: 837.
- Base original y base nueva de prueba conservadas con huellas de contenido iguales antes/después; instancia del usuario en http://127.0.0.1:3003. Sin commits ni push. Evidencia e informe: C:/Users/nurym/AppData/Local/Temp/vape-profit-reports-20261021/visual-qa/qa-final.md.

## Seguimiento: Dashboard → Ganancias → Ventas

El usuario detectó que al cambiar desde el reporte de ganancia de hoy a Ventas se heredaba el rango del enlace del Dashboard: el gráfico pasaba a 24 horas y ocultaba los períodos habituales. Reproducido con un test de navegador que compara ese recorrido con el ingreso directo a Ventas (24 frente a 15 franjas y controles ausentes).

Corregido en el cambio de vista: entrar a Ventas limpia el rango heredado y recupera Hoy por hora, de 08:00 a 22:00. Pulsar la pestaña ya activa conserva el rango personalizado. El enlace del Dashboard mantiene el día correcto de Ganancias y Atrás/recarga conserva las fechas originales. Verificados también los períodos de 30 días, 90 días y año, el calendario personalizado y pantallas de 390/320 px con una copia temporal con ventas. Evidencia RED/GREEN y recorrido: C:/Users/nurym/AppData/Local/Temp/vape-profit-reports-20261021/navigation-fix.
