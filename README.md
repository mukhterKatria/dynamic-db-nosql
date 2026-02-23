# Dynamic MongoDB Query Builder

A lightweight Compass-like web app for:

- Selecting MongoDB collections.
- Picking fields and conditions to build queries.
- Asking natural-language questions against a selected collection.
- Generating and executing queries, then seeing live results.

## Features

- **Manual query builder** (filters, projection, sort, limit).
- **Natural-language ask mode** (`/api/ask`) that:
  - Uses OpenAI (if `OPENAI_API_KEY` is provided), or
  - Falls back to a deterministic heuristic parser.
- **Field discovery** from sampled documents.
- Basic operator and field validation for safer query execution.

## Setup

```bash
npm install
```

Create `.env`:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=your_database
PORT=3000
# optional for better NL parsing
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

Run:

```bash
npm start
```

Open `http://localhost:3000`.

## API

- `GET /api/collections`
- `GET /api/collections/:name/fields`
- `POST /api/query`
- `POST /api/ask`

### Sample ask payload

```json
{
  "collection": "orders",
  "question": "Show latest 10 orders where total greater than 100"
}
```

