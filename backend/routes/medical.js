const express = require('express');
const router = express.Router();
const multer = require('multer');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

let pdfParse;
try { pdfParse = require('pdf-parse'); } catch (e) { pdfParse = null; }

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Multer storage ────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ─── MEDICAL REPORT ANALYSIS ──────────────────────────────────────────────
router.post('/analyze-report', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const isPDF = req.file.mimetype === 'application/pdf';
    let analysis;

    if (isPDF) {
      // Extract text from PDF
      if (!pdfParse) throw new Error('pdf-parse not installed. Run: npm install pdf-parse');
      const buffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(buffer);

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are an expert medical AI analyst. Analyze the medical report text provided and give a comprehensive, structured response. Format your response with clear sections using markdown. Always add a disclaimer that this is AI analysis and not a substitute for professional medical advice.`,
          },
          {
            role: 'user',
            content: `Analyze this medical report and provide:

## 1. Report Summary
Brief overview of what kind of report this is.

## 2. Key Findings
List all significant findings from the report.

## 3. Normal vs Abnormal Values
Clearly identify any values outside normal ranges and explain their significance.

## 4. Clinical Significance
Explain what these findings mean for the patient's health.

## 5. Recommendations
Specific next steps, lifestyle changes, or follow-up tests needed.

## 6. Specialist Consultation
Which type of specialist the patient should consult and why.

## 7. Urgency Level
Rate urgency: 🟢 Routine | 🟡 Soon (within weeks) | 🔴 Urgent (immediate attention needed)

Medical Report Content:
${data.text.substring(0, 8000)}`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      analysis = completion.choices[0].message.content;
    } else {
      // Vision analysis for image files
      const imageBuffer = fs.readFileSync(req.file.path);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = req.file.mimetype;

      const completion = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
              {
                type: 'text',
                text: `You are an expert medical AI analyst. Analyze this medical report/scan image and provide a comprehensive structured analysis:

## 1. Report Type & Overview
Identify what type of medical scan/report this is (X-ray, blood test, MRI, CT scan, ECG, etc.)

## 2. Key Findings
List all significant observations visible in the report/scan.

## 3. Normal vs Abnormal Areas
Identify any areas, values, or patterns that appear abnormal and explain their significance.

## 4. Clinical Significance
Explain what these findings mean in plain language for the patient.

## 5. Recommendations
Specific next steps, treatments, or follow-up investigations needed.

## 6. Specialist Consultation
Which type of specialist to consult (cardiologist, radiologist, hematologist, etc.) and why.

## 7. Urgency Level
🟢 Routine | 🟡 Soon (within 1-2 weeks) | 🔴 Urgent (see doctor immediately)

⚠️ *Disclaimer: This is AI-assisted analysis for informational purposes only and does not replace professional medical diagnosis.*`,
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      analysis = completion.choices[0].message.content;
    }

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({ success: true, analysis, fileType: isPDF ? 'pdf' : 'image' });
  } catch (error) {
    console.error('Medical analysis error:', error);
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ error: error.message || 'Analysis failed. Check your GROQ_API_KEY.' });
  }
});

// ─── SKIN ANALYSIS ────────────────────────────────────────────────────────
router.post('/analyze-skin', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype;

    const completion = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
            {
              type: 'text',
              text: `You are an expert dermatology AI assistant. Analyze this skin image and provide a comprehensive assessment:

## 1. Condition Assessment
Describe what you observe on the skin in detail.

## 2. Possible Diagnoses
List the most likely skin conditions (ranked by probability):
- Primary diagnosis (most likely)
- Differential diagnoses (other possibilities)

## 3. Severity Level
Rate severity: 🟢 Mild | 🟡 Moderate | 🔴 Severe

## 4. Affected Area Analysis
- Location and distribution pattern
- Size estimation (if determinable)
- Color, texture, and morphology description

## 5. Possible Causes & Triggers
Common causes for the observed condition (allergens, infections, genetics, etc.)

## 6. Skincare Recommendations
- Immediate care steps
- Products to use / avoid
- Dietary considerations
- Lifestyle modifications

## 7. Treatment Options
- Home remedies that may help
- OTC medications that may be appropriate
- Prescription medications a dermatologist may consider

## 8. When to See a Doctor Immediately
Red flag signs to watch for.

## 9. Prevention Tips
How to prevent recurrence or worsening.

⚠️ *Disclaimer: This is AI-assisted analysis for informational purposes only. Please consult a licensed dermatologist for proper diagnosis and treatment.*`,
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const analysis = completion.choices[0].message.content;
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Skin analysis error:', error);
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ error: error.message || 'Skin analysis failed.' });
  }
});

module.exports = router;
