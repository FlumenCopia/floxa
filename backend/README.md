# FLOXA Backend

The active backend service for the FLOXA platform, providing REST APIs, authentication, media asset delivery, and real-time WebSocket communication for client-consultant collaboration.

---

## Technology Stack

* **Runtime**: Node.js (v20.x or v22.x LTS)
* **Framework**: Express 4.x
* **Language**: TypeScript 5.7 (NodeNext module resolution)
* **ORM**: Prisma Client 6.4 (provider: `mongodb`)
* **Database**: MongoDB 6.0+ / 7.0+ / 8.0+ (Replica Set required for multi-document ACID transactions)
* **Realtime**: WebSockets (`ws`) with WebRTC voice signaling support

---

## Entry Points

* **`src/server.ts`**: Main process entry point. Creates the Node HTTP server wrapping the Express app, attaches the WebSocket server (`/ws/support/`), and binds to `ENV.PORT` (default `5000`).
* **`src/app.ts`**: Express application factory. Configures middleware (CORS, cookies, JSON/URL-encoded parsing), public static media streaming route (`/media/`), CSRF protection, `/api/` route mounting, `/health` endpoint, and global error handling.

---

## Directory Structure & Responsibilities

```text
backend/
├── prisma/
│   └── schema.prisma         # Prisma data models, relations, and enums for MongoDB
├── media/                     # Uploaded media storage (avatars, concepts, signed PDFs) [gitignored]
├── data/db/                   # Local MongoDB WiredTiger database files [gitignored]
├── scripts/
│   ├── README.md              # Documentation for diagnostic utilities
│   └── diagnostics/           # Manual diagnostic scripts (Prisma query, WS client)
├── tests/
│   ├── README.md              # Database safety rules and testing guidelines
│   └── integration/           # Database-connected integration test suites
├── src/
│   ├── config/                # Environment configuration and defaults (env.ts)
│   ├── controllers/           # HTTP request handlers and response dispatchers
│   ├── middleware/            # Auth, portal token, CSRF, and error handling middleware
│   ├── prisma/                # PrismaClient singleton instance (client.ts)
│   ├── routes/                # Express router declarations (/api/auth, /api/projects, etc.)
│   ├── services/              # Business logic (PDF generation, email, payments, storage)
│   ├── utils/                 # Cryptographic helpers and DRF response serializer
│   ├── websocket/             # WebSocket server and WebRTC peer signaling handler
│   ├── app.ts                 # Express application initialization
│   └── server.ts              # HTTP & WebSocket server bootstrap
├── .env.example               # Environment variables template
├── package.json               # Package configuration and dependencies
└── tsconfig.json              # TypeScript compiler configuration
```

### Folder Responsibilities

* **`src/config/`**: Centralized configuration loaded via `dotenv`. Exports the immutable `ENV` object containing port, secrets, cookie parameters, CORS origins, and media paths.
* **`src/controllers/`**: Extracts parameters from incoming requests, validates input, invokes service logic or performs direct Prisma queries, and sends HTTP responses.
* **`src/middleware/`**: Request interceptors including JWT authentication (`auth.middleware.ts`), client portal token verification (`portal.middleware.ts`), CSRF cookie validation (`csrf.middleware.ts`), and global error handling (`error.middleware.ts`).
* **`src/prisma/`**: Exports the shared `PrismaClient` singleton instance (`client.ts`), ensuring connection reuse across the process lifecycle.
* **`src/routes/`**: Declares API route paths and attaches appropriate middleware before delegating to controller functions.
* **`src/services/`**: Encapsulates external integrations and core domain logic:
  * `auth.service.ts`: JWT token creation, password hashing/verification.
  * `email.service.ts`: Nodemailer SMTP transport for discovery summaries and agreements.
  * `gemini.service.ts`: Google Gemini AI content generation for brand briefs.
  * `generatedAgreement.service.ts`: Legal agreement generation and snapshot state machine.
  * `payment.service.ts`: Payment milestone status management and verification.
  * `pdf.service.ts`: PDFKit document generation (legal agreements and brand delivery packages).
  * `project.service.ts`: Project creation and activity logging.
  * `razorpay.service.ts`: Razorpay order creation and HMAC SHA-256 webhook signature verification.
  * `storage.service.ts`: Local disk file writes and optional cloud blob fallback.
* **`src/utils/`**:
  * `crypto.ts`: Portal token signing/verification and hash helpers.
  * `serializer.ts`: Django REST Framework (DRF) compatibility layer that transforms MongoDB/Prisma documents into snake_case API contracts expected by frontend components.
* **`src/websocket/`**: Manages real-time consultant-client support rooms (`ACTIVE_HELP_SESSIONS`), field synchronization (`FIELD_SYNC`), and WebRTC audio signaling (`OFFER`, `ANSWER`, `ICE_CANDIDATE`).
* **`scripts/`**: Developer diagnostic scripts for inspecting Prisma data or testing WebSocket connectivity.
* **`tests/`**: Database-connected integration and E2E test suites (located in `tests/integration/`).
* **`media/`**: Local runtime storage for user uploads and generated documents (excluded from Git).
* **`data/`**: Local MongoDB runtime storage (excluded from Git).

---

## Request Flow

```text
Incoming HTTP Request
       │
       ▼
Express Route (`src/routes/`)
       │
       ▼
Middleware (`src/middleware/`) ────► [Auth / Portal Token / CSRF Check]
       │
       ▼
Controller (`src/controllers/`)
       │
       ├───────────────────────────────┐
       ▼                               ▼
Business Service (`src/services/`)   Direct Prisma Access (`prisma.*`)
       │                               │
       ├───────────────────────────────┘
       ▼
Serializer (`src/utils/serializer.ts`) ──► [Transforms to snake_case contract]
       │
       ▼
HTTP JSON Response
```

*Note: In accordance with the verified architecture, some controllers perform direct Prisma queries where specialized service encapsulation is not required.*

---

## Prisma and MongoDB

* **Schema Location**: `backend/prisma/schema.prisma`
* **Datasource Provider**: `mongodb`
* **Client Singleton**: `backend/src/prisma/client.ts`
* **Replica Set Requirement**: MongoDB **must** run as a replica set (e.g. `rs0`). Prisma's MongoDB connector relies on transactions for multi-document operations and nested relation mutations.
* **Safe Generate Command**:
  ```bash
  npm run prisma:generate
  ```
* **Database Commands Notice**:
  * `prisma db push` synchronizes Prisma schema indexes with MongoDB. Do not execute casually against populated databases without verification.
  * Never run seeds or migrations against production databases.
* **Local Database Status**: Local database data resides in `backend/data/db/` and is strictly excluded from Git.
* **Test Database Requirement**: All integration testing must use a dedicated, disposable test database.

---

## Media Storage

* **Physical Storage Root**: `backend/media/`
* **Public URL Prefix**: `/media/` (e.g., `http://localhost:5000/media/avatars/image.png`)
* **Resolution**: Configured in `src/config/env.ts` as `ENV.MEDIA_ROOT` (defaults to `path.resolve(__dirname, '../../media')`).
* **Git Excluded**: All files under `media/` are runtime data and excluded from Git tracking.

---

## Development Commands

All commands should be executed from the `backend/` directory:

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start development server with hot-reload via `tsx watch src/server.ts` |
| `npx tsc --noEmit` | Type-check TypeScript source files without producing build output |
| `npm run build` | Compile TypeScript into `dist/` using `tsc` |
| `npm start` | Run compiled production server (`node dist/server.js`) |
| `npm run prisma:generate` | Regenerate `@prisma/client` from `prisma/schema.prisma` |
| `npm run prisma:push` | Push Prisma schema state to MongoDB (development only) |

---

## Environment Configuration

Copy `.env.example` to `.env` to configure the backend:

```bash
cp .env.example .env
```

### Environment Variables Reference

* `PORT`: HTTP server listening port (default `5000`).
* `NODE_ENV`: Runtime environment (`development` or `production`).
* `DATABASE_URL`: MongoDB connection string with replica set query parameter.
* `SECRET_KEY`: Application secret for cryptographic signing.
* `JWT_ACCESS_SECRET`: Secret key for signing JWT access tokens.
* `JWT_REFRESH_SECRET`: Secret key for signing JWT refresh tokens.
* `JWT_ACCESS_EXPIRES_IN`: Access token lifetime in seconds.
* `JWT_REFRESH_EXPIRES_IN`: Refresh token lifetime in seconds.
* `PORTAL_ACCESS_SALT`: Salt used for client portal HMAC authentication.
* `PORTAL_ACCESS_MAX_AGE`: Maximum age in seconds for client portal sessions.
* `AUTH_ACCESS_COOKIE_NAME`: Cookie name for access tokens.
* `AUTH_REFRESH_COOKIE_NAME`: Cookie name for refresh tokens.
* `PORTAL_ACCESS_COOKIE_NAME`: Cookie name for client portal access.
* `CSRF_COOKIE_NAME`: Cookie name for CSRF tokens.
* `AUTH_COOKIE_SECURE`: Enable secure cookie flag (`true`/`false`).
* `AUTH_COOKIE_SAMESITE`: SameSite attribute for auth cookies (`lax`, `strict`, `none`).
* `CSRF_COOKIE_SECURE`: Enable secure cookie flag for CSRF.
* `CSRF_COOKIE_SAMESITE`: SameSite attribute for CSRF cookie.
* `CORS_ALLOWED_ORIGINS`: Comma-separated allowed frontend origins.
* `FRONTEND_BASE_URL`: Base URL of the frontend application.
* `RAZORPAY_KEY_ID`: Razorpay API Key ID.
* `RAZORPAY_KEY_SECRET`: Razorpay API Key Secret.
* `RAZORPAY_WEBHOOK_SECRET`: Secret for validating Razorpay webhook signatures.
* `RAZORPAY_CURRENCY`: Currency code for payments (default `INR`).
* `GEMINI_API_KEY`: Google Gemini API key for AI brief generation.
* `GEMINI_MODELS`: Comma-separated fallback list of Gemini model names.
* `GEMINI_TIMEOUT_SECONDS`: Request timeout for Gemini API calls.
* `GEMINI_MAX_OUTPUT_TOKENS`: Maximum output tokens for Gemini completions.
* `EMAIL_HOST`: SMTP host for email dispatch.
* `EMAIL_PORT`: SMTP port.
* `EMAIL_HOST_USER`: SMTP username.
* `EMAIL_HOST_PASSWORD`: SMTP application password.
* `EMAIL_USE_TLS`: Enable TLS for SMTP connections.
* `DEFAULT_FROM_EMAIL`: Sender address for outgoing emails.
* `BLOB_READ_WRITE_TOKEN`: Optional cloud blob storage token.
* `MEDIA_ROOT`: Optional override path for uploaded media files.
