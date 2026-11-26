# Plan de sprints

## Objetivo del producto

Permitir que una escuela de aviación capture, distribuya y dé seguimiento a sus prospectos desde el primer contacto hasta una llamada o matrícula, con visibilidad del próximo paso y protección de los datos por escuela.

## Sprint 1 — Visibilidad y seguimiento

**Objetivo:** que el equipo pueda identificar rápidamente los leads que requieren acción y registrar un próximo paso verificable.

**Historias:** HU-01, HU-03 y parte de HU-05.

**Incremento esperado:** dashboard operativo, lista de pendientes, registro de contacto, tareas y pruebas de aislamiento.

**Evidencia requerida:** tablero, commits, ejecución de pruebas, captura del recorrido y retroalimentación de usuarios.

## Sprint 2 — Captura y entrega confiable

**Objetivo:** completar el recorrido desde la llegada del lead hasta su asignación y dejar la entrega reproducible.

**Historias:** HU-02, HU-04 y HU-06.

**Incremento esperado:** captura/asignación, reserva de llamada, CI verificable, guía de ejecución y procedimiento de recuperación.

**Evidencia requerida:** Pull Request revisado, workflow ejecutado, cobertura, build, demo y registro de mejora Lean.

## Ejecución real (según historial de Git)

| Etapa | Fechas | Objetivo | Resultado verificable |
|---|---|---|---|
| Punto de partida | 19–23 oct | MVP del equipo FlightLeads | Commits iniciales: pipeline multiescuela, captura de leads, roles, WhatsApp, rediseño de UI |
| Sprint 1 | 12 nov | Calidad automatizada | CI en GitHub Actions, SonarQube Cloud y cobertura; PR #2 integrado en `main` |
| Sprint 2 | 24–25 nov | Entrega confiable y diferenciación | `/api/health`, npm audit, demo reproducible (`verify:demo`), Global Pathways (HU-06) e intercambio de rutas tras la sesión con el cliente |

## Roles

| Rol | Integrante | Responsabilidad |
|---|---|---|
| Product Owner | [COMPLETAR] | Priorizar valor y recoger feedback del cliente |
| Scrum Master | [COMPLETAR] | Facilitar eventos y visibilizar bloqueos |
| Developer | Juan Diego Rodríguez Velásquez | Sprints 1 y 2: CI, pruebas, health check, Global Pathways |

El MVP de octubre (punto de partida) fue construido por el equipo FlightLeads; ver `01-estado-inicial.md`.
