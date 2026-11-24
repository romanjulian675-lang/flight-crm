# Operación y recuperación

## Comprobación de salud

Flight CRM expone `GET /api/health`. La respuesta `200` confirma que la aplicación puede ejecutar una consulta mínima contra PostgreSQL:

```json
{
  "status": "ok",
  "database": "ok"
}
```

Si la base no está disponible, responde `503` sin revelar credenciales ni detalles internos:

```json
{
  "status": "error",
  "database": "unavailable"
}
```

## Verificación manual

Con la aplicación levantada, ejecutar:

```powershell
Invoke-WebRequest http://localhost:3200/api/health | Select-Object StatusCode, Content
```

La prueba automatizada cubre tanto el estado saludable como el error de conexión simulado.

## Recuperación

1. Revisar el commit y el workflow de la última versión funcional.
2. Confirmar que `npm run test:coverage`, `npm run typecheck`, `npm run lint` y `npm run build` pasan.
3. Si el fallo pertenece al último cambio, revertirlo mediante una nueva PR o desplegar el commit funcional anterior.
4. Volver a consultar `/api/health` y revisar los logs del entorno.

La recuperación debe hacerse con una nueva operación revisada; no se debe reescribir el historial compartido.
