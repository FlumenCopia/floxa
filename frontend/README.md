# FLOXA Frontend

The Next.js client application for the FLOXA platform, providing the consultant creative dashboard, client collaboration portal, and WebRTC video/audio calling.

---

## Technology Stack

* **Framework**: Next.js 16.2 (App Router)
* **Library**: React 19.2
* **Language**: TypeScript 5.x
* **Styling**: TailwindCSS 4
* **Realtime**: WebSockets and WebRTC

---

## Getting Started

### Prerequisites
* **Node.js**: v20.x or v22.x LTS
* **Active Backend**: FLOXA Node.js/Express Backend running on port `5000`

### Environment Configuration
Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

### Development Server
Run the Next.js development server on port `3000`:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Verification

| Command | Purpose |
| :--- | :--- |
| `npm test` | Run lightweight regression and contract tests via `node:test` |
| `npm run lint` | Check ESLint and React Hook rules |
| `npx tsc --noEmit` | Type-check TypeScript files |
| `npm run build` | Build optimized production bundle |
| `npm start` | Start production server on port `3000` |

---

## API Proxy Architecture

All frontend requests to `/api/*` are processed by the Next.js edge route handler in `app/api/[...path]/route.ts`. The proxy:
* Forwards requests to `BACKEND_API_URL` (default `http://localhost:5000/api`).
* Validates incoming `Origin` and `Referer` against the allowed origins (`http://localhost:3000`, `http://127.0.0.1:3000`, `https://floxa.flumenx.in`).
* Forwards essential authentication and collaboration headers: `x-portal-access-token`, `x-support-mode`, `x-consultant-support`, `cookie`, `authorization`, and CSRF tokens.
* Strips forbidden hop-by-hop headers.
