const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── System prompts per chat mode ─────────────────────────────────────────
const SYSTEM_PROMPTS = {
  general: `You are a knowledgeable and empathetic health assistant. Provide accurate, evidence-based health information in a clear and understandable way. Always recommend consulting a healthcare professional for medical decisions. Format responses with markdown for clarity.`,

  symptoms: `You are an expert medical symptom analyzer. When the user describes symptoms:
1. Acknowledge the symptoms empathetically
2. List possible conditions associated with those symptoms (ranked by likelihood)
3. Ask clarifying questions if needed (duration, severity, associated symptoms)
4. Provide immediate home care advice if appropriate
5. Clearly indicate when symptoms require URGENT medical attention (use 🔴 URGENT)
6. Recommend appropriate specialist to consult
Always remind them this is not a diagnosis — professional evaluation is essential.`,

  medicines: `You are a pharmaceutical information expert. For medication queries:
1. Explain what the medicine is used for
2. Provide standard dosage information (always clarify it varies by patient)
3. List common side effects and serious adverse effects
4. Mention important drug interactions to be aware of
5. Contraindications (who should NOT take it)
6. Storage and usage tips
7. Generic alternatives if available
⚠️ Always emphasize: medications must be prescribed by a doctor. Do not self-medicate.`,

  diet: `You are a certified nutritionist and dietitian AI. Create personalized diet plans and provide nutrition advice:
1. Assess the user's needs (age, health condition, goals)
2. Recommend specific foods to eat and avoid
3. Provide sample meal plans if requested
4. Explain nutritional benefits
5. Account for health conditions (diabetes, hypertension, etc.)
6. Suggest healthy alternatives to unhealthy foods
Always recommend consulting a registered dietitian for personalized plans.`,

  exercise: `You are a certified fitness trainer and exercise physiologist. Provide exercise guidance:
1. Create structured workout plans based on fitness level
2. Explain proper form and technique
3. Suggest exercise modifications for health conditions or injuries
4. Provide warm-up and cool-down routines
5. Track progress metrics
6. Recovery and rest day advice
Always recommend medical clearance before starting new exercise regimens.`,

  hospitals: `You are a healthcare navigation assistant. Help users find appropriate medical care:
1. Understand their medical need/condition
2. Recommend the appropriate type of specialist
3. Explain what different specialists do
4. Guide on when to go to ER vs urgent care vs regular appointment
5. Advise on what to bring to appointments
6. Help prepare questions for doctors
For actual hospital locations, they should check the "Nearby Hospitals" tab in the app.`,

  mental_health: `You are a compassionate mental health information assistant. Provide:
1. Information about mental health conditions
2. Coping strategies and self-care techniques
3. Mindfulness and relaxation exercises
4. When and how to seek professional help
5. Crisis resources when needed
6. Destigmatizing mental health discussions
⚠️ If the user expresses thoughts of self-harm or suicide, IMMEDIATELY provide crisis hotline numbers and urge them to seek help.
Crisis: iCall India: 9152987821 | Vandrevala Foundation: 1860-2662-345`,
};

// ─── Chat completion ───────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { message, mode = 'general', history = [] } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;

    // Build conversation history (last 10 messages for context)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 1500,
      temperature: 0.5,
    });

    const reply = completion.choices[0].message.content;
    res.json({ success: true, reply, mode });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Chat failed. Check GROQ_API_KEY.' });
  }
});

// ─── Generate AI Diet Plan ────────────────────────────────────────────────
router.post('/diet-plan', async (req, res) => {
  try {
    const { age, weight, height, goal, conditions, preferences } = req.body;

    const prompt = `Create a detailed 7-day diet plan for:
- Age: ${age || 'not specified'}
- Weight: ${weight || 'not specified'} kg
- Height: ${height || 'not specified'} cm  
- Goal: ${goal || 'maintain health'}
- Health Conditions: ${conditions || 'none'}
- Dietary Preferences: ${preferences || 'no restrictions'}

Provide:
## Daily Caloric Target
## 7-Day Meal Plan (Breakfast, Lunch, Dinner, Snacks for each day)
## Foods to Eat More Of
## Foods to Avoid
## Hydration Guide
## Supplement Recommendations (if any)
## Weekly Shopping List

Use Indian food options primarily. Make it practical and affordable.`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.diet },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3000,
      temperature: 0.4,
    });

    res.json({ success: true, plan: completion.choices[0].message.content });
  } catch (error) {
    console.error('Diet plan error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Generate AI Exercise Plan ────────────────────────────────────────────
router.post('/exercise-plan', async (req, res) => {
  try {
    const { age, fitnessLevel, goal, conditions, availableTime, equipment } = req.body;

    const prompt = `Create a detailed 4-week progressive exercise plan for:
- Age: ${age || 'not specified'}
- Fitness Level: ${fitnessLevel || 'beginner'}
- Goal: ${goal || 'general fitness'}
- Health Conditions/Injuries: ${conditions || 'none'}
- Available Time per Day: ${availableTime || '30 minutes'}
- Equipment Available: ${equipment || 'no equipment (bodyweight only)'}

Provide:
## Weekly Structure
## Week 1-4 Progressive Workouts (with sets, reps, duration)
## Warm-up Routine (5-10 min)
## Cool-down & Stretching Routine
## Rest Day Activities
## Progress Tracking Metrics
## Safety Guidelines

Be specific with exercise names, sets, reps, and rest periods.`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.exercise },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3000,
      temperature: 0.4,
    });

    res.json({ success: true, plan: completion.choices[0].message.content });
  } catch (error) {
    console.error('Exercise plan error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
