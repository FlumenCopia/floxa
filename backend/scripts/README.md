# Backend Diagnostic Scripts

This directory contains standalone developer diagnostic and verification utilities. These scripts are strictly for manual diagnostics and troubleshooting, and are never imported or invoked by the active runtime application.

---

## Diagnostic Scripts Inventory

### 1. `diagnostics/consultant-projects.ts`
* **Purpose**: Verifies that Prisma Client can query the MongoDB replica set and inspects consultant accounts and their associated project counts (up to 5 records).
* **Connects to MongoDB**: **Yes** (via Prisma Client).
* **Opens a WebSocket**: **No**.
* **Required Environment Variables**:
  * `DATABASE_URL`: MongoDB connection string pointing to a running replica set (e.g., `mongodb://127.0.0.1:27017/floxa_db?replicaSet=rs0`).
* **Data Modification**: **Read-only**. Executes a read query (`prisma.consultant.findMany`); does not create, update, or delete data.
* **Safe Usage**:
  ```bash
  npx tsx scripts/diagnostics/consultant-projects.ts
  ```

---

### 2. `diagnostics/websocket-client.ts`
* **Purpose**: Verifies that the Express WebSocket server is running and accepting client connections on the consultant-client support room endpoint (`/ws/support/:token/`), testing real-time `FIELD_SYNC` message dispatch.
* **Connects to MongoDB**: **No** (connects directly over WebSocket to the running Node.js HTTP/WS server).
* **Opens a WebSocket**: **Yes** (connects to `ws://localhost:5000/ws/support/<portal_token>/?user_type=client`).
* **Required Environment Variables**:
  * None directly. Requires the backend server to be actively listening on port `5000` (`npm run dev`).
* **Data Modification**: **No database modifications**. Broadcasts ephemeral sync messages in-memory to connected peers in the support room.
* **Safe Usage**:
  ```bash
  npx tsx scripts/diagnostics/websocket-client.ts
  ```

---

## Safety Guidelines

> [!CAUTION]
> **Production & Shared Environment Notice**:
> * Diagnostic scripts are intended for local development only.
> * Always verify that `DATABASE_URL` is pointing to your intended local database before executing scripts that connect via Prisma.
> * Never run automated or unattended scripts against production databases.
