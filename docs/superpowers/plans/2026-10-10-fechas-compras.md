# Corrección de fechas de compras A02

**Objetivo:** conservar el día seleccionado en Compras, Historial y Reportes, incluyendo las compras existentes.

**Diseño aprobado:** representar las fechas calendario al inicio del día argentino (03:00 UTC). Los valores ISO con una hora explícita conservan su instante. Una migración de datos corrige la codificación anterior de fechas calendario (00:00 UTC), sin cambiar importes, estados, stock ni fechas de creación o anulación.

**Tecnologías:** TypeScript, NestJS, Prisma/SQLite, React, Jest, Vitest y Playwright. Node >=24.15.0 <25.

## Restricciones

- Usar UTF-8 y mantener los cambios limitados a A02.
- Probar con bases temporales. No cargar fixtures en `backend/prisma/core.db`.
- Respaldar la base de trabajo antes de aplicar la migración.
- Conservar los cambios pendientes del rango horario de Reportes.
- No crear commits, publicar ni generar un instalador en esta tarea.

## 1. Guardado y consulta

Archivos: `backend/src/modules/purchases/purchase-date.ts`, `purchases.service.ts`, `backend/test/purchase-dates.integration-spec.ts`, `backend/test/purchases.service.spec.ts`, `frontend/src/lib/formatters.ts`, `formatters.test.ts`, `frontend/src/lib/data-export.test.ts`, `frontend/src/lib/repositories/purchases-repository.ts`, `purchases-repository.test.ts` y `frontend/src/routes/-pages/compras.tsx`.

- [x] Escribir regresiones sobre creación, edición, fecha automática, Historial y resumen comercial. El 01/10/2026 debe producir `2026-10-01T03:00:00.000Z` e incluirse en octubre.
- [x] Ejecutar las regresiones y confirmar que fallan por el desplazamiento actual.
- [x] Implementar `resolvePurchaseDate(value?: string, now?: Date): Date`: transformar solo `YYYY-MM-DD` a medianoche argentina; obtener la fecha automática en `America/Argentina/Buenos_Aires`; preservar horas ISO explícitas y rechazar fechas calendario inválidas.
- [x] Implementar `formatDateInputAR(date?: Date | string): string` para formar `YYYY-MM-DD` en Argentina. Usarlo al inicializar y limpiar el formulario y al convertir respuestas de compras.
- [x] Actualizar las expectativas de última compra del proveedor a 03:00 UTC.
- [x] Ejecutar las pruebas relevantes con Node 24: `npm --prefix backend test -- --runTestsByPath test/purchase-dates.integration-spec.ts test/purchases.service.spec.ts` y `npm --prefix frontend test -- src/lib/formatters.test.ts src/lib/repositories/purchases-repository.test.ts`.

## 2. Compras anteriores

Archivos: `backend/prisma/migrations/20261010000000_purchase_calendar_dates/migration.sql`, la regresión de actualización en `backend/test/purchase-dates.integration-spec.ts` y los casos de versiones anteriores en `backend/test/database-import.e2e-spec.ts` y `scripts/windows/runtime.test.cjs`.

- [x] Simular una base anterior con fechas a 00:00 UTC, fechas ya corregidas y horas explícitas; desplegar migraciones y comprobar el fallo antes de implementar.
- [x] Corregir únicamente valores enteros de fecha divisibles por 86400000, sumando 10800000 milisegundos. Recalcular la última compra solo para proveedores con compras registradas afectadas. La migración se aplica una vez mediante el registro existente de Prisma.
- [x] Verificar que importe, estado, ítems, stock, `createdAt`, `updatedAt` y `cancelledAt` se conservan. Un segundo despliegue debe conservar todas las fechas, incluso nuevas compras con una hora ISO explícita.
- [x] Actualizar la simulación de respaldos anteriores para que el historial de migraciones corresponda a esa versión. Las doce pruebas de importación pasaron después del ajuste.

## 3. Verificación y aplicación

- [x] Ejecutar `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
- [x] Navegar con Playwright sobre una aplicación compilada y una base temporal: crear/editar una compra de pods el primer día del mes, consultar Historial y Reportes, y probar el cambio de año.
- [x] Respaldar `backend/prisma/core.db` mediante la API de backup de SQLite y comprobar la integridad del respaldo.
- [x] Aplicar `prisma migrate deploy` sobre la base de trabajo, sin ejecutar semillas. Comparar los registros anteriores y posteriores y comprobar la integridad de la base.
- [x] Reiniciar el backend local para cargar el guardado corregido y verificar las tres fechas anteriores en la aplicación.
- [x] Ejecutar `npm run test:installer`: comprobar el respaldo automático de la fecha anterior y la actualización a medianoche argentina, conservando stock e ítems.
- [x] Actualizar la evidencia de A02 en el informe de auditoría y revisar el diff final.

**Resultado:** 202 pruebas del frontend, 220 del backend y 4 del runtime de Windows aprobadas. La revisión adicional de código comprobó 28 casos de fechas y migración. La migración de trabajo corrigió tres compras, con respaldo previo e integridad verificada; la comparación completa de tablas conservó los demás campos y registros. El backend local se reinició y la comprobación visual confirmó el filtro de Historial del 01/10/2026 y los $31.500 de compras registradas de octubre. Evidencia y scripts locales: `.verification/fechas-compras/`.
