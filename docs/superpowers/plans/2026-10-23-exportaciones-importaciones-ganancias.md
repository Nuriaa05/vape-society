# Exportaciones e importaciones de Stock y Ganancias

**Objetivo:** actualizar las exportaciones a las valuaciones y reportes actuales, y conservar sus resultados al restaurar respaldos.

**Diseño:** mantener CSV para consulta y SQLite para restauración. Reutilizar el resumen de Stock del servidor y el cálculo histórico de Ganancias. No guardar ganancias calculadas ni inventar costos de ventas antiguas. Trabajar en la rama actual, conservar los cambios ajenos y usar Node 24, sin dependencias nuevas.

- [x] Agregar regresiones de exportación: cinco indicadores de Stock, referencia mayorista y valores no disponibles; ganancias de todas las ventas entregadas, fechas e importes originales; resumen CSV sin fila total duplicada.
- [x] Implementar las opciones de Configuración con los cálculos existentes y conservar los exportadores actuales de detalle. Presentar los tres importes de Ganancias como resumen antes de sus agrupaciones.
- [x] Rechazar respaldos cuyas asignaciones de una salida de venta no correspondan a su cantidad física. Mantener compatibles las ventas antiguas sin asignaciones históricas y las salidas con faltantes declarados.
- [x] Verificar restauración completa, ganancias diarias, cortes de diez días, mensual y valuación de stock idénticos antes y después; comprobar migraciones antiguas sobre copias temporales.
- [x] Ejecutar typecheck, lint, tests y build; revisar descargas CSV y vista previa de importación con navegador. Conservar las bases existentes.

No incluye commits, push, instalador ni cambios del manual.

## Evidencia de verificación

- Regresiones observadas antes de implementar: cuatro fallos de exportación del frontend, tres consultas de ganancias inexistentes y una cantidad de salida inconsistente aceptada por el importador. Después: 87 pruebas específicas del frontend y 23 del backend aprobadas.
- Los cuatro comandos raíz, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`, terminaron con código 0 usando Node 24.22.1. Frontend: 53 archivos y 465 pruebas; backend: 49 suites y 417 pruebas. Total: 882 pruebas aprobadas.
- Navegador integrado sobre una copia temporal: resumen de Stock con cinco indicadores idénticos a la pantalla; ganancias con 42 ventas entregadas de todo el historial; CSV de un día con las tres cifras correctas y sin fila total duplicada. Sin errores ni advertencias de consola.
- Importación desde la interfaz: validación, cancelación y reemplazo con backup previo correctos. Comparación idéntica de las 35 tablas restaurables, excluyendo el registro local de backups y las migraciones. Vista previa de escritorio 1280×720 y pantalla pequeña 390×844 con desplazamiento interno y sin desbordamiento horizontal.
- Casos adicionales del navegador: respaldo antiguo migrado únicamente en su copia temporal (archivo fuente con SHA-256 idéntico después); respaldo con cantidad física de venta alterada rechazado antes de mostrar la confirmación. Las 35 tablas de la base temporal permanecen idénticas después del rechazo y la cancelación.
- Bases de trabajo y demostración con las mismas huellas de contenido después de las pruebas visuales. Se cerraron el navegador y el servidor temporales de verificación.
- Evidencias, archivos CSV y comparación de restauración en `%TEMP%/vape-transfer-ui-bIU8So`; registros de comprobaciones en `%TEMP%/vape-transfer-*-20261023.log`.
