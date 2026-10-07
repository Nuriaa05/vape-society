# Escala de interfaz Implementation Plan

> **For agentic workers:** ejecución en esta sesión, sin delegación. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir ajustar y guardar el tamaño de toda la interfaz desde Configuración → Apariencia.

**Architecture:** extender AppearanceProvider y AppearanceContext con interfaceScale y setInterfaceScale. Aplicar una variable CSS al elemento html para que también incluya los portales de los diálogos. Extraer el control de botones y la normalización de valores a archivos pequeños.

**Tech Stack:** React, TypeScript, CSS, Vitest y los componentes existentes.

## Global Constraints

- UTF-8; sin dependencias nuevas, cambios comerciales ni commits.
- 50 % a 150 %, pasos de 5 %, predeterminado 100 %.
- Guardado local en este navegador y aplicación inmediata.
- Impresión a escala normal y alturas de pantalla correctas.

## Tarea: ajuste de escala

**Files:**
- Crear `frontend/src/lib/interface-scale.ts` y `interface-scale.test.ts` para normalizar valores y recuperar porcentajes guardados.
- Ampliar `frontend/src/components/appearance-context.ts` y `appearance-provider.tsx` para mantener y persistir la escala.
- Crear `frontend/src/components/interface-scale-control.tsx` con los controles accesibles.
- Agregar Apariencia en `settings-section-navigation.tsx` y una sección en `routes/-pages/configuracion.tsx`.
- Actualizar `frontend/src/styles.css`, las alturas de AppShell y de los diálogos, y los anchos de desplegables si la verificación visual muestra que la escala altera su posición o tamaño.
- Adaptar la navegación de AppShell y Configuración al ancho disponible mediante consultas de contenedor para evitar desbordamiento al ampliar la interfaz.

**Interfaces:** `normalizeInterfaceScale(value: number): number`, `parseStoredInterfaceScale(value: string | null): number`, `interfaceScale: number`, `setInterfaceScale(scale: number): void`.

- [x] Escribir y ejecutar las pruebas de la preferencia antes de implementarla: un valor válido se conserva, datos ausentes o inválidos vuelven a 100 %, y los límites evitan escalas fuera de 50–150 %.
- [x] Implementar normalización, estado con inicialización diferida y guardado mediante localStorage. La escala normalizada se escribe como `--interface-scale: interfaceScale / 100`.
- [x] Agregar el control: los botones llaman a `setInterfaceScale(interfaceScale ± 5)` y Restablecer llama a `setInterfaceScale(100)`.
- [x] Agregar Configuración → Apariencia con el título «Tamaño de la interfaz» y texto que indique el guardado automático en este navegador.
- [x] Verificar en navegador reducción, aumento, límites, restablecimiento, recarga, dashboard y diálogos. Revisar alturas y desbordamiento a 1920 × 1080 y 2560 × 1440.
- [x] Ejecutar `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` con el runtime Node 24 disponible.
- [x] Revisar el diff y dejar abierto el ajuste implementado.

## Verificación visual

- Dashboard al 75 %: sin desbordamiento horizontal en 1920 × 1080 y 2560 × 1440; la barra lateral ocupa toda la altura.
- Apariencia al 150 %: controles visibles y sin desbordamiento horizontal en 1024 × 768 y 375 × 812.
- Diálogos y Select verificados al 75 % y 150 %; desplegables de Productos y Stock conservan el ancho del botón.
- La recarga restaura la preferencia; los límites deshabilitan el botón correspondiente y Restablecer vuelve a 100 %.
- Typecheck y lint pasaron en frontend y backend. Las 190 pruebas del frontend, las 199 pruebas del backend y el build completo pasaron; los checks del frontend se repitieron después de las correcciones visuales.
