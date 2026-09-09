# FLOXA Platform

FLOXA is a full-stack brand identity and client collaboration platform.

## Architecture

The project consists of two clean application roots:

```text
floxa/
├── backend/
│   ├── prisma/schema.prisma     # Prisma ORM schema for MongoDB
│   ├── media/                   # Local uploaded media storage (gitignored)
│   ├── data/db/                 # Local MongoDB WiredTiger storage (gitignored)
│   ├── scripts/                 # Developer testing utilities (scripts/diagnostics/)
│   ├── src/                     # Express application source code (TypeScript)
│   │   ├── config/              # Centralized environment configuration (env.ts)
│   │   ├── controllers/         # Request handling and HTTP response dispatch
│   │   ├── middleware/          # JWT auth, CSRF, portal token, error handlers
│   │   ├── prisma/              # PrismaClient singleton instance
│   │   ├── routes/              # Express API route declarations
│   │   ├── services/            # Core business logic (PDF, email, storage, payments)
│   │   ├── utils/               # Crypto utilities and DRF contract serializer
│   │   ├── websocket/           # WebRTC signaling and consultant support WS
│   │   ├── app.ts               # Express application initialization
│   │   └── server.ts            # HTTP server & WebSocket listener entrypoint
│   ├── tests/                   # Backend integration test suites (tests/integration/)
│   ├── .env.example             # Backend environment configuration template
│   ├── package.json             # Backend dependencies and scripts
│   └── tsconfig.json            # TypeScript NodeNext configuration
├── frontend/
│   ├── app/                     # Next.js App Router (pages & API proxy)
│   │   ├── api/[...path]/       # Next.js API edge proxy forwarding to backend
│   │   ├── client/[token]/      # Client Portal dynamic route
│   │   └── ...                  # Application route pages
│   ├── components/              # UI components (dashboard, client-portal, etc.)
│   ├── services/                # Frontend API client and WebSocket services
│   ├── __tests__/               # Isolated mock-based unit tests
│   ├── .env.example             # Frontend environment configuration template
│   ├── package.json             # Frontend dependencies and scripts
│   └── tsconfig.json            # Next.js TypeScript configuration
├── README.md                    # Repository documentation
└── .gitignore                   # Centralized repository ignore rules
```

### Technology Stack
* **Frontend**: Next.js 16 (App Router), React 19, TypeScript
* **Backend**: Node.js, Express, TypeScript
* **ORM**: Prisma Client (provider: `mongodb`)
* **Database**: MongoDB (Replica Set required for multi-document transactions)
* **Realtime**: WebSockets (`ws`) and WebRTC voice signaling

---

## Local Development

### Prerequisites
* **Node.js**: v20.x or v22.x LTS
* **MongoDB**: v6.0+ or v7.0+ running as a **Replica Set** (required by Prisma MongoDB for transactions).
  * Example local connection string: `mongodb://127.0.0.1:27017/floxa_db?replicaSet=rs0`

---

### Backend Setup & Execution

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy the environment configuration template:
   ```bash
   cp .env.example .env
   ```
   *Configure `DATABASE_URL`, secrets, and optional service keys as needed.*

3. Generate the Prisma client:
   ```bash
   npm run prisma:generate
   ```

4. Start the backend development server (defaults to port `5000`):
   ```bash
   npm run dev
   ```
   *The HTTP API will listen on `http://localhost:5000` and WebSockets on `ws://localhost:5000/ws/support/`.*

5. Validate TypeScript and build for production:
   ```bash
   npx tsc --noEmit
   npm run build
   ```

---

### Frontend Setup & Execution

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Copy the environment configuration template:
   ```bash
   cp .env.example .env.local
   ```
   *Default values point to `http://localhost:5000/api` and `localhost:5000`.*

3. Start the Next.js development server (defaults to port `3000`):
   ```bash
   npm run dev
   ```

4. Run safe, isolated frontend unit tests (zero database dependency):
   ```bash
   node --test __tests__/*.test.js
   ```

5. Validate TypeScript and build for production:
   ```bash
   npx tsc --noEmit
   npm run build
   ```

---

## Safety Warning: Backend Integration Tests

> [!CAUTION]
> **Database Safety Notice**:
> The test scripts located in `backend/tests/integration/` (e.g., `activities.test.mjs`, `payment_concurrency.test.mjs`, `deliverables_autogen_signoff.test.mjs`) are **database-connected integration/E2E test suites**.
> When executed, they connect directly to the MongoDB instance specified in `DATABASE_URL` and execute data mutations, document creations, and `deleteMany` cleanup operations.
>
> * **NEVER** run backend tests against production or shared staging databases.
> * Always configure a dedicated, isolated test database before executing backend test suites.

---

## Project Conventions

* **Routes (`backend/src/routes/`)**: Define route URLs and attach relevant middleware (auth, portal access, CSRF).
* **Controllers (`backend/src/controllers/`)**: Parse request parameters, validate payloads, and coordinate with services to dispatch HTTP responses.
* **Services (`backend/src/services/`)**: Encapsulate business logic, PDF document generation (PDFKit), email dispatch (Nodemailer), payment processing (Razorpay), AI generation (Google Gemini), and file storage.
* **Storage & Media (`backend/media/`)**: Centralized in `backend/src/services/storage.service.ts`. All uploaded assets (avatars, concepts, deliverables, moodboards, signed PDFs) are saved to and resolved from `ENV.MEDIA_ROOT` (defaults to `backend/media/`).
* **Contract Compatibility (`backend/src/utils/serializer.ts`)**: Normalizes MongoDB/Prisma documents into snake_case JSON schemas expected by existing frontend clients.
* **Realtime Communication (`backend/src/websocket/`)**: Manages consultant-client support rooms and WebRTC peer-to-peer audio calls.
