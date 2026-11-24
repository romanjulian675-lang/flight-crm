# Lean y mejora continua

## Desperdicios identificados

| Desperdicio | Dónde aparece | Efecto | Evidencia |
|---|---|---|---|
| Espera | El equipo debe levantar PostgreSQL antes de ejecutar la suite local | Retrasa la verificación de cambios | Registro de ejecución local |
| Retrabajo | Un worker de Vitest fallaba de forma inconsistente en Windows | Repetición de pruebas y resultados parciales | Commit `224528e` y baseline técnica |
| Trabajo no validado | La propuesta de valor y las entrevistas aún no tienen registros completos | Riesgo de construir funciones que el usuario no prioriza | Validación pendiente |

## Mejora aplicada

Se configuró Vitest con un único worker basado en threads:

- Situación inicial: 53 de 65 pruebas terminaban y un worker se cerraba inesperadamente.
- Acción: ajustar `pool` a `threads` y `maxWorkers` a `1`.
- Resultado observado: 65 de 65 pruebas aprobadas y cobertura de líneas de 88.51%; después del endpoint de salud, 67 de 67 y 88.57%.
- Evidencia: `vitest.config.mts`, commit `224528e` y `06-baseline-tecnica.md`.

## Métricas de trabajo

Completar con el historial real del equipo:

| Sprint | Historias terminadas | Tiempo desde inicio hasta terminado | Bloqueos | Observación |
|---|---:|---:|---:|---|
| Sprint 1 | Pendiente | Pendiente | Pendiente | Pendiente |
| Sprint 2 | Pendiente | Pendiente | Pendiente | Pendiente |

La métrica debe servir para decidir una mejora, no solo para decorar el informe.

## Retrospectiva

| Elemento | Registro |
|---|---|
| Qué funcionó | Pendiente |
| Qué dificultó el flujo | Pendiente |
| Mejora acordada | Pendiente |
| Responsable | Pendiente |
| Cómo se comprobará | Pendiente |
