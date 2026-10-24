# Ganancia de hoy en Dashboard

**Objetivo:** agregar la tarjeta aprobada “Ganancia de hoy” con enlace a Reportes, sin ampliar este cambio al balance mensual ni a cortes de diez días.

**Criterio:** importe final de ventas confirmadas y entregadas menos costo histórico de sus unidades. El día es America/Argentina/Buenos_Aires. Para entregas actuales se usa la fecha del movimiento de salida; una operación antigua sin movimientos se identifica por fecha de venta y queda con ganancia no disponible. El costo del producto ya es obligatorio: no mostrar “Costo pendiente” como una tarea por completar. Las anulaciones se excluyen. Cuotas, acreditaciones, compras y pagos a proveedores no agregan otra venta ni otro costo.

**Datos:** usar las asignaciones existentes de salidas a lotes FIFO, también para componentes de combos. Verificar que cubran exactamente las unidades vendidas. Si falta costo en alguna venta, devolver ganancia y costo como null, junto con la cantidad afectada. No inferir costos antiguos con el precio actual del producto. Importes en centavos enteros; resultados negativos permitidos.

**Alcance:** misma rama de trabajo, sin dependencias, migraciones, commits, push ni cambios a manuales o instalador. Conservar los cambios ajenos existentes, incluido frontend/package-lock.json. Las pruebas usarán bases temporales.

## Tareas

- [x] Escribir pruebas de integración en backend/test/reports-profit.spec.ts: día argentino, entrega de una venta anterior, FIFO, descuentos, combos, venta anulada o pendiente, costo faltante y pérdida. Ejecutarlas y observar la falta del campo todayProfit antes de implementar.
- [x] Crear backend/src/modules/reports/sales-profit.ts para consultar y validar costos. Añadir todayProfit al resultado de ReportsService.getDashboardSummary() con consulta paralela a las existentes. Cubrir ventas sin historial y unidades sin asignar sin inventar importes.
- [x] Probar la transformación de todayProfit en frontend/src/lib/repositories/reports-repository.test.ts, incluida la conservación de null. Extender el repositorio y agregar la quinta tarjeta en frontend/src/routes/-pages/index.tsx con un enlace accesible a /reportes. Usar cinco columnas en escritorio amplio, tres desde 1024 px, dos en pantalla mediana y una en móvil.
- [x] Ejecutar npm run typecheck, npm run lint, npm test y npm run build con Node 24, además de los tests del generador aislado. Revisar Dashboard y navegación a Reportes en escritorio y móvil si el navegador está habilitado; documentar el bloqueo en caso contrario.
- [x] Revisar el diff, comprobar que la base de trabajo conserva su contenido y entregar el resultado con las verificaciones y limitaciones reales.

## Verificación realizada

- Node 24.19.0. Los cuatro comandos de la raíz terminaron con código 0. La suite completa aprobó 374 pruebas de frontend y 378 de backend. También aprobaron las dos pruebas del generador de catálogo aislado.
- Después de los últimos ajustes de texto y distribución, se repitieron lint y build del frontend; después de ampliar los casos de integridad, se repitieron typecheck y lint del backend. Todos terminaron con código 0.
- Recorrido visual con el navegador integrado en 390, 1024, 1265 y 1536 px. Se comprobó el enlace a Reportes, ausencia de errores de consola, ganancia cero y ganancia no disponible ante historial incompleto.
- Una venta real sobre la base temporal produjo $3.240 de venta, $1.800 de costo y $1.440 de ganancia. La base de trabajo conservó sus 37 tablas y la misma huella de contenido antes y después de las pruebas.
