# Análisis de dependencias y entrega

## Decisión técnica

Flight CRM usa Node.js y npm, por lo que el laboratorio de OWASP Dependency-Check para Maven no se aplica literalmente. La práctica equivalente será `npm audit` dentro de GitHub Actions, usando el árbol de dependencias definido por `package-lock.json`.

## Automatización

El workflow `.github/workflows/sonarqube-analysis.yml` incluye un job independiente llamado `dependency-audit` que:

1. Instala Node.js 24.
2. Ejecuta `npm ci` usando el lockfile.
3. Ejecuta `npm audit --json`.
4. Conserva el resultado y marca el job con advertencia si npm encuentra vulnerabilidades.
5. Guarda `npm-audit.json` como artefacto incluso cuando el análisis falla.

Separar este job del análisis de SonarQube permite distinguir calidad del código de seguridad de dependencias y conserva el reporte para investigar la causa.

## Línea base

La ejecución local de `npm audit --audit-level=high` reportó vulnerabilidades transitivas. La actualización de Next.js a `16.4.6` eliminó parte de los avisos corregibles sin cambios mayores, pero Prisma 7 todavía arrastra `effect` con severidad alta. No se ejecutó `npm audit fix --force` porque propone un cambio mayor de Prisma. El resultado queda visible como advertencia y el reporte se conserva como artefacto.

La decisión para esta entrega es observar y registrar el riesgo sin bloquear la PR hasta validar una actualización compatible de Prisma. La remediación de esa dependencia queda como pendiente explícito del backlog técnico.

## Acción manual pendiente

En la Pull Request, abrir el job **Dependency audit**, revisar el resumen y descargar el artefacto `npm-audit-report`. Registrar la dependencia, severidad, ruta transitiva y decisión de actualización, sustitución o aceptación temporal del riesgo.
