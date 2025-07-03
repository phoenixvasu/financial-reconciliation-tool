# Financial Reconciliation Tool

A robust, explainable, and scalable tool for reconciling financial transactions between two files (CSV/Excel), powered by GenAI (Google Gemini LLM).

---

## Features

- **Semantic Transaction Matching:**
  - Matches transactions even if descriptions, dates, or amounts differ slightly.
  - Handles different date formats, amount columns, and currency mismatches.
- **Explainability:**
  - Every match includes a confidence score and a human-readable reason from the LLM.
- **Interactive UI:**
  - Upload files, review matches, and manually confirm or reject them.
  - See all LLM candidate pairs and their explanations for full transparency.
- **Scalable & Robust:**
  - Handles 1,000–5,000+ entries (with LLM call limits in mind).
  - Designed for both local development and Vercel serverless deployment.

---

## Project Structure

```
financial-reconciliation-tool/
  client/   # Vite + React frontend
  server/   # Express + Gemini LLM backend
  vercel.json
  README.md
```

---

## Local Development

### 1. Clone the Repo

```bash
git clone <your-repo-url>
cd financial-reconciliation-tool
```

### 2. Install Dependencies

```bash
cd client && npm install
cd ../server && npm install
```

### 3. Set Up Environment Variables

- Create `.env` files in both `client/` (if needed) and `server/`.
- At minimum, `server/.env` should include:
  - `GEMINI_API_KEY=your_gemini_api_key`
  - `LLM_MATCH_THRESHOLD=0.85` (optional)

### 4. Start the Backend

```bash
cd server
npm run dev
```

- Runs on `http://localhost:3001` by default.

### 5. Start the Frontend

```bash
cd client
npm run dev
```

- Runs on `http://localhost:5173` by default.

### 6. Configure Frontend API URL

- In `client/.env`:
  ```
  VITE_API_URL=http://localhost:3001/reconcile
  ```
- Restart the frontend dev server if you change this file.

### 7. Test in Browser

- Open `http://localhost:5173`.
- Upload two files and review the results.

---

## Vercel Deployment

### 1. Final Checklist

- All code committed and pushed to GitHub/GitLab/Bitbucket.
- `.env` files **not** committed to git.
- `vercel.json` present at project root.
- All dependencies installed.

### 2. Deploy

1. Go to [vercel.com](https://vercel.com/) and sign in.
2. Import your repo as a new project.
3. Set the root directory (project root).
4. Add all environment variables from your `.env` files in the Vercel dashboard.
5. Click **Deploy**.

### 3. Routing

- `/api/*` → serverless backend (Express + Gemini LLM)
- All other routes → frontend (Vite React)

### 4. Custom Domain (Optional)

- Add your domain in the Vercel dashboard and follow DNS instructions.

---

## Troubleshooting

- **API 404/500 errors:**
  - Check environment variables in Vercel.
  - Check Vercel logs for errors.
- **Frontend can't reach backend:**
  - Ensure API calls use `/api/reconcile` in production.
- **LLM errors or limits:**
  - Check your Gemini API key and usage limits.
- **Build errors:**
  - Ensure all dependencies are installed and up to date.

---

## License

MIT
