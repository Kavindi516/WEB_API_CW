# AI Disclosure — Prompts and AI Aids

**Module:** NB6007CEM Web API Development
**Student:** N.M.J.K Nanayakkara (COBSCCOMP251P-014)
**Project:** SLSEA Real-Time Solar Generation Data API

## AI aid used

- **Claude (by Anthropic)**, accessed via claude.ai, used as a pair-programming and
  code-review assistant throughout the project.

As the module permits and expects, I generated code with AI assistance and then directed
and critically evaluated it against the coursework brief and the marking rubric. I reviewed,
tested, and where necessary corrected the output rather than accepting it unchanged. The
prompts below are representative of how I directed the tool; they are grouped by the area of
work they relate to.

---

## 1. Scoping the work against the brief

- "Here is the coursework brief and the marking rubric. Read my current repository and tell
  me which brief requirements I have not yet met, grouped by rubric dimension."
- "List every REST resource the brief asks for (atomic, collection, composite, processing)
  and check which ones my code already exposes."
- "The brief says a created resource must report where it lives. Which of my endpoints return
  a Location header, and which are missing it?"

## 2. Data model

- "Review my Mongoose schemas. Confirm the Province → District → Substation → Installation →
  Reading hierarchy is foreign-key consistent with correct one-to-many cardinalities."
- "The brief wants readings as an append-only time series, not last-value fields on the
  installation. Does my model do this, and what index should I add for pagination and
  time-window queries?"
- "Explain why modelling the meter as an attribute of the installation is better here than a
  separate Device entity, so I can justify it in the report."

## 3. REST design — resources, methods, status codes

- "Build an installation composite resource that returns the installation plus its latest
  reading plus the full substation → district → province chain in one response."
- "Add a district generation-summary processing resource that computes current total power
  and today's total energy across all installations in the district."
- "Implement conditional GET on the composite installation using an ETag and If-None-Match,
  returning 304 when unchanged."
- "Add optimistic concurrency to PUT /installations using Last-Modified / If-Unmodified-Since,
  returning 412 when the resource has changed."
- "Add 406 Not Acceptable handling so a request whose Accept header excludes application/json
  is rejected instead of silently served JSON."

## 4. Security — authentication, scoping, roles

- "Redesign the device write path so each installation authenticates with a short-lived JWT
  scoped to installation-write, bootstrapped from a stored API key. Explain the trade-off
  versus using the raw API key directly."
- "Store only a SHA-256 hash of the device API key and compare it in constant time so response
  timing cannot leak how much of the key matched."
- "Separate user tokens and device tokens by JWT audience, pin the signing algorithm to HS256,
  and reject a token presented to the wrong kind of endpoint with 403."
- "Jurisdiction scoping is only enforced on the collection endpoints, so a user could read
  another district's data through a known item URL or through a substation's installations
  list. Put every read behind authentication and add the jurisdiction check to each single-item
  endpoint."
- "Gate POST, PUT and DELETE on installations behind the national role, and explain least-
  privilege so I can defend the choice at the viva."
- "Make the login validator reject non-string username/password so operator-injection like
  {\"username\": {\"$ne\": null}} cannot get through."

## 5. Error handling and validation

- "Standardise error handling so every client mistake returns the correct 4xx code instead of
  a 500, using one consistent error-body shape { error: { code, message, detail } }."
- "My malformed-ObjectId requests return 500. Map Mongoose CastError and ValidationError, and
  duplicate-key errors, to the correct 4xx codes."
- "Add a small dependency-free validation layer that checks types and ranges before any
  database work and strips unknown body fields."

## 6. Advanced query surface

- "Add pagination to the readings endpoint returning a data array plus pagination metadata with
  total count and next/previous links that preserve the caller's filters."
- "Add from/to time-window filtering and ascending/descending sort by timestamp, newest-first
  by default, with a hard page-size cap."

## 7. Testing

- "Write an automated black-box test script that exercises the whole API against the seed data:
  authentication, jurisdiction scoping on collections and single items, the composite and
  conditional requests, pagination/filtering/sorting, the device write path, and the role-gated
  create/update/delete path."
- "Add a test that logs in as each role and confirms a district user receives 403 when reading
  another district's installation."
- "Add an error-mapping test block that deliberately triggers malformed IDs and bad field types
  and asserts they return 400, not 500."

## 8. Deployment

- "My /api-docs returns 404 in production even though it works locally. Help me diagnose why
  the live service is behaving differently from my local build."
- "Make the app fail fast on startup if JWT_SECRET or MONGODB_URI is missing."

## 9. Documentation (OpenAPI / Swagger)

- "Author an OpenAPI 3.0 specification documenting every endpoint, its parameters, security
  requirements and response schemas, and serve it at /api-docs with Swagger UI."
- "Update the spec so every read endpoint requires a bearer token, document the 401/403
  responses, and separate the user, device and API-key security schemes."


---

## Problems where I corrected the AI's output rather than accepting it

1. **Energy-aggregation bug** — the first district-summary version summed instantaneous
   `powerKw` as if it were energy; I identified the dimensional error and recomputed today's
   energy as the difference between the first and last cumulative `energyKwh` readings of the day.
2. **Conditional-GET failure** — conditional GET returned 200 instead of 304; I traced it to
   Express's automatic weak ETag overwriting the strong ETag, disabled the automatic ETag, and
   compared If-None-Match explicitly.
3. **Device-auth redesign** — I replaced the raw-API-key write path with a scoped
   installation-write JWT bootstrapped from the key, and separated user and device tokens by JWT
   audience with a pinned algorithm so the two cannot be interchanged.
4. **Consistent error mapping** — I centralised error handling so client faults map to the
   correct 4xx codes instead of leaking as 500s, and added tests that deliberately trigger each case.
5. **Closing the scoping bypass** — jurisdiction scoping was initially enforced only on
   collections; I put every read behind authentication, added the jurisdiction check to every
   single-item read, and gated admin mutations behind the national role.
6. **Stale deployment** — I diagnosed `/api-docs` 404s in production as Railway auto-deploy
   being disabled, and re-enabled it.
