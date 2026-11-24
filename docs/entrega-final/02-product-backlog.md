# Product Backlog Flight CRM

El backlog se ordena por valor para el usuario principal: una persona responsable de admisiones o ventas de una escuela de aviación.

| Prioridad | Historia | Valor | Estado inicial |
|---|---|---|---|
| 1 | HU-01 Ver leads sin primer contacto | Evita perder prospectos nuevos | Existente, por verificar |
| 2 | HU-02 Capturar y asignar un lead | Reduce registro manual y tiempos de respuesta | Existente, por verificar |
| 3 | HU-03 Registrar contacto y próximo paso | Evita seguimientos olvidados | Existente, por verificar |
| 4 | HU-04 Reservar una llamada | Convierte el interés en una acción concreta | Existente, por verificar |
| 5 | HU-05 Proteger la información de cada escuela | Mantiene privacidad entre clientes | Existente, por verificar |
| 6 | HU-06 Integrar, probar y reproducir una entrega | Reduce riesgo al publicar cambios | Parcial, completar en la entrega |

## Deuda técnica priorizada

| Prioridad | Elemento | Motivo | Criterio de salida |
|---|---|---|---|
| Técnica 1 | TD-01 Remediar vulnerabilidades transitivas de Prisma | `npm audit` identifica un aviso alto en `effect` y la corrección automática propone un cambio mayor | Actualizar Prisma de forma compatible, repetir pruebas, build y audit, y registrar el resultado |

## HU-01 Ver leads sin primer contacto

**Como** responsable de admisiones, **quiero** identificar los leads que llevan más de 24 horas sin contacto, **para** priorizar la atención de los prospectos con mayor riesgo de abandono.

- Dado un lead abierto creado hace más de 24 horas y sin contacto real, cuando consulto el dashboard, entonces aparece en la lista de leads sin contacto.
- Dado un lead con una llamada no conectada, cuando consulto el dashboard, entonces continúa marcado como sin contacto real.
- Dado un lead que ya tuvo una conversación conectada, cuando consulto el dashboard, entonces no aparece como pendiente de primer contacto.

## HU-02 Capturar y asignar un lead

**Como** escuela de aviación, **quiero** recibir un lead desde un formulario y asignarlo según reglas, **para** que el prospecto sea atendido sin intervención manual inicial.

- Dado un formulario válido, cuando se recibe la solicitud, entonces se crea un lead dentro de la escuela correcta.
- Dado un lead con idioma, programa o fuente coincidente, cuando se ejecutan las reglas, entonces se asigna a una persona elegible.
- Dado un envío repetido con el mismo correo o teléfono, cuando se procesa, entonces se evita crear un duplicado y se registra la actividad.

## HU-03 Registrar contacto y próximo paso

**Como** agente comercial, **quiero** registrar una interacción y programar el siguiente paso, **para** mantener una trazabilidad completa del seguimiento.

- Dado un lead abierto sin tarea pendiente, cuando registro una llamada conectada, entonces el sistema exige un próximo paso.
- Dado un contacto con fecha de seguimiento, cuando se guarda, entonces aparece una tarea asociada al lead.
- Dado un agente de otra escuela, cuando intenta consultar o modificar el lead, entonces la operación es rechazada.

## HU-04 Reservar una llamada

**Como** prospecto, **quiero** reservar una llamada con la escuela, **para** elegir una forma de contacto y un horario sin intercambios innecesarios.

- Dado que existen horarios disponibles, cuando selecciono uno, entonces se registra la solicitud de llamada.
- Dado que elijo teléfono o Google Meet, cuando confirmo, entonces la reserva conserva el canal y el idioma seleccionado.
- Dado que la solicitud es válida, cuando se confirma, entonces la escuela puede verla en el flujo comercial correspondiente.

## HU-05 Proteger la información de cada escuela

**Como** cliente de Flight CRM, **quiero** que los datos de mi escuela estén aislados, **para** que otras escuelas no puedan acceder a mis leads o actividades.

- Dado un usuario de otra escuela, cuando consulta la lista de leads, entonces obtiene una lista vacía.
- Dado un usuario sin permisos suficientes, cuando intenta asignar o eliminar un lead, entonces la operación es rechazada.
- Dado un agente, cuando consulta datos, entonces solo ve el alcance permitido por su rol y configuración.

## HU-06 Integrar, probar y reproducir una entrega

**Como** equipo de desarrollo, **queremos** verificar cada cambio automáticamente y documentar su ejecución, **para** entregar una versión reproducible y confiable.

- Dado un push o pull request hacia `main`, cuando se ejecuta GitHub Actions, entonces instala dependencias, levanta la base, ejecuta pruebas, build, typecheck, lint y auditoría de dependencias.
- Dado un cambio con cobertura, cuando finaliza la validación, entonces se genera `coverage/lcov.info` para SonarQube.
- Dado un hallazgo de dependencias, cuando finaliza la auditoría, entonces se conserva un reporte JSON y el equipo registra la decisión de remediación.
- Dado un fallo de calidad o una versión defectuosa, cuando se revisa el procedimiento de recuperación, entonces el equipo puede volver al último commit funcional identificado.
- Dado un entorno de demostración activo, cuando consulto `/api/health`, entonces recibo el estado de la aplicación y de la base de datos sin información sensible.
