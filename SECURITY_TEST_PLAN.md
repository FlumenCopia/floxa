# FLOXA Platform — Security & Functional Verification Test Plan

**Version:** 1.0  
**Date:** 2026-11-11  
**Target Scope:** `backend/`, `frontend/`, `superadmin-api/`, `superadmin-ui/`, `app/`  
**Isolated Test Database:** `mongodb://127.0.0.1:27017/floxa_audit_test_db` (`rs0` single-node Replica Set)

---

## 1. Objectives & Preconditions

1. Verify every confirmed Critical, High, Medium, and Low finding from [AUDIT_REPORT.md](./AUDIT_REPORT.md) has either been remediated and covered by automated regression assertions or documented with residual constraints.
2. Validate transactional financial safety under real MongoDB Replica Set multi-document sessions (`ReplicaSetWithPrimary`) without modifying production `floxa_db` data.
3. Ensure existing functional unit and integration contracts (`backend`, `frontend`, `superadmin-api`, `app`) continue to pass cleanly alongside new adversarial/concurrency tests.

### Environment & Execution Rules

- **Database Isolation:** All `backend` Node test runner suites run with `$env:DATABASE_URL="mongodb://127.0.0.1:27017/floxa_audit_test_db"`.
- **Sequential Suite Serialization:** Backend integration files share `floxa_audit_test_db` and exercise the singleton `scheduler_locks` cron lock (`sla_deadline_check`), so the full 12-suite pass must execute with `--test-concurrency=1` to eliminate cross-process distributed-lock interference.
- **Standalone Contract Test Exclusion:** `backend/tests/portal-auth-contract.test.cjs` targets external `localhost:5000` / `floxa_db:27017` and is excluded from in-process CI runs unless explicitly pointed at an isolated staging server.
- **Uninstalled Modules (`superadmin-api`, `superadmin-ui`):** `node_modules` are not installed on disk in `superadmin-api/` or `superadmin-ui/`; zero-dependency Node logic tests (`audit_fixes.test.mjs`, `reactivation_sla_lifecycle.test.mjs`) run natively, whereas `welcome_email.test.mjs` and TypeScript/Next builds require `npm install` first.

---

## 2. Test Matrix by Audit Domain

| Test ID | Finding IDs | Target Component / Route | Adversarial / Concurrency Scenario | Expected Post-Fix Result | Automated Verification Reference |
|---|---|---|---|---|---|
| **TP-AUTH-01** | `AUTH-01` | `WS /ws/support/:portal_token/` | Client connects to password-protected portal without `portal_access_token`, or supplies a signed access token belonging to another project | Socket closes immediately with `4003`; only valid matching signed token opens connection | `backend/tests/security-audit-regression.test.cjs` (`AUTH-01`) |
| **TP-AUTH-02** | `AUTH-02`, `AUTH-11` | `GET /api/auth/me/`, `GET /api/client-portal/:token/?support=true`, `WS /ws/support/consultant/` | Active consultant connects WS, then is suspended (`isSuspended: true`) & `tokenVersion` incremented + `disconnectConsultantSockets()` invoked | Existing WS closes with `4001`; HTTP `/auth/me/` returns `401`/`403`; Support Mode fails closed (`401`/`403`); reconnect WS closes `4001` | `backend/tests/security-audit-regression.test.cjs` (`AUTH-02`), `backend/tests/b2b-password-management.test.cjs` |
| **TP-AUTH-03** | `AUTH-03`, `MOB-01` | `POST /api/auth/token/refresh/` | Submit `access` token in refresh body; submit forged `alg: none` JWT; submit valid `refresh` JWT | Rejects wrong `tokenType` and `alg: none` with `401`; valid refresh returns rotated `{ access, refresh }` in JSON + cookies | `backend/tests/security-audit-regression.test.cjs` (`AUTH-03`) |
| **TP-AUTH-04** | `AUTH-04` | `POST /api/auth/device-token/` | Unauthenticated consultant token registration; unverified client token registration on password-locked portal | Consultant unauthenticated returns `401`; unverified client returns `401`/`403` | `backend/tests/security-audit-regression.test.cjs` (`AUTH-04`) |
| **TP-SEC-01** | `SEC-01` | `POST /api/projects/`, `POST /api/auth/token/refresh/` | Cookie-authenticated requests inject `x-client-portal-token` or invalid `Authorization: Bearer` without `X-CSRFToken`; refresh cookie request omits `X-CSRFToken`; repeat with valid double-submit `csrftoken` + `X-CSRFToken` | All forged/bypass attempts fail with `403`; valid double-submit refresh succeeds `200` | `backend/tests/security-audit-regression.test.cjs` (`SEC-01`), `frontend/tests/proxy_allowlist.test.mjs` |
| **TP-AUTH-09** | `AUTH-09`, `AUTH-10` | `WS /ws/support/:portal_token/`, `POST /api/client-portal/:token/(discovery/submit, moodboards/select, moodboards/feedback, concepts/feedback)` | Portal client sends `CHAT_MESSAGE_SEND` claiming `senderRole: 'consultant'`; consultant with `x-support-mode: true` invokes client-only endpoints | Server overrides `senderRole` to `'client'`; all 4 Support Mode routes return `403` | `backend/tests/security-audit-regression.test.cjs` (`AUTH-09 & AUTH-10`), `backend/tests/phase1-auth-ws.test.cjs` |
| **TP-PAY-02** | `PAY-02`, `PAY-03`, `PAY-04` | `completePaymentMilestone()`, `POST /api/payments/razorpay/webhook/`, `POST /api/projects/:id/payments/` | Execute 2 concurrent `completePaymentMilestone` calls; fire 2 parallel identical signed Razorpay webhooks using consultant BYOK `razorpayWebhookSecret`; call `createMilestones` over paid `advance` milestone | Exactly 1 `payment_received` activity & 1 `RazorpayWebhookEvent` created; both webhooks return `200`; `advance` milestone retains `status: 'paid'` and original `amount` | `backend/tests/security-audit-regression.test.cjs` (`PAY-02 & PAY-03`) |
| **TP-WF-01** | `WF-01`, `WF-02`, `WF-03` | `isProjectAwaitingClientAction()`, `checkAndEscalateDeadlines()` | Shared unapproved concept pauses clock (`awaiting_concept_approval`); approving concept resumes SLA clock (`awaitingClient: false`); fire 3 concurrent `checkAndEscalateDeadlines()` calls on >24h overdue project | Clock transitions accurately; `deadline_warning_1` emitted strictly once | `backend/tests/security-audit-regression.test.cjs` (`WF-01 & WF-02`), `backend/tests/sla-lifecycle-monitoring.test.cjs` |
| **TP-FILE-01** | `FILE-01`, `FILE-02` | `GET /media/chat_attachments/...`, `POST /api/projects/:id/messages/upload/` | Unauthenticated fetch of uploaded chat voice/photo attachment; authenticated fetch; upload `<script>` text payload masquerading as `image/png` | Unauthenticated media GET returns `403`; authenticated GET returns `200` with `Cache-Control: private`; spoofed PNG upload rejected `400` | `backend/tests/chat.test.cjs` (`6.7`), `backend/tests/security-audit-regression.test.cjs` (`FILE-02`) |
| **TP-AI-01** | `AI-01`, `AI-02` | `POST /api/ai-suite/run/`, `serializeConsultant()` | Check encrypted `enc:v1:...` secrets in MongoDB & masked serializer output; fire 6 concurrent `/api/ai-suite/run/` requests on `free` tier (`FREE_TRIAL_LIMIT_PER_TOOL = 3`) | Serializer never exposes plaintext secrets; concurrent requests yield at most 3 `200` responses and reject remainder with `403`; DB `toolRuns <= 3` | `backend/tests/security-audit-regression.test.cjs` (`AI-01 & AI-02`) |
| **TP-BUILD** | All | `backend`, `frontend`, `app`, `superadmin-api` | Full TypeScript checks, Next.js production build, frontend proxy/UI unit suite, SuperAdmin security/SLA logic suite | Zero compilation/build errors across `backend`, `frontend`, `app`; 100% test pass in runnable suites | Command verification suite |

---

## 3. Manual / Environment-Specific Residual Checks

- **Mobile E2E Flow (`app/`):** TypeScript validation (`npx tsc --noEmit`) covers mobile changes cleanly; interactive UI testing against a live Expo Metro bundler + physical/emulator Razorpay order checkout remains a manual QA check when running mobile builds.
- **SuperAdmin Integration Tests:** After installing dependencies (`npm install`) in `superadmin-api/` and `superadmin-ui/`, run `npm run build` in both modules and execute `superadmin-api/tests/welcome_email.test.mjs` plus live CSRF/cookie smoke tests against port `5001` & `3002`.

