# Financial Reconciliation Tool

A modern, explainable, and robust financial reconciliation tool.

- **Frontend:** React + Vite + Tailwind (deployed on Vercel)
- **Backend:** Express + TypeScript (deployed on Render, uses Gemini LLM for fuzzy, explainable matching)

---

## Features

- **Upload two files** (CSV or Excel), parse and normalize dates, amounts, and currencies.
- **Fuzzy, explainable matching** using Gemini LLM:
  - Handles semantic description differences, currency/amount/date mismatches, partial payments, duplicates, and ambiguous records.
  - Outputs JSON mapping of matches with confidence scores and human-readable reasons.
- **Interactive UI**:
  - Review, confirm, or override matches.
  - Tabs for matched, unmatched, review, and all LLM candidate pairs.
- **Explainability**: Every match includes a confidence score and reason.
- **Robust error handling** and logging.
- **Ready for local development and cloud deployment (Vercel + Render).**

---

## Project Structure

```
financial-reconciliation-tool/
  client/      # Frontend (React + Vite + Tailwind)
  server/      # Backend (Express + TypeScript)
```

---

## Local Development

### 1. **Clone the repository**

```bash
git clone <your-repo-url>
cd financial-reconciliation-tool
```

### 2. **Set up the backend**

```bash
cd server
cp .env.example .env   # Create your .env file (see below)
npm install
npm run dev            # Runs on http://localhost:3001
```

**`.env.example` for backend:**

```
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-flash         # (optional, default: gemini-1.5-flash)
LLM_MATCH_THRESHOLD=0.85              # (optional, default: 0.85)
```

### 3. **Set up the frontend**

```bash
cd ../client
cp .env.example .env   # Create your .env file (see below)
npm install
npm run dev            # Runs on http://localhost:5173
```

**`.env.example` for frontend:**

```
VITE_API_URL=http://localhost:3001/reconcile
```

---

## Production Deployment

### **Backend (Render)**

- Deploy the `server/` folder as a **Web Service** on [Render](https://render.com/).
- **Build Command:** `npm run build`
- **Start Command:** `npm start`
- **Environment Variables:** Set as in `.env.example` above.
- After deployment, note your backend URL (e.g., `https://your-backend.onrender.com/reconcile`).

### **Frontend (Vercel)**

- Deploy the `client/` folder as a project on [Vercel](https://vercel.com/).
- **Project root:** `client/`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment Variable:**
  - `VITE_API_URL=https://your-backend.onrender.com/reconcile`
- After deployment, your frontend will be live and will call your Render backend.

---

## Core Logic Overview

### **Backend (`server/`)**

- **Entry:** `index.ts`

  - Express server with `/reconcile` POST endpoint.
  - Handles file uploads (CSV/Excel), parses and normalizes data.
  - Calls `reconcile.ts` for core logic.

- **Reconciliation Logic:** `reconcile.ts`

  - **Normalization:** Dates (handles serials, 2/4-digit years, various formats), amounts (credit/debit/amount columns), currencies.
  - **Matching:** 1-to-1 strict matching, with tolerance for date/amount/currency differences.
  - **LLM Integration:** For each plausible candidate pair, sends a prompt to Gemini LLM, which returns a JSON object with `match`, `confidence`, and `reason`.
  - **Explainability:** All LLM responses are parsed and included in the API response.
  - **Error Handling:** If LLM response is not valid JSON, attempts regex extraction and logs the raw response.
  - **Output:** Returns all matches, unmatched entries, and all LLM candidate pairs for UI review.

- **Test Script:** `test-llm.ts`

  - Standalone script to test LLM matching logic with sample data.

- **Environment Variables:**
  - `GEMINI_API_KEY` (required)
  - `GEMINI_MODEL` (optional)
  - `LLM_MATCH_THRESHOLD` (optional)

### **Frontend (`client/`)**

- **Entry:** `src/App.tsx`

  - Handles file upload, API calls, and UI state.
  - Uses `VITE_API_URL` for all API requests (set via environment variable).
  - Displays summary cards, tabs for matched/unmatched/review/LLM candidates.
  - Interactive review tab for manual confirmation/rejection of matches.
  - "All LLM Candidates" tab shows every candidate pair sent to the LLM, with full details and LLM responses.

- **File Upload Component:** `src/components/FileUpload.tsx`

  - Handles file selection, validation, and submission.

- **Styling:** Tailwind CSS, Heroicons for UI.

- **Environment Variable:**
  - `VITE_API_URL` (required): Full URL to backend `/reconcile` endpoint.

---

## API

### **POST `/reconcile`**

- **Request:** `multipart/form-data` with `fileA` and `fileB` (CSV or Excel)
- **Response:** JSON with:
  - `matches`: Array of matched transaction pairs with confidence and reason.
  - `unmatched_file_a_entries`: Unmatched entries from File A.
  - `unmatched_file_b_entries`: Unmatched entries from File B.
  - `llm_candidates`: All candidate pairs sent to LLM, with LLM responses.

---

## Troubleshooting

- **404 on file upload:**

  - Ensure `VITE_API_URL` is set to the full backend endpoint (e.g., `https://your-backend.onrender.com/reconcile`).
  - Check Render logs for incoming requests and errors.
  - Use browser DevTools to inspect the network request URL.

- **LLM errors:**
  - Ensure `GEMINI_API_KEY` is valid and has quota.
  - Check backend logs for LLM response parsing errors.

---

## Scripts

### **Backend (`server/`)**

- `npm run dev` — Start dev server with ts-node
- `npm run build` — Compile TypeScript to `dist/`
- `npm start` — Start production server from `dist/`

### **Frontend (`client/`)**

- `npm run dev` — Start Vite dev server
- `npm run build` — Build for production
- `npm run preview` — Preview production build locally

---

## Acknowledgements

- [Google Gemini LLM](https://ai.google.dev/)
- [Vercel](https://vercel.com/)
- [Render](https://render.com/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---
