# FLOXA Backend

The active backend service for the FLOXA platform, providing REST APIs, authentication, media asset delivery, and real-time WebSocket communication for client-consultant collaboration.

---

## Technology Stack

* **Runtime**: Node.js (v20.x or v22.x LTS)
* **Framework**: Express 4.x
* **Language**: TypeScript 5.7 (NodeNext module resolution)
* **ODM**: Mongoose 9.x (MongoDB Object Document Mapper)
* **Database**: MongoDB 6.0+ / 7.0+ / 8.0+ (Local standalone or Replica Set `rs0` for multi-document ACID transactions)
* **Realtime**: WebSockets (`ws`) with WebRTC voice/video signaling support

---

## Entry Points

* **`src/server.ts`**: Main process entry point. Creates the Node HTTP server wrapping the Express app, attaches the WebSocket server (`/ws/support/`), connects to MongoDB via Mongoose, and binds to `ENV.PORT` (default `5000`).
* **`src/app.ts`**: Express application factory. Configures middleware (CORS, cookies, JSON/URL-encoded parsing), public static media streaming route (`/media/`), CSRF protection, `/api/` route mounting, `/health` endpoint, and global error handling.

---

## Directory Structure & Responsibilities

```text
backend/
├── media/                     # Uploaded media storage (avatars, concepts, deliverables) [gitignored]
├── data/db/                   # Local MongoDB WiredTiger database files [gitignored]
├── tests/                     # Permanent automated regression test suites
│   ├── helpers.cjs            # Test server lifecycle, token signers, fixture creators
│   ├── phase1-auth-ws.test.cjs         # Phase 1: WebSocket auth and client-only protection
│   ├── phase2-ownership.test.cjs       # Phase 2: Project/resource ownership IDOR protection
│   ├── phase3-header-contract.test.cjs # Phase 3: FloxaHeader contract compatibility
│   ├── phase4-webrtc.test.cjs          # Phase 4: WebRTC signaling & room isolation
│   └── phase5-security-uploads.test.cjs# Phase 5: CORS, avatar uploads & orphan prevention
├── src/
│   ├── config/                # Environment configuration (env.ts) and Mongoose setup (database.ts)
│   ├── controllers/           # HTTP request handlers and response dispatchers
│   ├── middleware/            # Auth, portal token, CSRF, and error handling middleware
│   ├── models/                # Mongoose data schemas and models (Project, Client, Consultant, etc.)
│   ├── routes/                # Express router declarations (/api/auth, /api/projects, etc.)
│   ├── services/              # Business logic (PDF generation, email, payments, storage, Gemini AI)
│   ├── types/                 # Shared TypeScript interfaces and model types
│   ├── utils/                 # Cryptographic helpers and snake_case contract serializer
│   ├── websocket/             # WebSocket server and WebRTC peer signaling handler
│   ├── app.ts                 # Express application initialization
│   └── server.ts              # HTTP & WebSocket server bootstrap
├── .env.example               # Environment variables template
├── package.json               # Package configuration and dependencies
└── tsconfig.json              # TypeScript compiler configuration
```

### Folder Responsibilities

* **`src/config/`**: Centralized configuration loaded via `dotenv`. Exports the immutable `ENV` object and Mongoose connection helpers (`connectDatabase()`, `disconnectDatabase()`).
* **`src/controllers/`**: Extracts parameters from incoming requests, validates input, verifies consultant ownership, invokes service logic, and sends sanitized HTTP responses.
* **`src/middleware/`**: Request interceptors including JWT authentication (`auth.middleware.ts`), client portal token verification (`portal.middleware.ts`), CSRF cookie validation (`csrf.middleware.ts`), and global error handling (`error.middleware.ts`).
* **`src/models/`**: Defines Mongoose schemas, relationships, virtuals, and indexes for all domain entities.
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
  * `crypto.ts`: Portal token signing/verification and password hash helpers.
  * `serializer.ts`: Response serializer that transforms Mongoose documents into snake_case API contracts expected by frontend components (originally based on Django REST Framework contract schemas for frontend compatibility).
* **`src/websocket/`**: Manages real-time consultant-client support rooms (`ACTIVE_HELP_SESSIONS`), field synchronization, activity notifications, and WebRTC peer signaling (`OFFER`, `ANSWER`, `ICE_CANDIDATE`, `CALL_INITIATE`, `CALL_ACCEPT`, etc.).
* **`tests/`**: Permanent automated regression test suites executed via Node.js built-in `node:test` runner.
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
       ▼
Business Service (`src/services/`) / Mongoose Models (`src/models/`)
       │
       ▼
Serializer (`src/utils/serializer.ts`) ──► [Transforms to snake_case contract]
       │
       ▼
HTTP JSON Response
```

---

## Mongoose and MongoDB

* **Models Location**: `backend/src/models/`
* **Connection Lifecycle**: `backend/src/config/database.ts` (`connectDatabase()`, `disconnectDatabase()`)
* **Connection String**: Configured via `DATABASE_URL` environment variable.
* **Replica Set Support**: Multi-document transactions and oplog listening are supported when connected to a replica set (e.g. `rs0`).
* **Local Database Storage**: Local WiredTiger database files reside in `backend/data/db/` and are strictly excluded from Git.

---

## Media Storage

* **Physical Storage Root**: `backend/media/` (defaults to `ENV.MEDIA_ROOT`)
* **Public URL Prefix**: `/media/` (e.g., `/media/consultant_avatars/filename.png`)
* **Access Control**: Static `/media/` serving is strictly restricted to whitelisted public directories (`consultant_avatars`, `public`). Private project deliverables, moodboards, and concepts are access-controlled through authenticated API endpoints.
* **Git Excluded**: All files under `media/` are runtime data and excluded from Git tracking.

---

## Development & Test Commands

All commands should be executed from the `backend/` directory:

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start development server with hot-reload via `tsx watch src/server.ts` |
| `npm test` | Run permanent automated regression test suites via `node:test` |
| `npx tsc --noEmit` | Type-check TypeScript source files without producing build output |
| `npm run build` | Compile TypeScript into `dist/` using `tsc` |
| `npm start` | Run compiled production server (`node dist/server.js`) |

---

## Environment Configuration

Copy `.env.example` to `.env` to configure the backend:

```bash
cp .env.example .env
```

### Environment Variables Reference (Placeholders Only)

* `PORT`: HTTP server listening port (default `5000`).
* `NODE_ENV`: Runtime environment (`development` or `production`).
* `DATABASE_URL`: MongoDB connection string (e.g. `mongodb://127.0.0.1:27017/floxa_db`).
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
* `CORS_ALLOWED_ORIGINS`: Comma-separated allowed frontend origins (e.g. `http://localhost:3000,https://floxa.flumenx.in`).
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

---

## WebRTC Audio & Video Testing

* The WebSocket server on `/ws/support/` handles real-time signaling for WebRTC peer-to-peer calls.
* Automated regression tests verify all 8 signaling action types (`call_initiate`, `call_accept`, `call_reject`, `call_cancel`, `call_end`, `offer`, `answer`, `ice_candidate`), payload boundaries, and consultant/project room isolation.
* Physical audio and video streaming requires manual local hardware verification with active camera and microphone devices.
