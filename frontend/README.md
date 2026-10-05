# Patrón visual del frontend

El dashboard es la referencia visual. Las pantallas usan los componentes de `src/components/ui/card.tsx` y los estilos comunes de `src/styles.css`.

- `Card`: superficie con el mismo borde, color y radio de 12 px.
- `CardHeader`: título de 17,5 px, descripción opcional y acción de la sección.
- `CardBody`, `CardToolbar` y `CardFooter`: contenido, filtros y controles con 18 px de padding.
- `KpiCard`: indicadores con la tipografía y los tamaños del dashboard.
- `app-table-heading`: encabezados de tabla con el mismo padding del dashboard.

`AppShell` separa las secciones con 20 px y permite que el contenido crezca. Las pantallas con columnas usan `gap-5`; el ancho de los paneles depende del contenido. Los límites y scrolls de las tablas se mantienen en cada pantalla.

```tsx
<Card>
  <CardHeader title="Título de la sección" action={action} />
  <CardToolbar>{filters}</CardToolbar>
  <CardBody>{content}</CardBody>
  <CardFooter>{controls}</CardFooter>
</Card>
```
