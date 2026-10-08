# Asynchronous Communication with RabbitMQ

The microservices exchange **integration events** through RabbitMQ instead of calling each other over HTTP.
The publisher does not know who consumes the event, and the consumer processes it whenever it is available.

```text
auth-service  (publisher)
   │  POST /api/v1/auth/register  →  user saved  →  publishes UserRegistered
   ▼
Exchange  microservices.events   (direct, durable)
   │  routing key: user.registered
   ▼
Queue     pqrs.user.registered.queue   (durable, dead-lettered to microservices.events.dlx)
   │  manual ack after successful processing
   ▼
pqrs-service  (consumer)  →  UserRegisteredConsumer.handle()

Invalid / repeatedly failing messages ─► microservices.events.dlx ─► pqrs.user.registered.queue.dlq
```

## Names

| Element | Value |
|---|---|
| Virtual host | `/` |
| Exchange | `microservices.events` (`direct`, durable) |
| Routing key | `user.registered` |
| Queue | `pqrs.user.registered.queue` (owned by pqrs-service) |
| Dead-letter exchange | `microservices.events.dlx` (`direct`, durable) |
| Dead-letter queue | `pqrs.user.registered.queue.dlq` |

Queues are prefixed with the consuming service, so another service can bind its own queue to
`user.registered` and receive its own copy of every event.

## Event contract

The contract is versioned in [`contracts/events/user-registered.json`](../../contracts/events/user-registered.json).
Unit tests in **both** services check their code against that file, so a change on one side that breaks the
other fails the build.

```json
{
  "eventId": "6f1c1f0e-8d0a-4a4e-9a7e-3b1d2c4e5f60",
  "eventType": "UserRegistered",
  "source": "auth-service",
  "createdAt": "2026-10-08T10:00:00.000Z",
  "data": { "userId": "01a0...", "email": "juan@test.com", "role": "USER", "status": "ACTIVE" }
}
```

Messages are published as persistent JSON (`delivery_mode = 2`, `content_type = application/json`) with
`message_id = eventId`, `type = eventType` and `app_id = source`.

## Delivery guarantees and error handling

| Situation | Behaviour |
|---|---|
| Publish | Confirm channel: `publish` resolves only when the broker has the message. |
| Broker down while registering | Registration still returns `201`; the failure is logged and the event is **not** sent (no outbox yet). |
| Broker connection lost | auth-service reconnects on the next publish; pqrs-service retries every 5 s and re-subscribes. |
| Consumer offline | Messages wait in the durable queue and are delivered when it comes back. |
| Malformed JSON or contract violation | Rejected without requeue → DLQ. |
| Handler throws | Requeued once; if it fails again → DLQ. |
| `RABBITMQ_URL` empty | Messaging disabled (publisher becomes a no-op, consumers are not started). This is the case on Azure today. |

Messages in the DLQ can be inspected and moved back from the management UI (or with the Postman collection).

## Code layout

Infrastructure is kept apart from business logic:

| Service | Infrastructure | Business |
|---|---|---|
| auth-service | `src/messaging/rabbitmq.publisher.ts` (amqplib) | `UserService.register` publishes through the `EventPublisher` interface |
| pqrs-service | `src/messaging/rabbitmq.service.ts` (topology, ack/nack, reconnect) | `src/messaging/consumers/user-registered.consumer.ts` |

## Running it

```bash
# Broker only (for local development or integration tests)
docker compose up -d rabbitmq

# Whole stack in containers (Postgres, Redis, RabbitMQ, auth-service, pqrs-service)
docker compose --profile app up -d --build
```

- AMQP: `amqp://guest:guest@localhost:5672`
- Management UI: <http://localhost:15672> (guest / guest)
- If 5672/15672 are already taken on your machine: `RABBITMQ_PORT=5673 RABBITMQ_MANAGEMENT_PORT=15673 docker compose up -d rabbitmq`
  (then use `RABBITMQ_URL=amqp://guest:guest@localhost:5673` in the services' `.env`).

Register a user and watch pqrs-service log `UserRegistered received: user ...`:

```bash
curl -X POST http://localhost:8001/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"demo@test.com","password":"password123"}'
```

## Tests

| Level | Where | Command | Needs |
|---|---|---|---|
| Unit | `services/auth-service/test/messaging`, `services/pqrs-service/src/messaging/**/*.spec.ts` | `npm test` in each service | nothing |
| Integration | `services/*/test/integration` | `npm run test:integration` in each service | `docker compose up -d rabbitmq` |
| End-to-end | `tests/e2e/rabbitmq-communication.e2e.test.mjs` | `node --test "tests/e2e/*.test.mjs"` (repo root) | `docker compose --profile app up -d --build` |

- **Unit** tests use in-memory fakes of the amqplib connection/channel: message format, confirms, ack/nack and DLQ
  policy, reconnection, contract validation.
- **Integration** tests talk to a real broker. auth-service checks that a registration ends up as a
  `UserRegistered` message on a queue bound to the exchange; pqrs-service checks ack, ordering, DLQ for invalid
  messages, retry-once and durability while the consumer is offline. They use their own temporary queues, so
  they never steal messages from a running pqrs-service.
- **End-to-end** registers users through the real auth-service HTTP API and verifies through the RabbitMQ
  management API that the event was published with the right content and acknowledged by pqrs-service.

Environment overrides: `RABBITMQ_URL` (integration), `AUTH_URL`, `RABBITMQ_MGMT_URL`, `RABBITMQ_MGMT_CREDENTIALS` (e2e).

## Postman

Import [`RabbitMQ-Lab.postman_collection.json`](RabbitMQ-Lab.postman_collection.json). It reproduces the lab
requests (create exchange/queue/binding, publish, get with `ack_requeue_false` / `ack_requeue_true`, purge)
using this project's names, plus requests to send an invalid message and read the DLQ.
