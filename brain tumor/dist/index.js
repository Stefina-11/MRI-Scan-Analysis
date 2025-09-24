"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const tumor_analyzer_1 = require("./models/tumor-analyzer");
const app = express();
const port = 3000;
// Initialize TumorAnalyzer
const tumorAnalyzer = new tumor_analyzer_1.TumorAnalyzer();
tumorAnalyzer.loadModels(); // Load models asynchronously
// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({ storage });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.post('/upload-mri', upload.single('mriScan'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No MRI scan file uploaded.');
    }
    try {
        const imageBuffer = fs.readFileSync(req.file.path);
        const analysisResult = await tumorAnalyzer.analyzeMriScan(imageBuffer);
        // Clean up the uploaded file after analysis
        fs.unlinkSync(req.file.path);
        res.status(200).json({
            message: 'MRI scan uploaded and analyzed successfully',
            filename: req.file.filename,
            analysis: analysisResult,
        });
    }
    catch (error) {
        console.error('Error during MRI scan analysis:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path); // Clean up on error
        }
        res.status(500).send('Error processing MRI scan.');
    }
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log("Brain tumor analysis system initialized.");
});
