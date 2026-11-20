# Demo desplegada en Azure

## Acceso

- **Aplicación web:** <https://polite-meadow-029cbe40f.5.azurestaticapps.net/>
- **Servicio de autenticación:** <https://auth-service.wonderfulpebble-9c282134.brazilsouth.azurecontainerapps.io>
- **Servicio PQRS y Swagger:** <https://pqrs-service.wonderfulpebble-9c282134.brazilsouth.azurecontainerapps.io/docs>

Cuenta desechable de demostración (rol `USER`):

| Campo | Valor |
|---|---|
| Correo | `demo@telematics.test` |
| Contraseña | `DemoPQRS2026!` |

La cuenta solo sirve para probar el sitio; no usarla para información real. Se puede registrar otra cuenta desde la app.

## Estado verificado

- Frontend, autenticación y documentación del servicio PQRS responden correctamente.
- `pqrs-service` corre en Azure Container Apps en Brasil Sur con una sola réplica saludable.
- La cola BullMQ usa un **Azure Managed Redis independiente** (`telpqrs-redis-br`, Brasil Sur), vía TLS; la contraseña está guardada como secreto de Container Apps.
- La imagen activa de PQRS es `pqrs-service:ready`, sin el Redis embebido.
- Prueba de extremo a extremo: iniciar sesión, enviar un ticket desde la web o `POST /api/v1/tickets` y consultar `GET /api/v1/tickets/{id}`. La prueba del 20 de noviembre de 2026 terminó con estado `AI_PROCESSED` y clasificación IA.

La cola usada para el triage de tickets es BullMQ sobre Redis. La integración RabbitMQ `UserRegistered` descrita en [la guía de RabbitMQ](../../docs/rabbitmq/README.md) es otro flujo y no está habilitada en el despliegue actual porque `RABBITMQ_URL` no está configurada.

## Recursos Azure

- Azure Static Web Apps: frontend.
- Azure Container Apps: `auth-service` y `pqrs-service`.
- Azure Managed Redis: broker de BullMQ para el triage asíncrono.
- Azure Database for PostgreSQL: persistencia de auth y PQRS.
- Azure Container Registry: imágenes de los servicios.

Los recursos permanecen encendidos y pueden consumir el crédito de Azure. La instancia de Redis actual es de nivel de desarrollo, sin alta disponibilidad.

## Variables del servicio PQRS

En Container Apps, `pqrs-service` recibe `REDIS_HOST`, `REDIS_PORT`, `REDIS_TLS=true` y `REDIS_PASSWORD` como referencia a un secreto. Nunca guardes contraseñas de Azure, credenciales de PostgreSQL, claves de Groq ni tokens de sesión en este repositorio. El archivo local `deploy/azure/config.env` está ignorado por Git.

## CLI útil

```bash
az containerapp show -n pqrs-service -g rg-telematics-pqrs \
  --query "{image:properties.template.containers[0].image,revision:properties.latestRevisionName}"
az containerapp logs show -n pqrs-service -g rg-telematics-pqrs --follow
az redisenterprise show -n telpqrs-redis-br -g rg-telematics-pqrs \
  --query "{state:provisioningState,host:hostName,region:location}"
```
