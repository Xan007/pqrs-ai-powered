# Frontend

Cliente web para crear una cuenta, iniciar sesión y ver las PQRS de esa cuenta.

React, Vite, TypeScript y Tailwind.

## Arranque

El auth-service debe estar en el puerto 8001 y el pqrs-service en el 8002.

```bash
cd frontend
npm install
npm run dev
```

Las URL están en `.env.example` (`VITE_AUTH_API_URL` y `VITE_PQRS_API_URL`). Si no copias ese archivo a `.env`, el cliente usa `http://localhost:8001` y `http://localhost:8002`.
