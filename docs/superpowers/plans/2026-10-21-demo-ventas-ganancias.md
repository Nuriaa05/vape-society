# Datos de prueba para ventas y ganancias

**Objetivo:** dejar una app de demostración con ventas reales del sistema y resultados comprobables, sin modificar la base de trabajo ni la demostración anterior.

**Implementación:** `scripts/create-sales-demo.cjs` reutiliza `createStockDemo` para crear otra base temporal. Carga compras, combos, clientes y ventas mediante la API. Solamente en esa base recién creada ajusta las fechas históricas de las operaciones y movimientos para cubrir el mes actual y los cinco anteriores. Genera `ventas-ganancias.json` y una guía con importes esperados. No admite una base ni una API de destino.

- [x] Escribir y ejecutar primero las pruebas de aislamiento, resultados y conservación del stock.
- [x] Implementar el script y documentar su ejecución con Node 24 en README.
- [x] Verificar los importes por día, cortes de diez días y mes; excluir pendientes y anuladas de ganancias; verificar costos FIFO y combos.
- [x] Ejecutar las verificaciones relevantes y comparar las bases existentes antes y después.
- [x] Iniciar la demostración en un puerto libre y revisar Reportes y el dashboard con Chromium autorizado.

Comandos: `node --test scripts/create-sales-demo.test.cjs`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Para cargar y mantener la demostración: `node scripts/create-sales-demo.cjs --serve --port 3005`. Cada ejecución crea otra base independiente y conserva las anteriores.

## Resultados

- Cuatro pruebas de los generadores aprobadas, incluyendo base preexistente protegida, conservación de cantidades, relaciones SQLite y resultados de ganancias calculados independientemente.
- Typecheck, lint, build y formato de los scripts aprobados. `git diff --check` sin errores.
- `npm test` terminó con código 0: frontend aprobado (447 pruebas) y backend aprobado (49 suites y 413 pruebas). Su salida está en `%TEMP%/vape-sales-demo-full-test-20261021.log`. La corrección posterior de Ganancia de hoy volvió a verificar todo el frontend, con 452 pruebas aprobadas.
- Demostración en `http://127.0.0.1:3005`, base `%TEMP%/vape-stock-demo-UuFhIp/core.db`: 46 ventas (41 entregadas, 3 pendientes y 2 anuladas), seis meses, dos combos y stock restante disponible.
- Ganancia de hoy: $24.555. Ganancia del mes: $62.142,25. Los tres cortes suman el mismo total que el informe diario. CSV del primer corte: diez ventas, ingresos $37.221, costo $21.100 y ganancia $16.121.
- Revisión con Chromium 151 y Playwright, autorizados por el usuario: gráfico de ventas, ganancias por cortes y meses, detalle, exportación CSV, enlace desde Dashboard y alternancia en una pantalla de 390 px. Sin errores de consola ni desbordamiento de la página. Evidencia en `%TEMP%/vape-sales-demo-verification-20261021`.
- Huellas de contenido de la base de trabajo y la demostración anterior idénticas antes y después. No se cargaron fixtures ni se modificaron sus registros.
