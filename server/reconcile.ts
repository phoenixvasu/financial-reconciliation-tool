import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { parse as csvParseSync } from 'csv-parse/sync';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

const router: Router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const LLM_MATCH_THRESHOLD = parseFloat(process.env.LLM_MATCH_THRESHOLD || '0.85');
const AMOUNT_TOLERANCE = 0.01; // Allow small rounding differences

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Normalize any date value to MM/DD/YYYY string
 */
function normalizeDateValue(val: any): string {
  if (val == null) return '';
  // Excel serial
  if (typeof val === 'number' && val > 40000 && val < 60000) {
    const utc_days = Math.floor(val - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    const mm = String(date_info.getMonth() + 1).padStart(2, '0');
    const dd = String(date_info.getDate()).padStart(2, '0');
    const yyyy = date_info.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  const valStr = String(val).trim();
  // MM/DD/YYYY or MM-DD-YYYY
  let match = valStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const mm = match[1].padStart(2, '0');
    const dd = match[2].padStart(2, '0');
    const yyyy = match[3];
    return `${mm}/${dd}/${yyyy}`;
  }
  // MM/DD/YY or MM-DD-YY
  match = valStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/);
  if (match) {
    const mm = match[1].padStart(2, '0');
    const dd = match[2].padStart(2, '0');
    let yy = parseInt(match[3], 10);
    // 00-49 → 2000-2049, 50-99 → 1950-1999
    const yyyy = yy < 50 ? (2000 + yy) : (1900 + yy);
    return `${mm}/${dd}/${yyyy}`;
  }
  return valStr;
}

/**
 * Recursively normalize all date-like fields in an object
 */
function normalizeDatesInObject(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = normalizeDatesInObject(value);
    } else if (key.trim().toLowerCase() === 'date') {
      out[key] = normalizeDateValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Parse CSV/Excel buffer into objects with normalized dates
 */
function parseFile(buffer: Buffer, filename: string): Record<string, any>[] {
  const ext = filename.toLowerCase().split('.').pop();
  let rows: Record<string, any>[] = [];

  if (ext === 'csv') {
    const text = buffer.toString('utf-8');
    rows = csvParseSync(text, { columns: true, skip_empty_lines: true }) as Record<string, any>[];
  } else if (ext === 'xlsx' || ext === 'xls') {
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
      dateNF: 'MM/DD/YYYY'
    }) as Record<string, any>[];
  } else {
    throw new Error(`Unsupported file extension: ${ext}`);
  }
  return rows;
}

/**
 * Pretty-print for LLM prompt
 */
function prettyPrint(row: Record<string, any>): string {
  return Object.entries(row)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function datesAreClose(dateA: string, dateB: string, days = 0): boolean {
  // Compare MM/DD/YYYY strings, allow ±days
  const [mA, dA, yA] = dateA.split('/').map(Number);
  const [mB, dB, yB] = dateB.split('/').map(Number);
  const dtA = new Date(yA, mA - 1, dA);
  const dtB = new Date(yB, mB - 1, dB);
  const diff = Math.abs(dtA.getTime() - dtB.getTime());
  return diff <= days * 86400 * 1000;
}

function amountsAreClose(a: any, b: any, tol = AMOUNT_TOLERANCE): boolean {
  const numA = parseFloat(String(a).replace(/[^\d.-]/g, ''));
  const numB = parseFloat(String(b).replace(/[^\d.-]/g, ''));
  return Math.abs(numA - numB) <= tol;
}

function getRowAmount(row: Record<string, any>): any {
  if (row['Amount'] && String(row['Amount']).trim() !== '') return row['Amount'];
  if (row['Credit Amount'] && String(row['Credit Amount']).trim() !== '') return row['Credit Amount'];
  if (row['Debit Amount'] && String(row['Debit Amount']).trim() !== '') return row['Debit Amount'];
  return null;
}

// Utility: extract and normalize currency from a row
function getRowCurrency(row: Record<string, any>): string | null {
  const currencyFields = ['Currency', 'currency', 'Curr', 'curr', 'Account Currency'];
  for (const field of currencyFields) {
    if (row[field] && typeof row[field] === 'string') {
      return row[field].trim().toUpperCase();
    }
  }
  return null;
}

// Add new batch LLM function
async function geminiBatchMatchRow(
  a: Record<string, any>,
  candidates: { b: Record<string, any>; idx: number }[]
): Promise<Array<{ file_b_index: number; match: boolean; confidence: number; reason: string }>> {
  if (candidates.length === 0) return [];
  const fileAString = prettyPrint(a);
  const candidatesString = candidates
    .map(({ b, idx }) => `${idx}:\n${prettyPrint(b)}`)
    .join('\n\n');
  const prompt = `You are a financial reconciliation expert.\n\nYour task is to compare the following File A transaction to each of the File B candidates. For each candidate, output a JSON object with: file_b_index, match (true/false), confidence (0-1), and a clear, human-readable reason.\n\n**Instructions:**\n- Consider all possible reasons two transactions may represent the same real-world event, even if there are differences in description, date, amount, or currency.\n- If you detect a possible partial payment, duplicate, or ambiguous record, explain this in the reason and set confidence accordingly.\n- If the amounts are close but not exact, consider rounding, partial payments, or splits.\n- If the dates are off by a few days, consider posting delays.\n- If currencies differ, only match if you are highly confident and explain why.\n- If you are uncertain, set confidence below 0.85 and explain why.\n- Always provide a clear, concise reason for your decision, mentioning any edge cases (partial payment, duplicate, ambiguous, currency/format mismatch, etc.) if relevant.\n\n**Confidence Scoring System:**\n- Use the full range from 0 (no match) to 1 (perfect match).\n- 0.95–1.0: Nearly certain match (all key fields align, only minor differences).\n- 0.85–0.94: Strong match, but with some uncertainty (e.g., minor field differences, plausible but not perfect).\n- 0.7–0.84: Possible match, but notable uncertainty (e.g., partial payment, ambiguous description, or multiple plausible candidates).\n- 0.5–0.69: Weak match, only some fields align, or possible duplicate/ambiguous.\n- 0.2–0.49: Very weak match, unlikely but not impossible.\n- 0–0.19: No meaningful match.\n- Justify the confidence score in your reason.\n\n- Output ONLY a single JSON array, one object per File B candidate, in the same order as below. Do not include any commentary, markdown, or explanation outside the JSON.\n\nFile A:\n${fileAString}\n\nFile B candidates:\n${candidatesString}`;

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent([prompt]);
  const content = result.response.text();
  try {
    // Try to parse the first JSON array in the response
    const match = content.match(/\[[\s\S]*?\]/);
    const arr = match ? JSON.parse(match[0]) : JSON.parse(content);
    return arr.map((obj: any) => ({
      file_b_index: obj.file_b_index,
      match: !!obj.match,
      confidence: typeof obj.confidence === 'number' ? obj.confidence : 0,
      reason: obj.reason || 'No reason provided',
    }));
  } catch (err) {
    console.error('Failed to parse Gemini batch response:', content);
    // Fallback: return empty array
    return [];
  }
}

// Enhanced reconciliation
export async function reconcile(
  dataA: Record<string, any>[],
  dataB: Record<string, any>[]
) {
  const matches: any[] = [];
  const unmatchedA: Record<string, any>[] = [];
  const unmatchedB: Record<string, any>[] = [];
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const llmCandidates: any[] = [];

  // Normalize all dates in both files
  const normA = dataA.map(normalizeDatesInObject);
  const normB = dataB.map(normalizeDatesInObject);

  // Only 1-to-1 matching, but batch LLM calls per File A row
  for (let i = 0; i < normA.length; i++) {
    if (usedA.has(i)) continue;
    const a = normA[i];
    const dateA = a['Date'];
    const amountA = getRowAmount(a);
    const candidates = normB
      .map((b, idx) => ({ b, idx }))
      .filter(({ b, idx }) =>
        !usedB.has(idx) &&
        b['Date'] &&
        datesAreClose(dateA, b['Date'], 7) &&
        amountsAreClose(amountA, getRowAmount(b), 500)
      );
    if (candidates.length === 0) continue;
    // Batch LLM call for this File A row
    console.log(`[LLM BATCH] FileA row ${i} with ${candidates.length} FileB candidates`);
    const batchResults = await geminiBatchMatchRow(a, candidates);
    // Add all LLM candidate results for explainability
    for (let j = 0; j < batchResults.length; j++) {
      const { file_b_index, match, confidence, reason } = batchResults[j];
      llmCandidates.push({
        file_a_entry: a,
        file_b_entry: normB[file_b_index],
        confidence_score: parseFloat(confidence.toFixed(2)),
        match_reason: reason,
        file_a_index: i,
        file_b_index,
      });
    }
    // Find best match above threshold
    let bestIdx = -1;
    let bestConfidence = 0;
    let bestReason = '';
    for (const res of batchResults) {
      if (res.confidence > bestConfidence && res.match) {
        bestConfidence = res.confidence;
        bestIdx = res.file_b_index;
        bestReason = res.reason;
      }
    }
    if (bestIdx !== -1 && bestConfidence >= LLM_MATCH_THRESHOLD) {
      matches.push({
        type: '1-to-1',
        file_a_entry: a,
        file_b_entry: normB[bestIdx],
        confidence_score: parseFloat(bestConfidence.toFixed(2)),
        match_reason: bestReason,
      });
      usedA.add(i);
      usedB.add(bestIdx);
    }
  }

  // Unmatched
  for (let i = 0; i < normA.length; i++) {
    if (!usedA.has(i) && !unmatchedA.includes(normA[i])) unmatchedA.push(normA[i]);
  }
  for (let j = 0; j < normB.length; j++) {
    if (!usedB.has(j) && !unmatchedB.includes(normB[j])) unmatchedB.push(normB[j]);
  }

  return {
    matches,
    unmatched_file_a_entries: unmatchedA,
    unmatched_file_b_entries: unmatchedB,
    llm_candidates: llmCandidates
  };
}

// Route setup
router.post(
  '/reconcile',
  upload.fields([
    { name: 'fileA', maxCount: 1 },
    { name: 'fileB', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]>;
      const fileA = files.fileA?.[0];
      const fileB = files.fileB?.[0];

      if (!fileA || !fileB) {
        res.status(400).json({ error: 'Both fileA and fileB are required.' });
        return;
      }

      const dataA = parseFile(fileA.buffer, fileA.originalname);
      const dataB = parseFile(fileB.buffer, fileB.originalname);

      // Warn if too many LLM calls for free tier
      if (dataA.length > 15 || dataB.length > 15) {
        res.status(400).json({ error: 'Too many rows for Gemini free tier. Please upload smaller files.' });
        return;
      }

      const result = await reconcile(dataA, dataB);
      res.json(result);
    } catch (error: any) {
      console.error('Reconciliation error:', error);
      res.status(500).json({ error: (error && error.message) ? String(error.message) : 'Internal Server Error' });
    }
  }
);

export default router;

export { parseFile, parseFile as parseBuffer, geminiBatchMatchRow };