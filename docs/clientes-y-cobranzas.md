# Clientes y cobranzas

El menú **Clientes y cobranzas** muestra una fila por cliente con su deuda y si tiene pagos vencidos. El filtro **Deuda del cliente** permite ver todos los clientes, solo quienes tienen deuda o quienes tienen pagos vencidos. **Ver cuenta** abre sus cuotas e historial. Podés cobrar directamente con **Cobrar** en su fila. El selector **Tipo de movimiento** permite consultar también **Tarjetas** y **Reintegros**, incluidas las operaciones de consumidor final. Cobrar una cuota reduce una deuda, sin generar otra venta.

El resumen usa las mismas tarjetas de indicadores de Inicio y Reportes. La lista muestra los estados **Deuda vencida**, **Deuda** y **Al día**, con el estado y las acciones centrados en sus columnas.

## Clientes y saldos anteriores

Creá un cliente con nombre, teléfono opcional y notas. Desde **Ver cuenta** podés consultar ventas, cuotas, saldo e historial y **Cargar deuda anterior**. Esta opción sirve si el cliente ya debía dinero antes de usar el sistema; no modifica ventas ni stock. Para una compra nueva sin pagar, registrá una venta con **Cuotas directas**. La cuenta permite filtrar las cuotas por mes y estado y se cierra con la cruz o la tecla Escape.

Al cargar una deuda anterior, el **Concepto** es opcional y permite describir su origen. Si se deja vacío, se guarda como **Deuda anterior**.

La cuenta prioriza el saldo pendiente, lo vencido, **Registrar cobro**, las cuotas y el historial de pagos. Cada deuda muestra su concepto una sola vez, seguido de sus cuotas. El importe original se muestra junto al saldo cuando una cuota está parcialmente pagada. **Filtrar cuotas** despliega los filtros de mes y estado y permite restablecerlos. Los reintegros se muestran cuando existen y las ventas asociadas quedan plegadas. **Más opciones → Anular deuda anterior** permite corregir una carga equivocada, con explicación y motivo antes de confirmar; para registrar dinero recibido se usa **Registrar cobro**.

Las cuotas vencidas se distinguen en rojo, las pendientes en ámbar y las pagadas en verde, siempre con su estado escrito. Los paneles se abren y cierran suavemente, respetando la preferencia de movimiento reducido.

La lista prioriza la **Deuda del cliente** (cuotas directas y saldos anteriores). Dentro de la cuenta, la sección plegable **Tarjetas del cliente** muestra el neto estimado que el procesador todavía debe depositar y el bruto **por completar** si falta el calendario. Desde **Ver tarjetas** se consultan las acreditaciones de ese cliente de todos los meses. Una venta con tarjeta no habilita **Cobrar**: sus cuotas las cobra la tarjeta al cliente, y el ingreso al negocio se registra al acreditar el procesador.

Las deudas iniciales se dividen en cuotas mensuales indicando cantidad y primer vencimiento. **Cobrar** y **Ver cuenta** quedan visibles en cada fila; el menú de tres puntos reúne **Editar** y **Archivar**, con confirmación antes de archivar. Archivar un cliente lo quita de las nuevas ventas, conservando sus movimientos y permitiendo cobrar su deuda. Activá **Incluir archivados** para encontrarlo y usá **Activar** en su menú para devolverlo a la lista habitual.

## Vender en cuotas directas

En **Nueva venta**, los productos y el carrito permanecen a la izquierda. El panel derecho reúne el resumen, **Cliente y forma de pago**, las cuotas, los descuentos y la entrega, en secciones ordenadas. El **Resumen de venta** conserva el total visible mientras completás el formulario y explica qué falta para confirmar. **Buscar o crear cliente** reúne la búsqueda por nombre o celular y la selección en un único desplegable. Si el cliente no está registrado, elegí **Crear cliente** y completá su nombre y celular opcional dentro del mismo selector: al guardar quedará seleccionado en la venta.

En **Nueva venta**, seleccioná **Cuotas directas**, un cliente registrado, cantidad de cuotas, primer vencimiento y recargo opcional. Si hay anticipo, indicá su medio de cobro; para efectivo se pide también lo recibido para calcular el vuelto.

El primer vencimiento se propone para el mes siguiente y puede editarse antes de confirmar. Si no hay anticipo, no se solicita un medio de cobro.

El recargo se calcula sobre el precio después del descuento. El saldo posterior al anticipo se divide en cuotas: los centavos restantes se agregan a la última. Los vencimientos conservan el día original; el 31 de enero genera el último día de febrero y luego el 31 de marzo.

Revisá el calendario antes de confirmar. Los planes confirmados son fijos: no se reprograman ni generan interés automático por atraso. La entrega de mercadería tiene su propio estado.

## Cobrar cuotas

Usá **Ver cuenta → Registrar cobro** o **Cobrar** en la fila del cliente. El botón se habilita cuando hay deuda directa pendiente. Ingresá el **Importe del pago**, el medio y la fecha. **Cobrar toda la deuda** completa el importe pendiente.

En efectivo se toma el **Importe del pago** como dinero recibido. Si el cliente entrega más, activá **Calcular vuelto** e indicá el **Efectivo recibido**; este campo es opcional y, si queda vacío, también se toma el importe del pago. El efectivo indicado no puede ser menor al pago. La revisión muestra el efectivo recibido y el vuelto cuando hay una diferencia a devolver.

El formulario propone aplicar el importe a las cuotas con vencimiento más antiguo y muestra la distribución. **Elegir cuotas manualmente** permite modificarla, incluso para adelantar cuotas o distribuir el pago entre varias compras. La suma debe coincidir con el importe del pago. No se admiten sobrepagos ni saldos a favor.

**Revisar pago** muestra el importe, el medio, la fecha, las cuotas incluidas, el vuelto si corresponde y cuánto quedará debiendo. Todavía no se guarda ningún movimiento: podés **Volver a editar**. **Confirmar pago** lo registra y muestra el pago guardado y el saldo actualizado de la cuenta, con acciones para imprimir el comprobante o volver a la cuenta.

Registrá la fecha efectiva y el medio de cobro. Los medios habilitados inicialmente son efectivo, transferencia y QR; se administran desde Configuración. Los cobros posteriores no vuelven a aplicar el recargo de la venta.

## Tarjetas

En **Nueva venta → Cuotas con tarjeta**, seleccioná el medio de tarjeta, el procesador, la referencia opcional y las cuotas del cliente. La venta se confirma sin cargar las acreditaciones esperadas. No se registra dinero recibido por la aprobación de la tarjeta.

Al elegir esta modalidad se selecciona un medio habilitado para cuotas. Después, en **Clientes y cobranzas → Tipo de movimiento → Tarjetas**, la venta figura **Por completar**. Elegí **Completar acreditaciones** para indicar la fecha, el bruto y la comisión estimada de uno o varios depósitos. La cantidad de depósitos es independiente de las cuotas del cliente y sus brutos deben sumar el total de la venta. El calendario queda fijo al guardarlo; no registra un cobro.

Las ventas por completar aparecen aunque el filtro mensual esté activo, porque todavía no tienen fecha prevista. Su bruto se muestra por separado del neto estimado de las acreditaciones programadas. Si se anula una venta antes de completar su calendario, este se carga primero desde Tarjetas o Reintegros para poder cancelar lo que nunca se recibió sin registrar una salida de caja.

En **Tipo de movimiento → Tarjetas**, registrá cada acreditación con fecha efectiva, bruto y comisión real. El neto recibido es bruto menos comisión. Se admiten acreditaciones parciales y comisiones reales diferentes de las estimadas. La comisión del procesador se guarda separada del recargo cobrado al cliente.

## Correcciones y devoluciones

Cada movimiento conserva su historial. **Revertir** requiere un motivo; después podés registrar el dato corregido. Para corregir el cobro inicial o anticipo de una venta activa, primero anulá la venta para conservar la relación entre su total, lo cobrado y lo adeudado.

La anulación completa de una venta cancela las cuotas pendientes y muestra en **Reintegros** el importe a devolver. La devolución de dinero puede completarse con varios movimientos. Si se anula una deuda inicial, solo se ofrece devolver lo efectivamente cobrado.

En tarjetas se distingue el dinero que sale del negocio de la acreditación pendiente que cancela el procesador. Por ejemplo, si una venta de $1.000 tuvo $400 de bruto acreditado y $600 todavía pendientes, una devolución puede registrar $400 de egreso y $600 de cancelación pendiente. No se registra una salida de dinero por los $600 que nunca ingresaron.

Los comprobantes de cobro y devolución son internos e imprimibles desde su historial. La devolución parcial de productos no está incluida.

**Imprimir** abre una vista previa con los formatos **Hoja A4** y **Ticket 58 mm**. Elegí el formato y luego **Imprimir o guardar PDF**. El recibo compacto identifica el negocio, cliente, fecha y referencia del movimiento; destaca el importe y detalla las cuotas abonadas, sin repetir sus vencimientos. Muestra efectivo y vuelto cuando hay una diferencia, e identifica los movimientos revertidos. El **Saldo actual** corresponde a la consulta realizada al imprimir, cuya fecha y hora se indican; puede incluir movimientos posteriores al cobro original. Si no se puede consultar, se muestra como no disponible.

## Totales, fechas y respaldos

La búsqueda de clientes usa nombre o teléfono. Los filtros de tarjetas y reintegros permiten consultar mes, cliente, estado y texto; las cuotas se filtran dentro de la cuenta. El mes del resumen también filtra los movimientos de tarjetas y reintegros, sin ocultar cuotas en la cuenta. Los totales se calculan sobre todos los registros correspondientes, aunque se muestren varias páginas. La deuda de clientes y las devoluciones pendientes incluyen todos los vencimientos; los cobros y egresos del mes usan su fecha efectiva. Los días se interpretan en la zona horaria de Buenos Aires.

Las ventas anteriores se conservan sin seguimiento financiero. La actualización no supone que estén cobradas o adeudadas: cargá los compromisos conocidos como deudas iniciales. Los respaldos incluyen clientes, planes y movimientos; los respaldos anteriores compatibles se migran en una copia temporal antes de importarlos.

No se conectan bancos, procesadores ni servicios de mensajería: el seguimiento es manual.
