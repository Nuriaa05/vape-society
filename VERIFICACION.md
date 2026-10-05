# Verificación de la actualización

Realizada el 3 de octubre de 2026 en Windows, con Node.js 24.15.0 y npm 11.12.1.

La primera extracción usó `codex/runtime-packaging`, en `2054f9d0`, y omitió los cambios finales. Se compararon todas las ramas locales y se corrigió el núcleo desde `main`, en `afe3a101dec2c2e51d749c5f8a8ae7b677a59a72`, del 15 de agosto. Esta rama contiene cupones, recargos, efectivo y vuelto, comprobantes actualizados, historial de actividad, reportes completos y los últimos ajustes de rankings y configuración.

| Verificación                        | Resultado                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Typecheck del backend y frontend    | Correcto                                                                                                                  |
| Lint del backend y frontend         | Sin errores                                                                                                               |
| Tests del backend                   | 149/149, 29 suites                                                                                                        |
| Tests del frontend                  | 105/105                                                                                                                   |
| Build del backend y frontend        | Correcto                                                                                                                  |
| Navegación con catálogo vacío       | 11 pantallas, sin errores de JavaScript ni API                                                                            |
| Circuito comercial en base temporal | Compra, reserva, entrega, anulación, stock y respaldo correctos                                                           |
| Pagos y cupones desde la interfaz   | Cupón creado; venta con descuento y recargo; efectivo recibido y vuelto correctos                                         |
| Historial de actividad y reportes   | Actividad y anulaciones visibles, rankings, consumo y exportación completos                                               |
| Lista de ventas                     | 603 registros, páginas de 200 con skip 0, 200, 400 y 600                                                                  |
| Scroll de las 11 pantallas          | Se llega al final con la rueda del mouse en 1280 × 480, sin desbordamiento horizontal                                     |
| Selector largo                      | 31 categorías; área de 303 px para 1032 px de contenido, última opción accesible                                          |
| Diálogo de producto                 | Área de 446 px para 578 px de contenido, acciones finales accesibles                                                      |
| Migración con datos existentes      | Validada primero sobre una copia y luego aplicada al núcleo, sin pérdida de registros ni cambios en sus campos anteriores |
| Integridad de SQLite                | Cero errores de claves foráneas                                                                                           |
| Codificación                        | 227 archivos de texto revisados sin UTF-8 inválido ni mojibake                                                            |

La base de trabajo sigue siendo `backend/prisma/core.db`, independiente de Lozano. Se conservaron el producto, la categoría, la venta, su línea, los dos movimientos de stock y el contador en 1 que ya había cargado el usuario. Se aplicó `20261003010000_current_payments` después de `20261003000000_core_init`, sin reemplazar la base ni modificar la migración anterior.

La base tiene seis medios de pago activos y conserva «Tarjeta» desactivado para mantener compatibilidad histórica. Una instalación nueva comienza sin operaciones ni catálogo y sin ese método antiguo.

Respaldo previo a la migración: `backend/backups/core-before-main-1791079319350.db`.

Se restableció el modo desarrollo que estaba en uso: frontend en `http://127.0.0.1:8081` y backend en `http://127.0.0.1:3002`. Se comprobó `/health/ready`, la configuración de pagos, el historial y los reportes mediante el proxy de Vite.

Las pruebas comerciales y de navegador se ejecutaron sobre bases temporales separadas, eliminadas al cerrarse. Evidencia local en `.verification`: `backend-tests-main.json`, `frontend-tests-main.json`, `smoke.json`, `database-migration-main.json`, `encoding-main.json`, `main-source-files.json` y `reports-main.png`.

La carpeta original de Lozano conserva el mismo estado de Git que tenía antes de esta tarea. El núcleo sigue teniendo su propio repositorio, sin commits ni remoto. Se mantuvieron las exclusiones de ingredientes, recetas, producción, instaladores e importación automática del runtime de Lozano.

Esta verificación acredita la extracción actualizada y sus circuitos reutilizables. La adaptación del catálogo, la marca, las reglas del nuevo cliente y la revisión de dependencias siguen pendientes para un producto final.

## Adaptación visual a Vape Society — 4 de octubre de 2026

Se trasladó la apariencia de `C:\Users\Gonzalo\Downloads\Sistema de stock\Stock Pods Panel.dc.html` a las once pantallas del núcleo: Geist, logo original, colores, tarjetas, formularios, tablas y menú lateral fijo. Se conservaron los modos claro y oscuro, con preferencia guardada en el navegador, y se habilitó el mismo menú en pantallas pequeñas.

Las tablas anchas y el gráfico de reportes tienen desplazamiento horizontal dentro de su contenedor en móvil. El menú lateral tiene su propio scroll en ventanas bajas; las páginas largas conservan el scroll del documento. Las páginas cuyo contenido entra completo no necesitan desplazamiento vertical. Los comprobantes permanecen blancos y legibles en modo oscuro; la impresión de reportes usa colores claros.

No se importaron los módulos de stock, movimientos, pedidos o proveedores del prototipo, ni sus categorías, datos de ejemplo o usuario ficticio. Los módulos comerciales y las categorías existentes siguen siendo los de Lozano Core. El nombre y encabezado comercial de los comprobantes siguen usando la configuración guardada en la base.

| Verificación | Resultado |
| --- | --- |
| Typecheck, lint y build de frontend y backend | Correctos; lint sin advertencias |
| Tests | 105 del frontend y 149 del backend: 254 correctos |
| Revisión en navegador | 66 comprobaciones: 11 rutas, dos temas y tres tamaños (1440 × 1000, 390 × 844, 1280 × 480), sin errores ni desbordamiento del documento |
| Menú móvil y preferencia de tema | Navegación hasta Configuración, cierre del menú y tema conservado al recargar |
| Operaciones comerciales | Compras, reservas, entrega, anulación, respaldos, cupones, recargos, efectivo y vuelto, historial, reportes y más de 600 ventas, sobre una base temporal |
| Scroll | Final de las páginas largas, menú de 839 px dentro de 480 px, selector de 31 categorías y acciones finales del diálogo accesibles |
| Fuente local | Geist servida desde el proyecto; ninguna petición externa del frontend |
| Impresión | Fondo claro, texto oscuro y menú oculto al imprimir desde modo oscuro; comprobantes legibles |
| Preservación | Backend y prototipo idénticos por hashes; todas las tablas y campos de la base de trabajo idénticos al estado previo |
| Lógica de las páginas | Sin cambios en el código fuera del renderizado JSX, comprobado con el parser de TypeScript |
| Codificación | 225 archivos de texto sin UTF-8 inválido ni mojibake |

Evidencia en `.verification`: `frontend-tests-vape.json`, `backend-tests-vape.json`, `vape-browser.json`, `vape-preservation.json`, `vape-business-code.json`, `vape-print-font.json`, `smoke.json` y capturas `vape-*.png`. Copia anterior del frontend: `.verification/before-vape-1791138353173`.

La fuente y el logo quedan dentro de `frontend/public`; no se agregaron dependencias. Se conserva el acceso local en `http://127.0.0.1:8081` con backend propio en el puerto 3002.

## Gráfico del dashboard — 4 de octubre de 2026

Se agregó «Unidades vendidas» debajo de los indicadores, siguiendo el gráfico de Vape Society: fondo, barras grises, selección roja, indicador de cantidad y selector Semanal/Mensual. Se puede seleccionar con mouse o teclado. En móvil, el gráfico mensual tiene scroll dentro de su contenedor y conserva visible la escala.

Semanal muestra los últimos siete días, incluido el día actual. Mensual muestra enero hasta el mes actual. Los límites de fechas usan Argentina y los períodos sin ventas se completan con cero. Se cuentan unidades de ventas confirmadas, pendientes o entregadas; se excluyen anuladas. Los combos suman las cantidades de sus productos guardadas en la venta.

Los datos provienen del nuevo endpoint de lectura `/api/reports/units-series`, con `period=week` o `period=month`. El gráfico de importes de Reportes conserva su comportamiento. No se agregaron dependencias ni cambios de esquema, y no se cargaron ventas de ejemplo en la base de trabajo.

| Verificación | Resultado |
| --- | --- |
| Typecheck, lint y build | Frontend y backend correctos |
| Tests | 107 del frontend y 153 del backend: 260 correctos |
| Conteo y fechas | Productos, componentes de combos, pendientes, anulaciones, días y meses de Argentina, cambio de año y períodos vacíos |
| Navegador | Ocho combinaciones de período, tema y tamaño: 1440 px y 390 px; selección con mouse y teclado, cantidades reales y sin desbordamiento del documento |
| Estados vacíos y recuperación | Comprobados con respuestas simuladas exclusivamente en el navegador de pruebas |
| Circuito comercial | Venta desde la interfaz, lectura semanal/mensual, anulación y actualización del gráfico sobre una base temporal; las once rutas y sus scrolls siguen funcionando |
| Preservación | Todas las tablas y campos de la base de trabajo idénticos al estado previo; SQLite íntegro, sin errores de claves foráneas; los diez archivos del prototipo conservan sus hashes |
| Codificación | 226 archivos de texto sin UTF-8 inválido ni mojibake |

La primera ejecución conjunta interrumpió el proceso de pruebas del backend en Windows. La repetición aislada de la suite completa terminó correctamente con 153/153 pruebas; el frontend terminó con 107/107.

Evidencia en `.verification`: `frontend-tests-dashboard-units.json`, `backend-tests-dashboard-units.json`, `dashboard-units-browser.json`, `dashboard-units-preservation.json`, `smoke.json` y capturas `dashboard-units-*.png`. Copia previa de los archivos modificados: `.verification/before-dashboard-units-1791141664199`.
