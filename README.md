# WEB_API_CW

# SLSEA Solar Generation Data API

**Web API Development-Coursework** | BSc (Hons) Computing (Software Engineering), Coventry University (delivered at NIBM)
**Name:** N.M.J.K Nanayakkara
**Index:** COBSCCOMP251P-014

Real-time and historical solar generation data API for the Sri Lanka Sustainable Energy Authority (SLSEA). Metering devices push readings as write clients; SLSEA users read data scoped by jurisdiction (national / provincial / district).

**Live API:** https://webapicw-production.up.railway.app

**API documentation (Swagger UI):** https://webapicw-production.up.railway.app/api-docs

## Tech stack

- Node.js / Express 5
- MongoDB Atlas (via Mongoose)
- JWT bearer auth (SLSEA users) + API-key auth (metering devices)
- OpenAPI 3.0 docs served via `swagger-ui-express`
- Deployed on Railway (auto-deploys from `main` on push)

## Prerequisites

- Node.js (LTS recommended)
- A MongoDB connection string (local or Atlas)

## Setup

1. Clone the repository and install dependencies:
```bash
   git clone <repo-url>
   cd WEB_API_CW
   npm install
```

2. Create a `.env` file in the project root with:
```env
   MONGODB_URI=<your MongoDB connection string>
   JWT_SECRET=<any long random string>
   PORT=3000
```

3. Seed the database with sample data (provinces, districts, substations, installations, one week of 15-minute readings, and 3 test users):
```bash
   node seed.js
```
   This also writes `seed-credentials.json` with each installation's device API key — needed to test the write path (`POST /installations/{id}/readings`).

   **Seeded SLSEA users** (all share the password `Password123`):
   | Username         | Role        | Scope                  |
   |------------------|-------------|-------------------------|
   | `national`       | NATIONAL    | Sees all data           |
   | `western_user`   | PROVINCIAL  | Western province only   |
   | `colombo_user`   | DISTRICT    | Colombo district only   |

4. Start the server:
```bash
   npm start
```
   The API will be running at `http://localhost:3000`.

## API documentation

Full interactive API docs (all endpoints, request/response schemas, auth requirements) are available at `/api-docs` — both locally (`http://localhost:3000/api-docs`) and in production (link above).

## Authentication

- **SLSEA users** (reading data): `POST /auth/login` with `username`/`password` returns a JWT bearer token. Include it as `Authorization: Bearer <token>` on scoped endpoints (e.g. `/districts`, `/installations`).
- **Devices** (writing readings): each installation has its own API key (from `seed-credentials.json`). Include it as `x-api-key: <key>` when calling `POST /installations/{id}/readings`.

## Project structure

```
index.js                   # Express app entry point
db.js                      # MongoDB connection
models/                    # Mongoose schemas
routes/                    # Route handlers (provinces, districts, substations, installations, readings, auth)
middleware/                # userAuth, deviceAuth, scopeByJurisdiction
swagger.yaml               # OpenAPI 3.0 spec served at /api-docs
seed.js                    # Database seeding script
```