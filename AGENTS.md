# Convenciones del núcleo

Usar UTF-8. Mantener cambios concretos y código claro, sin dependencias ni abstracciones innecesarias. Conservar responsabilidades separadas y nombres descriptivos.

Este proyecto es independiente de Lozano. No acceder a sus bases ni modificar su carpeta. La base de este proyecto es `backend/prisma/core.db` y los respaldos están en `backend/backups`.

No cargar `backend/test/fixtures` en la base de trabajo: contienen datos sintéticos usados únicamente por pruebas sobre bases temporales.

Antes de finalizar cambios relevantes, ejecutar `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. No hacer commits, publicar ni instalar servicios sin una solicitud del usuario.
