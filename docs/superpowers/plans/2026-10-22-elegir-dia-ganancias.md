# Elegir un día en Ganancias

**Objetivo:** mostrar Elegir día a la izquierda de Exportar en la cabecera de Ganancias. Una selección aplica inmediatamente ese día, activa Diario y actualiza tarjetas, tabla, detalles y exportaciones.

**Implementación:** reutilizar el calendario existente con un modo de selección individual, un mes visible, navegación por teclado y atajos Hoy/Ayer. Permitir quitar el filtro para volver al mes actual. Mantener el selector de rango de Ventas con sus dos meses y su selección de inicio y fin.

- [x] Verificar la ausencia del control y agregar regresiones para elegir un día, validar la fecha y quitar el filtro.
- [x] Implementar el modo individual, la cabecera y la navegación de Ganancias, sin dependencias ni cambios de API.
- [x] Ejecutar typecheck, lint, pruebas y build. Revisar selección en otro mes, actualización de importes, CSV, quitar filtro, teclado, recarga y el rango de Ventas sobre la misma base de prueba.

No incluye commits, push, manual ni instalador.

## Verificación

- Seis regresiones observadas en rojo antes de implementar. Después: 29 pruebas específicas y la suite completa del frontend, con 53 archivos y 460 pruebas, aprobadas.
- Typecheck, lint y build del proyecto aprobados con Node 24. Comprobación de sintaxis del generador de demostración aprobada.
- Navegador integrado: Elegir día y Exportar quedan contiguos, con la misma altura. Un clic en el 15/09/2026 cierra el calendario, activa Diario y muestra una venta por $12.750, costo $7.500 y ganancia $5.250. La fecha se conserva al recargar.
- CSV descargado: una fila correspondiente al 15/09/2026 y los mismos importes. Probados Ayer desde Mensual, Hoy, Ver todo el mes, flecha izquierda y Enter. El selector individual presenta un solo mes y `aria-multiselectable=false`.
- Ventas conserva sus dos meses y su selección de rango en dos clics. Elegir 20/10/2026–21/10/2026 en Ventas no modifica el día seleccionado en Ganancias.
- Revisión a 1440×900 y 390×844, sin desbordamiento horizontal ni errores o advertencias de consola. Se restableció el tamaño normal del navegador.
- Huellas de contenido idénticas de la base de trabajo y la demostración antes y después. Evidencias y CSV en `%TEMP%/vape-profit-day-picker-20261022`; registros en `%TEMP%/vape-profit-day-picker-*-20261022.log`.
