# Escala de interfaz

Diseño aprobado por la usuaria el 7 de octubre de 2026: agregar el ajuste en Configuración → Apariencia.

- Control «− 100 % +» con botón Restablecer.
- Rango de 50 % a 150 %, con pasos de 5 % y valor inicial de 100 %.
- Aplicación inmediata a toda la interfaz, incluidos menús y diálogos.
- Preferencia guardada en este navegador, independiente de los datos comerciales.
- Restablecer vuelve a 100 %. Los controles de reducción y aumento se desactivan en sus límites.
- El tamaño de impresión no depende de la escala elegida para la pantalla.

Se amplía el proveedor de apariencia existente. Un componente pequeño contiene el control y una función valida los valores guardados. No se agregan dependencias ni cambios de backend.

Verificación: límites y valores guardados inválidos, reducción y aumento visibles, persistencia al recargar, navegación al dashboard, pantallas de 1920 × 1080 y 2560 × 1440, y los comandos de typecheck, lint, tests y build del proyecto.

No se hacen commits: AGENTS.md requiere una solicitud explícita de la usuaria.
