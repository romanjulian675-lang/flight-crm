# Trazabilidad de una historia

## Historia seleccionada

**HU-06: Preparar una ruta internacional (Global Pathways).** También se conserva HU-01 como recorrido de la demo.

## Recorrido completo HU-06

| Etapa | Evidencia | Estado |
|---|---|---|
| Necesidad del cliente | `10-validacion-cliente.md`, sesión del 25 nov | Registrado |
| Priorización | `02-product-backlog.md` (prioridad 6, "Nuevo") y Sprint 2 en `04-plan-de-sprints.md` | Hecho |
| Desarrollo | Rama `sonarcloudtests`, commits `5991172` y `cd1ef8f` | Hecho |
| Prueba | `tests/unit/pathways.test.ts` y `tests/unit/pathway-exchange.test.ts` | Hecho |
| Revisión | PR #3 hacia `main` [COMPLETAR: enlace] | Pendiente |
| Integración | Ejecución del workflow en el PR #3 [COMPLETAR: enlace] | Pendiente |
| Entrega | `npm run verify:demo` en entorno local | Hecho |
| Resultado | Indicador en `10-validacion-cliente.md` | Esperado |

## Evidencia técnica existente

El módulo `src/modules/dashboard.ts` calcula los leads sin contacto y `src/app/(app)/page.tsx` los presenta en el dashboard. Las pruebas de integración verifican que un lead antiguo sin contacto aparece y que una conversación conectada cambia su estado.

## Criterio para la demo

La demo debe mostrar, en este orden:

1. Un lead creado desde un canal de entrada.
2. Su asignación a un agente.
3. La aparición del lead como pendiente de contacto.
4. El registro de una conversación conectada.
5. La creación del próximo paso.
6. La desaparición del pendiente y la tarea visible.
