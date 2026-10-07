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

There are two kinds of bearer token, and they are **not interchangeable**. Each carries an `aud` (audience) claim that the API enforces.

- **SLSEA users** (reading data): `POST /auth/login` with `username`/`password` returns a **user token** (8 h). Send it as `Authorization: Bearer <token>` on the scoped read/admin endpoints (e.g. `/districts`, `/installations`).
- **Devices** (writing readings): each installation has its own API key (from `seed-credentials.json`). The device sends it as `x-api-key: <key>` to `POST /installations/{id}/token` and receives a **device token** (1 h, scope `installation-write`, bound to that one installation). The device then sends it as `Authorization: Bearer <token>` to `POST /installations/{id}/readings`.

| Token used on…                         | Result                         |
|----------------------------------------|--------------------------------|
| user endpoint with a **device** token  | `403 WRONG_TOKEN_TYPE`         |
| `POST …/readings` with a **user** token | `403 WRONG_TOKEN_TYPE`         |
| device token for installation A on B   | `403 WRONG_INSTALLATION`       |
| missing / forged / expired token       | `401 NO_TOKEN` / `BAD_TOKEN`   |

Note: tokens issued before this audience check was added (no `aud` claim) are rejected with `401`; users just log in again and devices re-request a token.

## Validation and errors

Every route with input goes through a validation layer (`middleware/validate.js`, rules in `validation/schemas.js`) **before** any database work: path ids must be 24-hex ObjectIds, body fields must have the right JSON type and range, query parameters (`page`, `limit`, `from`, `to`, `order`) are checked, and unknown body fields are dropped.

All errors share one shape: `{ "error": { "code", "message", "detail" } }`. For validation failures `detail` lists every problem as `{ location, field, message }`.

| Status | Codes |
|--------|-------|
| 400 | `VALIDATION_ERROR`, `INVALID_ID`, `INVALID_JSON`, `INVALID_SUBSTATION` |
| 401 | `NO_TOKEN`, `BAD_TOKEN`, `NO_API_KEY`, `INVALID_CREDENTIALS` |
| 403 | `WRONG_TOKEN_TYPE`, `WRONG_SCOPE`, `WRONG_INSTALLATION`, `INVALID_API_KEY`, `FORBIDDEN` |
| 404 / 406 / 409 | `NOT_FOUND` / `NOT_ACCEPTABLE` / `DUPLICATE`, `DUPLICATE_METER` |
| 412 / 413 / 415 | `PRECONDITION_FAILED` / `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` |
| 500 | `INTERNAL_ERROR` (generic message — details are only logged server-side) |

## Tests

```bash
npm test
```

Uses Node's built-in test runner (no extra dependencies, no database needed). It covers token separation, validation and error handling.

## Project structure

```
index.js                   # Server entry point (checks env, connects DB, listens)
app.js                     # The Express app itself (importable by tests)
db.js                      # MongoDB connection
models/                    # Mongoose schemas
routes/                    # Route handlers (provinces, districts, substations, installations, readings, auth)
middleware/                # userAuth, deviceJwtAuth, deviceAuth, validate, scopeByJurisdiction
validation/                # Per-route validation schemas
utils/                     # errors (error shape + mapping), tokens (sign/verify user & device JWTs)
test/                      # node:test suites
swagger.yaml               # OpenAPI 3.0 spec served at /api-docs
seed.js                    # Database seeding script
```