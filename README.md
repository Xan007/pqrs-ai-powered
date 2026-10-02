# AI-Powered PQRS Triage and Prioritization System

**Telematics Course - Systems Engineering Program**  
*Universidad de los Llanos (2026-II)*

---

## 1. Project Overview
Organizations handle large volumes of PQRS (Petitions, Inquiries, Complaints, Claims, and Suggestions). Manual triage often leads to operational bottlenecks, human classification errors, and critical delays in addressing urgent cases.

This project implements an intelligent, distributed system that automates the triage process using Artificial Intelligence. The solution analyzes the sentiment and context of each submission, classifies it into standard regulatory categories, assigns the responsible organizational area, and computes an objective priority score to ensure high-impact issues are escalated immediately.

---

## 2. Architecture Overview
The system follows a **Microservices Architecture** to ensure decoupling, scalability, and independent deployment cycles. Services communicate over secure **HTTP/REST APIs**:

- **Frontend Client**: Web interface for user authentication and PQRS management.
- **Authentication Service**: Manages user identity, credential verification, and session tokens.
- **PQRS Domain Service**: Handles the lifecycle of PQRS requests, database persistence, and integrates an **internal AI Triage Module** (powered by Groq) for real-time classification, categorization, and urgency scoring.

---

## 3. Repository Structure

```text
Telematics-Project/
├── docker/
├── docs/
├── frontend/
├── services/
│   ├── auth-service/
│   └── pqrs-service/
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## 4. Local Development Setup

### Prerequisites
- **Git**
- **Docker & Docker Compose** (for local databases)
- **Python 3.11+**
- **Node.js** (for frontend development)

### 1. Clone Repository
```bash
git clone <repository-url>
cd Telematics-Project
```

### 2. Start Local Databases (Docker)
This starts a PostgreSQL instance and automatically provisions independent databases (`auth_db` and `pqrs_db`):
```bash
docker compose up -d
```

### 3. Start the Authentication Microservice
```bash
cd services/auth-service
# Follow configuration instructions in services/auth-service/README.md
```

### 4. Start the PQRS Domain Microservice
```bash
cd services/pqrs-service
python -m venv venv

# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

### 5. Start the Frontend Client
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Technology Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **Microservices Backend**: Python (FastAPI), Pydantic
- **AI Triage Module**: Groq API (High-speed LPU inference integrated into `pqrs-service`)
- **Persistence**: Relational Database (PostgreSQL - Database per Service pattern)
- **Cloud Infrastructure**: Microsoft Azure

---

## 5. Deployment (Azure)
Both microservices are containerized (`services/*/Dockerfile`) and deployed to **Azure Container Apps** with **Azure Database for PostgreSQL**. See [deploy/azure/README.md](deploy/azure/README.md) for the one-command deployment.
