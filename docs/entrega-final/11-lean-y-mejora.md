# Lean y mejora continua

## Desperdicios identificados

| Desperdicio | Dónde aparece | Efecto | Evidencia |
|---|---|---|---|
| Espera | El equipo debe levantar PostgreSQL antes de ejecutar la suite local | Retrasa la verificación de cambios | Registro de ejecución local |
| Retrabajo | Un worker de Vitest fallaba de forma inconsistente en Windows | Repetición de pruebas y resultados parciales | Commit `224528e` y baseline técnica |
| Trabajo no validado | Global Pathways se construyó antes de hablar con el cliente | Riesgo de construir funciones que el usuario no prioriza | Sesión del 25 nov y ajuste en `cd1ef8f` |

## Mejora aplicada

Se configuró Vitest con un único worker basado en threads:

- Situación inicial: 53 de 65 pruebas terminaban y un worker se cerraba inesperadamente.
- Acción: ajustar `pool` a `threads` y `maxWorkers` a `1`.
- Resultado observado: 65 de 65 pruebas aprobadas y cobertura de líneas de 88.51%; después del endpoint de salud, 67 de 67 y 88.57%.
- Evidencia: `vitest.config.mts`, commit `224528e` y `06-baseline-tecnica.m## Métricas de trabajo (fuente: historial de Git)

| Etapa | Commits | Líneas añadidas | Duración | Observación |
|---|---:|---:|---|---|
| Sprint 1 (12 nov) | 4 | ~360 | 1 día | Todo el trabajo se concentró en una sola sesión |
| Sprint 2 (24–25 nov) | 10 | ~1.190 | 2 días | Mayor volumen; el trabajo quedó en la rama sin integrar a `main` hasta el PR #3 |

**Decisión que tomamos con la métrica:** los cambios de Sprint 2 se acumularon en una rama sin integrar (desperdicio de "cambios terminados que tardan en integrarse"). La mejora es integrar con PRs más pequeños y frecuentes.

## Retrospectiva Sprint 2

| Elemento | Registro |
|---|---|
| Qué funcionó | La CI detectó problemas antes de integrar; la sesión con el cliente reorientó Global Pathways |
| Qué dificultó el flujo | Pruebas inestables en Windows; trabajo acumulado en una sola rama; validación con usuarios tardía |
| Mejora acordada | PRs pequeños y validar con el cliente antes de implementar una historia nueva |
| Responsable | Equipo FlightLeads; seguimiento técnico de Juan Diego Rodríguez Velásquez |
| Cómo se comprobará | Número de días entre el primer commit de una historia y su integración en `main` |
