# Auditoría del frontend de lozano-core

**Integridad de implementación: PASA con observaciones.** El frontend expresa una identidad coherente de Vape Society, conserva las operaciones de Lozano y obtiene sus datos del backend local. Las 11 rutas cargaron sin excepciones de JavaScript ni respuestas de error del backend durante el barrido normal. Hay una desviación funcional confirmada en la fecha inicial de Compras y problemas de accesibilidad y adaptación móvil que deben corregirse. Este veredicto evalúa la coherencia de la implementación; no equivale a aprobar todos sus detalles.

**Fecha:** 4 de octubre de 2026. **Proyecto auditado:** `C:\Users\Gonzalo\Documents\lozano-core`. **Aplicación:** [frontend local](http://127.0.0.1:8081/), con su backend propio en el puerto 3002.

Se aplicaron Impeccable, su comando `audit` y el criterio `Operate` para una aplicación de gestión. **No se modificaron componentes, estilos, APIs ni datos del negocio.** Se generaron este informe y las evidencias de inspección.

## Evaluación general

| Dimensión | Puntuación | Evidencia principal |
| --- | ---: | --- |
| Accesibilidad | 2/4 | Hay semántica, navegación por teclado y diálogos Radix, pero faltan nombres accesibles y algunos contrastes mínimos. |
| Rendimiento | 3/4 | Rutas separadas en chunks, fuentes locales y compilación correcta. El logo de 772 kB está sobredimensionado. |
| Temas | 3/4 | Tokens compartidos y tema oscuro consistente; requieren ajustes de contraste. El comprobante blanco es intencional. |
| Adaptación responsive | 2/4 | Las pantallas principales funcionan en móvil, con fallos concretos en Configuración y Nuevo combo y una distribución extensa en Nueva venta. |
| Integridad de implementación | 3/4 | Sistema visual consistente y operaciones conectadas; la fecha UTC de Compras contradice la fecha local del comercio. |
| **Total** | **13/20** | **Aceptable: requiere correcciones específicas.** |

La puntuación usa la escala de Impeccable. El rendimiento se evaluó mediante código, recursos y build; no es una medición de Core Web Vitals en producción.

**13 hallazgos:** 0 P0, 6 P1, 7 P2 y 0 P3. P1 indica un problema importante o un incumplimiento de accesibilidad verificado; P2 indica una dificultad con una alternativa disponible.

Los asuntos prioritarios son los controles sin nombre accesible, los contrastes, el formulario de combos recortado, el desborde de Configuración a 320 px y la fecha incorrecta de Compras. En la distribución visual, los problemas más notorios son las alturas forzadas y la columna de Nueva venta.

## Espacio entre tarjetas

**La separación entre tarjetas ya sigue una base razonable. El mayor problema es cómo se reparten sus alturas y el espacio disponible.** Una tarjeta estirada, una fila de grid demasiado alta y un formulario largo producen huecos aunque el `gap` sea correcto.

Mediciones con zoom del navegador al 100 %:

| Pantalla | Separación observada | Evaluación |
| --- | --- | --- |
| Dashboard, escritorio | 12 px entre KPI y entre columnas; 8 px entre filas y entre entregas/alertas | Excepción compacta para conservar el dashboard dentro de `100dvh`. En pantallas altas el reparto de filas introduce huecos adicionales. |
| Dashboard, móvil | 16 px entre KPI y tarjetas; 24 px entre grupos principales | Coherente, aunque los cuatro KPI apilados desplazan el gráfico hasta y=823 px a 390 px de ancho. |
| Productos | Una tarjeta principal; 16 px entre campos del formulario | La separación externa no es un problema. Revisar etiquetas y lectura de tablas en móvil. |
| Combos | Una tarjeta principal; 16 px entre grupos del formulario y 8 px en la fila de componentes | El fallo es el ancho mínimo de la fila interna, no su separación externa. |
| Nueva venta | 16 px entre tarjetas y entre columnas | El resumen mide 937 px de alto en escritorio y deja la columna del carrito muy vacía cuando hay pocos productos. |
| Ventas | Una tarjeta principal; filtros separados 12 px | La distribución general es coherente. El comprobante corregido conserva su ancho. |
| Compras | 16 px entre formulario y resumen; 24 px antes del historial | Es razonable distinguir el historial como otro grupo. El resumen se estira a la altura del formulario. |
| Stock | 16 px entre productos y movimientos | Correcto. Ambos paneles conservan scroll propio al expandir las listas. |
| Proveedores | Una tarjeta principal; 12 px entre campos | No requiere cambiar la separación externa. |
| Historial | Un contenedor dividido en meses y actividad; 12 px entre filtros | La columna de meses queda muy vacía con un solo mes y muchos eventos. Conviene evaluar su altura/posición, no agregar espacios. |
| Reportes | 16 px entre KPI y entre columnas; 24 px entre grupos de análisis y tablas | Escala coherente. La tarjeta de métodos de pago hereda la altura del gráfico vecino. |
| Configuración | 16 px en ambos ejes; 20 px de padding en los cuerpos | El grid estira tarjetas desiguales. La sección de pagos cerrada conserva un cuerpo vacío grande en escritorio. |

### Criterio recomendado

Mantener **16 px entre tarjetas equivalentes**, **24 px entre grupos distintos**, **20 px de padding en tarjetas normales** y **8–12 px para controles relacionados**. Conservar una excepción compacta explícita para el dashboard en escritorio: 12 px entre columnas y 8 px entre filas, compatible con su requisito de `100dvh`.

Las tarjetas con contenido distinto deberían conservar una altura acorde a ese contenido. Para secciones plegables, el cierre debe recuperar el espacio. Al modificar el grid, comprobar también el hueco entre filas: agregar solamente `items-start` puede trasladar el vacío desde dentro de la tarjeta hacia fuera.

## Hallazgos P1

### F01 — Campos, filtros y acciones sin nombre accesible

**Categoría:** Accesibilidad.

**Ubicación:** [Field de Configuración](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/configuracion.tsx:1449), [Field de Productos](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/productos.tsx:825), [Field de Combos](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/combos.tsx:512), [menú de Ventas](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/ventas.tsx:433), [eliminar del carrito](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/nueva-venta.tsx:904) y [eliminar ítem de compra](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/compras.tsx:723). También afecta selects de filtros en Productos, Ventas e Historial y campos de Stock.

**Evidencia:** el árbol de accesibilidad de Chromium contiene 23 controles habilitados sin nombre en las pantallas base. Diez corresponden a los menús de las primeras diez ventas. En formularios aparecen campos numéricos sin nombre; el carrito y el borrador de compra agregan botones de eliminar sin nombre. Varios `Label` están visualmente presentes pero no asociados por `htmlFor`/`id`. Algunos placeholders aportan un nombre de respaldo, que no corrige esa asociación.

**Impacto:** un lector de pantalla anuncia controles genéricos y dificulta distinguir precio, margen, cantidad o acciones de una fila.

**Estándar:** [WCAG 4.1.2, nombre, función y valor](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html).

**Recomendación:** asociar las etiquetas existentes con sus controles; dar nombres a los filtros; nombrar las acciones con su contexto, por ejemplo «Acciones de la venta 000103» y «Eliminar [producto]». Los campos opcionales de cliente en Nueva venta ya muestran el patrón correcto de `htmlFor`/`id`.

**Comando sugerido:** `$impeccable harden`.

### F02 — Contraste de texto insuficiente en campos y estados

**Categoría:** Accesibilidad / Temas.

**Ubicación:** [tokens del tema claro](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/styles.css:92), [placeholder oscuro](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/styles.css:140) y [StatusBadge](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/components/app-shell.tsx:299).

**Evidencia:** contrastes calculados sobre colores CSS y fondos compuestos, antes de redondear el resultado:

| Elemento | Tema | Contraste aproximado |
| --- | --- | ---: |
| Placeholder `#a1a1aa` sobre blanco | Claro | 2,56:1 |
| Placeholder `#71717a` sobre tarjeta `#1c1c1f` | Oscuro | 3,52:1 |
| «Pendiente» en badge de advertencia | Claro | 4,08:1 |
| «Entregado» / «OK» en badge verde | Claro | 4,37:1 |
| Texto secundario `#71717a` sobre `#f6f6f7` | Claro | 4,47:1 |

**Impacto:** afecta lectura de ayudas, filtros, estados de entrega y stock. El fallo más marcado está en los placeholders; el texto secundario está muy cerca del umbral, pero sigue por debajo.

**Estándar:** [WCAG 1.4.3: mínimo 4,5:1 para este texto de tamaño normal](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Se excluyeron controles deshabilitados. La marca gráfica y el logo no se contabilizan como fallos de texto funcional.

**Recomendación:** ajustar los tokens de placeholder y los tonos de texto/fondo de los badges, conservando la identidad roja y las diferencias entre estados. Verificar ambos temas y fondos de advertencia.

**Comando sugerido:** `$impeccable colorize`.

### F03 — Las barras sin seleccionar tienen poco contraste

**Categoría:** Accesibilidad / Temas.

**Ubicación:** [token claro de barras](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/styles.css:105), [token oscuro](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/styles.css:139) y [gráfico de Reportes](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/reportes.tsx:967).

**Evidencia:** `#dcdce0` sobre `#f6f6f7` da aproximadamente **1,27:1**; `#27272a` sobre `#0a0a0a` da **1,33:1**. Las barras grises expresan cantidades y son especialmente difíciles de distinguir en el gráfico de Reportes oscuro. El rojo seleccionado es visible, pero no resuelve la lectura de las restantes barras.

**Impacto:** comparar magnitudes requiere esfuerzo o seleccionar cada barra. Los nombres accesibles de los puntos son positivos, pero no sustituyen la legibilidad visual del gráfico.

**Estándar:** [WCAG 1.4.11: contraste 3:1 para partes gráficas necesarias para comprender los datos](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

**Recomendación:** ajustar `--chart-bar` por tema para alcanzar ese contraste en los fondos reales. Mantener el rojo como selección y conservar las etiquetas y controles por teclado.

**Comando sugerido:** `$impeccable colorize`.

### F04 — Nuevo combo se recorta a 320 px

**Categoría:** Responsive.

**Ubicación:** [DialogContent de Combos](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/combos.tsx:350) y [fila para agregar componentes](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/combos.tsx:405).

**Evidencia:** el diálogo tiene **286 px de ancho interior y 444 px de contenido desplazable**. Su columna implícita mide 396 px. La fila `1fr 96px auto`, el selector de producto y «Agregar» imponen ese ancho y ensanchan también campos y botones del formulario. La captura muestra cortes a la derecha.

**Impacto:** se pierde la lectura completa del formulario y parte de sus acciones en una pantalla angosta.

**Estándar:** [WCAG 1.4.10, redistribución a 320 píxeles CSS](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Es un formulario, por lo que no corresponde la excepción de tablas de datos bidimensionales.

**Recomendación:** usar una columna del diálogo que permita encoger (`minmax(0,1fr)`), limitar el tamaño intrínseco de sus hijos y apilar/reorganizar la fila de producto, cantidad y agregar en móvil. Comprobar también nombres largos de productos.

**Comando sugerido:** `$impeccable adapt`.

### F05 — Configuración ensancha toda la página en móvil angosto

**Categoría:** Responsive.

**Ubicación:** [fila «Combos en el ticket»](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/configuracion.tsx:729).

**Evidencia:** a 320 px, el documento alcanza **368 px**, tanto en tema claro como oscuro. La fila del selector y «Guardar formato» tiene 246 px disponibles y 331 px de contenido. Su `flex` no reorganiza ni reduce correctamente los hijos.

**Impacto:** aparece scroll horizontal en la página y parte del contenido queda fuera del ancho del dispositivo.

**Estándar:** [WCAG 1.4.10, redistribución](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

**Recomendación:** apilar selector y acción en anchos angostos; permitir que el selector reduzca su ancho y que el botón conserve una etiqueta legible. Comprobar ambas opciones del selector y 320/390 px.

**Comando sugerido:** `$impeccable adapt`.

### F06 — Compras propone el día siguiente después de las 21:00

**Categoría:** Integridad de implementación.

**Ubicación:** [estado inicial de fecha](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/compras.tsx:160), [restablecimiento del formulario](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/compras.tsx:186) y [limpieza del borrador](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/compras.tsx:193).

**Evidencia:** en Chromium con zona de Argentina, a las **21:47 del 04/10/2026**, el input de compra muestra **2026-10-05**. El código usa `new Date().toISOString().slice(0, 10)`, que extrae la fecha UTC.

**Impacto:** si el operador acepta la fecha propuesta, puede registrar una compra en otro día y distorsionar historial y reportes. El mismo error reaparece al limpiar el formulario.

**Estándar:** coherencia con la fecha local del comercio; no es una cuestión de espaciado ni un criterio WCAG.

**Recomendación:** construir la fecha local con los componentes locales de `Date`, o con la zona del comercio según la convención existente. Verificar la franja 21:00–23:59 y el cambio de mes/año.

**Comando sugerido:** `$impeccable harden`.

## Hallazgos P2

### F07 — El grid estira tarjetas de contenido desigual

**Categoría:** Integridad visual / Responsive.

**Ubicación:** [grid de Configuración](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/configuracion.tsx:654), [Card de Configuración](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/configuracion.tsx:1427), [grid de Compras](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/compras.tsx:274) y [grid de Reportes](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/reportes.tsx:359).

**Evidencia:** a 1440 px, «Métodos de pago» cerrado mide **222 px**, igual que «Cupones», aunque solo conserva un encabezado de aproximadamente 65 px. El vacío ronda **157 px**. «Datos del local» y «Comprobante interno» miden ambos 412 px pese a tener distintos contenidos. En Reportes, la tarjeta de pagos mide 452 px por su vecino gráfico.

**Impacto:** da la impresión de contenido faltante y alarga el recorrido, especialmente cuando se pliegan secciones.

**Estándar:** ritmo y densidad de una interfaz de gestión; no es un incumplimiento WCAG por sí solo.

**Recomendación:** conservar alturas naturales y hacer que las secciones plegables recuperen espacio. Evaluar la composición completa del grid para que la siguiente fila no conserve el mismo hueco. Mantener el orden de lectura en móvil.

**Comando sugerido:** `$impeccable layout`.

### F08 — El dashboard acumula un hueco inferior en pantallas altas

**Categoría:** Integridad visual / Responsive.

**Ubicación:** [filas del dashboard](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/styles.css:248) y [contenedor de aviso](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/index.tsx:270).

**Evidencia:** la distancia entre el final de «Ventas recientes» y el aviso inferior es **14 px a 1366×768**, **79 px a 1440×900** y **169 px a 1920×1080**. A 1920×1080, después de «Alertas de stock» quedan aproximadamente **211 px** hasta el aviso. El grid reparte el espacio con dos filas `1fr`, mientras las tarjetas tienen altura natural y el aviso queda al final.

**Impacto:** la separación aparente deja de seguir la escala de 8–16 px y aumenta según la altura de la pantalla. El vacío actual está fuera de las tarjetas; la corrección previa del espacio interior sigue funcionando.

**Estándar:** composición adaptativa y requisito del dashboard dentro de `100dvh`.

**Recomendación:** repartir la altura según las necesidades del gráfico y las listas, acotar el crecimiento del gráfico y ubicar el aviso cerca del contenido. Mantener entregas sobre alertas, ventas debajo del gráfico y los scrolls internos cuando falte altura.

**Comando sugerido:** `$impeccable layout`.

### F09 — El resumen de Nueva venta domina la distribución

**Categoría:** Responsive / Integridad visual.

**Ubicación:** [grid principal](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/nueva-venta.tsx:685) y [columna de resumen](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/nueva-venta.tsx:923).

**Evidencia:** en 1440×900, el resumen mide **937 px** y «Confirmar venta» empieza en **y=953 px**, incluso con el carrito vacío. A 1366×768 ocurre lo mismo. El buscador y el carrito terminan mucho antes, dejando un gran espacio a su izquierda. En móvil, el resumen mide aproximadamente 974 px.

**Impacto:** una acción frecuente queda alejada del carrito y obliga a recorrer una columna larga. La separación de 16 px entre tarjetas es correcta; la proporción entre columnas y la organización interna requieren atención.

**Estándar:** eficiencia de una pantalla operativa; no se exige que todo formulario móvil entre en una sola pantalla.

**Recomendación:** compactar la organización del resumen: aprovechar pares de campos en escritorio donde sean legibles, revisar márgenes de grupos y disponer el bloque de confirmación cerca de la información esencial. Conservar los datos opcionales de cliente, pagos, recargos, cupón, vuelto y entrega.

**Comando sugerido:** `$impeccable layout`.

### F10 — Al cerrar varios diálogos se pierde el punto de foco

**Categoría:** Accesibilidad.

**Ubicación:** [apertura de Nuevo producto](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/productos.tsx:271), [Nuevo combo](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/combos.tsx:212), [Nuevo proveedor](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/proveedores.tsx:112), [Ajustar stock](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/stock.tsx:257) y [menú móvil](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/components/app-shell.tsx:241).

**Evidencia:** después de Escape y de esperar la animación de cierre, los cuatro formularios devuelven el foco a `BODY`, en lugar del botón que los abrió. El menú móvil tampoco lo devuelve al botón de apertura. Escape sí cierra; el foco permanece dentro de los formularios durante Tab.

**Impacto:** quien usa teclado pierde su ubicación y debe volver a recorrer controles para continuar.

**Estándar:** [patrón de diálogo modal WAI-ARIA: devolver el foco al elemento de apertura o a un destino lógico](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Se trata como dificultad de navegación confirmada, sin atribuir automáticamente toda pérdida de foco a un incumplimiento WCAG.

**Recomendación:** usar el trigger de Radix cuando corresponda o conservar una referencia al botón de apertura para restaurar el foco. Mantener la navegación y el cierre actuales de la sidebar.

**Comando sugerido:** `$impeccable harden`.

### F11 — El logo de la sidebar es demasiado pesado para su tamaño

**Categoría:** Rendimiento.

**Ubicación:** [imagen del shell](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/components/app-shell.tsx:155) y [PNG actual](C:/Users/Gonzalo/Documents/lozano-core/frontend/public/brand/vape-society-logo.png).

**Evidencia:** el PNG mide **1373×1146** y ocupa **771.993 bytes**, mientras se muestra a **150 px de ancho**. El mismo archivo se usa como favicon.

**Impacto:** añade descarga y decodificación innecesarias en la primera visita, especialmente desde un teléfono. La caché reduce el coste de visitas posteriores.

**Estándar:** adecuación de recursos al tamaño de presentación.

**Recomendación:** generar una versión optimizada para el tamaño real y pantallas de alta densidad, conservando el original y su apariencia. Usar un favicon pequeño propio. No cambiar el diseño de la sidebar.

**Comando sugerido:** `$impeccable optimize`.

### F12 — Los errores de carga carecen de recuperación dentro del contenido

**Categoría:** Integridad de implementación / Estados de interfaz.

**Ubicación:** [error del Dashboard](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/index.tsx:49), [error de Productos](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/productos.tsx:216) y [error de Reportes](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/reportes.tsx:275).

**Evidencia:** al simular un 503 únicamente en el navegador de auditoría, las tres pantallas muestran el error pero no tienen botones dentro de `main`. Se verificó también el estado de carga. El backend real respondió correctamente en el barrido normal.

**Impacto:** después de un fallo temporal, el operador debe recargar la página o salir y volver, sin una recuperación directa desde el mensaje.

**Estándar:** recuperación de errores de interfaz; el hallazgo no afirma un fallo del backend actual.

**Recomendación:** agregar una acción concreta de reintento usando las queries existentes y revisar el anuncio accesible del estado. Preservar borradores cuando sea relevante.

**Comando sugerido:** `$impeccable harden`.

### F13 — Los mensajes de tablas vacías quedan cortados en móvil

**Categoría:** Responsive / Estados de interfaz.

**Ubicación:** [tabla vacía de Combos](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/combos.tsx:234), [ítems vacíos de Compras](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/compras.tsx:650) y [carrito vacío](C:/Users/Gonzalo/Documents/lozano-core/frontend/src/routes/-pages/nueva-venta.tsx:784).

**Evidencia:** a 390 px, los mensajes están centrados dentro de tablas con ancho mínimo mayor al panel. Se ve solo parte de «Todavía no hay combos cargados», «Sin productos cargados» y la indicación para empezar el carrito. Las tablas permanecen dentro de su scroll horizontal.

**Impacto:** se pierde la explicación del estado inicial aunque no haya datos que requieran una tabla ancha.

**Estándar:** comunicación legible del estado vacío. El scroll de una tabla con datos no se considera por sí mismo un defecto de reflow.

**Recomendación:** presentar el mensaje vacío en el ancho visible de la tarjeta o fuera del scroller de datos, conservando la estructura de tabla para registros reales.

**Comando sugerido:** `$impeccable adapt`.

## Patrones y aspectos a conservar

Los huecos más importantes comparten dos causas: estiramiento automático de filas y reparto de altura sin relación con el contenido. Las etiquetas sin asociación se repiten en helpers `Field` y controles individuales. Los contrastes parten de pocos tokens comunes, por lo que pueden resolverse sin retocar cada pantalla. Los desbordes confirmados dependen del tamaño intrínseco de grids/flex, no de que falte un scroll general.

La identidad visual es consistente: Geist, colores, bordes, radios, tablas y sidebar se mantienen entre rutas. El contenido usa todo el ancho disponible. El shell móvil navega y cierra correctamente. El tema oscuro cambia las superficies y textos de manera coherente. El gráfico semanal/mensual tiene nombres accesibles y selección de período. Los campos opcionales de cliente sí están asociados a sus etiquetas. Los diálogos tienen título y descripción. El comprobante queda contenido a 320 px, incluso con textos largos y en ambos temas. Stock y Reportes mantienen scrolls independientes de 640 px al expandir las listas.

El detector de Impeccable produjo **dos advertencias `overused-font`**, correspondientes a las dos declaraciones de Geist en `styles.css`. **Se descartan como problemas para este proyecto:** la tipografía fue elegida expresamente para conservar el estilo de Vape Society. Es una observación estética del detector, no un defecto técnico. El detector no señaló otros patrones; sus resultados no sustituyen las mediciones del navegador.

## Orden recomendado de trabajo

1. **P1 — `$impeccable harden`:** asociar etiquetas y nombres de controles (F01), y corregir la fecha local de Compras (F06).
2. **P1 — `$impeccable adapt`:** resolver el ancho del formulario de combo y de la fila de formato de ticket (F04–F05).
3. **P1 — `$impeccable colorize`:** ajustar contraste de placeholders, badges y barras sin selección en ambos temas (F02–F03).
4. **P2 — `$impeccable layout`:** corregir alturas de tarjetas, hueco del dashboard y organización del resumen de venta, usando la escala de espacios definida arriba (F07–F09).
5. **P2 — `$impeccable harden`:** restaurar foco al cerrar y ofrecer recuperación de errores (F10, F12).
6. **P2 — `$impeccable adapt`:** hacer legibles los estados vacíos en móvil (F13).
7. **P2 — `$impeccable optimize`:** optimizar el recurso del logo y favicon conservando su aspecto (F11).
8. **Verificación — `$impeccable audit`:** repetir la auditoría después de las correcciones y comparar medidas.
9. **Cierre — `$impeccable polish`:** revisar alineaciones, bordes y ritmo final después de resolver los errores.

Podés solicitar estas correcciones individualmente, todas juntas o en el orden que prefieras. La recomendación es mejorar esta base mediante cambios acotados, manteniendo las funcionalidades y la sidebar actuales.

## Verificación y alcance

Se inspeccionaron Dashboard, Productos, Combos, Nueva venta, Ventas, Compras, Stock, Proveedores, Historial, Reportes y Configuración.

El barrido cubrió **88 combinaciones**: 11 rutas × 2 temas × 4 tamaños (1440×900, 1366×768, 390×844 y 320×568), más un dashboard a 1920×1080: **89 casos**. Se midieron dimensiones, gaps, padding, desbordes, contraste y nombres accesibles. Se revisaron capturas de las 11 pantallas en escritorio y móvil y muestras oscuras.

La confirmación incluyó 20 aperturas de formularios/diálogos, navegación móvil, listas expandidas, pagos desplegados, carrito y compra con un ítem local, datos largos en el comprobante, foco después de las animaciones y estados de carga/error. La fecha de Compras se confirmó expresamente con zona de Argentina.

Las peticiones enviadas al backend por la inspección fueron de lectura. La cotización del carrito se interceptó con una respuesta simulada dentro del navegador de prueba; los errores 503 y datos largos también se simularon allí. No se guardaron ventas, compras, productos, ajustes ni cambios de configuración. La revisión de operaciones que guardan datos se apoyó en código y pruebas existentes, sin ejecutar nuevas operaciones sobre la base activa.

| Comprobación del frontend | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto |
| `npm run test` | 109 pruebas correctas en 30 archivos |
| `npm run build` | Correcto |
| Barrido normal en navegador | 0 excepciones JS; 0 respuestas de error de API; 0 intentos de mutación |

El build genera CSS de **48,49 kB / 9,55 kB gzip**, el chunk principal de **338,64 kB / 105,27 kB gzip** y chunks separados por pantalla. Las fuentes locales ocupan aproximadamente 29,4 y 16,5 kB. No se ejecutó Lighthouse ni una prueba manual con NVDA; el diagnóstico de accesibilidad combina árbol de Chromium, teclado, colores computados y referencias W3C, y no constituye certificación completa WCAG.

Evidencias locales:

- [Mediciones y peticiones del barrido](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit/results.json).
- [Confirmación de formularios, scrolls, foco y estados](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit/confirmation.json).
- [Confirmación de fecha de compra](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit/purchase-date.json).
- [Salida del detector de Impeccable](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit-detector.json).
- [Dashboard a 1920 px](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit/dashboard-1920-Claro.png).
- [Configuración en escritorio](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit/configuracion-1440-Claro.png).
- [Combo recortado a 320 px](C:/Users/Gonzalo/Documents/lozano-core/.verification/impeccable-audit/combo-nuevo-320-Claro.png).

Nota sobre la verificación: el primer selector de error no contemplaba el texto singular del dashboard; se corrigió para la confirmación de estados. Las lecturas iniciales de cierre/foco tomadas durante la animación no se usaron como evidencia de un fallo de cierre; se esperó el cierre real para confirmar el foco. Los elementos `sr-only`, el truncado intencional y los scrolls de tablas se revisaron en contexto para evitar falsos positivos.
