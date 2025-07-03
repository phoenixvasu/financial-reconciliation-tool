import express, { Request, Response } from 'express';
import multer from 'multer';
import { parse as csvParse } from 'csv-parse';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const AI_SIMILARITY_THRESHOLD = 0.85;

if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY is not set. AI matching will not work.');
}

type Transaction = Record<string, any>;

type MatchMeta = {
  confidence: number;
  reason: string;
  method: 'Exact' | 'AI';
};

function parseFile(buffer: Buffer, originalname: string): Transaction[] {
  if (originalname.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    // Use csv-parse sync API if available, otherwise fallback to a simple split (for demo)
    // If csv-parse/sync is not available, you may need to install it or use a different parser
    try {
      // @ts-ignore
      return require('csv-parse/sync').parse(text, { columns: true, skip_empty_lines: true });
    } catch {
      // Fallback: naive CSV parsing (not for production)
      const [header, ...rows] = text.split(/\r?\n/).filter(Boolean);
      const keys = header.split(',');
      return rows.map(row => {
        const values = row.split(',');
        return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
      });
    }
  } else if (
    originalname.endsWith('.xlsx') ||
    originalname.endsWith('.xls')
  ) {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
  } else {
    throw new Error('Unsupported file type: ' + originalname);
  }
}

function stringifyTransaction(tx: Transaction): string {
  // You can customize this to include only relevant fields
  return Object.values(tx).join(' ');
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (normA * normB);
}

async function getEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not set');
  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    {
      input: text,
      model: OPENAI_EMBEDDING_MODEL,
    },
    {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.data[0].embedding;
}

function matchTransactions(
  a: Transaction[],
  b: Transaction[]
): {
  matched: Transaction[];
  unmatchedA: Transaction[];
  unmatchedB: Transaction[];
  matchesMeta: MatchMeta[];
} {
  // Simple matching: by exact stringified row
  const bSet = new Set(b.map(row => JSON.stringify(row)));
  const aSet = new Set(a.map(row => JSON.stringify(row)));

  const matched: Transaction[] = [];
  const matchesMeta: MatchMeta[] = [];
  const unmatchedA: Transaction[] = [];
  const unmatchedB: Transaction[] = [];

  for (const row of a) {
    const str = JSON.stringify(row);
    if (bSet.has(str)) {
      matched.push(row);
      matchesMeta.push({ confidence: 1, reason: 'Exact match', method: 'Exact' });
    } else {
      unmatchedA.push(row);
    }
  }
  for (const row of b) {
    const str = JSON.stringify(row);
    if (!aSet.has(str)) {
      unmatchedB.push(row);
    }
  }
  return { matched, unmatchedA, unmatchedB, matchesMeta };
}

async function aiMatchTransactions(
  unmatchedA: Transaction[],
  unmatchedB: Transaction[],
  alreadyMatched: Set<string>,
): Promise<{
  aiMatched: Transaction[];
  aiMatchedB: Set<number>;
  aiMatchesMeta: MatchMeta[];
}> {
  if (!OPENAI_API_KEY || unmatchedA.length === 0 || unmatchedB.length === 0) {
    return { aiMatched: [], aiMatchedB: new Set(), aiMatchesMeta: [] };
  }
  const aiMatched: Transaction[] = [];
  const aiMatchedB = new Set<number>();
  const aiMatchesMeta: MatchMeta[] = [];

  // Precompute all embeddings for unmatchedB
  const bEmbeddings: (number[] | null)[] = await Promise.all(
    unmatchedB.map(async (tx) => {
      try {
        return await getEmbedding(stringifyTransaction(tx));
      } catch {
        return null;
      }
    })
  );

  for (let i = 0; i < unmatchedA.length; ++i) {
    const txA = unmatchedA[i];
    let bestScore = -1;
    let bestIdx = -1;
    let bestReason = '';
    let aEmbedding: number[] | null = null;
    try {
      aEmbedding = await getEmbedding(stringifyTransaction(txA));
    } catch {
      continue;
    }
    for (let j = 0; j < unmatchedB.length; ++j) {
      if (aiMatchedB.has(j)) continue;
      const bEmbedding = bEmbeddings[j];
      if (!bEmbedding) continue;
      const score = cosineSimilarity(aEmbedding!, bEmbedding);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = j;
        bestReason = `AI match, cosine similarity: ${score.toFixed(3)}`;
      }
    }
    if (bestScore >= AI_SIMILARITY_THRESHOLD && bestIdx !== -1) {
      aiMatched.push(txA);
      aiMatchedB.add(bestIdx);
      aiMatchesMeta.push({ confidence: bestScore, reason: bestReason, method: 'AI' });
      alreadyMatched.add(JSON.stringify(txA));
    }
  }
  return { aiMatched, aiMatchedB, aiMatchesMeta };
}

router.post(
  '/reconcile',
  upload.fields([
    { name: 'fileA', maxCount: 1 },
    { name: 'fileB', maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]>;
      if (!files.fileA?.[0] || !files.fileB?.[0]) {
        res.status(400).json({ message: 'Both files are required.' });
        return;
      }
      const fileA = files.fileA[0];
      const fileB = files.fileB[0];
      const dataA = parseFile(fileA.buffer, fileA.originalname);
      const dataB = parseFile(fileB.buffer, fileB.originalname);
      // Step 1: Exact match
      const { matched, unmatchedA, unmatchedB, matchesMeta } = matchTransactions(dataA, dataB);
      // Step 2: AI-powered match
      const alreadyMatched = new Set(matched.map(row => JSON.stringify(row)));
      const { aiMatched, aiMatchedB, aiMatchesMeta } = await aiMatchTransactions(unmatchedA, unmatchedB, alreadyMatched);
      // Remove AI-matched from unmatched lists
      const finalUnmatchedA = unmatchedA.filter(tx => !alreadyMatched.has(JSON.stringify(tx)));
      const finalUnmatchedB = unmatchedB.filter((_, idx) => !aiMatchedB.has(idx));
      res.json({
        matched_transactions: [...matched, ...aiMatched],
        unmatched_transactions_fileA: finalUnmatchedA,
        unmatched_transactions_fileB: finalUnmatchedB,
        match_confidence: [...matchesMeta, ...aiMatchesMeta],
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }
);

export default router;
