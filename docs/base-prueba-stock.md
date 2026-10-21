# Base de prueba de stock y venta mayorista

Con Node 24 y las compilaciones actuales (`npm run build`), ejecutar desde la raíz:

```powershell
node scripts/create-stock-demo.cjs --serve --port 3003
```

El script abre una instancia independiente en `http://127.0.0.1:3003/stock`. La base de trabajo conserva sus datos y su instancia en el puerto 3002.

Cada ejecución crea una carpeta nueva `vape-stock-demo-*` dentro del directorio temporal de Windows. Allí guarda:

- `core.db`: base de prueba con las migraciones actuales.
- `demo.json`: ubicación, catálogo y valores iniciales.
- `lista-mayorista.md`: precios y recorrido sugerido para probar la app.

El nombre del comercio indica **BASE DE PRUEBA**. Los productos y proveedores llevan el prefijo `[DEMO]`.

## Datos incluidos

- 12 productos distribuidos en Pods, Cartuchos y Accesorios.
- 148 unidades físicas: 72 pagadas y 76 a crédito. No quedan unidades sin clasificar.
- Productos pagados, productos a crédito y productos con ambos tipos de ingreso.
- Tres compras registradas: una pagada y dos a crédito, con vencimientos a 7 y 40 días de la creación.
- Lista General con precios para todos los productos desde 3, 6 y 12 unidades combinadas. Las rebajas de referencia son 10 %, 15 % y 20 % respecto del precio habitual.
- Sin ventas ni reservas iniciales.

| Tarjeta                              | Valor inicial |
| ------------------------------------ | ------------: |
| Valor stock al costo                 |      $102.400 |
| Valor minorista                      |      $204.800 |
| Valor mayorista (General, desde 3)   |      $184.320 |
| Stock propio (minorista menos deuda) |      $168.600 |
| Deuda                                |       $36.200 |

Las compras se registran a través de las APIs de la aplicación para generar los ingresos de stock, las deudas y el historial correspondiente.

## Otras opciones

- Sin `--serve`, crea los archivos y termina.
- Sin `--port`, usa un puerto libre y muestra la dirección al finalizar.
- `--help` muestra la ayuda.
- `Ctrl+C` detiene la instancia. Los archivos de esa base se conservan; ejecutar nuevamente el script crea otra base limpia.

El script siempre genera su propia base y servidor: no acepta la ruta de una base existente ni la dirección de otra API. No carga fixtures de pruebas en la base de trabajo.

Verificación del generador:

```powershell
node --test scripts/create-stock-demo.test.cjs
```
