# Corregir los períodos de ganancias

El usuario confirmó tres opciones: **Ganancia de hoy**, **Cortes de 10 días** y **Mensual**. Se elimina la opción de recorrer el mes como una serie diaria. La agrupación interna `day` se conserva para consultar únicamente hoy y mantener la compatibilidad de la API y del enlace del dashboard.

- [x] Agregar pruebas de regresión para el nombre, la fecha argentina y el rango fijo de hoy.
- [x] Corregir los períodos y su navegación. Hoy siempre consulta el día actual; al pasar de hoy a cortes o mensual se recupera el rango del mes. Elegir otro rango desde el calendario cambia de hoy a cortes.
- [x] Actualizar las indicaciones del generador de datos de prueba.
- [x] Ejecutar typecheck, lint, tests y build; aprovechar la suite del backend ya en curso porque no se modifica su código.
- [x] Verificar con navegador el enlace desde Dashboard, los tres períodos, calendario, exportación, recarga y pantalla pequeña, conservando los datos existentes.

## Evidencia

- Cinco regresiones observadas primero en rojo y luego aprobadas. Suite completa del frontend: 53 archivos y 452 pruebas aprobadas.
- Dos pruebas del generador de la demostración aprobadas. Typecheck, lint y build aprobados. Backend: 49 suites y 413 pruebas aprobadas; `npm test` terminó con código 0. La suite del frontend se volvió a ejecutar sobre la corrección y aprobó sus 452 pruebas.
- Chromium 151 autorizado: se reprodujo antes la consulta diaria de todo el mes; después, la consulta, la barra, el detalle y el CSV de hoy abarcan solamente el día argentino actual. Probados cortes, mensual, selección de otro rango, recuperación de hoy, enlace del Dashboard, recarga y alternancia con Ventas; escritorio de 1600 px y móvil de 390 px sin errores de consola ni desbordamiento.
- Huellas de contenido idénticas antes y después para la base de trabajo, la demostración anterior y la demostración con 46 ventas. No se modificaron operaciones.
- Archivos de verificación: `%TEMP%/vape-profit-today-20261021`. Resultado completo del backend en `%TEMP%/vape-sales-demo-full-test-20261021.log`.
