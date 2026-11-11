# FLOXA Platform — Security & Functional Audit Remediation Report

**Remediation Date:** 2026-11-11  
**Baseline Report:** [AUDIT_REPORT.md](./AUDIT_REPORT.md)  
**Modules Remediated:** `backend/`, `frontend/`, `superadmin-api/`, `superadmin-ui/`, `app/`

---

## 1. Executive Summary

All **32 confirmed vulnerabilities, concurrency defects, and workflow flaws** identified in [AUDIT_REPORT.md](./AUDIT_REPORT.md) have been addressed across the five-module FLOXA repository (with 1 low-severity operational item and browser/mobile `localStorage` fallback compatibility documented accurately below). During verification of `backend/tests/chat.test.cjs`, a newly introduced `/media/chat_attachments` authorization gate also surfaced a real workflow regression (uploads happen immediately prior to WebSocket message persistence), which was resolved cleanly by scoping chat attachment uploads into per-project folders (`chat_attachments/<projectId>/...`) alongside legacy `ChatMessage` DB authorization lookups.

---

## 2. Finding-by-Finding Remediation Record

### Domain 1 — Authentication, Session & Token Security (`AUTH-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `AUTH-01` | Critical | **Fixed** | Fail closed on `/ws/support/:portal_token/` when `project.portalPasswordHash` is configured: missing, expired, malformed, or cross-project `portal_access_token` cookies/query params terminate immediately with WebSocket close code `4003`. Updated [socketServer.ts](./backend/src/websocket/socketServer.ts). |
| `AUTH-02` | High | **Fixed** | Unified consultant token resolution into `resolveAuthenticatedConsultant()` enforcing `isActive`, `!isSuspended`, exact `tokenVersion` matching, `tokenType === 'access'` (with legacy access compatibility), and `HS256` algorithm pinning across `auth.middleware.ts`, `portal.middleware.ts`, and `socketServer.ts`. Added active WebSocket forced disconnection (`disconnectConsultantSockets`) on account suspension, password change, and password reset. Updated [auth.service.ts](./backend/src/services/auth.service.ts), [auth.middleware.ts](./backend/src/middleware/auth.middleware.ts), [portal.middleware.ts](./backend/src/middleware/portal.middleware.ts), [auth.controller.ts](./backend/src/controllers/auth.controller.ts), [deadlineMonitoring.service.ts](./backend/src/services/deadlineMonitoring.service.ts), [socketServer.ts](./backend/src/websocket/socketServer.ts). |
| `AUTH-03` | High | **Fixed** | Enforced strict `verifyRefreshJwt()` (`tokenType: 'refresh'`, `HS256`, active non-suspended consultant, matching `tokenVersion`) and rotated both `access` and `refresh` tokens in JSON body + HttpOnly cookies on `POST /api/auth/token/refresh/`. Honored configured `ENV.JWT_ACCESS_EXPIRES_IN` / `ENV.JWT_REFRESH_EXPIRES_IN`. Updated [auth.service.ts](./backend/src/services/auth.service.ts) and [auth.controller.ts](./backend/src/controllers/auth.controller.ts). |
| `AUTH-04` | High | **Fixed** | Hardened `POST /api/auth/device-token/` and `POST /api/auth/device-token/unregister/`: consultant tokens require authenticated `req.user`, client tokens require verified portal access (`x-portal-access-token` / `floxa_portal_access`) when `portalPasswordHash` exists, and unregister enforces caller ownership (`consultantId` / `portalToken`). Updated [auth.controller.ts](./backend/src/controllers/auth.controller.ts) and [auth.routes.ts](./backend/src/routes/auth.routes.ts). |
| `AUTH-05` | High | **Fixed** | Added `getTrustedOriginsSet()` and `resolveSafeFrontendOrigin()` in [env.ts](./backend/src/config/env.ts) and replaced unvalidated `Origin`/`Referer` header forwarding in password reset and portal invitation emails with strict allowlist matching. Updated [auth.controller.ts](./backend/src/controllers/auth.controller.ts), [project.controller.ts](./backend/src/controllers/project.controller.ts), [discovery.controller.ts](./backend/src/controllers/discovery.controller.ts). |
| `AUTH-06` | High | **Fixed** | Enforced `requireProdSecret()` in [env.ts](./backend/src/config/env.ts) (throwing at startup in production when secrets are absent or use dev defaults) and hardened prod cookie `Secure`/`SameSite` flags. Added `tokenVersion` to `SuperAdmin` schema, pinned `HS256` JWT verification, rotated `tokenVersion` in `changeAdminPassword`, and removed prefilled default email/password from `superadmin-ui`. Updated [superadmin.model.ts](./superadmin-api/src/models/superadmin.model.ts), [auth.middleware.ts](./superadmin-api/src/middleware/auth.middleware.ts), [settings.controller.ts](./superadmin-api/src/controllers/settings.controller.ts), [page.tsx](./superadmin-ui/app/login/page.tsx). |
| `AUTH-07` | Medium | **Fixed** | Implemented sliding-window rate limiter [rateLimit.middleware.ts](./backend/src/middleware/rateLimit.middleware.ts) (`loginLimiter`, `passwordResetLimiter`, `reactivationLimiter`, `verifyPortalPasswordLimiter`) and `createLoginRateLimiter` in [security.ts](./superadmin-api/src/utils/security.ts). Wired into [auth.routes.ts](./backend/src/routes/auth.routes.ts), [portal.routes.ts](./backend/src/routes/portal.routes.ts), [auth.routes.ts](./superadmin-api/src/routes/auth.routes.ts). |
| `AUTH-08` | Medium | **Mitigated** | Removed `localStorage.getItem("floxa_jwt") || localStorage.getItem("floxa_token")` reads from [FloxaHeader.jsx](./frontend/components/common/FloxaHeader.jsx), using `"active"` cookie sentinel and preventing `4001` reconnect storms in [supportSocketService.js](./frontend/services/supportSocketService.js). Added cookie-based CSRF + credentials support to [api.ts](./superadmin-ui/services/api.ts). *(Note: WS `?token=` and SuperAdmin optional Bearer storage remain supported for non-cookie/mobile clients.)* |

### Domain 2 — CSRF, CORS, Proxy & Request Forgery (`SEC-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `SEC-01` | Critical | **Fixed** | Removed the `x-client-portal-token` CSRF exemption in [csrf.middleware.ts](./backend/src/middleware/csrf.middleware.ts); restricted `Authorization: Bearer` CSRF exemption strictly to cryptographically verified non-empty JWTs (with no cookie fallback); added `timingSafeEqual` CSRF token comparison; and enforced CSRF checks whenever `AUTH_ACCESS_COOKIE_NAME`, `AUTH_REFRESH_COOKIE_NAME`, or `PORTAL_ACCESS_COOKIE_NAME` cookies are present. Updated [api.js](./frontend/lib/api.js) `refreshAccessToken()` to send `X-CSRFToken`. |
| `SEC-02` | High | **Fixed** | Added CSRF double-submit token generation (`GET /api/admin/auth/csrf`) and verification middleware (`csrfProtection`) in [security.ts](./superadmin-api/src/utils/security.ts), [auth.controller.ts](./superadmin-api/src/controllers/auth.controller.ts), [auth.routes.ts](./superadmin-api/src/routes/auth.routes.ts), and [server.ts](./superadmin-api/src/server.ts). Updated [api.ts](./superadmin-ui/services/api.ts) to attach `x-csrf-token` and `credentials: 'include'` on mutations and CSV exports. |
| `SEC-03` | High | **Fixed** | Removed the silent `"https://floxa.flumenx.in"` fallback origin spoofing in [route.ts](./frontend/app/api/[...path]/route.ts), added strict `new URL(referer).origin` comparison, and returned `403` on untrusted Origin/Referer requests. Updated [route.ts](./frontend/app/media/[...path]/route.ts) to forward auth/portal headers and apply `Cache-Control: private, no-store, no-cache, must-revalidate` on non-public media folders and error responses. |
| `SEC-04` | Medium | **Fixed** | Updated [server.ts](./superadmin-api/src/server.ts) to fail closed on disallowed production origins without hardcoded localhost fallbacks, aligned [api.ts](./superadmin-ui/services/api.ts) default API URL to port `5001`, and updated [.env.example](./superadmin-api/.env.example) CORS origin to `http://localhost:3002`. |

### Domain 3 — Authorization, IDOR & Role Isolation (`AUTH-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `AUTH-09` | High | **Fixed** | Enforced `Project.exists({ _id, consultantId, isArchived: false })` on `/ws/support/consultant` events (`CHAT_TYPING`, `CHAT_MESSAGES_READ`, `PROJECT_READ`), eliminated global `consultantSockets` fallback broadcast in `broadcastProjectRead`, and bound `senderRole`, `typingRole`, and `readerRole` strictly to the server-authenticated socket `role` rather than client message fields. Updated [socketServer.ts](./backend/src/websocket/socketServer.ts). |
| `AUTH-10` | High | **Fixed** | Applied `clientOnlyAction` to `discovery/submit/`, `moodboards/:moodboard_id/select/`, `moodboards/:moodboard_id/feedback/`, and `concepts/:concept_id/feedback/` in [portal.routes.ts](./backend/src/routes/portal.routes.ts), removed forced `req.isPortalClient = true` in `submitPortalDiscovery`, and ensured Support Mode portal chat endpoints record consultant identity accurately. Updated [portal.controller.ts](./backend/src/controllers/portal.controller.ts) and [portal.middleware.ts](./backend/src/middleware/portal.middleware.ts). |
| `AUTH-11` | Medium | **Fixed** | Made Support Mode fail closed (`401` on invalid/missing consultant JWT, `403` on non-owning consultant) across all Support Mode headers and query flags (`x-support-mode`, `x-consultant-support`, `support`, `support_mode`, `mode`, `consultant`) without falling through to portal password/open mode. Updated [portal.middleware.ts](./backend/src/middleware/portal.middleware.ts). |

### Domain 4 — Payment Integrity & Deliverable Gating (`PAY-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `PAY-01` | Critical | **Fixed** | Passed `rzpCreds` into `fetchRazorpayPayment(razorpayPaymentId, rzpCreds)` inside `verifyPortalPayment` so consultant BYOK Razorpay verification queries the consultant's own merchant account. Updated [portal.controller.ts](./backend/src/controllers/portal.controller.ts). |
| `PAY-02` | High | **Fixed** | Removed silent standalone MongoDB `session = null` downgrade in [payment.service.ts](./backend/src/services/payment.service.ts): `executeAtomicPaymentCompletion()` requires a Replica Set / Sharded cluster (`503` otherwise) and safely handles `payment_milestone_id` idempotency lookup without regex misfires. |
| `PAY-03` | High | **Fixed** | Removed cross-secret fallback to `ENV.RAZORPAY_WEBHOOK_SECRET` when `isConsultantWebhook === true`, and transitioned webhook event claiming atomically (`$set: { processingStatus: 'processing' }` for `['received', 'failed']`) inside [payment.controller.ts](./backend/src/controllers/payment.controller.ts). |
| `PAY-04` | Medium | **Fixed** | Validated cached pending payment transactions in `createPortalPaymentOrder` against current milestone amount/currency/merchant (marking stale mismatched orders failed cleanly), preserved existing `paid`/`requested` milestones in `createMilestones`, and enforced `advance.status === 'paid'` when unlocking `final` milestones in [portal.controller.ts](./backend/src/controllers/portal.controller.ts), [payment.controller.ts](./backend/src/controllers/payment.controller.ts), and [project.service.ts](./backend/src/services/project.service.ts). |

### Domain 5 — Workflow Integrity & SLA Lifecycle (`WF-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `WF-01` | High | **Fixed** | Replaced tautological `Concept.find({ projectId, status: 'shared' })` check with explicit counts of `sharedConceptsCount > 0 && approvedConceptsCount === 0` in [deadlineMonitoring.service.ts](./backend/src/services/deadlineMonitoring.service.ts) so consultant SLA timers resume promptly after concept approval. |
| `WF-02` | Medium | **Fixed** | Added MongoDB distributed lease locking (`SchedulerLock` in `scheduler_locks` with `finally` release) in [deadlineMonitoring.service.ts](./backend/src/services/deadlineMonitoring.service.ts) so multi-instance backend processes cannot execute SLA sweeps simultaneously. |
| `WF-03` | Medium | **Fixed** | Replaced sliding 24h warning deduplication with atomic `Project.findOneAndUpdate({ _id, deadlineFlagsCount: { $lt: targetFlag } })` claims so each warning flag (1–4) fires at most once. Updated [admin.controller.ts](./superadmin-api/src/controllers/admin.controller.ts) reactivation to clear deadlines across all secondary projects at `deadlineFlagsCount >= 3` or `deadlineBreached: true`. |

### Domain 6 — File Upload, Media Serving, Storage & XSS (`FILE-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `FILE-01` | Critical | **Fixed** | Removed `'chat_attachments'` from `ALLOWED_PUBLIC_MEDIA_DIRS` in [app.ts](./backend/src/app.ts), stored new chat uploads under per-project directories `chat_attachments/<projectId>/` in [chat.controller.ts](./backend/src/controllers/chat.controller.ts), and enforced consultant ownership or verified client portal authorization + `Cache-Control: private, no-store, no-cache, must-revalidate` + `X-Content-Type-Options: nosniff` on `/media/chat_attachments/...`. |
| `FILE-02` | High | **Fixed** | Added explicit Multer `limits` (`fileSize`, `files`) across [auth.routes.ts](./backend/src/routes/auth.routes.ts), [project.routes.ts](./backend/src/routes/project.routes.ts), and [portal.routes.ts](./backend/src/routes/portal.routes.ts). Implemented magic-byte signature validation (`hasExpectedMagicBytes`) and strict Sharp decode rejection (`400`) in [storage.service.ts](./backend/src/services/storage.service.ts), and applied upload validation to portal signature uploads in [portal.controller.ts](./backend/src/controllers/portal.controller.ts). |
| `FILE-03` | Medium | **Fixed** | Implemented `escapeHtml()` across all user-controlled template interpolations and switched Nodemailer TLS validation to `tls.rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false'` in both [email.service.ts](./backend/src/services/email.service.ts) and [email.service.ts](./superadmin-api/src/services/email.service.ts). |

### Domain 7 — AI Suite, Quota Race Conditions, Secrets & SSRF (`AI-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `AI-01` | High | **Fixed** | Replaced TOCTOU read-then-increment quota logic in [aiSuite.controller.ts](./backend/src/controllers/aiSuite.controller.ts) with atomic `Consultant.findOneAndUpdate` slot reservations (`toolRuns.<toolId> < FREE_TRIAL_LIMIT_PER_TOOL` or `bonusCredits > 0`) and automatic atomic compensation rollback when generation errors or returns `isInsufficient`. |
| `AI-02` | Critical | **Fixed** | Removed hardcoded Gmail SMTP defaults (`contactmiscarchive@gmail.com` / app password) from [email.service.ts](./superadmin-api/src/services/email.service.ts). Implemented AES-256-GCM authenticated encryption (`encryptSecret` / `decryptSecret` / `maskSecret`, versioned `enc:v1:...`) for consultant and platform API/Razorpay secrets across [crypto.ts](./backend/src/utils/crypto.ts), [auth.controller.ts](./backend/src/controllers/auth.controller.ts), [serializer.ts](./backend/src/utils/serializer.ts), [gemini.service.ts](./backend/src/services/gemini.service.ts), [razorpay.service.ts](./backend/src/services/razorpay.service.ts), [security.ts](./superadmin-api/src/utils/security.ts), and [settings.controller.ts](./superadmin-api/src/controllers/settings.controller.ts). |
| `AI-03` | Medium | **Fixed** | Replaced raw query-string API key interpolation in `testGeminiConnection` with `x-goog-api-key` request header authentication in [settings.controller.ts](./superadmin-api/src/controllers/settings.controller.ts). |

### Domain 8 — Mobile App (`app/`) & Operations (`MOB-*`, `OPS-*`)

| ID | Severity | Status | Fix Summary & Changed Files |
|---|---|---|---|
| `MOB-01` | High | **Fixed** | Aligned backend refresh contract and updated mobile [storage.ts](./app/src/services/storage.ts), [api.ts](./app/src/services/api.ts), and [AuthContext.tsx](./app/src/context/AuthContext.tsx) to store rotated `access` and `refresh` tokens reliably upon 401 token refresh. |
| `MOB-02` | High | **Fixed** | Implemented portal password challenge (`POST /client-portal/:token/verify-password/`), persisted `x-portal-access-token` across HTTP (`api.ts`), WebSocket ([socket.ts](./app/src/services/socket.ts)), and auth context ([AuthContext.tsx](./app/src/context/AuthContext.tsx)), added password prompt UI in [AuthScreen.tsx](./app/src/screens/AuthScreen.tsx), enforced `can_download` gating for Deliverables, and removed hardcoded dummy Rs 45,000 placeholder payments in [ClientPortalScreen.tsx](./app/src/screens/ClientPortalScreen.tsx). |
| `MOB-03` | Low | **Documented** | SecureStore remains the primary mobile keystore with explicit web fallback; `app/` passes `npx tsc --noEmit`. Remove dev `debug.keystore` prior to store release signing. |
| `OPS-01` | Medium | **Fixed (Code) / Noted (Deps)** | Aligned default API port (`5001`) in [api.ts](./superadmin-ui/services/api.ts) and CORS origin (`http://localhost:3002`) in [.env.example](./superadmin-api/.env.example). Installing `node_modules` in `superadmin-api/` and `superadmin-ui/` remains required prior to building/running those two services. |

