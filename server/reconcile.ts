import express, { Request, Response } from 'express';
import multer from 'multer';
import { parse as csvParse } from 'csv-parse';
import xlsx from 'xlsx';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

type Transaction = Record<string, any>;

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

function matchTransactions(
  a: Transaction[],
  b: Transaction[]
): {
  matched: Transaction[];
  unmatchedA: Transaction[];
  unmatchedB: Transaction[];
  matchesMeta: { confidence: number; reason: string }[];
} {
  // Simple matching: by exact stringified row
  const bSet = new Set(b.map(row => JSON.stringify(row)));
  const aSet = new Set(a.map(row => JSON.stringify(row)));

  const matched: Transaction[] = [];
  const matchesMeta: { confidence: number; reason: string }[] = [];
  const unmatchedA: Transaction[] = [];
  const unmatchedB: Transaction[] = [];

  for (const row of a) {
    const str = JSON.stringify(row);
    if (bSet.has(str)) {
      matched.push(row);
      matchesMeta.push({ confidence: 1, reason: 'Exact match' });
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

router.post(
  '/reconcile',
  upload.fields([
    { name: 'fileA', maxCount: 1 },
    { name: 'fileB', maxCount: 1 },
  ]),
  (req: Request, res: Response): void => {
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
      const { matched, unmatchedA, unmatchedB, matchesMeta } = matchTransactions(dataA, dataB);
      res.json({
        matched_transactions: matched,
        unmatched_transactions_fileA: unmatchedA,
        unmatched_transactions_fileB: unmatchedB,
        match_confidence: matchesMeta,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }
);

export default router;
