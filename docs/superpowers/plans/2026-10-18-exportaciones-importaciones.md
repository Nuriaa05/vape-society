# Actualización de exportaciones e importaciones

**Objetivo:** cubrir los datos de cobranzas, mercadería a crédito y precios mayoristas en las exportaciones existentes, y verificar su conservación al importar respaldos SQLite.

**Criterio:** conservar los CSV como archivos de consulta y los respaldos `.db` como formato completo de restauración. Reutilizar repositorios, cálculos financieros y serialización CSV existentes. No añadir dependencias, inferir movimientos históricos ni modificar la base de trabajo durante las pruebas.

- [x] Revisar los puntos de exportación de Configuración, Productos y Reportes; identificar tablas y relaciones ya cubiertas por la importación.
- [x] Añadir pruebas de regresión de columnas financieras, valuación histórica, precios y exportaciones completas con paginación; ejecutarlas antes de la implementación.
- [x] Completar `frontend/src/lib/data-export.ts` y separar las nuevas secciones en `data-export-sections.ts`. Exportar clientes, planes, cuotas, cobros y aplicaciones, tarjetas y acreditaciones, devoluciones y cancelaciones, deudas/pagos/reintegros de proveedores, ingresos/asignaciones FIFO y listas/escalas/precios. Incluir archivados, anulaciones y reversiones.
- [x] Incorporar un controlador de lectura de exportaciones bajo el módulo de respaldos para los registros sin consulta completa existente, con identificadores de sección permitidos y pruebas sobre una base temporal. Mantener separados los movimientos reales y los importes previstos.
- [x] Compartir el armado de ventas y productos entre los CSV de sus pantallas y Configuración. Usar `serializeCSV`/`downloadCSV` en todos los puntos; preservar filtros, evitar límites de vista previa y mantener los importes como números.
- [x] Ampliar los conteos de importación en `sqlite-import.ts`, el contrato de `backups-repository.ts` y sus etiquetas en `data-import-controls.tsx`. Verificar migración antigua, validación completa y restauración de registros relacionados únicamente en bases temporales.
- [x] Ejecutar Node 24: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Completar un recorrido de Configuración, Productos y Reportes y verificar archivos descargados. No hacer commits ni push.

**Verificación de importación:** conservar la comparación de todas las tablas del respaldo, las referencias entre registros y los importes originales. Las pruebas de reemplazo deben apuntar exclusivamente a las bases creadas por `prisma-test-database.ts`/`legacy-test-database.ts`; nunca a `backend/prisma/core.db`.

**Compatibilidad verificada:** una versión inicial de `20261015010000_supplier_credit` dejó el checksum `ea6fbe3843c58ac8a7974a025ff87c14864db75ba69062af9b2ac31b8bff4bd8`. La comparación de las 105 definiciones de tablas e índices de una copia con una base nueva migrada no encontró diferencias. El importador acepta exclusivamente ese alias para esa migración y mantiene las validaciones posteriores. Se probaron el rechazo del alias para otra migración y el rechazo de importes financieros inconsistentes.

**Recorrido de interfaz:** Playwright con Chrome, sobre una copia temporal. Se descargaron y leyeron los 33 CSV de Configuración, el de Productos y los cuatro de Reportes, más una exportación de ventas filtrada por fechas. Las ventas de Reportes y Configuración conservaron las mismas columnas y valores. Se verificaron la vista previa de importación, su cancelación y las pantallas de 1440 × 960 y 390 × 844, sin errores de JavaScript ni respuestas de API fallidas. La restauración con comparación de todas las tablas se probó mediante la API sobre una base temporal.

**Resultado:** los cuatro comandos raíz finalizaron con código 0 usando Node 24.19.0. Pasaron 371 pruebas del frontend (50 archivos) y 358 del backend (46 suites), 729 en total. El servidor local quedó activo en `http://127.0.0.1:3002`; se cerró el servidor temporal de verificación. Se conservó la rama `simplificar-mayorista`, sin commits ni push.
