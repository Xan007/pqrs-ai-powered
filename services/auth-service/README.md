# Authentication Microservice

Independent service responsible for user identity, authentication, credential validation, and JWT token issuance.

**Stack:** Node.js + Express 5 + TypeScript, Prisma (PostgreSQL `auth_db`), bcrypt, JWT.

## Setup

```bash
cd services/auth-service
cp .env.example .env          # adjust values
npm install
npm run prisma:generate
npm run prisma:deploy         # apply migrations (use prisma:migrate while developing)
npm run seed                  # optional: creates the ADMIN user from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                   # http://localhost:8001
```

Production: `npm run build && npm start`.

## Tests

```bash
npm test            # unit + HTTP tests (Jest + supertest), no database needed
npm run test:cov    # with coverage report
```

Tests live in `test/`. The repository is mocked, so the suite runs without PostgreSQL.

```bash
# Publisher against a real broker (docker compose up -d rabbitmq)
npm run test:integration
```

## Events (RabbitMQ)

After a successful registration the service publishes `UserRegistered` to the `microservices.events` exchange
with routing key `user.registered` (see [docs/rabbitmq](../../docs/rabbitmq/README.md)). Configure it with
`RABBITMQ_URL` / `RABBITMQ_EXCHANGE`; leave `RABBITMQ_URL` empty to disable publishing. A broker outage never
fails the registration.

## Endpoints

All routes are prefixed with `/api/v1` (except `/health`).

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/health` | – | Health check |
| POST | `/auth/register` | – | Register a user (`{ email, password }`, min 8 chars). Always created with role `USER` |
| POST | `/auth/login` | – | Returns `{ accessToken, tokenType, expiresIn, user }` |
| GET | `/auth/me` | Bearer | Current user profile |
| GET | `/auth/verify` | Bearer | Validates a token and returns its payload (for other services) |
| GET | `/users` | ADMIN | List users |
| GET | `/users/:id` | ADMIN | Get user by id |
| PATCH | `/users/:id/role` | ADMIN | Change role (`{ role: "USER" \| "ADMIN" }`) |

JWT payload: `{ sub: userId, email, role }`, signed with `JWT_SECRET` / `JWT_ALGORITHM`, valid for `ACCESS_TOKEN_EXPIRE_MINUTES`.
Other services can validate tokens locally with the same `JWT_SECRET`, or call `GET /api/v1/auth/verify`.

Errors follow the same shape as the PQRS service:

```json
{ "code": "AUTH.UNAUTHORIZED", "message": "Invalid email or password", "details": null, "traceId": "req_..." }
```
