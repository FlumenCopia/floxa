# FLOXA Platform

FLOXA is a full-stack brand identity and client collaboration platform.

## Architecture

The project consists of two clean application roots:

```text
floxa/
├── backend/
│   ├── media/                   # Local uploaded media storage (gitignored)
│   ├── data/db/                 # Local MongoDB WiredTiger storage (gitignored)
│   ├── src/                     # Express application source code (TypeScript)
│   │   ├── config/              # Centralized environment configuration (env.ts) and Mongoose database connection
│   │   ├── controllers/         # Request handling and HTTP response dispatch
│   │   ├── middleware/          # JWT auth, CSRF, portal token, error handlers
│   │   ├── models/              # Mongoose data schemas and models (Project, Client, Consultant, etc.)
│   │   ├── routes/              # Express API route declarations
│   │   ├── services/            # Core business logic (PDF, email, storage, payments, AI)
│   │   ├── types/               # TypeScript interfaces and shared type declarations
│   │   ├── utils/               # Crypto utilities and snake_case contract serializer
│   │   ├── websocket/           # WebRTC signaling and consultant support WS
│   │   ├── app.ts               # Express application initialization
│   │   └── server.ts            # HTTP server & WebSocket listener entrypoint
│   ├── tests/                   # Permanent automated regression test suites
│   ├── .env.example             # Backend environment configuration template
│   ├── package.json             # Backend dependencies and scripts
│   └── tsconfig.json            # TypeScript NodeNext configuration
├── frontend/
│   ├── app/                     # Next.js App Router (pages & API proxy)
│   │   ├── api/[...path]/       # Next.js API proxy forwarding to backend
│   │   ├── client/[token]/      # Client Portal dynamic route
│   │   └── ...                  # Application route pages
│   ├── components/              # UI components (dashboard, client-portal, discovery, etc.)
│   ├── services/                # Frontend API client and WebSocket services
│   ├── tests/                   # Lightweight contract, proxy allowlist, and WebRTC tests
│   ├── .env.example             # Frontend environment configuration template
│   ├── package.json             # Frontend dependencies and scripts
│   └── tsconfig.json            # Next.js TypeScript configuration
├── README.md                    # Repository documentation
└── .gitignore                   # Centralized repository ignore rules
```

### Technology Stack
* **Frontend**: Next.js 16 (App Router), React 19, TypeScript
* **Backend**: Node.js (v20.x or v22.x LTS), Express 4.x, TypeScript 5.7
* **ODM**: Mongoose 9.x (MongoDB Object Document Mapper)
* **Database**: MongoDB 6.0+ / 7.0+ (Replica Set supported for multi-document ACID transactions)
* **Realtime**: WebSockets (`ws`) with WebRTC voice/video signaling support

---

## Local Development

### Prerequisites
* **Node.js**: v20.x or v22.x LTS
* **MongoDB**: v6.0+ or v7.0+ (Local standalone or Replica Set `rs0`).
  * Example local connection string placeholder: `mongodb://127.0.0.1:27017/floxa_db` (or `mongodb://127.0.0.1:27018/floxa_db?replicaSet=rs0`)

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
   *Configure `DATABASE_URL`, secrets (`JWT_ACCESS_SECRET`, `SECRET_KEY`), CORS origins, and optional service keys as needed.*

3. Start the backend development server (defaults to port `5000`):
   ```bash
   npm run dev
   ```
   *The HTTP API listens on `http://localhost:5000` and WebSockets on `ws://localhost:5000/ws/support/`.*

4. Run automated backend regression tests:
   ```bash
   npm test
   ```

5. Validate TypeScript and compile for production:
   ```bash
   npx tsc --noEmit
   npm run build
   ```

6. Start the compiled production server:
   ```bash
   npm start
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

4. Run automated frontend regression tests:
   ```bash
   npm test
   ```

5. Lint, validate TypeScript, and build for production:
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run build
   ```

6. Start the production frontend server:
   ```bash
   npm start
   ```

---

## Project Conventions & Architecture

* **Database & ODM (`backend/src/models/`, `backend/src/config/database.ts`)**: Pure Mongoose models and schema definitions. Database connection lifecycle managed via `connectDatabase()` with automatic index synchronization.
* **Routes (`backend/src/routes/`)**: Define route URLs and attach relevant middleware (authentication, portal access, CSRF).
* **Controllers (`backend/src/controllers/`)**: Parse request parameters, validate payloads, enforce resource ownership, and coordinate with services.
* **Services (`backend/src/services/`)**: Encapsulate business logic, PDF document generation (PDFKit), email dispatch (Nodemailer), payment processing (Razorpay), AI generation (Google Gemini), and file storage.
* **Storage & Media (`backend/media/`)**: Centralized in `backend/src/services/storage.service.ts`. Uploaded assets (avatars, concepts, deliverables, moodboards) are saved to `ENV.MEDIA_ROOT` (defaults to `backend/media/`) with public avatar streaming through `/media/consultant_avatars/`.
* **API Contract Compatibility (`backend/src/utils/serializer.ts`)**: Serializes Mongoose documents into snake_case JSON schemas expected by the Next.js frontend (originally modeled after Django REST Framework API contracts for seamless frontend migration).
* **Realtime Communication (`backend/src/websocket/`)**: Manages consultant-client support rooms, field synchronization, live activity notifications, and WebRTC peer-to-peer audio/video call signaling.
* **Manual Testing Requirement (WebRTC Media)**: Automated suites thoroughly verify signaling handshakes, offer/answer message schemas, role isolation, and room transitions. Physical audio and video streaming requires manual local hardware verification with active camera and microphone devices.
