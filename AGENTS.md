# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Freight Command Center — a maritime logistics tracking app (React 19 + Express 4 + SQLite). See `README.md` for basic setup.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Express API server | `npm run dev` | 3000 | Backend; uses embedded SQLite (`data/app.db`) + flat files (`data/shipments.csv`, `data/settings.json`) |
| Vite dev server | `npx vite --port 5173 --host 0.0.0.0` | 5173 | Frontend HMR; proxies `/api` → `localhost:3000`. Start **after** the backend. |

### Running tests / lint / build

- **Tests:** `npm test -- --run` (vitest, 21 tests, all pass; some use external API stubs that log expected ENOTFOUND errors — these are normal)
- **Lint:** `npm run lint` (runs `tsc --noEmit`). Note: there are pre-existing TS type errors (missing `booking_number` on `Shipment` type, JSX namespace, etc.) that do **not** affect runtime.
- **Build:** `npm run build` (Vite production build to `dist/`)

### Non-obvious caveats

- The `npm run dev` command only starts the Express backend (via `tsx src/bin/server.ts`). To get the frontend with HMR, start the Vite dev server separately as shown above.
- The Express server serves static files from `dist/` when that directory exists. If you only need the API, `npm run dev` suffices.
- External carrier API keys (Hapag-Lloyd, Maersk, CMA CGM) are optional. The app falls back to simulated tracking data without them.
- Data is file-based (SQLite + CSV/JSON in `data/`). No external database server is needed.
