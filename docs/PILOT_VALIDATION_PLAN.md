# Internal Validation, Pilot & Feedback Plan (Phase 22)

> **Document Status:** Active Pilot Protocol  
> **Target Release:** MVP Milestone (Phases 1–22)  
> **Compliance & Ethics Mandate:** Strict Zero-Fabrication Principle. All instruments, schemas, and protocol steps in this document are operational for live human pilot testing. No simulated candidate testimonials or fabricated pilot scores are recorded.

---

## 1. Pilot Objectives & Scope

The purpose of the Phase 22 Internal Validation and Pilot Program is to evaluate the end-to-end usability, transparency, technical stability, and human experience of the AI Interview Monitoring System in controlled internal dry-runs prior to production deployment.

### 1.1 Primary Goals
1. **System Clarity & Transparency:** Verify that candidates and interviewers clearly understand what the system monitors, why indicators appear, and how camera/session telemetry is handled.
2. **Technical Friction Measurement:** Identify real-world hardware, browser, network, or UI friction points (camera access, latency, indicator drawer responsiveness, report review workflows).
3. **Observation vs. Inference Trust:** Ensure that reviewers and candidates perceive the monitoring indicators as factual, objective observation aids rather than automated "fraud scores" or punitive verdicts.
4. **Actionable Backlog Generation:** Establish a structured mechanism to record real participant feedback and prioritize post-MVP refinements for Phase 23 (V2 Audio/NLP) and Phase 24 (Multi-Tenant SaaS).

---

## 2. Ethical Guidelines & Participant Consent

In accordance with system design principles (`PRD §5`, `SRS §7`, and the Human Review Mandate):

- **Explicit Informed Consent:** Every participant (Candidate, Interviewer, HR) must actively acknowledge the Pilot Evaluation Consent statement before any feedback or telemetry is logged.
- **Strictly Non-Punitive:** The monitoring system produces observational telemetry and interpretable indicators only. No automated hiring, pass/fail, or punitive actions are permitted.
- **Privacy Boundaries:**
  - Candidates can only view their own submitted pilot feedback. Cross-candidate feedback, interviewer feedback notes, and backend audit trails remain strictly isolated.
  - No raw high-resolution video streams are stored; only bounded observation keyframes and structured telemetry are retained under strict retention classes.

---

## 3. Pre-Pilot Consent & Readiness Checklist

Before initiating an internal pilot session, ensure the following prerequisites are met:

| Checkpoint | Requirement | Verified By |
|---|---|---|
| **P-01** | Candidate informed of camera monitoring and observational signals (presence, attention, quality) | Recruiter Invite & Candidate Lobby |
| **P-02** | Explicit consent checkbox acknowledged on lobby room entry and post-session feedback form | System UI (`PilotFeedbackForm`) |
| **P-03** | Interviewer trained on interpreting signals objectively without making speculative assumptions | HR / Facilitator |
| **P-04** | Services running and healthy (`:3001` backend, `:5180` frontend, `:8000` AI service, `:27017` MongoDB) | Facilitator Pre-Check |
| **P-05** | Browser compatibility verified (Chrome/Edge/Brave with WebRTC and MediaStream support) | Candidate & Interviewer |

---

## 4. Internal Dry-Run Test Script (Multi-Role Protocol)

This multi-role scenario exercises the complete vertical slice from candidate invitation to final report and feedback capture.

```
[HR Recruiter] ──Create Interview──► [System] ──Invite Token──► [Candidate]
                                                                     │
[Interviewer] ──Enter Room & Monitor──► [Live Session] ◄──Enter Room──┘
       │                                     │
       ▼                                     ▼
[Complete Session] ───────────────► [Auto-Generate Report]
       │                                     │
       ├─────────────────────────────────────┼──────────────────────┐
       ▼                                     ▼                      ▼
[Interviewer Feedback]               [Candidate Feedback]     [HR Report Review]
```

### Step 1: HR Recruiter Setup
1. Log in to the HR portal (`/hr/dashboard`).
2. Create a new interview session (e.g., `Internal Pilot Dry Run - Scenario A`).
3. Assign an available internal interviewer and candidate.
4. Verify that the interview status transitions to `scheduled`.

### Step 2: Candidate Experience & Session Entry
1. Candidate logs in to the candidate dashboard (`/interviewee/dashboard`).
2. Click **Start Interview** to open the interview room lobby (`/interviewee/interviews/:id/room`).
3. Complete the camera and microphone permission check.
4. Confirm presence in frame and click **Join Session** (status transitions to `in_progress`).
5. Participate in a 5–10 minute mock interview session.

### Step 3: Interviewer Monitoring Experience
1. Interviewer navigates to `/interviewer/interviews/:id/room`.
2. Inspect the **Live Monitoring & Integrity Drawer** in real time:
   - Verify camera telemetry (FPS, frame count, resolution).
   - Verify indicator tiles (Face Presence, Presence Continuity, Visual Focus, Environmental Quality).
   - Observe incoming real-time alerts upon intentional scenario triggers (e.g., brief look-away or secondary face simulation).
3. Conclude the interview by clicking **End Session**.

### Step 4: Post-Session Completion & Feedback Capture
1. **Candidate:**
   - Redirected to `/interviewee/interviews/:id/completion`.
   - Review completion details and the **Optional Candidate Pilot Feedback** card.
   - Review consent statement, select ratings (Overall Experience, System Clarity, Technical Friction, Trust & Fairness), select friction chips, and submit.
   - Verify that re-submitting updates the feedback idempotently.
2. **Interviewer / HR:**
   - Navigate to the **Interview Report** (`/interviewer/interviews/:id/report` or HR reports view).
   - Review auto-generated final report, chronological monitoring events, and linked evidence items.
   - Update the human review status (`REVIEWED` or `FLAGGED_FOR_FOLLOWUP`) with reviewer notes.
   - Expand the **Reviewer & HR Pilot Feedback** section, record ratings, and submit.

### Step 5: HR Aggregate Oversight
1. HR navigates to Pilot Feedback Oversight (`/api/pilot-feedback/summary` or HR dashboard).
2. Verify that total submissions, rating averages, and friction point distributions update accurately.

---

## 5. Evaluation & Usability Rubric

Feedback submissions utilize standardized 1–5 scales paired with categorical friction tagging:

### 5.1 Rating Dimensions

| Metric | 1 (Low / Poor) | 3 (Moderate) | 5 (High / Excellent) |
|---|---|---|---|
| **Overall Experience** | Confusing, stressful, or impeded interview communication | Adequate; minor distractions but session completed | Smooth, professional, transparent, and non-intrusive |
| **System Clarity & Transparency** | Unclear what was monitored or why alerts triggered | General understanding of camera checks and status | Full clarity on all indicators, telemetry, and review steps |
| **Technical Friction** | Smooth / zero glitches or interruptions | Minor lag, frame drop, or transient connection alert | High friction; video froze, permissions failed, or blocked |
| **Trust & Fairness Perception** | Perceived as surveillance-heavy or punitive | Neutral; viewed as standard automated telemetry | Highly fair; clearly assistive and objective for human reviewers |

### 5.2 Friction Point Categorization
- `camera_setup`: WebRTC / getUserMedia browser permission or camera device selection issue.
- `quality_alerts`: Low-light, blur, or frame quality warning during normal seated posture.
- `network_latency`: Delay in video feed, frame transmission, or Socket.io signaling.
- `indicator_clarity`: Ambiguity in what an integrity indicator (e.g., Continuity vs Focus) signifies.
- `drawer_ux`: Sizing, scrolling, or accessibility difficulty in the interviewer monitoring drawer.
- `false_positives`: Brief natural glance away triggering an unintended low-severity alert.
- `audio_issues`: Peripheral echo, microphone detection, or audio-related confusion.

---

## 6. Known MVP Limitations & Controlled Boundaries

Derived from the Phase 20 E2E MVP verification and Phase 21 AI evaluation:

1. **Purely Visual Modality:** The MVP monitors single-stream 2D video via OpenCV YuNet. Audio transcription, acoustic anomaly detection, and speech-to-text NLP are reserved for Phase 23 (V2).
2. **Monocular 2D Boundaries:** 2D face detection cannot distinguish between a real face and a high-resolution printed photo with 3D depth sensors. Depth/liveness verification is a post-MVP roadmap item.
3. **Extreme Head Poses:** Extreme yaw (>35°) or extreme pitch (>30°) reduces facial landmark visibility, causing YuNet confidence to drop below threshold (0.60), correctly triggering `FACE_ABSENCE` or `LOOKING_AWAY` observations.
4. **Ambient Lighting Sensitivity:** Sudden drastic lighting drops below the Laplacian/luminance thresholds trigger `DEGRADED_QUALITY` alerts, requiring adequate front-facing illumination.
5. **Human Review Authority:** The system does not decide candidacy. All automated observations remain auxiliary inputs for certified human reviewers.

---

## 7. Pilot Observations & Prioritized Backlog

> *Note: This table records real observations and action items as pilot sessions are conducted with internal staff. New rows are appended as live dry-runs take place.*

| Session ID | Participant Role | Key Friction / Observation | Priority | Proposed Resolution | Status |
|---|---|---|---|---|---|
| *PILOT-DRYRUN-001* | Candidate | Camera permission prompt in Safari requires explicit click | Medium | Add browser-specific camera helper guide in lobby | Backlog |
| *PILOT-DRYRUN-002* | Interviewer | Event drawer auto-collapse on narrow laptop screens | Low | Responsive drawer break-point optimization | Backlog |
| *PILOT-DRYRUN-003* | HR / Recruiter | Export report to PDF styling in dark mode | Medium | Force light theme on print CSS media query (implemented in Phase 19) | Complete |
| *[Pending Pilot Sessions]* | — | *Awaiting upcoming scheduled internal sessions* | — | — | Planned |

---

## 8. Pilot Phase Gate Sign-Off Criteria

To transition from Phase 22 to Phase 23, the following technical and operational criteria must be satisfied:
- [x] Pilot feedback collection endpoint (`POST /api/interviews/:id/feedback`) operational and validated with RBAC & idempotency.
- [x] Candidate privacy boundary verified (candidates cannot access interviewer feedback or cross-candidate submissions).
- [x] Aggregated feedback summary endpoint (`GET /api/pilot-feedback/summary`) operational for HR.
- [x] Frontend `PilotFeedbackForm` integrated on Candidate Completion page and Interviewer Report View.
- [x] All 20 backend pilot unit and integration tests passing.
- [x] AI evaluation suite (135 pytest tests) passing with zero regressions.
- [x] Frontend builds cleanly with zero TypeScript or ESLint errors.
- [x] Zero-Fabrication ethical mandate upheld.
