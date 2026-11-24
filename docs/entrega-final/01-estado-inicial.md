# Estado inicial Flight CRM

## Propósito del producto

Flight CRM ayuda a una escuela de aviación a recibir prospectos, asignarlos al equipo comercial y dar seguimiento hasta una reserva o matrícula. El sistema organiza el trabajo en un pipeline y conserva las actividades, tareas y próximos pasos asociados a cada prospecto.

## Punto de partida verificable

| Elemento | Estado observado |
|---|---|
| Rama local | `sonarcloudtests` |
| Commit de referencia | `555eeeb` — configuración de cobertura para SonarQube |
| Rama base | `main`, commit `e7c29ad` |
| Stack | Next.js, React, TypeScript, Prisma, PostgreSQL y Vitest |
| CI existente | `.github/workflows/sonarqube-analysis.yml` |
| Pruebas | Unitarias y de integración contra PostgreSQL |
| Calidad | `typecheck`, `lint`, `build`, cobertura LCOV y SonarQube Cloud |
| Estado local al iniciar | Árbol Git limpio |

## Funcionalidades reutilizadas

- Multi-tenancy por escuela y aislamiento de datos.
- Roles de propietario, manager y agente.
- Pipeline de leads con etapas configurables.
- Captura de leads desde formularios e integraciones.
- Asignación automática y reglas de distribución.
- Lista, búsqueda y filtros de leads.
- Registro de llamadas, mensajes, notas, reuniones y tareas.
- Indicadores de leads sin contacto, tareas vencidas y embudo.
- Reserva de llamadas desde la web de la escuela.
- Soporte en inglés y español.

## Riesgos iniciales

1. Las pruebas requieren que PostgreSQL local esté disponible en el puerto `5434`.
2. El workflow depende de secretos y variables de GitHub/SonarQube que deben configurarse manualmente.
3. La mayor parte del producto ya existía; la entrega debe distinguir claramente el código reutilizado de la mejora realizada durante el trabajo final.
4. La validación con usuarios y los registros de Scrum no están demostrados por el código y deben obtenerse o documentarse manualmente.

## Línea base técnica

En la primera verificación local, `npm run typecheck` y `npm run lint` terminaron correctamente. `npm test` no pudo completar porque PostgreSQL no estaba ejecutándose en `localhost:5434`; este resultado se conserva como condición de entorno, no como fallo funcional del producto.
