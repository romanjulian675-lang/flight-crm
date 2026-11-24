# Trazabilidad de una historia

## Historia seleccionada

**HU-01: Ver leads sin primer contacto.**

## Recorrido completo

| Etapa | Evidencia que debe enlazarse | Estado |
|---|---|---|
| Necesidad del cliente | Registro de entrevista u observación | Pendiente |
| Priorización | Product Backlog y objetivo del sprint | Preparado |
| Desarrollo | Rama, commit o Pull Request | Completar enlace |
| Prueba | `tests/integration/crm.test.ts` — dashboard y leads sin contacto | Disponible en repositorio |
| Revisión | Comentario o aprobación de Pull Request | Completar enlace |
| Integración | Workflow de GitHub Actions | Completar enlace |
| Entrega | Demo local o entorno alojado | Completar enlace |
| Resultado | Indicador antes/después y feedback | Pendiente |

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
