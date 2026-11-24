# Acciones manuales pendientes

Estas acciones no pueden completarse únicamente modificando archivos locales.

## GitHub

- Crear o confirmar la rama de trabajo del equipo a partir de `sonarcloudtests`.
- Subir cada commit de la iteración con un mensaje claro.
- Abrir al menos un Pull Request hacia `main` y solicitar revisión a otro integrante.
- Añadir comentarios de revisión útiles y conservar el enlace.
- Configurar protección de `main` para exigir la validación de CI si la cuenta lo permite.

## SonarQube Cloud

- Crear o confirmar el proyecto `flight-crm`.
- Configurar el secreto `SONAR_TOKEN`.
- Configurar la variable `SONAR_ORGANIZATION`.
- Verificar que el Quality Gate y la cobertura aparezcan en el workflow.

## Base de datos y pruebas locales

En una terminal separada, ejecutar:

```powershell
npm run db:local
```

Cuando PostgreSQL indique que está listo, en otra terminal ejecutar:

```powershell
npm run db:migrate
npm run db:seed
npm run test:coverage
```

La configuración de Vitest usa un único worker basado en threads para evitar cierres inesperados de procesos nativos en Windows durante la suite de integración.

## Preparar la demostración

Con PostgreSQL activo, ejecutar una sola vez:

```powershell
npm run db:seed
npm run db:demo-history
```

El segundo comando agrega historial sintético únicamente a la escuela cuyo nombre termina en `(demo)` y solo usa usuarios `@demo.local`. Para verificar que la aplicación y los datos están listos:

```powershell
npm run dev
```

En otra terminal:

```powershell
npm run verify:demo
```

No ejecutar `db:demo-history` contra datos reales ni modificar los usuarios de demostración para incluir credenciales reales.

No subir `.env`, `.env.local`, contraseñas, tokens ni datos reales.

## Cliente y validación

- Entrevistar o probar el flujo con al menos dos usuarios potenciales.
- Registrar fecha, perfil, problema observado, tarea realizada y comentarios.
- Medir un indicador sencillo, por ejemplo tiempo para encontrar un lead sin contacto o porcentaje de tareas completadas.
- Registrar qué se mantuvo, qué se cambió y qué se descartó después de la retroalimentación.

## Evidencia de la sustentación

- Capturar el recorrido principal funcionando.
- Capturar el tablero y los objetivos de cada sprint.
- Guardar enlaces a commits, Pull Request, workflow y resultados de pruebas.
- Preparar la explicación individual de cada integrante.
