import express = require('express');
import { Request, Response } from 'express';
import multer = require('multer');
import { FileFilterCallback } from 'multer';
import path = require('path');
import fs = require('fs');
import { TumorAnalyzer, TumorAnalysisResult } from './models/tumor-analyzer';
import { ReportGenerator } from './utils/report-generator';

const app = express();
const port = 3002;

const reportGenerator = new ReportGenerator();

const tumorAnalyzer = new TumorAnalyzer();
tumorAnalyzer.loadModels();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowedTypes = /dicom|nifti|jpeg|jpg|png|gif/;
  const mimeType = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimeType && extname) {
    return cb(null, true);
  }
  cb(new Error('Invalid file type. Only DICOM, NIfTI, JPG, JPEG, PNG, GIF files are allowed.'));
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/upload-mri', upload.single('mriScan'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No MRI scan file uploaded.' });
  }

  try {
    const filePath = req.file.path;
    const imageBuffer = fs.readFileSync(filePath);
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let fileType: string;

    if (fileExtension === '.dcm') {
      fileType = 'dicom';
    } else if (fileExtension === '.nii' || fileExtension === '.gz') {
      fileType = 'nifti';
    } else {
      fileType = 'image';
    }

    const analysisResult: TumorAnalysisResult = await tumorAnalyzer.analyzeMriScan(imageBuffer, fileType);

    res.status(200).json({
      message: 'MRI scan uploaded and analyzed successfully',
      filename: req.file.filename,
      filePath: `/uploads/${path.basename(filePath)}`,
      analysis: analysisResult,
    });
  } catch (error: any) {
    console.error('Error during MRI scan analysis:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    if (error.message && error.message.includes('Invalid file type')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error processing MRI scan.' });
  }
});

app.post('/generate-report', async (req: Request, res: Response) => {
  const { analysisResult, imagePath } = req.body;

  if (!analysisResult || !imagePath) {
    return res.status(400).json({ message: 'Missing analysis results or image path for report generation.' });
  }

  try {
    const reportUrl = await reportGenerator.generatePdfReport(analysisResult, imagePath);
    res.status(200).json({
      message: 'Report generated successfully',
      reportUrl: reportUrl,
      reportId: analysisResult.reportId,
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Error generating report.' });
  }
});

app.post('/api/patient/login', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Patient login simulated successfully.', token: 'dummy-token' });
});

app.post('/api/patient/register', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Patient registration simulated successfully.' });
});

app.get('/api/patient/:patientId/reports', (req: Request, res: Response) => {
  const { patientId } = req.params;
  res.status(200).json({ message: `Simulating reports for patient ${patientId}`, reports: [] });
});

app.post('/api/edit-segmentation', (req: Request, res: Response) => {
  const { scanId, editedMask } = req.body;
  res.status(200).json({ message: `Segmentation for scan ${scanId} edited and saved.` });
});

app.post('/api/alerts', (req: Request, res: Response) => {
  const { type, message, recipient } = req.body;
  console.log(`ALERT: ${type} - ${message} to ${recipient}`);
  res.status(200).json({ message: 'Alert simulated successfully.' });
});

app.post('/api/hospital-integration', (req: Request, res: Response) => {
  const { data, system } = req.body;
  console.log(`Integrating data with ${system}:`, data);
  res.status(200).json({ message: `Integration with ${system} simulated successfully.` });
});

app.post('/api/analyze-batch', upload.array('mriScans'), async (req: Request, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    return res.status(400).json({ message: 'No MRI scan files uploaded for batch processing.' });
  }

  const results: TumorAnalysisResult[] = [];
  for (const file of (req.files as Express.Multer.File[])) {
    try {
      const filePath = file.path;
      const imageBuffer = fs.readFileSync(filePath);
      const fileExtension = path.extname(file.originalname).toLowerCase();
      let fileType: string;

      if (fileExtension === '.dcm') {
        fileType = 'dicom';
      } else if (fileExtension === '.nii' || fileExtension === '.gz') {
        fileType = 'nifti';
      } else {
        fileType = 'image';
      }
      const analysisResult: TumorAnalysisResult = await tumorAnalyzer.analyzeMriScan(imageBuffer, fileType);
      results.push(analysisResult);
    } catch (error) {
      console.error('Error during batch analysis for file:', file.originalname, error);
      results.push({ tumorDetected: false, medicalSummary: `Error processing ${file.originalname}` });
    } finally {
      fs.unlinkSync(file.path);
    }
  }
  res.status(200).json({ message: 'Batch analysis completed.', results });
});


app.use('/uploads', express.static(uploadsDir));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log("Brain tumor analysis system initialized.");
});
