# Reportes: gráfico de ventas y ganancias

> For agentic workers: ejecutar por tareas con subagent-driven-development; la integración permanece a cargo del coordinador. No hacer commits.

**Objetivo:** una sola pantalla de Reportes con Ventas/Ganancias dentro del mismo bloque de gráfico, resúmenes y períodos propios, conservando las tres tarjetas generales y el enlace del Dashboard.

**Arquitectura:** conservar los cálculos y endpoints existentes. Compartir el componente de barras con soporte de positivos, pérdidas y valores no disponibles. Mantener el contenido comercial montado y conservar por separado las fechas de Ventas y Ganancias; el modo y las fechas activas continúan en la URL. Los períodos de ventas y la agrupación de ganancias se conservan al alternar.

**Tecnologías:** React, TanStack Router/Query, Tailwind y Vitest existentes; Node 24.19.0. Sin nuevas dependencias, backend ni cambios de esquema.

## Restricciones globales

- Mantener la rama feat/tarjetas-stock y los cambios previos; sin commits, push, instalador ni servicios.
- UTF-8, cambios concretos, preservar backend/prisma/core.db y la demo vape-stock-demo-3KxnFF/core.db. Datos de QA solo en copias temporales.
- No añadir la explicación comparativa rechazada por el usuario.
- Permanecen arriba Ventas hoy, Ventas del mes y Compras del mes (con sus nombres del período cuando corresponda). Las cuatro tarjetas quitadas no reaparecen.
- Ventas: Total, Promedio y Pico; Hoy por hora/30 días/90 días/año. Ganancias: Ventas entregadas, Costo y Ganancia; Diario/Cortes de 10 días/Mensual. Los resúmenes de ganancias van dentro del bloque del gráfico.
- Selector Período junto a Exportar para el modo activo. Fechas independientes; recarga y enlaces existentes conservan fechas válidas. El Dashboard abre Ganancias con hoy.
- Conservar tabla agrupada de ganancias, modal paginado, CSV completos, PDF y estados de carga/error/reintento. Evitar exportaciones obsoletas al alternar modos o fechas.
- El resto de tablas y medios de pago permanecen visibles. Los datos comerciales siguen sus filtros de Ventas.

## Tarea 1: gráfico compartido

Archivos nuevos: frontend/src/lib/report-chart.ts, frontend/src/lib/report-chart.test.ts y frontend/src/components/report-bar-chart.tsx.

Interfaz: exportar `ReportChartPoint = { label: string; fullLabel: string; from: string; to: string; v: number | null }`. Exportar componente `ReportBarChart({ data, selectedIdx, onSelect, signed? })`, con data readonly ReportChartPoint[], índice number|null, callback (index:number)=>void y signed boolean opcional. No recibir max: calcular escala a partir de los datos.

- [x] Pruebas RED/GREEN de escala y posiciones: solo positivos, solo pérdidas, mixtos, ceros, centavos, datos vacíos y null.
- [x] Implementar eje con cero visible y barras negativas por debajo; null conserva “No disponible” y su detalle. En modo signed, positivos verdes y pérdidas rojas; ventas conservan color actual. Mantener tooltip, clic accesible, selección y desplazamiento horizontal local.
- [x] Verificar prueba focalizada, typecheck/lint de los archivos y revisión de especificación/calidad. El agente solo modifica estos tres archivos y escribe su informe fuera del repositorio.

## Tarea 2: integración en una pantalla

Archivos: frontend/src/routes/-pages/reportes.tsx y frontend/src/components/profit-report.tsx. Conservar profit-report-table.tsx, profit-sales-dialog.tsx y el motor actual.

- [x] Antes de cambiar el contenedor, reproducir en navegador que no hay selector dentro del gráfico y que Ganancias cambia toda la pantalla.
- [x] Quitar las pestañas superiores. Colocar el selector con nombre accesible “Datos del gráfico” dentro del bloque del gráfico en ambos modos.
- [x] Conservar fechas por modo con estado local y las fechas activas en la URL. Cambiar modo guarda las fechas salientes y restaura las entrantes; Ganancias sin selección usa este mes. Mantener períodos de ventas y agrupación de ganancias al alternar. Pulsar el modo activo conserva la selección.
- [x] Un AppShell, tres tarjetas generales, gráfico activo y medios de pago. Sustituir el gráfico local por ReportBarChart. Ganancias usa query existente, mini resúmenes con iconos, detalle por barra y tabla agrupada debajo del gráfico.
- [x] Exportar según modo activo. Mantener guards de ganancias y descartar descargas comerciales si el contexto activo cambió mientras se obtenían datos. Error del gráfico de ganancias permite reintento conservando los controles.
- [x] Conservar los demás listados, filtros y exportaciones. Revisar carga/error y acciones de impresión.

## Tarea 3: revisión y verificación

- [x] Revisión independiente del diff de esta unificación contra la copia previa, sin confundirlo con cambios anteriores ya existentes.
- [x] Con Node 24, npm run typecheck, npm run lint, npm test completo y npm run build. Backend sin fuentes modificadas en la unificación; la suite completa se ejecutó igualmente. Tras los últimos cambios de interfaz se repitió la suite frontend completa.
- [x] Navegador: selector dentro del gráfico, mismas tres tarjetas generales en ambos modos, independencia de fechas/períodos, Dashboard/hoy, Atrás/recarga, selección de barras, modal/CSV paginados, ganancias negativas/null, carga/error/reintento y respuestas demoradas. Pantallas de escritorio y 390/320 px; PDF sin controles y CSV del modo correcto.
- [x] Comparar huellas de las dos bases antes/después; conservar demo en 3003 y detener solo servidores de QA propios. Documentar evidencias fuera del repositorio.

## Evidencia de integración

- Carpeta de verificación temporal: C:/Users/nurym/AppData/Local/Temp/vape-unified-reports-20261021. Navegador Chromium 151.0.7922.34 con Playwright 1.61.1, alternativa autorizada por el usuario al navegador integrado desactivado. Viewports 1600/1280/768/390/320 px.
- Prueba de pantalla RED antes de la integración, GREEN después. Diecinueve pruebas matemáticas y cuatro casos adicionales de período de Ventas en URL. Frontend completo final: 53 archivos/447 pruebas aprobadas.
- Revisión independiente aprobada tras resolver dos P2: generación monotónica para descartar exportación o aviso antiguo en A→B→A, y marca mínima visible para valores no nulos subpíxel anclada en cero. Regresiones del navegador RED/GREEN en review-regressions-before.json y review-regressions-result.json. Sin hallazgos abiertos en la revisión de este alcance.
- CSV global con 105 ventas y detalle paginado con 103 ventas completos. Ocho casos de fallos/demoras y dos cancelaciones por salida del modo aprobados; también se verificó la descarga normal de ambos modos.
- PDF de Ganancias por cortes (3 páginas), diario (4 páginas, los 21 días presentes) y Ventas (3 páginas); gráficos completos dentro del ancho y controles ocultos. Renders revisados con Poppler. No se probó una impresora física.
- Períodos y rangos propios por modo, recarga activa y enlace Dashboard/hoy verificados. La selección del modo inactivo se conserva durante la sesión de la pantalla; una recarga recupera el modo y rango activos de la URL.
- No se agregó la aclaración comparativa excluida por el usuario. Sin cambios de fuentes backend, esquema, dependencias ni manuales en esta unificación. Las diferencias anteriores de estos archivos permanecen fuera del alcance.
- Al conservar las tarjetas comerciales de Ventas mientras se consulta Ganancias con otras fechas, las tres tarjetas muestran su rango cuando es personalizado. Caso RED/GREEN en card-dates.cjs y revisión en 390/320 px, sin agregar la explicación comparativa excluida.
- Cierre: Node 24.19.0; npm run typecheck, npm run lint, npm test y npm run build con código 0. Backend: 49 suites/413 pruebas; frontend final: 53 archivos/447 pruebas (repetida después del último cambio). Total vigente aprobado: 860 pruebas. La suite backend tardó 1588,321 segundos y no se reinició innecesariamente.
- Huellas finales de contenido iguales a las iniciales: trabajo b41579a5aa673cd5e389f58d6dd456c2a89e3ad414e9166df46bff00045c7067; demo b0f6fad75ad00b6cf9cb531b2ae12e9e6a192ae48c0ec3ce160450cafca3403d. UTF-8 estricto de 28 textos y git diff --check aprobados. Servidor de QA 3004 detenido; demo 3003 conservada. Sin commits, push, publicación ni instalador.
