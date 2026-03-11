# SYSTEM PROMPT & ARCHITECTURE: STRUCTURED INTERVIEW FLOW
# VERSION: 1.0 (Pipeline -> Extension -> Evaluation)
# AUTHOR: Capgemini AI Engineering Team

---

## 1. SYSTEM OVERVIEW & WORKFLOW

This document defines the highly structured "Question-by-Question" interview flow. The goal is to tightly connect the Interview Preparation Phase (Dashboard) with the Execution Phase (Chrome Extension) and Evaluation Phase (AI Co-Pilot).

### The 3-Step Lifecycle:
1. **Pipeline & Preparation (Dashboard):** The Interviewer (TA/Manager) reviews the candidate's CV and the Job Description in the Dashboard. They use an AI Assistant to generate a list of specific, tailored questions. These questions are saved in the Database.
2. **Execution (Chrome Extension):** During the meeting, the Extension fetches these saved questions. The UI acts as a checklist. The Interviewer clicks a specific question to "activate" it. All transcribed audio during this active state is mapped directly to this question.
3. **Evaluation (Backend AI):** The AI receives a structured transcript where audio chunks are strictly mapped to `[Question_ID]`. It evaluates the candidate's exact answer exclusively against the specific question asked, plus a general evaluation for unprompted conversation (`Other`).

---

## 2. DATABASE SCHEMA REQUIREMENTS

To support this flow, the database must track pre-generated interview questions and link them to the interview session.

### `interviewQuestions` Table
- `id`: UUID (PK)
- `interviewId`: UUID (FK to interviews table)
- `questionText`: String (The exact question to ask)
- `dimension`: Enum ('technical', 'behavioral', 'communication')
- `expectedKeywords`: String[] (What the AI should listen for in the answer)
- `status`: Enum ('pending', 'asked', 'skipped')
- `order`: Integer (Sequence of the questions)

---

## 3. CHROME EXTENSION UI/UX FLOW

The Side Panel in the Chrome Extension transforms from a passive observer into an Active Interview Guide.

**State 1: Synced & Ready**
- Extension detects the Meet URL.
- Fetches all `interviewQuestions` for this `interviewId`.
- Displays a prominent `▶ Start Intelligence` button.

**State 2: Active Recording (The Checklist UI)**
- The UI lists all questions vertically as interactive cards.
- At the very top, a persistent button: `🔵 General Chat (Other)`.
- When the Interviewer clicks `Question 1`:
  - The Question 1 card highlights (turns Green).
  - The Extension sends a WebSocket payload: `{ type: 'MARKER', action: 'START_QUESTION', questionId: '123' }`.
  - A small "`recording answer...`" animation plays under Question 1.
- When the Interviewer clicks `Question 2`:
  - Q1 is automatically marked as `Done` (turns Gray/Checked).
  - The Extension sends a new marker: `{ type: 'MARKER', action: 'START_QUESTION', questionId: '456' }`.
- If the conversation goes off-topic, the Interviewer clicks `🔵 General Chat (Other)`:
  - The Extension sends: `{ type: 'MARKER', action: 'START_OTHER' }`.

---

## 4. THE LLM EVALUATION PROMPT (BACKEND AI)

When the Extension sends the `[END_INTERVIEW]` signal, the Backend constructs a specific payload for the LLM.

### INPUT TO LLM:
```json
{
  "interviewContext": {
    "role": "manager",
    "jobTitle": "Senior Frontend Engineer"
  },
  "structuredTranscript": [
    {
      "context": "General Chat (Other)",
      "dialogue": [
        "Interviewer: Hello, how are you today?",
        "Candidate: I am doing great, excited to be here."
      ]
    },
    {
      "context": "Question 1: Explain your experience with Docker Orchestration and Kubernetes.",
      "expectedKeywords": ["pods", "clusters", "kubectl", "scaling"],
      "dialogue": [
        "Interviewer: So, tell me about your experience with Docker.",
        "Candidate: Yes, I have used Docker extensively for containerizing microservices...",
        "Interviewer: And what about Kubernetes?",
        "Candidate: I deploy them using Helm charts onto EKS clusters."
      ]
    },
    {
      "context": "Question 2: How do you handle conflict with a difficult client?",
      "expectedKeywords": ["empathy", "communication", "escalation", "listening"],
      "dialogue": [
        "Interviewer: How do you handle a client who changes requirements mid-sprint?",
        "Candidate: I usually try to listen to their needs first, then explain the impact on the timeline..."
      ]
    }
  ]
}
```

### SYSTEM INSTRUCTION FOR LLM:
You are the Capgemini AI Interview Evaluator. You are receiving a strictly structured transcript divided into `[Segments]`. Each Segment maps either to a specific Interview Question or to `General Chat (Other)`.

**Your Task:**
1. **Analyze Each Segment Individually:** Evaluate the `Candidate`'s dialogue inside that specific segment against the Question's `expectedKeywords` and standard industry correctness.
2. **Score Each Question (0-100):** Assign an accuracy and depth score based ONLY on what was said in that segment.
3. **Analyze 'Other' Segment:** Extract any red flags, culture fit indicators, or general communication skills demonstrated outside of the formal questions.
4. **Output Final Report:** Generate a JSON report summarizing the scores per question.

### EXPECTED JSON OUTPUT FORMAT:
```json
{
  "overallScore": 82,
  "questionEvaluations": [
    {
      "questionText": "Explain your experience with Docker Orchestration and Kubernetes.",
      "dimension": "technical",
      "score": 85,
      "aiFeedback": "Strong answer. Candidate accurately mentioned EKS and Helm. Demonstrated practical knowledge of deployment.",
      "missingKeywords": ["scaling"]
    },
    {
      "questionText": "How do you handle conflict with a difficult client?",
      "dimension": "behavioral",
      "score": 75,
      "aiFeedback": "Good baseline response focusing on listening, but lacked a specific framework (like STAR) or mention of escalation protocols.",
      "missingKeywords": ["escalation"]
    }
  ],
  "generalObservations": {
    "communicationClarity": "Excellent. Speech was clear and confident.",
    "culturalFit": "Positive attitude shown during the General Chat phase.",
    "redFlags": []
  },
  "finalRecommendation": "Advance to next round."
}
```

---

## 5. WHY THIS RULES THE UX & DEV EXPERIENCE

1. **Zero Hallucination Risk:** By forcing the AI to look at a small, isolated chunk of text for `Question 1`, it cannot accidentally mix up answers or hallucinate context from `Question 5`.
2. **Empowered Interviewers:** The TA/Manager gets a literal checklist. They don't have to scramble for notes. They just click and talk.
3. **Seamless Fallback:** If the interviewer forgets to click a question and just talks, it naturally falls into `General Chat (Other)`. The AI will still analyze it under `generalObservations`.
4. **Data Goldmine:** Capgemini now has structured data comparing *every candidate's exact response* to *the exact same generated question*, making unbiased side-by-side comparison trivial.
