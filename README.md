# vape society Core

Núcleo comercial local independiente, actualizado desde `main` de Lozano (`afe3a101`, 15 de agosto de 2026). Es una base para desarrollar otro negocio; conserva sus reglas comerciales y usa el estilo visual del prototipo de Vape Society.

## Contenido

- `backend`: NestJS, Prisma y SQLite. Productos, categorías, combos, proveedores, ventas, cupones, recargos, efectivo y vuelto, reservas, entregas, anulaciones, compras, ajustes de stock, historial de actividad, configuración, reportes y respaldos.
- `frontend`: React y Vite, con las pantallas comerciales reutilizadas y la apariencia de Vape Society.
- `scripts/core.mjs`: comandos para preparar, desarrollar y ejecutar este proyecto con su propia base y puertos.

Se excluyeron ingredientes, recetas, producción, sus relaciones y pantallas, las migraciones históricas, el prototipo Tauri, instaladores, servicios de Windows, videos, documentación antigua y datos de Lozano. También se quitó el servidor SSR de TanStack Start: esta interfaz funciona como una SPA local.

## Apariencia

La referencia es `C:\Users\Gonzalo\Downloads\Sistema de stock\Stock Pods Panel.dc.html`: fuente Geist, logo original, paleta, modos claro y oscuro, menú lateral fijo, botones, tablas y tarjetas. La preferencia de tema se conserva en este navegador. El menú se abre desde un botón en pantallas pequeñas; las tablas anchas se desplazan horizontalmente dentro de su tarjeta. La impresión de reportes usa colores claros en ambos temas.

Se conservaron los módulos, operaciones y categorías del núcleo. No se importaron el stock, los movimientos, los pedidos, los proveedores ni las categorías o datos de demostración del prototipo. La marca de la interfaz no modifica los datos comerciales ni el encabezado configurable de los comprobantes.

El logo y los archivos de Geist se sirven desde `frontend/public`; no requieren conexión a Internet. La licencia SIL Open Font License está en `frontend/public/fonts/OFL.txt`.

## Base nueva

Se crea **otro archivo SQLite** en `backend/prisma/core.db`, con el esquema comercial reducido. La migración inicial y la actualización de pagos permiten preparar una base vacía o actualizar la primera versión del núcleo conservando sus datos. No se copia ni se vacía una base de Lozano.

En una base vacía, la inicialización crea seis medios de pago: Efectivo, Transferencia, QR, Tarjeta Debito, Tarjeta Credito un pago y Tarjeta Credito cuotas. Los recargos iniciales de las tarjetas son del 2,5%, como en Lozano, y se pueden modificar en Configuración. El método antiguo «Tarjeta» se desactiva cuando se actualiza una base existente, conservando sus referencias históricas.

También crea configuración genérica, un contador de comprobantes en cero y el proveedor interno «Local». No carga productos, categorías, cupones, ventas, compras ni stock. Repetirla conserva los datos y la configuración existente.

Los datos sintéticos en `backend/test/fixtures` existen exclusivamente para pruebas sobre bases temporales. No se ejecutan durante la preparación o el arranque.

## Uso

Requiere Node.js 24.15 o posterior de la rama 24 y npm. Desde esta carpeta:

```powershell
npm run setup
npm run dev
```

Desarrollo: `http://127.0.0.1:8081`, con API en `http://127.0.0.1:3002`. Vite tiene proxy para `/api` y `/health`.

Para ejecutar la versión compilada:

```powershell
npm run build
npm start
```

Abrir `http://127.0.0.1:3002`. No usa los puertos ni las carpetas de datos del runtime de Lozano. Detener los comandos con Ctrl+C.

Primero completar los datos del negocio y crear categorías desde Configuración; después cargar proveedores y productos. Por ahora cada presentación o variante que tenga stock, precio o código propio se registra como un producto independiente. El modelo de variantes definitivo se debe decidir al adaptar el negocio.

## Verificación

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
```

Los tests del backend crean bases temporales y tienen un límite de 60 segundos para contemplar la preparación de SQLite en Windows.

`test:smoke` comprueba las 11 pantallas, compras, ventas, stock, anulaciones y respaldos en una base temporal. Crea un cupón desde la interfaz, confirma una venta con descuento y recargo y otra con efectivo y vuelto, consulta el historial y los reportes y carga más de 600 ventas. También verifica el scroll de todas las páginas, los selectores largos y los diálogos en una ventana de 1280 × 480. Requiere el navegador Chromium de Playwright; si falta, instalarlo desde `frontend` con `npx playwright install chromium`.

## Funciones recuperadas de la versión final

- Dashboard con gráfico de unidades vendidas al estilo Vape Society: últimos siete días y meses del año actual, con datos reales y selección de barras.
- Métodos de pago editables, con recargos y manejo de efectivo; sección plegada al abrir Configuración.
- Cupones por porcentaje o importe fijo. El backend calcula y guarda descuentos, recargos, total, dinero recibido y vuelto.
- Comprobantes nuevos e históricos con los importes de la venta original.
- Historial de actividad por mes, día, tipo y texto, con carga progresiva.
- Reportes con períodos, detalle del período seleccionado, rankings por unidades o importe de líneas, consumo de productos y exportaciones completas.
- Desplazamiento de páginas y diálogos, listas de historial y selectores con muchas opciones.

## Cambios puntuales respecto del origen

- La lista de ventas usa páginas con `take` y `skip`, sin superar el límite de 500 del backend.
- Las ventas guardan el nombre del medio de pago al confirmarse; renombrarlo después conserva los comprobantes históricos.
- El reporte «Ventas menos compras» indica una diferencia entre operaciones del mes. No calcula utilidad sobre el costo del inventario vendido.
- Los respaldos y el nombre del negocio son independientes.

## Límites de esta extracción

Es una base de desarrollo local, todavía sin marca, catálogo ni reglas particulares del nuevo cliente. No incluye autenticación, acceso remoto, multiusuario, facturación fiscal, instalador ni actualización automática. Incluye las correcciones de dependencias de `main`; quedan avisos de npm que requieren revisión antes de entregar un producto al cliente.

Los rankings suman los importes de las líneas de productos y combos. Los descuentos por cupón y los recargos se guardan a nivel de venta; el ranking no distribuye esos ajustes entre los productos.

La impresión funciona con el diálogo del navegador, que también permite guardar como PDF. La integración nativa queda como contrato opcional; no hay cliente Electron en esta carpeta. La importación automática y el reinicio del runtime de Lozano se excluyeron. Para restaurar un respaldo de este núcleo, detener completamente el backend, conservar una copia de la base actual y reemplazar `backend/prisma/core.db` por el respaldo del mismo proyecto antes de reiniciar. No importar bases históricas de Lozano.

Origen revisado: carpeta `lozano`, rama `main`, commit `afe3a101dec2c2e51d749c5f8a8ae7b677a59a72`. El proyecto original no se modifica. La procedencia y las pruebas están documentadas en `VERIFICACION.md`.
