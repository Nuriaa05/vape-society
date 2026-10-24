# Restaurar la vista diaria de ganancias

**Objetivo:** recuperar Diario, Cortes de 10 días y Mensual en Reportes, con una fila por día en Diario. La tarjeta del dashboard conserva Ganancia de hoy y su enlace al día actual.

**Alcance:** reutilizar la agrupación `day` del backend. Conservar el rango consultado al alternar agrupaciones; usar desde el inicio del mes hasta hoy cuando no se indique uno. Mantener las pestañas subrayadas, el divisor y la cabecera con Exportar.

- [x] Actualizar las regresiones de períodos, fechas argentinas, rangos históricos y CSV; observar los fallos antes del cambio.
- [x] Eliminar la restricción automática a hoy en la navegación y actualizar la guía de demostración.
- [x] Ejecutar typecheck, lint, pruebas y build con Node 24. Revisar Diario, cortes, mensual, enlace del dashboard, CSV y navegación con el navegador, sin modificar las bases existentes.

No incluye commits, push, instalador ni cambios del manual.

## Verificación

- Siete regresiones observadas en rojo antes de implementar; 23 pruebas específicas aprobadas después. Suite completa del frontend: 53 archivos y 454 pruebas aprobadas.
- Typecheck, lint y build del proyecto aprobados con Node 24.19.0. Dos pruebas del generador de demostración aprobadas sobre una base temporal nueva.
- Navegador integrado: Diario presenta 22 filas del 01/10/2026 al 22/10/2026; cortes y mensual conservan los mismos totales. Un intervalo de febrero de 2024 conserva sus 29 días. El enlace del dashboard y el modal de detalle consultan únicamente el 22/10/2026.
- CSV descargado: agrupación Diario, período completo y 22 filas diarias. Cabecera sin selector de fechas, pestañas y divisor conservados. Sin errores ni advertencias de consola ni desbordamiento horizontal en el navegador integrado.
- Huellas de contenido idénticas para la base de trabajo y la demostración antes y después de la revisión. Evidencias en `%TEMP%/vape-daily-profit-20261022`; registros de comandos en `%TEMP%/vape-daily-profit-*-20261022.log`.
