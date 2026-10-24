# Restaurar el diseño anterior de Ganancias

**Referencia:** captura proporcionada por el usuario. Volver a las pestañas Ventas / Ganancias arriba de la página; en Ganancias mostrar el encabezado del período, tres tarjetas grandes y la tabla, sin gráfico ni datos comerciales de la vista Ventas.

Conservar la corrección confirmada de los períodos: Ganancia de hoy (día argentino actual), Cortes de 10 días y Mensual. No modificar cálculos, API, base de datos ni datos de prueba.

- [x] Reproducir con navegador la diferencia respecto de la referencia y guardar una prueba de regresión fuera del repositorio.
- [x] Restaurar el componente de página de Ganancias y las pestañas superiores, conservando exportaciones, estados de carga/error y selección de ventas en modal.
- [x] Verificar Ventas y Ganancias, sus fechas independientes, los tres períodos, Dashboard, CSV, impresión y pantallas pequeñas.
- [x] Ejecutar typecheck, lint, tests de frontend y build. La suite del backend acaba de aprobar 413 pruebas y no se modifica su código.
- [x] Comparar las huellas de las bases y registrar los resultados, sin commits ni publicación.

## Resultados

- Restauradas las dos vistas independientes. Ganancias presenta solamente sus tarjetas y tabla; Ventas conserva sus tarjetas, gráfico y tablas comerciales. Las pestañas quedan arriba en ambas vistas.
- Prueba de regresión visual primero en rojo y luego aprobada. Navegación, fechas independientes, hoy, cortes, mensual, calendario, enlace del Dashboard, detalle en modal, CSV y recarga aprobados con Chromium 151 autorizado.
- Acción de impresión y estilos de impresión verificados: pestañas y controles ocultos, tarjetas y tabla visibles. Pantallas de 768, 390 y 320 px sin desbordamiento ni errores de consola.
- Typecheck, lint y build aprobados; 53 archivos y 452 pruebas del frontend aprobados. Se conserva el resultado reciente de 49 suites y 413 pruebas del backend, cuyo código no cambió.
- Bases conservadas: trabajo, demostración anterior y demostración de 46 ventas. La instancia de prueba se volvió a abrir después de una interrupción sobre el mismo archivo SQLite, sin repetir la carga.
- Evidencia en `%TEMP%/vape-profit-layout-20261021`. Instancia de demostración: `http://127.0.0.1:3005/reportes?vista=ganancias`.
