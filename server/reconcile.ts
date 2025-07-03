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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
 * Force normalization of all 'Date' fields
 */
function forceNormalizeDateField(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(row => {
    const newRow = { ...row };
    for (const key of Object.keys(newRow)) {
      if (key.trim().toLowerCase() === 'date') {
        newRow[key] = normalizeDateValue(newRow[key]);
      }
    }
    return newRow;
  });
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

/**
 * Use Gemini to compare two rows
 */
async function geminiMatchRows(
  a: Record<string, any>,
  b: Record<string, any>
): Promise<{ confidence: number; reason: string }> {
  const currencyA = getRowCurrency(a);
  const currencyB = getRowCurrency(b);
  const amountA = getRowAmount(a);
  const amountB = getRowAmount(b);
  const dateA = a['Date'];
  const dateB = b['Date'];

  let notes = [];
  if (currencyA && currencyB && currencyA !== currencyB) {
    notes.push(`Currency mismatch: File A = ${currencyA}, File B = ${currencyB}`);
  }
  if (dateA && dateB && dateA !== dateB) {
    notes.push(`Date difference: File A = ${dateA}, File B = ${dateB}`);
  }
  if (amountA && amountB && String(amountA) !== String(amountB)) {
    notes.push(`Amount difference: File A = ${amountA}, File B = ${amountB}`);
  }

  const notesText = notes.length > 0 ? `\nNOTES:\n${notes.join('\n')}` : '';

  const prompt = `You are a financial reconciliation assistant.\n\nCompare the following two financial transactions and decide if they represent the same real-world event, even if:\n- Descriptions differ semantically (e.g., 'Invoice #123 paid' vs 'Payment for Inv123').\n- Amounts are in different formats or currencies.\n- Dates are off by a few days (e.g., due to posting delays).\n\nInstructions:\n- Ignore superficial differences (punctuation, case, whitespace, synonyms, abbreviations, etc.).\n- If currencies differ, only match if you are highly confident and explain why.\n- If dates are off by a few days, consider posting delays.\n- If amounts are close but not exact, consider rounding or format issues.\n- If you are uncertain, set confidence below 0.85 and explain why.\n- Always provide a clear, human-readable reason for your decision.\n- Output ONLY a single JSON object, with keys: match (true/false), confidence (0–1), reason (brief). Do not include any commentary, markdown, or explanation outside the JSON.\n${notesText}\n\nTransaction A:\n${prettyPrint(a)}\n\nTransaction B:\n${prettyPrint(b)}`;

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent([prompt]);
  const content = result.response.text();

  try {
    return parseGeminiResponse(content);
  } catch (err) {
    console.error('Failed to parse Gemini response:', content);
    // Try to extract the first JSON object using regex
    const match = content.match(/{[\s\S]*}/);
    if (match) {
      try {
        return parseGeminiResponse(match[0]);
      } catch (err2) {
        // Still failed
      }
    }
    // Final fallback
    return { confidence: 0, reason: 'Failed to parse Gemini response' };
  }
}

function parseGeminiResponse(content: string): { confidence: number; reason: string } {
  const json = JSON.parse(content);
  let reason = json.reason || 'No reason provided';
  return {
    confidence: typeof json.confidence === 'number' ? json.confidence : 0,
    reason
  };
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

  // Only 1-to-1 matching
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
        datesAreClose(dateA, b['Date'], 3) &&
        amountsAreClose(amountA, getRowAmount(b), 100)
      );
    let best = null;
    let bestConfidence = 0;
    let bestReason = '';
    let bestIdx = -1;
    for (const { b, idx } of candidates) {
      console.log('[LLM MATCH] Comparing FileA row', i, 'with FileB row', idx);
      console.log('FileA entry:', JSON.stringify(a, null, 2));
      console.log('FileB entry:', JSON.stringify(b, null, 2));
      const { confidence, reason } = await geminiMatchRows(a, b);
      llmCandidates.push({
        file_a_entry: a,
        file_b_entry: b,
        confidence_score: parseFloat(confidence.toFixed(2)),
        match_reason: reason,
        file_a_index: i,
        file_b_index: idx
      });
      if (confidence > bestConfidence) {
        best = b;
        bestConfidence = confidence;
        bestReason = reason;
        bestIdx = idx;
      }
    }
    if (best && bestConfidence >= LLM_MATCH_THRESHOLD) {
      matches.push({
        type: '1-to-1',
        file_a_entry: a,
        file_b_entry: best,
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

export { parseFile, parseFile as parseBuffer, geminiMatchRows };