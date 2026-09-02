# Revenue Rescue Agent

AI-assisted, policy-governed recovery of failed payments for the Razorpay AI Buildathon Track 3 concept.

## Architecture

Frontend (Next.js) → FastAPI → AI diagnosis → deterministic policy gate → simulated execution → audit trail/metrics.

The frontend reads the real FastAPI audit API and triggers the real simulation endpoint. Local mock data is used only when the backend is unavailable so the UI can still be previewed.

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

For a deployed frontend, set `NEXT_PUBLIC_API_URL` to the deployed backend URL ending in `/api`.

## API

- `GET /` health check
- `POST /api/run-simulation` run a synthetic recovery batch
- `GET /api/metrics` aggregate recovery metrics
- `GET /api/audit-trail` paginated decision history
- `GET /api/audit-trail/{payment_id}` full decision trace

## Notes

This is a synthetic simulation. No real customer payments or payment credentials are processed.
