# FLOXA Platform — Evidence-Based Security & Functional Audit Report

**Audit Date:** 2026-11-11  
**Scope:** Full-repository source-code audit across all five FLOXA modules (`backend/`, `frontend/`, `superadmin-api/`, `superadmin-ui/`, `app/`)  
**Methodology:** Static source inspection across routes, middleware, controllers, services, WebSocket handlers, Mongoose models, Next.js proxies, SuperAdmin services/UI, React Native mobile code, and baseline test execution (`frontend` 79/79 pass; `backend` 110/110 across 11 runnable suites against isolated DB; `superadmin-api` 33/34 pass with 1 pre-existing failure due to unbuilt `dist/` and uninstalled `superadmin-api`/`superadmin-ui` dependencies).

---

## 1. Executive Summary

The FLOXA codebase includes meaningful security building blocks (HttpOnly cookies, `tokenVersion` checks on `/api/auth/me` and standard `requireAuth`, HMAC-signed portal access tokens, watermarked asset delivery, Razorpay HMAC signature validation, CSV formula sanitization, and regex escaping). However, **32 verified defects and gaps** remain across authentication consistency, CSRF enforcement, WebSocket room/role authorization, Support Mode isolation, payment credential selection & atomicity, SLA calculation, private media exposure, file validation, AI quota concurrency, secret storage, SuperAdmin hardening, and mobile parity.

| Severity | Confirmed Count | Key Examples |
|---|---:|---|
| **Critical** | 5 | `AUTH-01` WS portal password bypass; `SEC-01` CSRF bypass via header + cookie fallback; `FILE-01` public `/media/chat_attachments`; `PAY-01` BYOK Razorpay verification bug; `AI-02` hardcoded live SMTP credentials in source & plaintext secrets in DB |
| **High** | 15 | `AUTH-02`–`AUTH-06`, `AUTH-09`, `AUTH-10`, `SEC-02`, `SEC-03`, `PAY-02`, `PAY-03`, `WF-01`, `FILE-02`, `AI-01`, `MOB-01`, `MOB-02` |
| **Medium** | 10 | `AUTH-07`, `AUTH-08`, `AUTH-11`, `SEC-04`, `PAY-04`, `WF-02`, `WF-03`, `FILE-03`, `AI-03`, `OPS-01` |
| **Low** | 2 | `MOB-03` mobile storage fallback / keystore hygiene & hardening |

---

## 2. Role-Permission Matrix (Observed vs. Required)

| Action | Client (Portal Auth) | Owning Consultant (Direct Auth) | Owning Consultant (Support Mode) | Other Consultant | SuperAdmin |
|---|---|---|---|---|---|
| View own project / portal | **Allow** | **Allow** | **Allow (Read/Assist)** | **Deny (404)** | **Allow (Admin API)** |
| Edit discovery draft (`POST /discovery/`) | **Allow** | **Allow** | Allow (Assist) -> currently forces `isPortalClient` on submit (`AUTH-10`) | **Deny** | Deny |
| Submit final discovery (`POST /discovery/submit/`) | **Allow** | **Confirm/Restrict** | **Deny** *(Currently forces `req.isPortalClient = true`!)* | **Deny** | Deny |
| Select moodboard / submit feedback | **Allow** | Deny | **Deny** *(Currently Allowed as client!)* | **Deny** | Deny |
| Approve concept / request changes | **Allow** | Deny | **Deny** *(Currently Allowed as client!)* | **Deny** | Deny |
| Sign legacy agreement | **Allow** | Deny | **Deny (Enforced 403)** | **Deny** | Deny |
| Accept generated agreement snapshot | **Allow** | Deny | **Deny (Enforced 403)** | **Deny** | Deny |
| Create / verify Razorpay payment order | **Allow** | Deny | **Deny (Enforced 403)** | **Deny** | Audited manual policy |
| Manual `markMilestonePaid` | **Deny** | **Allow** | Deny | **Deny** | Audited policy |
| Final client sign-off | **Allow** | Deny | **Deny (Enforced 403)** | **Deny** | Deny |
| Download shared deliverable | **Allow (Only after ALL milestones paid)** | **Allow** | Allow (View own asset) | **Deny** | Admin metadata only |
| Post portal chat / WS `senderRole: 'client'` | **Allow (`client` only)** | **Allow (`consultant` on project route)** | **Must tag `'consultant'`, NEVER `'client'`** *(Currently tags `'client'` / spoofable)* | **Deny** | Deny |

---

## 3. Detailed Findings by Audit Domain

### Domain 1 — Authentication, Session & Token Security (`AUTH-*`)

#### `AUTH-01` [CRITICAL] [CONFIRMED] Client Portal WebSocket Authentication Bypass
- **Evidence:** `backend/src/websocket/socketServer.ts:814-828`
- **Mechanism:** When a password-protected project (`project.portalPasswordHash` set) connects on `/ws/support/:portal_token` with `role === 'client'`:
  ```ts
  if (signedAccess) {
    const verified = unsignPortalAccessToken(signedAccess, ENV.PORTAL_ACCESS_MAX_AGE);
    if (verified && verified !== portalToken) { ... ws.close(4003); }
  }
  ```
  1. Omitting `signedAccess` (no cookie and no query param) skips the entire `if (signedAccess)` block and opens the WebSocket.
  2. Supplying an invalid/forged/expired `signedAccess` causes `unsignPortalAccessToken(...)` to return `null`, so `verified && verified !== portalToken` evaluates to `false` and also opens the WebSocket.
- **Exploit Scenario:** An attacker with only a portal URL token (which may have been forwarded or leaked without the portal password) connects to `ws://<host>/ws/support/<portal_token>/` with no cookie/token and immediately issues `GET_PROTECTED_ASSET`, `CHAT_MESSAGE_SEND`, `FIELD_SYNC`, or `WEBRTC_SIGNAL`.

#### `AUTH-02` [HIGH] [CONFIRMED] Missing `tokenVersion`, `isActive`, `isSuspended` Enforcement & JWT Algorithm Pinning
- **Evidence:**
  - `backend/src/middleware/portal.middleware.ts:139-163` (Support Mode branch verifies `jwt.verify(token, ENV.JWT_ACCESS_SECRET)` with no check on `user.isActive`, `user.isSuspended`, or `tokenVersion`).
  - `backend/src/middleware/portal.middleware.ts:209-220` (`requireProjectAccess` consultant branch checks `!user || !user.isActive`, omits `tokenVersion` check and explicit `isSuspended` 403 code).
  - `backend/src/middleware/auth.middleware.ts:25,30-33,64` (`optionalAuth` skips `user.tokenVersion === payload.tokenVersion` if `payload.tokenVersion === undefined`; `jwt.verify` omits `algorithms: ['HS256']`).
  - `backend/src/websocket/socketServer.ts:156-165, 509-518, 791-810`: `verifyConsultantToken` does not verify `tokenVersion`; `/ws/support/:portal_token` does not check `consultant.isActive` or `consultant.isSuspended`; active WebSocket connections are never closed when a consultant is suspended or resets/changes password.
- **Exploit Scenario:** A suspended or password-reset consultant can continue calling dual-auth `/api/projects/:id/discovery/` routes and portal Support Mode routes, and keep using existing WebSocket connections indefinitely until expiration or disconnect.

#### `AUTH-03` [HIGH] [CONFIRMED] Non-Rotating Refresh Tokens & Broken Mobile Refresh Contract
- **Evidence:**
  - `backend/src/controllers/auth.controller.ts:83-125`
  - `backend/src/services/auth.service.ts:6-60` (ignores `ENV.JWT_ACCESS_EXPIRES_IN` / `ENV.JWT_REFRESH_EXPIRES_IN`, hardcodes `'15m'` and `'7d'`)
  - `app/src/services/api.ts:150-163`
- **Mechanism:** `POST /api/auth/token/refresh/` only sets the `floxa_access` cookie and returns `{ detail: 'Token refreshed successfully.' }` without issuing/rotating a refresh token or returning `access` in JSON. Meanwhile, the mobile Axios interceptor (`app/src/services/api.ts:158`) expects `refreshRes.data?.access`. Mobile refresh therefore fails silently and never updates `ACCESS_TOKEN` in SecureStore. Moreover, refresh tokens are static 7-day JWTs without rotation or per-session revocation beyond coarse `tokenVersion`.

#### `AUTH-04` [HIGH] [CONFIRMED] Unauthenticated Push Device Token Registration & Deletion Hijacking
- **Evidence:**
  - `backend/src/routes/auth.routes.ts:21-22` (`POST /device-token/` uses `optionalAuth`; `DELETE /device-token/` has **no** auth middleware)
  - `backend/src/controllers/auth.controller.ts:487-537`
- **Mechanism:** `registerDeviceToken` upserts by `{ token }` and binds `portalToken` (`role: 'client'`) without verifying `x-portal-access-token` / `floxa_portal_access` or project validity, and overwrites existing records sharing a token. `unregisterDeviceToken` deletes any token unauthenticated.

#### `AUTH-05` [HIGH] [CONFIRMED] Origin / Referer Header Poisoning in Password Reset & Portal Emails
- **Evidence:**
  - `backend/src/controllers/auth.controller.ts:368-371` (`forgotPassword`)
  - `backend/src/controllers/project.controller.ts:294-297, 415-419` (`createProject`, `retryInvite`)
  - `backend/src/controllers/agreement.controller.ts` (passes `origin` override)
- **Mechanism:** Unvalidated `req.get('origin')` or parsed `Referer` is passed as `baseUrlOverride` into `sendPasswordResetEmail` / `sendClientPortalInvite`, which interpolates `${effectiveBase}/reset-password?token=...`. An attacker sending `Origin: https://evil.example` triggers password reset emails pointing legitimate consultants to an attacker-controlled domain.

#### `AUTH-06` [HIGH] [CONFIRMED] SuperAdmin Missing `tokenVersion`, Default Weak Secrets & Prefilled Admin Credentials
- **Evidence:**
  - `superadmin-api/src/models/superadmin.model.ts:1-60` & `superadmin-api/src/middleware/auth.middleware.ts:41-54` (no `tokenVersion`, no `algorithms: ['HS256']`)
  - `superadmin-api/src/controllers/settings.controller.ts:88-90` (`changeAdminPassword` never increments `tokenVersion`)
  - `superadmin-ui/app/login/page.tsx:10-11` (`useState("admin@floxa.com")`, `useState("Password@123")` hardcoded in frontend bundle)
  - `backend/src/config/env.ts:13-19` (hardcoded fallback secrets `floxa_default_secret_key_change_me_in_prod`, `floxa_jwt_access_secret_2026`, `floxa_jwt_refresh_secret_2026`, `floxa.client-portal-access` even when `NODE_ENV === 'production'`)

#### `AUTH-07` [MEDIUM] [CONFIRMED] Absence of Brute-Force Rate Limiting on Auth & Portal Password Verification
- **Evidence:** `backend/src/routes/auth.routes.ts`, `backend/src/routes/portal.routes.ts`, `superadmin-api/src/routes/auth.routes.ts`
- **Mechanism:** `POST /api/auth/login/`, `/forgot-password/`, `/reset-password/`, `/request-reactivation/`, `/api/client-portal/:portal_token/verify-password/`, and SuperAdmin `POST /api/auth/login` have zero rate-limiting or lockout protections.

#### `AUTH-08` [MEDIUM] [CONFIRMED] Secrets / Tokens in WebSocket Query Strings & `localStorage`
- **Evidence:** `frontend/services/supportSocketService.js:46,105`, `frontend/components/common/FloxaHeader.jsx:522-523,701`, `superadmin-ui/services/api.ts:5,44`. WebSocket JWTs are sent in URL query params (`?token=...`), exposing credentials in proxy/server access logs. SuperAdmin UI stores bearer JWT in `localStorage` (`floxa_admin_token`).

---

### Domain 2 — CSRF, CORS, Proxy & Request Forgery (`SEC-*`)

#### `SEC-01` [CRITICAL] [CONFIRMED] CSRF Bypass via Header Presence + Cookie Fallback
- **Evidence:**
  - `backend/src/middleware/csrf.middleware.ts:29-35`
  - `backend/src/middleware/portal.middleware.ts:134-184`
  - `frontend/lib/api.js:214-219`
- **Mechanism:** `csrfProtection` immediately returns `next()` whenever `req.headers.authorization?.startsWith('Bearer ')` OR `req.headers['x-client-portal-token']` is truthy:
  - Sending `X-Client-Portal-Token: <token>` bypasses `csrfProtection`, while `clientPortalAccess` / `requireProjectAccess` STILL authenticate the victim via their browser-sent `floxa_portal_access` cookie (`portal.middleware.ts:173`) or even Support Mode `floxa_access` cookie (`portal.middleware.ts:135`)!
  - In browser CORS preflighted scenarios (or same-site subdomain attacks), custom headers trigger preflight unless misconfigured CORS allows them, and CORS IS configured to allow `x-client-portal-token` and `Authorization` for any trusted origin (or non-CORS form/fetch where allowed). More critically, CSRF exemption must NEVER be granted unless the request is genuinely authenticated by a non-cookie header token rather than falling back to cookies.
- *Note on `requireAuth` (`auth.middleware.ts:51-56`):* Invalid/empty `Authorization: Bearer ` does **not** fall back to `floxa_access` cookie in `requireAuth`/`optionalAuth` (`else if` branch), so cookie fallback under invalid `Bearer` is **FALSE POSITIVE** for `requireAuth`, **CONFIRMED** for `x-client-portal-token` + cookies in `portal.middleware.ts`.

#### `SEC-02` [HIGH] [CONFIRMED] SuperAdmin API Completely Lacks CSRF Protection
- **Evidence:** `superadmin-api/src/server.ts:24-41`, `superadmin-api/src/controllers/auth.controller.ts`
- **Mechanism:** `adminLogin` sets `floxa_superadmin_token` (`httpOnly: true`, `sameSite: 'lax'`) and `requireAdminAuth` accepts that cookie for all state-changing `POST`/`PATCH`/`DELETE` routes (`/api/admin/consultants/*`, `/api/admin/purge-demo-data`, `/api/admin/settings/*`) with zero CSRF token or Origin enforcement on mutations.

#### `SEC-03` [HIGH] [CONFIRMED] Next.js API & Media Proxy Fallback Origin Spoofing + Public Media Caching
- **Evidence:**
  - `frontend/app/api/[...path]/route.ts:51-61`
  - `frontend/app/media/[...path]/route.ts:71-73`
- **Mechanism:**
  1. In `frontend/app/api/[...path]/route.ts:51-61`, if `origin` is absent and `host` is not allowlisted, `validOrigin` falls back to `"https://floxa.flumenx.in"` and explicitly injects `Origin: https://floxa.flumenx.in` and `Referer: https://floxa.flumenx.in/` into the upstream backend request, laundering untrusted/missing origin context into a trusted production origin.
  2. In `frontend/app/media/[...path]/route.ts:71-73`, every proxied media response receives `cache-control: public, max-age=86400, stale-while-revalidate=604800` unconditionally, allowing shared CDNs/proxies to cache private assets served with cookies.

#### `SEC-04` [MEDIUM] [CONFIRMED] SuperAdmin CORS Production Fallback, Unconditional `!origin`, and Port Mismatch
- **Evidence:** `superadmin-api/src/server.ts:19-31`, `superadmin-ui/services/api.ts:1`, `superadmin-api/.env.example`
- **Mechanism:** If `CORS_ORIGIN`/`ADMIN_APP_URL` is unset in production, `superadmin-api` defaults to `['http://localhost:3001', 'http://localhost:3002']`. Separately, `superadmin-ui/services/api.ts:1` falls back to `http://localhost:5002/api` while `superadmin-api` listens on `5001`, and `superadmin-api/.env.example` lists `CORS_ORIGIN=http://localhost:3001` instead of `3002`.

---

### Domain 3 — Authorization, IDOR & Role Isolation (`AUTH-*`)

#### `AUTH-09` [HIGH] [CONFIRMED] WebSocket Cross-Project IDOR & Role Spoofing
- **Evidence:**
  - `backend/src/websocket/socketServer.ts:691-741` (`CHAT_TYPING`, `CHAT_MESSAGES_READ`, `PROJECT_READ` on `/ws/support/consultant` accept arbitrary `content.projectId` without checking `project.consultantId === authenticatedConsultantId`)
  - `backend/src/websocket/socketServer.ts:365-373` (`PROJECT_READ` broadcasts to ALL `consultantSockets` if `consultantId` missing)
  - `backend/src/websocket/socketServer.ts:1346-1347, 1418-1419, 1448-1449` (`CHAT_MESSAGE_SEND`, `CHAT_TYPING`, `CHAT_MESSAGES_READ` in `/ws/support/:portal_token` honor `content.senderRole === 'consultant'` or `Boolean(query.consultant_token)`, letting any client spoof messages/receipts as `'consultant'`).

#### `AUTH-10` [HIGH] [CONFIRMED] Support Mode Privilege Escalation on Client-Only & Dual-Auth Endpoints
- **Evidence:**
  - `backend/src/routes/portal.routes.ts:26-37, 62-64`: Missing `clientOnlyAction` middleware on:
    - `POST /:portal_token/discovery/` & `POST /:portal_token/discovery/submit/` (`portal.controller.ts:321` explicitly overwrites `req.isPortalClient = true;`!)
    - `POST /:portal_token/moodboards/:moodboard_id/select/` and `feedback/`
    - `POST /:portal_token/concepts/:concept_id/feedback/`
    - `POST /:portal_token/messages/` and `messages/upload/` (which tag `senderRole: 'client'` even when called by consultant in Support Mode).
  - `backend/src/routes/project.routes.ts:18-23`: Dual-auth discovery routes allow consultant mutations directly rather than gating/auditing Support Mode consistently with the workflow policy.

#### `AUTH-11` [MEDIUM] [PARTIALLY MITIGATED] Support Mode Detection Falls Back Silently on Invalid Credentials
- **Evidence:** `backend/src/middleware/portal.middleware.ts:139-165`
- **Mechanism:** When `x-support-mode=true` (or `support_mode=true` query param) is supplied with an expired/invalid consultant JWT or non-owning consultant, `portal.middleware.ts` catches/ignores the failure and falls through to client portal password/open-portal authentication instead of failing closed (`401`/`403`) on explicit failed Support Mode auth.

---

### Domain 4 — Payment Integrity & Deliverable Gating (`PAY-*`)

#### `PAY-01` [CRITICAL] [CONFIRMED] Client Payment Verification Ignores Consultant BYOK Razorpay Keys
- **Evidence:** `backend/src/controllers/portal.controller.ts:1300`
- **Mechanism:** `createPortalPaymentOrder` creates the order using `resolveConsultantRazorpayCredentials(consultantId)` (`rzpCreds`), yet `verifyPortalPayment` invokes `await fetchRazorpayPayment(razorpayPaymentId)` **without passing `rzpCreds`**. For any consultant configured with BYOK Razorpay credentials, `verifyPortalPayment` either throws `503 Razorpay configuration is missing` (when platform env keys are empty) or queries the platform Razorpay account instead of the consultant's merchant account and fails signature/order verification.

#### `PAY-02` [HIGH] [CONFIRMED] Silent Standalone MongoDB Financial Downgrade & Invalid `ProjectActivity` Metadata Query
- **Evidence:**
  - `backend/src/services/payment.service.ts:92-120`: When MongoDB topology is not `ReplicaSetWithPrimary` / `Sharded`, `executeAtomicPaymentCompletion` sets `session = null` and silently runs multi-collection updates (`PaymentTransaction`, `PaymentMilestone`, `Project`, `ProjectActivity`) without ACID transactions. Combined with failure between steps (such as `testFailureInjectionHook`), partial payment states persist.
  - `backend/src/services/payment.service.ts:207, 369`: Deduplication query uses `metadata: new RegExp((milestone as any).id, 'i')`, which can fail or misfire against serialized JSON strings depending on formatting and lacks an idempotency unique key on financial activity logs.

#### `PAY-03` [HIGH] [CONFIRMED] Razorpay Webhook Cross-Secret Fallback & Concurrent Race Window
- **Evidence:** `backend/src/controllers/payment.controller.ts:204-269`
- **Mechanism:**
  1. Lines 217-223: If `consultantSecret` verification returns `false`, the handler falls back to verifying against `ENV.RAZORPAY_WEBHOOK_SECRET` (platform secret) instead of treating the BYOK consultant's webhook secret as authoritative for that consultant's order.
  2. Lines 240-269: Two concurrent webhook requests for the same `eventKey` hit `findOneAndUpdate(..., { $setOnInsert: { processingStatus: 'received' } }, { upsert: true })`. Because the guard only skips `['processed', 'ignored']`, the second concurrent delivery (`processingStatus === 'received'`) proceeds concurrently into `completePaymentMilestone`. (Additionally, if a prior delivery temporarily failed with `'failed'`, retries are blocked only in some states or raced in `'received'`.)

#### `PAY-04` [MEDIUM] [CONFIRMED] Reusable Payment Order Ignores Changed Milestone Amount / Merchant & Unchecked Milestone Edits
- **Evidence:**
  - `backend/src/controllers/portal.controller.ts:1164-1171`: `createPortalPaymentOrder` reuses an existing `pending`/`created` `PaymentTransaction` without verifying that `transaction.amount === milestone.amount` or matching consultant merchant keys.
  - `backend/src/controllers/payment.controller.ts:26-85`: `createMilestones` lacks guard preventing overwrite/deletion of already `requested` or `paid` milestones cleanly across all edge cases.
  - `backend/src/services/project.service.ts:224-228`: `recalculatePaymentMilestones` unlocks `mid` without checking agreement signature status (`signed`/`locked`), relying solely on advance paid + concept approved.

---

### Domain 5 — Workflow Integrity & SLA Lifecycle (`WF-*`)

#### `WF-01` [HIGH] [CONFIRMED] Tautological Concept Query Keeps Consultant SLA Clock Paused Forever
- **Evidence:** `backend/src/services/deadlineMonitoring.service.ts:77-78`
- **Mechanism:**
  ```ts
  const sharedConcepts = await Concept.find({ projectId, status: 'shared' });
  if (sharedConcepts.length > 0 && !sharedConcepts.some((c: any) => c.status === 'approved'))
  ```
  Because `sharedConcepts` only queried `{ status: 'shared' }`, `!sharedConcepts.some(c => c.status === 'approved')` is **always true** whenever >=1 concept remains `'shared'`, even after the client has approved another concept on the project (`Concept.countDocuments({ projectId, status: 'approved' }) > 0`). Thus the consultant's SLA remains paused indefinitely after concept approval.

#### `WF-02` [MEDIUM] [CONFIRMED] Unsynchronized Multi-Instance SLA Scheduler Cron
- **Evidence:** `backend/src/server.ts:22-26`, `backend/src/services/deadlineMonitoring.service.ts:250-457`
- **Mechanism:** Every backend instance starts its own `setInterval(checkAndEscalateDeadlines, 30 * 60 * 1000)` without a distributed lease/lock in MongoDB, risking concurrent read-modify-write races on `slaPausedAt`, `totalClientWaitMs`, `deadlineFlagsCount`, and activity notifications when horizontally scaled.

#### `WF-03` [MEDIUM] [CONFIRMED] SLA Warning Re-Emission Window & Reactivation Secondary-Project Hazard
- **Evidence:**
  - `backend/src/services/deadlineMonitoring.service.ts:380-405`: Warning deduplication checks `createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }` rather than permanent milestone-level idempotency; and `onBrandDnaCompleted` (`line 236`) resets `deadlineFlagsCount: 0` without checking whether the project was suspended (`flags >= 4`) or resetting overdue state safely.
  - `superadmin-api/src/controllers/admin.controller.ts:456-464`: On consultant reactivation, only `suspendedDueToProjectId` and projects with `deadlineFlagsCount === 4` have deadlines reset; any secondary project at `deadlineFlagsCount === 3` (>72h–96h overdue) remains immediately primed to re-suspend the consultant on the next cron tick.

---

### Domain 6 — File Upload, Media Serving, Storage & XSS (`FILE-*`)

#### `FILE-01` [CRITICAL] [CONFIRMED] Private Chat Attachments Publicly Exposed Without Authentication
- **Evidence:** `backend/src/app.ts:68`
- **Mechanism:** `ALLOWED_PUBLIC_MEDIA_DIRS = ['consultant_avatars', 'public', 'chat_attachments'];` allows any unauthenticated internet user to fetch private client/consultant chat images, voice notes, and documents via `/media/chat_attachments/<filename>`.

#### `FILE-02` [HIGH] [CONFIRMED] Unbounded Multer Memory Buffers, Extension-Only Validation & Unvalidated Signature Uploads
- **Evidence:**
  - `backend/src/routes/auth.routes.ts`, `project.routes.ts`, `portal.routes.ts`: `multer({ storage: multer.memoryStorage() })` configured without `limits: { fileSize, files }`.
  - `backend/src/services/storage.service.ts:41-60, 151`: `validateUploadedFile` checks only filename extension + size (no magic-byte verification); `optimizeImageBuffer` swallows Sharp decode errors and returns the raw attacker buffer intact.
  - `backend/src/controllers/portal.controller.ts:977-980`: `signPortalAgreement` writes multipart `req.file` signature uploads straight to disk and PDF embedding without `validateUploadedFile` or Sharp image verification.

#### `FILE-03` [MEDIUM] [CONFIRMED] Unescaped HTML Interpolation in Emails & Disabled SMTP TLS Certificate Validation
- **Evidence:**
  - `backend/src/services/email.service.ts:36, 146-325`
  - `superadmin-api/src/services/email.service.ts:44, 79-130`
- **Mechanism:** User-controlled strings (`clientName`, `consultantName`, `project.title`, `clientEmail`) are interpolated raw into HTML email templates without HTML escaping (HTML injection/phishing inside branded emails), and both Nodemailer transports configure `tls: { rejectUnauthorized: false }`.

---

### Domain 7 — AI Suite, Quota Race Conditions, Secrets & SSRF (`AI-*`)

#### `AI-01` [HIGH] [CONFIRMED] Concurrent AI Quota Bypass (TOCTOU) & SuperAdmin `bonusCredits` Ignored
- **Evidence:** `backend/src/controllers/aiSuite.controller.ts:98-146`
- **Mechanism:** `runAiSuiteTool` reads `currentRuns` at line 101, runs Gemini (`118-130`), and only executes `$inc: { aiUsage.toolRuns.<toolId>: 1 }` AFTER Gemini resolves (`135-139`). Concurrent requests fired when `currentRuns === 2` all pass line 103 and execute arbitrarily many free AI runs. Furthermore, `aiSuite.controller.ts` never honors `consultant.aiUsage?.bonusCredits` granted via `superadmin-api`.

#### `AI-02` [CRITICAL] [CONFIRMED] Hardcoded Live SMTP Credentials in Source & Plaintext Secrets Stored in DB
- **Evidence:**
  - `superadmin-api/src/services/email.service.ts:30, 33, 61` (`'contactmiscarchive@gmail.com'` / `'onorlcovemxsxtwd'` hardcoded in source as defaults!)
  - `backend/src/controllers/auth.controller.ts:187-233` (`integrations.geminiApiKey`, `razorpayKeySecret`, `razorpayWebhookSecret` stored plaintext on `Consultant`)
  - `superadmin-api/src/controllers/settings.controller.ts:298-311` (`platform_integrations` stored plaintext on `PlatformSetting`)
  - `backend/src/utils/serializer.ts:36` & `superadmin-api/src/controllers/settings.controller.ts` (key masks leak prefix+suffix chars)

#### `AI-03` [LOW/MEDIUM] [CONFIRMED] Unvalidated API Key Interpolation in SuperAdmin Gemini Health Check
- **Evidence:** `superadmin-api/src/controllers/settings.controller.ts:326-340`
- **Mechanism:** `req.body.apiKey` is interpolated directly into `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}` without URL encoding (`encodeURIComponent`) or character validation.

---

### Domain 8 — Mobile App (`app/`) & Operational Findings (`MOB-*`, `OPS-*`)

#### `MOB-01` [HIGH] [CONFIRMED] Mobile Access Token Auto-Refresh Broken by Backend Response Contract
- **Evidence:** `app/src/services/api.ts:152-163` vs `backend/src/controllers/auth.controller.ts:121`
- **Mechanism:** Mobile sends `POST /auth/token/refresh/` with `{ refresh }` expecting `refreshRes.data?.access`, but backend never includes `access` (or rotated `refresh`) in the JSON response body.

#### `MOB-02` [HIGH] [CONFIRMED] Mobile Client Portal Missing Password Challenge Flow, Payment Checkout & Deliverable Downloads
- **Evidence:** `app/src/context/AuthContext.tsx:119-158`, `app/src/screens/ClientPortalScreen.tsx:907-998`
- **Mechanism:** `loginClient` cannot prompt/verify `portalPasswordHash` or capture `x-portal-access-token`; Deliverables tab shows static cards without downloading via `/download/`; Payments tab renders milestone statuses without initiating payment/order flow; WebSocket `socket.ts` lacks portal access token transmission for locked portals.

#### `MOB-03` [LOW] [CONFIRMED] Mobile Storage Fallback & Build/Config Hygiene
- **Evidence:** `app/src/services/storage.ts:15-27` (falls back silently to in-memory object if SecureStore throws, though acceptable on web; tokens never logged). Debug keystore exists in repo gitignore-check (`app/android/app/debug.keystore`).

#### `OPS-01` [MEDIUM] [CONFIRMED] SuperAdmin Port/Dependency Mismatches
- **Evidence:** `superadmin-ui/services/api.ts:1` defaults to `5002` instead of `5001`; `superadmin-api/.env.example` specifies `http://localhost:3001` instead of `3002`; `superadmin-api` & `superadmin-ui` lack installed `node_modules` in workspace, causing `npm run build` / `welcome_email.test.mjs` to fail until built.

---

## 4. Verified False Positives / Not Present / Mitigated Controls

| Suspected Risk | Classification | Evidence |
|---|---|---|
| Invalid `Bearer` header falls back to `floxa_access` cookie in `requireAuth`/`optionalAuth` | **NOT PRESENT** | `backend/src/middleware/auth.middleware.ts:14-18, 51-56` uses strict `else if`; empty/invalid `Bearer` fails with `401` and never reads cookies. |
| CSV formula injection in SuperAdmin CSV exports | **NOT PRESENT** | `superadmin-api/src/controllers/settings.controller.ts:143-151` (`sanitizeCsvCell`) prefixes leading `[=+\-@\t\r]` with `'`. |
| Unescaped RegExp NoSQL ReDoS in search | **MITIGATED** | `backend/src/controllers/project.controller.ts:40` and `superadmin-api/src/controllers/admin.controller.ts:11-13` escape regex metacharacters. |
| Client bypass of final milestone payment on HTTP deliverable download | **MITIGATED** | `backend/src/services/project.service.ts:13-54` (`canClientDownloadDeliverable`) enforces `deliverable.status === 'shared'`, `final` paid, and ALL project milestones paid. |
| `dangerouslySetInnerHTML` XSS in `frontend/` or `superadmin-ui/` | **NOT PRESENT** | Full workspace scan found zero `dangerouslySetInnerHTML` or `document.write` sinks. |

