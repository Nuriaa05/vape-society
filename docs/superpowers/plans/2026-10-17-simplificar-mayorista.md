# Simplificar precios mayoristas

## Alcance aprobado

Hacer intuitivo configurar cantidades mínimas y precios por unidad, asignar listas a clientes y reconocer el precio aplicado en una venta. Conservar las APIs, el cálculo por cantidad total mezclada y el tratamiento actual de combos. No crear cantidades fijas, reglas nuevas, dependencias ni commits.

## Implementación

- [x] `price-lists.ts` y pruebas: resolver y mostrar precios efectivos de celdas vacías usando las cantidades configuradas, incluyendo cero y cantidades fuera de orden.
- [x] `price-lists-editor.tsx`: precios primero, acciones secundarias agrupadas, nombres concretos, ejemplo por producto/cantidad, protección de navegación y recarga con cambios sin guardar. Conservar borrador al alternar Productos/Listas.
- [x] `collections-forms.tsx`: consultar y elegir lista desde la ficha del cliente sin alterar el resto del formulario.
- [x] `sale-customer-fields.tsx` y resumen de Nueva venta: aclarar que elegir cliente aplica sus precios y destacar lista y cantidad activa.
- [x] Ejecutar typecheck, lint, tests y build. Actualizar el smoke mayorista para las nuevas etiquetas y comprobar borradores, navegación, herencia de precios y compatibilidad con cobranzas/proveedores en bases temporales. Ver limitación de la suite completa abajo.

## Validación

El ejemplo muestra el precio por unidad del producto para una cantidad total de venta; nunca guarda ni agrega una venta. Las celdas vacías muestran qué precio usarían y siguen omitiéndose al guardar. Cambiar de lista o navegar con cambios pendientes exige una decisión explícita; cancelar conserva el borrador. Una ficha de cliente permite asignar General o una lista activa. La vista de prueba usa la copia aislada existente.

## Resultado

- Typecheck, lint y build aprobados. Frontend: 329 pruebas aprobadas.
- Smoke mayorista aprobado: precios efectivos de celdas vacías, ejemplo sin escritura, conservación del borrador al alternar pestañas, cancelación de navegación, confirmación de descarte al cambiar lista y asignación desde la ficha del cliente. También conserva los recorridos anteriores de venta, financiación, reintentos e impresión.
- Smoke general: 12 pantallas aprobadas sin errores de página ni de API. Smoke de proveedores a crédito aprobado. Revisión visual de escritorio y celular realizada.
- El detector de los componentes modificados no informó hallazgos.
- `npm test` aprobó frontend pero el proceso completo de Jest terminó con un cierre nativo de Node en Windows (3221226505), sin resumen de backend. Se ejecutaron por separado las suites `wholesale-pricing.e2e-spec.ts`, `collections.integration-spec.ts` y `supplier-credit.integration-spec.ts`: 23 pruebas aprobadas en 3 suites. No se afirma que la suite completa del backend haya pasado en esta ejecución.
- Sin cambios de código en backend ni migraciones nuevas. Datos de pruebas en bases temporales; la vista de trabajo conserva su copia aislada.
