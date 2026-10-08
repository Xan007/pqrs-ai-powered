# PQRS Domain Microservice

Domain microservice responsible for:
- Managing PQRS requests lifecycle (CRUD operations).
- Ingesting incoming tickets and executing AI-driven triage (categorization, urgency detection, and summarization using Groq).
- Persisting state with PostgreSQL through Prisma ORM.

## Local Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure `DATABASE_URL` and `GROQ_API_KEY` are properly defined.

### 3. Apply Database Migrations
```bash
npx prisma migrate dev --name init_tickets
```

### 4. Run the Service
```bash
# Development mode
npm run start:dev
```

- **API Endpoint:** `http://localhost:8002/api/v1/tickets`
- **Swagger Documentation:** `http://localhost:8002/docs`

## Tests

```bash
npm test                    # unit tests, no external services
npm run test:integration    # RabbitMQ consumer against a real broker (docker compose up -d rabbitmq)
```

## Events (RabbitMQ)

`UserRegisteredConsumer` consumes `UserRegistered` events published by auth-service from
`pqrs.user.registered.queue` (bound to `microservices.events` / `user.registered`). Invalid messages and messages
that fail twice go to `pqrs.user.registered.queue.dlq`. Configure it with `RABBITMQ_URL`, `RABBITMQ_EXCHANGE` and
`RABBITMQ_PREFETCH`; leave `RABBITMQ_URL` empty to disable the consumers. See [docs/rabbitmq](../../docs/rabbitmq/README.md).
