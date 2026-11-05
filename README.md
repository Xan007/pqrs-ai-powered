# AI-Powered PQRS Triage System

Telematics course project for the Systems Engineering Program at Universidad de los Llanos.

docs: https://drive.google.com/drive/folders/1oqT9XXS6HjYcD_AJydByIThGh1IPEjG-?usp=sharing

## Overview

This project implements a distributed PQRS platform. Users authenticate through the Auth
Service, submit requests through the PQRS Service, and receive automated triage based on
category, department, priority, urgency, and summary.

## Architecture

- **Frontend:** React, Vite, and TypeScript.
- **Auth Service:** Express, TypeScript, Prisma, PostgreSQL, bcrypt, and JWT.
- **PQRS Service:** NestJS, Prisma, PostgreSQL, BullMQ, Redis, and Groq.
- **Persistence:** One PostgreSQL server with separate `auth_db` and `pqrs_db` databases.
- **Local infrastructure:** Docker Compose.
- **Cloud deployment:** Azure Container Apps, Azure Database for PostgreSQL, Azure Container
  Registry, and Redis. See [deploy/azure/README.md](deploy/azure/README.md).

The Auth Service issues JWTs. The PQRS Service validates the same JWT locally and derives
the authenticated user identity from the `sub` claim. Services do not share database tables.

## Repository structure

```text
Telematics-Project/
├── docker/
├── deploy/
│   └── azure/
├── frontend/
└── services/
    ├── auth-service/
    └── pqrs-service/
```

## Prerequisites

- Git
- Node.js 22 or a compatible current LTS release
- Docker Desktop
- A Groq API key for AI triage

## Run locally

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Install dependencies and start the Auth Service:

```bash
cd services/auth-service
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

In another terminal, start the PQRS Service:

```bash
cd services/pqrs-service
npm ci
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

For direct local execution, set `GROQ_API_KEY` in the PQRS Service environment if AI triage
is required. Docker Compose loads `services/pqrs-service/.env` automatically; make sure that
file exists and contains the key before starting the application profile:

```bash
docker compose --profile app up --build
```

Start the frontend in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

## Test and build

```bash
cd services/auth-service && npm test && npm run build
cd ../pqrs-service && npm test && npm run build
cd ../../frontend && npm run build
```

## API endpoints

The Auth Service listens on `http://localhost:8001` and the PQRS Service listens on
`http://localhost:8002`.

- Auth API: `http://localhost:8001/api/v1`
- PQRS API: `http://localhost:8002/api/v1/tickets`
- PQRS Swagger: `http://localhost:8002/docs`

Ticket endpoints require `Authorization: Bearer <token>`. Regular users can create and
read their own tickets. Administrators can list all tickets and update ticket status.
