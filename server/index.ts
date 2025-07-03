import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { parseBuffer, reconcile } from './reconcile';

dotenv.config();
const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

app.post('/', upload.fields([{ name: 'fileA' }, { name: 'fileB' }]), async (req, res): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]>;
  const fileA = files['fileA']?.[0];
  const fileB = files['fileB']?.[0];
  if (!fileA || !fileB) {
    res.status(400).json({ message: 'Both files are required.' });
    return;
  }
  try {
    const dataA = parseBuffer(fileA.buffer, fileA.originalname);
    const dataB = parseBuffer(fileB.buffer, fileB.originalname);
    const result = await reconcile(dataA, dataB);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
});

export default app;

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
