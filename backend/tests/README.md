# Backend Integration Test Suites

> [!CAUTION]
> **CRITICAL DATABASE SAFETY NOTICE**:
> The test suites in this directory (`backend/tests/integration/*.test.mjs`) are **database-connected integration and end-to-end tests**.
>
> * **Direct Database Connection**: They connect directly through Prisma Client to the MongoDB database configured in `DATABASE_URL`.
> * **Data Mutation & Deletion**: When executed, these tests create real records (consultants, projects, agreements, deliverables, payments) and execute `deleteMany` cleanup queries.
> * **Isolation Requirement**: They **MUST NEVER** be executed against production, staging, or any shared development database.
> * **Dedicated Disposable Database**: Running these tests requires a dedicated, isolated disposable database (e.g. `mongodb://127.0.0.1:27017/floxa_test?replicaSet=rs0`).
> * **Explicit Approval**: Running these suites requires explicit manual approval. No automatic `npm test` command is registered to prevent accidental test runs against local development data.

---

## Test Suites Inventory

Located under `backend/tests/integration/`:

| Test File | Target Subsystem / Flow | Key Operations |
| :--- | :--- | :--- |
| `activities.test.mjs` | Consultant & client activity logging | Creates consultant, project, logs activities, queries read state |
| `concept_approval_locking.test.mjs` | Concept approvals & immutable locking | Tests concept approval status transitions, client portal locking |
| `deliverables_autogen_signoff.test.mjs` | Brand package autogen & completion | Tests PDF deliverable generation upsert and client sign-off |
| `generated_agreement.test.mjs` | Agreement PDFKit generation & snapshots | Verifies agreement snapshot generation, PDFKit buffer, legal terms |
| `payment_concurrency.test.mjs` | Razorpay webhook idempotency & concurrency | Concurrently fires mock webhooks, verifies milestone state machine |
| `phase5_summary_email.test.mjs` | Discovery summary email delivery | Verifies email formatting and delivery dispatch with mock transport |
| `phase6_support_ws.test.mjs` | WebSocket support & WebRTC voice signaling | Connects WS client, tests session rooms and signaling message routing |

---

## Safe Execution Workflow

To safely execute an integration test:

1. Ensure the backend build artifacts are up to date:
   ```bash
   cd backend
   npm run build
   ```

2. Configure a dedicated test database in `.env.test`:
   ```bash
   DATABASE_URL="mongodb://127.0.0.1:27017/floxa_test_disposable?replicaSet=rs0"
   ```

3. Execute the single desired test suite manually:
   ```bash
   node tests/integration/deliverables_autogen_signoff.test.mjs
   ```

4. Verify that the disposable test database can be dropped after testing:
   ```bash
   # Clean up disposable test database
   ```
