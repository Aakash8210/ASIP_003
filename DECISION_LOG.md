# DECISION_LOG.md

# AI Interview Monitoring and Detection System

Record material project decisions here. Do not silently reverse a
decision. If a decision changes, add a new record explaining why.

## Status Legend

- **APPROVED** — established by approved documentation/project direction
- **PROVISIONAL** — selected for implementation but may be refined with
  evidence
- **TBD** — intentionally unresolved
- **SUPERSEDED** — replaced by a later decision

## Approved Baseline Decisions

### DEC-001 — Product Framing

**Status:** APPROVED  
The system is an AI Interview Monitoring / Interview Integrity Platform
that produces observable signals, structured events, evidence/context
and integrity-risk indicators for human review. It is not a definitive
automated cheating/deception judge.  
**Basis:** PRD, SRS, AI/ML Specification.

### DEC-002 — Evidence + Risk Indicators + Human Review

**Status:** APPROVED  
Core principle: evidence + confidence + context + human review. No
individual signal is conclusive proof of cheating, deception or
intent.  
**Basis:** SRS, AI/ML Specification, UI/UX Specification.

### DEC-003 — Modular Application Architecture

**Status:** APPROVED  
Use logical separation of frontend, application backend, AI analysis,
persistence, real-time communication and monitoring/event processing.
Avoid premature microservices.  
**Basis:** System Architecture, Development Plan.

### DEC-004 — Technology Direction

**Status:** APPROVED  
React + Vite + Tailwind CSS; Node.js + Express.js; Python + FastAPI;
MongoDB; WebRTC; Socket.io; open-source/local AI/CV for MVP where
appropriate. Exact library/model versions must be verified during
implementation.  
**Basis:** Architecture, UI/UX, Development Plan, Infrastructure Plan.

### DEC-005 — Interview Session as Central Business Context

**Status:** APPROVED  
The interview session connects participants, monitoring events, AI
analysis, alerts, evidence and reports.  
**Basis:** Architecture and Database Specification.

### DEC-006 — Event-Oriented Monitoring Data

**Status:** APPROVED  
Represent monitoring output primarily as timestamped structured events
rather than permanently storing every raw frame. Events may reference
evidence.  
**Basis:** Architecture and Database Specification.

### DEC-007 — Confidence and Severity Are Separate

**Status:** APPROVED  
Model/rule confidence and product severity are separate concepts and
must not be conflated.  
**Basis:** Database Specification, UI/UX Specification, Testing Plan.

### DEC-008 — Local-First / ₹0 Initial Development

**Status:** APPROVED  
Initial development/validation targets ₹0 recurring infrastructure spend
using local hardware, open-source software and suitable free tiers. This
does not imply permanent free production SaaS.  
**Basis:** Zero-Cost Infrastructure Plan and Roadmap.

### DEC-009 — MVP Before Advanced Multimodal AI

**Status:** APPROVED  
Complete and evaluate webcam/CV/event/alert/evidence MVP before audio,
speech-to-text, NLP and multimodal fusion.  
**Basis:** Development Plan, AI/ML Specification, Roadmap.

### DEC-010 — No Fabricated AI Performance

**Status:** APPROVED  
Precision, recall, F1, false positives, false negatives and latency must
be measured using controlled data. No result may be claimed before
measurement.  
**Basis:** SRS and Testing & Evaluation Plan.

### DEC-011 — Backend Authorization Is the Security Boundary

**Status:** APPROVED  
UI visibility is not a security control. Backend authorization enforces
permissions.  
**Basis:** UI/UX Specification and security requirements.

### DEC-012 — Data Minimization

**Status:** APPROVED  
Do not persist unnecessary raw media. Do not embed large raw media blobs
in ordinary event documents unless an approved architecture decision
requires it.  
**Basis:** Database Specification and Architecture.

### DEC-013 — Phase-Gated Development

**Status:** APPROVED  
Implement through 24 dependency-driven phases. Verify each phase before
progression. Critical unresolved failures block progression.  
**Basis:** Development Plan and implementation strategy.

## Provisional Implementation Decisions

### DEC-014 — Persistent Project-Control Files

**Status:** PROVISIONAL  
Maintain `CLAUDE.md`, `IMPLEMENTATION_PLAN.md`, `PROJECT_STATUS.md` and
`DECISION_LOG.md` as persistent engineering context.

### DEC-015 — Minimum-Code Strategy

**Status:** PROVISIONAL  
Implement the smallest production-quality solution satisfying the
current requirement. Avoid speculative abstractions, unused dependencies
and future-phase functionality.

### DEC-016 — Phase-Scoped Documentation Reading

**Status:** PROVISIONAL  
During implementation, read documentation relevant to the current phase
instead of repeatedly loading unrelated future-stage material. The
complete documentation remains authoritative.

## Explicitly TBD

### TBD-001 — Production cloud provider

Production provider/topology remains flexible.

### TBD-002 — Production concurrency target

Must be benchmarked rather than assumed.

### TBD-003 — Production latency target

Must be measured and validated.

### TBD-004 — Production data/evidence retention period

The requirement exists; final duration is not established.

### TBD-005 — Production backup/RPO/RTO

To be defined when production requirements justify them.

### TBD-006 — Final production evidence/object storage

Not fixed by the current baseline.

### TBD-007 — Final billing model/pricing

Deferred until validation.

### TBD-008 — ATS integration priorities

To be based on validated product/customer requirements.

### TBD-009 — Advanced multimodal model selection

Requires technical evaluation and validation.

### TBD-010 — Final supported observable-behaviour taxonomy

Only documented, feasible, ethically appropriate and evaluated signals
should be enabled.

## Decision Change Procedure

When a new material decision is required: 1. identify the
problem/requirement; 2. inspect approved documentation; 3. inspect
current implementation; 4. identify alternatives if useful; 5. choose
only when justified; 6. record the decision; 7. record affected
phases/components; 8. update affected technical documents; 9. add
tests/acceptance criteria where needed.

## Phase 1 Decisions

### DEC-017 — Repository Initialization & Baseline Structure

**Status:** APPROVED  
**Date:** 2026-09-26  
**Phase:** Phase 1 — Requirements Freeze & Repository

**Context:**
Project documentation complete, but no Git repository, no implementation directories, no project scaffolding files.

**Decision:**
Initialize Git repository; create standard directory structure (frontend/, backend/, ai-service/, tests/, scripts/); create .gitignore, README.md, docker-compose.yml with local development services (MongoDB, backend, AI service, frontend).

**Alternatives:**
- Defer Git initialization to later
- Use different directory structure
- Use different container orchestration

**Rationale:**
- Git is required for phase-gated milestones per CLAUDE.md
- Directory structure matches approved architecture (DEC-003, DEC-004)
- docker-compose.yml enables zero-cost local development per Zero-Cost Infrastructure Plan (DEC-008)
- README.md provides project traceability

**Impact:**
Establishes the repository baseline for all subsequent phases.

**Verification:**
- `git status` shows initialized repository
- All expected directories exist
- .gitignore, README.md, docker-compose.yml present and valid

**Related requirements:**
CLAUDE.md §12, IMPLEMENTATION_PLAN.md Phase 1, DEC-003, DEC-004, DEC-008

---


## DEC-XXX — [Decision title]

Status:
Date:
Phase:

Context:

Decision:

Alternatives:

Rationale:

Impact:

Verification:

Related requirements:

Supersedes:
```

## DEC — Phase 2 Stabilization Decisions

**Status:** APPROVED (by implementation)
- Single `BrowserRouter` in `main.tsx`; `App.tsx` contains only `<Routes>`.
- Component API extended (`danger`, `checked`, `onSelect`) to match page usage — pages kept as the usage contract source.
- Data-driven table renamed to `DataTable`; compositional `Table*` primitives added to `ui/Table.tsx`.
- ESLint 9 flat config adopted (`eslint.config.js`); unused-vars demoted to warn (legacy demo pages retain illustrative code).
- Build pipeline: `tsc -b && vite build` to guarantee type checking in production builds.
- Frontend remains mock-data only; no Phase 4–6 functionality implemented.

## DEC — Sign-out and Layout Fixes (User-reported, 2026-10-03)

**Status:** APPROVED (by implementation, user-requested bug fix)

Context:
- User reported: unusable dashboard layout, non-functional logout button after sign-in, and sign-in/sign-up form not centered.
- Headless-browser verification showed the HR/interviewer/interviewee dashboard logout worked in current code, but the public homepage avatar-menu "Sign out" was a no-op (empty handler in `PublicLayout.tsx`), which is the path the user actually hit.

Decision:
- Wired the public homepage user-menu "Sign out" to `logout()` + `navigate('/', { replace: true })` in `PublicLayout.tsx`.
- Replaced the misused shared `Dropdown` component (internal `isOpen` caused a double-click requirement) in `PublicLayout` with plain menu markup matching the dashboard layouts; added click-outside close.
- Made logout deterministic in `HRLayout`, `InterviewerLayout`, `IntervieweeLayout`: explicit `navigate('/signin', { replace: true })` after `logout()` via a shared `handleLogout`.
- Hardened `logout` in `useAuth.tsx`: clears `user`/`token` from both localStorage and sessionStorage.
- Fixed invalid nested `<button>` DOM (button-in-button) in table action menus (`hr/DashboardPage.tsx`, `interviewer/ReportsPage.tsx`) by using styled span triggers.
- Sign-in/sign-up pages remain fully centered (verified); no split layout used.

Alternatives:
- Controlled `open`/`onToggle` props on the shared Dropdown component (rejected: broader API change than needed).

Rationale:
- Minimal, deterministic fixes; single-click sign-out everywhere; no ghost sessions after reload.

Impact:
- Frontend-only change; no backend/AI-service impact; no data model change.

Verification:
- 13/13 headless Chrome tests passed (homepage sign-out, sidebar/avatar-menu sign-out per role, redirect-after-logout, centered auth cards, no DOM nesting warnings).
- `npm run lint`: 0 errors. `npm run build`: passes.

Related requirements:
- UI/UX Specification v1.0 (navigation, auth pages); PRD v1.0 (authentication).

Supersedes:
- None.

## DEC-018 — AI Service Foundation Scope; CV Dependencies Deferred to Phase 13

**Status:** APPROVED (by implementation, resolving an IMPLEMENTATION_PLAN ambiguity)
**Date:** 2026-10-03
**Phase:** Phase 4 — Python/FastAPI AI Service

**Context:**
`IMPLEMENTATION_PLAN.md` Phase 4 work line mentions "MVP CV dependencies", but the
same plan's Phase 13 ("Computer Vision") depends on Phases 4 **and** 12, and the
Development Plan (M07) defines the Phase 4 step as "CV service foundation: Create
FastAPI AI-service structure and monitoring interfaces" — structure and interfaces,
not CV libraries. AI/ML Specification §30 lists the CV framework (OpenCV) and
face/landmark processing (MediaPipe) as Baseline decisions for the CV work itself,
with "exact implementation TBD". Installing heavy CV dependencies before any CV
code exists would violate the Minimum-Code Strategy (DEC-015) and add unused
dependencies.

**Decision:**
Phase 4 delivers the development foundation only: FastAPI app factory, environment-
driven configuration, `/health` + `/ready` + `/` endpoints, JSON error handling,
OpenAPI docs, tests, and the documented `app/services/analysis/` extension point.
No CV framework (opencv-python, mediapipe, numpy-for-CV) is installed in Phase 4;
tests assert these are absent. CV dependencies are installed in Phase 13 when the
CV engine is actually implemented and validated.

**Alternatives:**
- Install opencv-python/mediapipe in Phase 4 (rejected: unused dependencies, no CV
  code until Phase 13, conflicts with DEC-015 and test-enforced negative scope).

**Rationale:**
- Development Plan M07 governs the foundation step: structure + monitoring interfaces.
- IMPLEMENTATION_PLAN Phase 13 explicitly depends on Phase 12 (WebRTC/media) for CV,
  proving CV work is not expected inside Phase 4.
- AI/ML Spec §30 marks exact CV implementation as TBD pending validation.

**Impact:**
- `requirements.txt` contains only foundation dependencies; Phase 13 will extend it.
- Phase 4 gate ("AI service runs locally and health check passes") is unaffected.

**Verification:**
- `tests/test_app.py::TestNoExternalDependencies` asserts `cv2`/`mediapipe` (and
  `pymongo`/`motor`) are not importable — 24/24 tests pass.

**Related requirements:**
IMPLEMENTATION_PLAN.md Phase 4/13, Development Plan M07, AI/ML Specification §30,
DEC-004, DEC-009, DEC-015.

---


## DEC-019 — AI Service Runtime Boundary and Port

**Status:** APPROVED (by implementation)
**Date:** 2026-10-03
**Phase:** Phase 4 — Python/FastAPI AI Service

**Context:**
The AI service must be separated from the Node.js application backend (System
Architecture v1.0; AI/ML Specification §29). A concrete local runtime shape was
needed for Phase 4 verification.

**Decision:**
The AI service binds `0.0.0.0:8000` locally (configurable via `AI_SERVICE_HOST`/
`AI_SERVICE_PORT`). Browsers must not call this service directly; the Node.js
application backend is the future internal-HTTP caller (proposed flow
`Application -> AI Service`). Health endpoints report process status only and never
claim AI/model/detector readiness, per the AI integrity rules (DEC-001, DEC-002).

**Alternatives:**
- Same-process embedding in Express (rejected: violates approved separation).
- Direct browser access (rejected: bypasses the primary authorization boundary).

**Rationale:**
- Matches System Architecture v1.0 deployment shape and AI/ML Spec §29.
- Keeps the Phase 4 gate verifiable with a simple local health check.

**Impact:**
- Port 8000 reserved for this service in local development; docker-compose maps it.
- Phase 11+/13+ integration must go through the backend, not the browser.

**Verification:**
- Cold-start uvicorn + `curl http://localhost:8000/health` returned
  `{"status":"ok", ...}` (2026-10-03); 24/24 tests pass.

**Related requirements:**
System Architecture v1.0 (§ authorization boundary, deployment shape), AI/ML
Specification §29, CLAUDE.md §4/§8, DEC-001, DEC-002, DEC-003.

---


## DEC-020 — httpx Client Package Provisioning in the Development Environment

**Status:** PROVISIONAL (environment-verified)
**Date:** 2026-10-03
**Phase:** Phase 4 — Python/FastAPI AI Service

**Context:**
FastAPI's `TestClient` requires an HTTP client library. This development
environment's package index provides the official next-generation httpx client
(maintained by Tom Christie / Pydantic Services Inc., BSD-3-Clause) under the
package name `httpx2` (with dependency `httpcore2`); the classic `httpx` name is
not resolvable here.

**Decision:**
Pin `httpx2==2.13.1` in `ai-service/requirements.txt` and verify the full
dependency set installs cleanly and the test suite passes against it. On a
standard PyPI environment where `httpx` resolves, `httpx` is the equivalent pin;
either name satisfies the TestClient requirement.

**Alternatives:**
- Force `httpx` install (rejected: not resolvable from this environment's index).
- Vendor the client (rejected: unnecessary).

**Rationale:**
- Same upstream maintainer/license as httpx; verified metadata and functionality.
- Requirements must reflect what actually installs and passes verification.

**Impact:**
- `requirements.txt` line 6 pins `httpx2==2.13.1`; verified 2026-10-03.
- If the project later moves to a standard PyPI index, replace with `httpx`.

**Verification:**
- `pip install -r requirements.txt` → all satisfied; 24/24 tests pass (2026-10-03).

**Related requirements:**
DEC-004 (exact library versions verified during implementation), CLAUDE.md §7
(anti-hallucination), CLAUDE.md §11.

---


## DEC-021 — Pinned Public Service URLs (User Hard Constraint)

**Status:** APPROVED (explicit user instruction; permanent)
**Date:** 2026-10-04
**Phase:** Cross-phase (Phases 2–3 runtime; all future phases)

**Context:**
The development environment is an e2b sandbox whose preview links map
`<port>-<sandbox-host>.e2b.app` to local ports. The user designated the
frontend preview link as the permanent public URL and instructed that it must
never change — "even if I say to do so" — and that frontend and backend must
remain working and visible at their links in the browser.

**Decision:**
- **Frontend public URL (permanent):** `https://5180-iteaxs65egwgp2h9q52q5.e2b.app/`
  → local port **5180**.
- **Backend public URL:** `https://3001-iteaxs65egwgp2h9q52q5.e2b.app/`
  → local port **3001**.
- **AI service:** internal port **8000** (backend-only caller; no pinned public
  URL required in the current phase).
- `strictPort: true` in both `frontend/vite.config.*` files: vite must fail
  loudly rather than silently serve on a different port/link.
- Backend CORS allows the e2b preview origin plus localhost origins (5173/5180)
  so browser API calls from the pinned frontend origin work from Phase 6 onward.
- The frontend dev-port change 5173 → 5180 (commit `9fe0da0`, 2026-10-03) is
  confirmed as intentional environment adaptation, not accidental drift.

**Alternatives:**
- Revert vite to port 5173 (rejected: breaks the user's designated link).
- Leave CORS localhost-only (rejected: browser calls from the e2b origin would
  be blocked from Phase 6 onward).

**Rationale:**
- The e2b preview link is the user's only browser access point; changing it
  severs visibility regardless of technical merit.
- `strictPort` enforces the constraint at the tool level (fail-fast over
  silent port drift).

**Impact:**
- Future phases must keep frontend on :5180 and backend on :3001 and must not
  repurpose the e2b preview origin.
- Deployment provider decisions (TBD-001) remain separate; the pinned URLs are
  a development-environment constraint, not the production topology.

**Verification:**
- Frontend e2b link → HTTP 200; backend e2b link → health OK (2026-10-04).
- CORS echo: `Access-Control-Allow-Origin: https://5180-iteaxs65egwgp2h9q52q5.e2b.app`.
- Single config-driven vite instance on 5180 (stray duplicate removed).

**Related requirements:**
User instruction (2026-10-04), System Architecture v1.0 (authorization
boundary), UI/UX Specification v1.0, DEC-003, DEC-011, DEC-019.

---


## DEC-022 — Phase 5 MongoDB Development Database, Driver and Connection Architecture

**Status:** APPROVED (by implementation)
**Date:** 2026-10-04
**Phase:** Phase 5 — MongoDB (persistence foundation)

**Context:**
Phase 5 requires MongoDB persistence in the Node/Express backend. This
environment has no Docker and no pre-installed MongoDB; the Zero-Cost
Infrastructure Plan prefers MongoDB Community Server locally where
practical, with Atlas Free as a prototype alternative when local MongoDB
is unavailable. The backend previously had no MongoDB dependency.

**Decision:**
- Development database: **MongoDB Community Server 8.0.4**, installed
  from the official Debian 12 tarball, data directory
  `/home/user/mongodb-data` (outside the repository), bound to
  `127.0.0.1:27017` only. No credentials required for the local
  localhost-only instance; production requires authenticated
  least-privilege credentials (TBD). Atlas Free was not used because a
  local server was available.
- Library: official **`mongodb` Node.js driver 6.21.0** (no ODM). The
  raw driver is the simplest maintainable integration for the current
  ESM/Express backend (DEC-004), avoids ODM schema-invention pressure,
  and keeps AI-analysis persistence generic and traceable.
- Connection architecture: `backend/src/config/database.js` with
  environment-driven `MONGODB_URI`/`MONGODB_DB_NAME`, sanitized
  logging (credentials redacted), graceful failure (connection failure
  never crashes the backend; `/health` still serves), idempotent
  reconnect, and graceful disconnect in the existing shutdown handler.
  Connection is non-blocking at startup so the canonical backend URL
  is never broken by database unavailability.

**Alternatives:**
- Mongoose ODM (rejected: adds schema/ODM abstractions the current
  phase does not need; conflicts with DEC-015).
- MongoDB Atlas Free (rejected for this environment: local server
  available; per Infrastructure Plan local-first preference).
- Blocking startup on MongoDB (rejected: would break the pinned
  canonical backend URL when MongoDB is unavailable).

**Rationale:**
- Local Community Server satisfies ₹0 infrastructure (DEC-008) and the
  local-first rule; sandbox has sudo and network access to the official
  tarball.
- The raw driver matches the Database Specification's identifier
  flexibility ("String/ObjectId") without imposing ODM idioms.

**Impact:**
- `backend/package.json` gains one runtime dependency (`mongodb`).
- Future phases use `requireDatabase()` from the persistence layer;
  `/ready` reports actual database connectivity.

**Verification:**
- Node driver ping → `{"ok":1}`; backend startup logs connected +
  19 indexes; `GET /ready` → 200; SIGTERM → graceful shutdown with
  MongoDB disconnect; unreachable-URI test returns null without crash.
- 43/43 backend tests pass.

**Related requirements:**
IMPLEMENTATION_PLAN.md Phase 5, Database Specification §19 (security),
CLAUDE.md §4/§8, DEC-004, DEC-008, DEC-015, DEC-021.

---


## DEC-023 — Phase 5 Persistence Model Conventions and TBD Discipline

**Status:** APPROVED (by implementation; resolves documented
ambiguities)
**Date:** 2026-10-04
**Phase:** Phase 5 — MongoDB (persistence foundation)

**Context:**
The Database Specification v1.0 is a baseline proposal; several enums,
identifier forms and lifecycle states are explicitly TBD/Proposed. The
SRS has not finalized the interview lifecycle states (§states "lifecycle
stages such as configured, active and completed" — examples only), while
Database Specification §8.1 proposes `draft → scheduled/invited → ready
→ in_progress → completed`. A documented conflict exists between the two
example vocabularies.

**Decision:**
- **Identifiers:** application-generated UUID strings stored as `_id`
  (Database Specification allows "String/ObjectId"; String chosen).
  Cross-references (`recruiter_id`, `candidate_id`, `interview_id`,
  `event_id`, `evidence_ids`, `analysis_id`, `recipient_user_id`) store
  these identifiers and are validated at the application layer
  (MongoDB has no enforced foreign keys): DB-VAL-001 (events require a
  valid interview session), DB-VAL-002 (timestamp required), DB-VAL-003
  (confidence type-checked numeric when provided; **no bounded range
  enforced** until a model defines one), DB-VAL-005 (evidence refs must
  resolve and belong to the same interview), DB-VAL-007 (report/event
  refs belong to the report's interview), DB-VAL-008 (created_at/
  updated_at generated by the data layer). DB-VAL-009 is deferred
  (applies to future recruiter review flows, Phases 17/18).
- **Interview status:** the Database Specification §8.1 proposed set
  (`draft, scheduled, invited, ready, in_progress, completed`) is
  enforced provisionally as the working set, defaulting to `draft`.
  No cancellation/expiry/error states were invented. The SRS-governed
  final list remains TBD; when the SRS finalizes states, the set must
  be reconciled (this record documents the conflict; the Database
  Specification's proposed vocabulary governs until then).
- **Roles:** `recruiter, candidate, interviewer, admin` — the SRS role
  table's recognized roles (Recruiter/HR, Candidate, Hiring Manager /
  Interviewer, System Administrator). Permissions are NOT enforced in
  Phase 5 (Phase 6 owns RBAC).
- **Open enums:** users.status, alerts.status, review_status, severity,
  event_type and source remain open strings — exact values are TBD
  (DB-TBD-001/002, UI Spec "exact severity scale TBD"). Documented
  defaults are applied when omitted (active / active / unreviewed).
  No closed-enum enforcement that would convert TBD into fixed values.
- **AI analysis / final reports:** stable baseline fields only; `output`
  and `integrity_indicators` are controlled structured objects without
  invented model-specific schemas (schemas TBD per AI/ML Spec).
- **Index strategy:** 19 documented baseline indexes created; six
  deferred (IDX-USR-002, IDX-REC-002, IDX-CAN-002, IDX-EVT-004,
  IDX-EVT-005, IDX-ALT-003) per the Database Specification's
  over-indexing caution. IDX-RPT-001 is unique (one current report per
  interview, per §14 and "Unique/Conditional").
- **Test strategy:** dedicated test database derived as
  `${MONGODB_DB_NAME}_test`; the suite refuses to run against a
  database not ending in `_test` and drops only that database
  (guarded destructive cleanup). Synthetic data only
  (`@example.local`, demo names).

**Alternatives:**
- Enforce closed enums for all status fields (rejected: documentation
  explicitly marks exact states TBD; converting TBD into fixed values
  is prohibited).
- Accept any status string including invented cancellation/expiry/error
  states (rejected: inventing unsupported lifecycle states).
- Non-unique IDX-RPT-001 (rejected: §14 documents one current report per
  interview; uniqueness enforces the documented invariant).

**Rationale:**
- Respects TBD discipline while preserving DB-VAL validation discipline.
- The lifecycle conflict is resolved by adopting the Database
  Specification's proposed vocabulary (the governing baseline for the
  data model) and recording that the SRS final list remains TBD.

**Impact:**
- `src/db/constants.js` documents open enums; `src/db/indexes.js`
  documents deferred indexes; when the SRS finalizes states/severity,
  only these modules need updating.

**Verification:**
- 43/43 tests pass, including: invalid interview_id rejected (DB-VAL-001),
  missing timestamp rejected (DB-VAL-002), non-numeric confidence
  rejected (DB-VAL-003), cross-interview evidence/event refs rejected
  (DB-VAL-005/007), lifecycle state outside the proposed set rejected,
  duplicate email/report rejected via unique indexes, 19 baseline
  indexes recognized, test database cleanup verified.

**Related requirements:**
Database Specification §8.1, §9.1, §15, §20 (DB-VAL-001..009), §25
(implementation guidance), SRS (role table, lifecycle examples), AI/ML
Specification §(severity placeholders TBD), CLAUDE.md §5/§6/§7,
DEC-005, DEC-006, DEC-007, DEC-012, DEC-015.

---


## DEC-024 — Phase 6 Authentication Mechanism: Stateless JWT (HS256)

**Status:** APPROVED (by implementation; SRS-SEC-010 defers the exact
mechanism to architecture/privacy decisions)
**Date:** 2026-10-04
**Phase:** Phase 6 — Authentication & RBAC

**Context:**
SRS-SEC-010 and System Architecture ("exact mechanism is SRS/TBD")
delegate the session/token mechanism to an implementation decision. The
Database Specification documents no dedicated sessions collection (the
nine Phase 5 collections are users, recruiters, candidates,
interview_sessions, monitoring_events, ai_analysis_results, alerts,
evidence, final_reports). CORS already allows the Authorization header
with credentials.

**Decision:**
Stateless JWT (HS256) via the standard `jsonwebtoken` library. Tokens
are transported in the `Authorization: Bearer` header, carry only `sub`
(user id), and are validated on every protected request; the current
user and role are re-resolved from the users collection (source of
truth; stale-role and deleted-account risk avoided). The signing secret
is server-side env only (`JWT_SECRET`; auth endpoints return 503 with a
non-secret message when unconfigured; `/health` unaffected). Token
expiry is env-driven (`JWT_EXPIRES_IN`, dev default `24h`,
provisional). Logout is client-side credential removal; the
`/api/auth/logout` endpoint validates the credential and returns
success. Server-side token revocation is NOT implemented and is
documented as a limitation (tokens remain valid until expiry).

**Alternatives:**
- MongoDB-backed server-side sessions (rejected: requires an
  undocumented sessions collection and cleanup machinery; more moving
  parts than the phase needs).
- Hand-rolled HMAC tokens (rejected: custom cryptographic algorithms are
  prohibited).
- Cookie sessions (rejected: same collection/infra cost as server
  sessions; Bearer header already allowed by the existing CORS config).

**Rationale:**
- Smallest architecture compatible with the approved documents (no new
  collection, no session store, standard library).
- Per-request user resolution keeps authorization correct without
  refresh/revocation machinery in this phase.

**Impact:**
- `backend/package.json` gains one runtime dependency (`jsonwebtoken`).
- Logout invalidates the client credential; tokens remain technically
  valid until expiry (documented limitation; tested).
- Production token policy (expiry, refresh, revocation) remains TBD
  (SRS-SEC-010).

**Verification:**
- 45/45 RBAC integration tests + 17/17 unit tests pass, including
  malformed/expired/wrong-secret/missing-secret token handling and the
  documented stateless logout limitation.
- Live verification: login for all three roles, protected/cross-role
  matrix, logout 200.

**Related requirements:**
SRS-SEC-010, SRS-FR-001/002, System Architecture (§Auth & Access, §
session security), Zero-Cost Infrastructure Plan §16, CLAUDE.md §8/§11,
DEC-004, DEC-011, DEC-015, DEC-021.

---


## DEC-025 — Phase 6 Password Hashing: Node Built-in scrypt

**Status:** APPROVED (by implementation)
**Date:** 2026-10-04
**Phase:** Phase 6 — Authentication & RBAC

**Context:**
SRS-SEC-003 requires standard secure password-storage practices. The
backend had no password-hashing dependency. Node's built-in
`node:crypto` provides scrypt (RFC 7914), an OWASP-recommended
password-based KDF, so an established mechanism exists without adding a
dependency.

**Decision:**
Use Node built-in `crypto.scrypt` with a per-user 16-byte random salt
and 64-byte derived key, verified with `timingSafeEqual`; stored as
`scrypt$<saltHex>$<hashHex>` in the existing users collection
(`password_hash`). Plaintext passwords are never persisted, logged,
returned or placed in frontend state; API responses use a safe
representation that never includes password_hash.

**Alternatives:**
- `bcrypt` dependency (rejected: not installed; scrypt from the standard
  library satisfies the requirement without a new dependency per the
  dependency-discipline rule).
- Argon2 native dependency (rejected: native build cost; not required by
  any approved document).
- Custom cryptographic hashing (rejected: prohibited).

**Rationale:**
- Standard, audited, NIST/OWASP-recognized KDF already available in the
  runtime; timing-safe comparison prevents timing attacks.
- Format prefix (`scrypt$`) allows future algorithm migration.

**Impact:**
- No new dependency; `backend/src/auth/password.js` is the single
  hashing module.
- Future rehashing/migration (e.g. to argon2id) can key off the stored
  scheme prefix.

**Verification:**
- 17/17 unit tests pass: hash format, round-trip verify, wrong-password
  rejection, unique per-hash salts, malformed-hash safety, no plaintext
  in output; integration tests assert the stored document contains only
  the scrypt hash and responses never contain password material.

**Related requirements:**
SRS-SEC-003, Database Specification §5/§19, CLAUDE.md §8/§10/§32,
DEC-012, DEC-015.

---


## DEC-026 — Phase 6 Role Model Mapping and Provisional Permission Boundary

**Status:** APPROVED (by implementation; resolves the SRS/UI-UX role
vocabulary difference; UX-TBD-002 remains open)
**Date:** 2026-10-04
**Phase:** Phase 6 — Authentication & RBAC

**Context:**
The UI/UX Specification §3 defines the product roles as HR,
Interviewer, Interviewee, while the backend storage roles established
in Phase 5 (DEC-023, from the SRS role table) are `recruiter,
candidate, interviewer, admin` — Phase 5 code, indexes and tests depend
on that vocabulary. UX-TBD-002 leaves the exact HR vs Interviewer
permission boundary open, and UX-TBD-001 leaves multi-role accounts
open.

**Decision:**
- Backend storage keeps the SRS vocabulary (DEC-023 unchanged):
  `recruiter, candidate, interviewer, admin`.
- The application-facing auth/RBAC layer uses the UI/UX product roles:
  `hr, interviewer, interviewee`, mapped in
  `backend/src/auth/roles.js` (recruiter→hr, candidate→interviewee,
  interviewer→interviewer, case-insensitive). Auth API responses and
  frontend role-aware routing use product roles; the backend role stays
  internal.
- `authorize(...productRoles)` middleware enforces the product role on
  the backend (DEC-011). No cross-role permissions are invented: each
  role may access only its own role-protected endpoints.
- `admin` has no product-role mapping in this phase (no admin product
  UI in the UI/UX specification): admin accounts can authenticate but
  are denied product-role endpoints (403). Self-registration as admin
  is not possible (registration accepts only the three product roles).
- One role per account (UX-TBD-001 treated as single-role); role
  selection (UX-AUTH-003) is not implemented — the backend-assigned
  role is the source of truth.

**Alternatives:**
- Rename backend roles to product roles (rejected: breaks Phase 5
  persistence code/tests and silently reverses DEC-023).
- Grant admin access to HR endpoints (rejected: invented cross-role
  permission; UX-TBD-002 open).

**Rationale:**
- Preserves the recorded Phase 5 baseline and SRS traceability while
  exposing the UI/UX product roles consistently at the application
  boundary.
- Phase 6 proves "authorized access works and unauthorized role access
  is blocked" without inventing a permission matrix.

**Impact:**
- Phase 7+ reuses `authorize()`/`toProductRole()`; if UX-TBD-002 or
  UX-TBD-001 are later decided, only `roles.js` and route guards change.

**Verification:**
- Full cross-role denial matrix verified by integration tests and live
  curl checks (403 vs 401 distinction; admin authenticate-but-denied).
- Role-mapping unit tests pass (17/17).

**Related requirements:**
UI/UX Specification §3/§7 (UX-AUTH-002/003, role-security rule,
UX-TBD-001/002), SRS role table, SRS-SEC-002, Database Specification §5,
CLAUDE.md §2/§3, DEC-011, DEC-023.

---


## DEC-027 — Phase 6 Registration Persistence, Auth UI Cleanup and Resource-Authorization Foundation

**Status:** APPROVED (by implementation)
**Date:** 2026-10-04
**Phase:** Phase 6 — Authentication & RBAC

**Context:**
Phase 6 requires authentication-related persistence using the existing
users collection. The existing Phase 2 signup flow collects a company
name for HR accounts (Database Spec documents the User → Recruiter
relationship and a recruiters collection), and the resource-ownership
test required by Phase 6 ("Interviewer cannot access unauthorized
interview") maps to the documented interview_sessions.recruiter_id /
candidate_id relationships. No interviewer-assignment relationship is
documented until Phase 8.

**Decision:**
- Registration persists to the users collection only (name, email,
  password_hash, role, status 'active', timestamps). Additionally, HR
  registration creates the linked recruiter profile (company preserved)
  and Interviewee registration the linked candidate profile, via the
  existing Phase 5 persistence functions — establishing the documented
  User → Recruiter/Candidate relationships. On unexpected profile
  failure the created user is removed (registration fails cleanly,
  no orphaned accounts). No second authentication collection.
- Registration validation: required fields, email format, duplicate
  email → 409, password ≥ 8 chars, only the three product roles.
  Duplicate-email rejection is intentional (task requirement) —
  registration is not enumeration-sensitive in the same way login is.
- Login uses identical safe messaging ("Invalid email or password") for
  unknown account and wrong password (no enumeration).
- Auth UI cleanups (existing product flow): sign-in role selector
  removed (backend role is the source of truth; UX-AUTH-002), OAuth
  provider buttons removed (UX-AUTH-001: only if implemented; OAuth out
  of scope), dead forgot-password link removed (password reset out of
  scope), sign-up demo buttons removed (duplicate registration would
  409), sign-in demo accounts retained and seeded with real hashed
  credentials via `scripts/seed-demo-users.js`, dead "Remember me"
  checkbox removed (token persistence is uniform).
- Resource-authorization foundation: `backend/src/auth/resourceAccess.js`
  (`authorizeInterviewAccess`) + `GET /api/rbac/interview/:id` — access
  to a specific interview uses ONLY the documented relationships
  (recruiter-owner via the user's recruiter profile, candidate-participant
  via the candidate profile). Interviewers are denied in this phase (no
  documented assignment relationship exists until Phase 8). The route
  is an explicit, isolated Phase 6 verification endpoint — not interview
  management (Phase 7).

**Alternatives:**
- Users-only persistence, drop the company field (rejected: silently
  discards user-provided data from the existing product flow).
- Allow interviewer access to specific interviews via an invented
  assignment field (rejected: interview assignment semantics are
  Phase 8).
- Keep OAuth/forgot-password mock UI (rejected: non-functional controls
  mislead users; UX-AUTH-001 constrains provider buttons).

**Rationale:**
- Reuses existing Phase 5 persistence exactly as documented; no new
  collections; no invented semantics; the ownership relationships the
  Phase 6 test requires are the documented ones.

**Impact:**
- Phase 7 builds interview management on `authorizeInterviewAccess()`;
  Phase 8 adds interviewer assignment and extends the access rules.
- Auth UI is now fully functional against the real backend.

**Verification:**
- Integration tests: linked profiles created; ownership matrix (owner
  200 / participant 200 / non-owner 403 / interviewer 403 / unknown 404
  / unauthenticated 401); registration validation and duplicate
  rejection; safe login messaging; live registration + /me verified.
- `scripts/seed-demo-users.js` run successfully (idempotent).
- Frontend build/lint pass; logout handlers deterministic.

**Related requirements:**
SRS-FR-001/002, SRS-SEC-001/002/003, Database Specification §5/§6/§7,
UI/UX Specification §7 (UX-AUTH-001/002), IMPLEMENTATION_PLAN.md Phase 6,
CLAUDE.md §5/§6/§8, DEC-011, DEC-012, DEC-015, DEC-023.

---


## DEC-028 — Phase 7 HR Product API Surface, Invitation Semantics and HR Screen Data Integrity

**Status:** APPROVED (by implementation)
**Date:** 2026-10-04
**Phase:** Phase 7 — HR Product

**Context:**
Phase 7 requires HR interview management (create/list/open/update, candidate
association, invitation) using the existing `interview_sessions` collection and
Phase 6 auth/RBAC. The SRS-FR-005 invitation requirement has no approved email
provider (Zero-Cost Infrastructure Plan defines an internal MVP boundary), the
UI/UX §8.1–8.2 dashboard/list concepts were previously rendered with Phase 2
mock data including fabricated integrity scores/alerts/match scores, and the
interview lifecycle remains the DEC-023 provisional set.

**Decision:**
- **API surface:** `POST/GET /api/interviews`, `GET/PATCH /api/interviews/:id`,
  `POST /api/interviews/:id/invite`, `GET /api/candidates` — all behind the
  existing `authenticate()` + `authorize('hr')` middleware; ownership on
  `:id` routes enforced with the Phase 6 `authorizeInterviewAccess()` resource
  authorization (recruiter profile ↔ `interview_sessions.recruiter_id`). No new
  collections, no schema changes, no new indexes, no new dependencies.
- **Creation fields:** exactly `title` (required), `candidateId` (required,
  validated to resolve to an existing candidate profile), `scheduledStartAt`
  (optional ISO date). Status defaults to `draft`. No invented company/job/
  scoring/monitoring-configuration fields (monitoring_configuration remains a
  documented-but-unexposed Phase 5 schema field).
- **Update surface:** `PATCH` allows only `title` and `scheduledStartAt`
  (including clearing the schedule with null). Candidate reassignment and
  direct status mutation are not permitted through the API in this phase —
  lifecycle changes happen only through documented workflow operations.
- **Invitation workflow:** internal state transition only —
  `draft → invited`, generating an opaque `invite_reference` (UUID) persisted
  on the interview session, exactly the Database Spec §8 field. No external
  email provider, no API keys, no delivery claims. Re-inviting an invited or
  non-draft interview is rejected (409). The candidate-facing consumption of
  the reference belongs to Phase 9.
- **Candidate association:** `GET /api/candidates` lists registered candidate
  profiles (safe user fields only). Candidates are not organization-scoped —
  no org fields are documented in the Database Specification (multi-tenancy
  is Phase 24).
- **HR screens:** Dashboard, Interviews list, Create Interview, Interview
  Details and Candidates pages are wired to the real APIs with loading/empty/
  error states. Fabricated Phase 2 mock metrics (integrity scores, alert
  counts, match scores, fake candidate pipelines) were removed from HR
  screens — Phase 7 forbids AI risk/fraud metrics, and mock data may not
  remain where a backend capability exists. Placeholder screens (Reports,
  Organization, Settings) remain clearly future states.

**Alternatives:**
- An `hr_interviews` collection (rejected: undocumented duplicate of
  interview_sessions).
- External email provider for invitations (rejected: no approved provider/API
  key; MVP boundary is the internal state workflow).
- PATCH accepting status/candidate changes (rejected: would silently resolve
  the DEC-023 TBD lifecycle semantics).
- Keeping the Phase 2 mock dashboard until later phases (rejected: the
  corresponding APIs now exist; fabricated metrics violate the Phase 7
  boundary and data-integrity rules).

**Rationale:**
- Smallest implementation satisfying SRS-FR-002/004/005, UI/UX §8, and the
  Database Spec §8 model while preserving DEC-023 TBD discipline and DEC-011
  backend authorization.

**Impact:**
- Phase 8 (interviewer assignment) and Phase 9 (candidate invitation
  consumption) build on these endpoints and the `invite_reference` field.
- `interviewStatus.ts` is the single frontend status-badge mapping for the
  provisional lifecycle set.

**Verification:**
- 145/145 backend tests (40 new Phase 7; full auth/role/ownership/validation/
  invitation matrix); frontend `tsc -b && vite build` + lint 0 errors; live
  role/ownership checks on the dev server.

**Related requirements:**
SRS-FR-002/004/005, Database Specification §8 (invite_reference, §8.1
lifecycle), UI/UX Specification §8.1–8.2 (UX-HR-001/002), Zero-Cost
Infrastructure Plan (internal MVP boundary), IMPLEMENTATION_PLAN.md Phase 7,
CLAUDE.md §2/§5/§6/§7, DEC-005, DEC-011, DEC-015, DEC-023, DEC-027.

---


## DEC-029 — Phase 8 Interviewer Assignment Schema, Interviewer Product Surface and Report Access Boundary

**Status:** APPROVED (schema decision approved by the user before implementation)
**Date:** 2026-10-04
**Phase:** Phase 8 — Interviewer Product

**Context:**
Phase 8 requires assigned-interview views and backend-enforced assigned-interview
authorization, but the approved Database Specification defines NO interviewer
field on interview_sessions (only recruiter_id/candidate_id connect
participants), the word "interviewer" does not appear in the Database
Specification, the SRS interviewer permissions are explicitly TBD, and no
interviewer profile collection is documented. Phase 6 resourceAccess.js had
already documented this gap. A schema change was therefore required and the
implementation stopped for approval per the phase-gate rules.

**Decision (approved):**
- **Assignment schema:** a single nullable scalar `interviewer_id` is added to
  `interview_sessions`, referencing `users._id` for a user with the
  `interviewer` backend role and `active` status. It mirrors the
  recruiter_id/candidate_id reference pattern. No new collection
  (interviewer_interviews / assigned_interviews rejected per phase boundary).
- **Assignment workflow:** the owning HR user assigns/reassigns via
  `POST /api/interviews/:id/assign` (HR product role + resource ownership) or
  optionally at creation (`interviewerId` on `POST /api/interviews`); the
  reference is validated (exists + interviewer role + active; invalid → 400).
  Assignment is allowed only while the interview is in a pre-room state
  (draft/scheduled/invited); ready/in_progress/completed reject with 409
  (no documented reassignment-after-start rule exists; DEC-023 lifecycle
  preserved untouched).
- **Interviewer API surface:** `GET /api/interviewer/interviews`,
  `GET /api/interviewer/interviews/:id`,
  `GET /api/interviewer/interviews/:id/report` (plus `GET /api/interviewers`
  for HR assignment support) — a separate role namespace that leaves the
  Phase 7 HR endpoints untouched.
- **Authorization:** `authorizeInterviewAccess` gains an interviewer branch —
  access is permitted only when interview_sessions.interviewer_id equals the
  authenticated interviewer's user id; unassigned interviews remain
  inaccessible to interviewers (Phase 6 behavior preserved).
- **Report access boundary:** permitted report access returns the existing
  final_reports document for an authorized assigned interview (Database Spec
  §13; IDX-RPT-001 unique index already existed); when no report exists the
  endpoint responds 404 with a truthful message. Report generation remains
  Phase 19. No fabricated report data is exposed.
- **Privacy:** the interviewer view exposes candidate identity (name) only —
  candidate email/contact data is intentionally withheld; no password/token
  material in any response.
- **Index:** one new sparse index `idx_int_005_interviewer_status_created`
  ({interviewer_id, status, created_at}) mirroring idx_int_001 for the
  recruiter listing workload — a current Phase 8 query, not speculative.

**Alternatives:**
- A separate interview_assignments collection (rejected: forbidden class of
  collection and more infrastructure than needed).
- Reusing `/api/interviews/:id` across roles (rejected: would complicate
  per-role response shaping and weaken the Phase 7 HR boundary).
- Inventing an interviewers profile collection (rejected: not documented).
- Fabricating report/live-monitoring data for the interviewer UI (rejected:
  violates the AI-integrity and data-integrity rules).

**Rationale:**
- Smallest change enabling UX-INT-001 assigned/upcoming/ongoing/completed
  views and backend-enforced assigned-interview authorization while
  preserving the Phase 7 HR boundary, the DEC-023 lifecycle TBD and the
  no-fabrication rules.

**Impact:**
- Phase 9 (candidate product) and Phase 10 (interview room) build on the
  interviewer_id relationship; the room workflow can gate on the assigned
  interviewer/participants.
- Phase 19 report generation will target final_reports keyed by interview_id
  (access path already implemented and tested).

**Verification:**
- 177/177 backend tests (32 new Phase 8: auth/role matrix, assignment
  workflow, view representation, isolation, empty state, report access with
  synthetic fixture, honest 404); frontend `tsc -b && vite build` + lint 0
  errors; live end-to-end assignment/visibility verification on the dev
  server.

**Related requirements:**
UX-INT-001 (§9.1), UX-INT-002 boundary note (§9.2), PRD-FR-002/004/010, SRS
role table (interviewer permissions TBD), Database Specification §8/§13
(final_reports), IMPLEMENTATION_PLAN.md Phase 8, CLAUDE.md §2/§5/§6/§7,
DEC-005, DEC-011, DEC-023, DEC-028.

---


## DEC-030 — Frontend API Access via Same-Origin Vite Proxy

**Status:** APPROVED (fix)
**Date:** 2026-10-04
**Phase:** Phase 8 (post-milestone fix)

**Context:**
The frontend API client defaulted to the absolute backend URL
(`http://localhost:3001`). From a remote browser (public e2b URL), localhost
resolves to the user's machine, not the sandbox — every API call failed with
"Unable to reach the server" (sign-in was broken). Additionally, a
tsc-emitted `vite.config.js` artifact shadowed `vite.config.ts`, silently
ignoring config changes.

**Decision:**
- The vite dev server proxies `/api`, `/health` and `/ready` to
  `http://localhost:3001`; the API client defaults to same-origin relative
  paths (`VITE_API_BASE_URL` override retained). Works identically for
  localhost:5180 and the public e2b URL; CORS is bypassed (same origin).
- The stale `vite.config.js`/`vite.config.d.ts` shadow artifact was removed
  and regenerated from the updated `vite.config.ts` via `tsc -b`.
- Dev servers are started detached (`setsid`) so they survive the tool
  session lifecycle.

**Verification:**
- Login through the public e2b URL returns a real token; `/health` via the
  proxy returns backend JSON. Committed as
  "Fix: frontend API access via same-origin vite proxy (public e2b URL sign-in)".

**Related requirements:** Zero-Cost Infrastructure Plan, CLAUDE.md §8,
DEC-013 (CORS).

## DEC-031 — Phase 9 Candidate System-Check Model, Mandatory/Optional Baseline and Candidate API Surface

**Status:** APPROVED (by implementation)
**Date:** 2026-10-04
**Phase:** Phase 9 — Candidate/Interviewee Product

**Context:**
Phase 9 requires the candidate system check (UX-CAN-002, PRD-FR-003,
SRS-FR-006/007). The connectivity metric and browser support matrix are
explicitly TBD, microphone blocking "depends on the configured interview
requirements" and no configurable requirement schema exists in the
implemented baseline, screen sharing is conditional on the implemented
feature, and readiness persistence is not documented. The previous
SystemCheckPage was a hardcoded fake-results mock (violating the no-fake
system-check rule).

**Decision:**
- **No schema change.** System check is a client-side browser capability
  flow; no readiness persistence is documented in the Database
  Specification. No new collections, no new indexes. The existing
  `interview_sessions.candidate_id` mapping (Phase 6/5) is the candidate
  association.
- **Mandatory checks:** camera (webcam monitoring is the MVP core per
  CLAUDE.md §2 and SRS §9.x "prevents continuation if camera is mandatory
  for the configured interview"), connection (truthful `navigator.onLine`
  reachability — no invented quality/threshold values), browser capability
  (`navigator.mediaDevices.getUserMedia` + `RTCPeerConnection` presence —
  no invented browser allowlist; the TBD matrix is preserved).
- **Microphone:** checked and displayed but optional (non-blocking baseline)
  — audio analysis is a later phase and no configurable mic requirement
  exists in the implemented schema (SRS: blocking "depends on the configured
  interview requirements").
- **Screen sharing:** NOT a required check — not required by the implemented
  interview configuration (conditional per UX-CAN-002/PRD-FR-013); no
  screen-capture permission is requested.
- **Check states:** idle/checking/ready/permission_required/unavailable/failed
  with per-check retry and recovery guidance; media tracks are stopped
  immediately (no raw media persisted or uploaded); no monitoring events are
  generated from readiness checks.
- **Continue gating:** enabled only when all mandatory checks pass; completion
  is truthful client-side state stating the interview room comes in the next
  stage (Phase 10 boundary — no fake room, no bypass route exists).
- **Candidate API surface:** `GET /api/interviewee/interviews` and
  `GET /api/interviewee/interviews/:id` (candidate profile requirement +
  `authorizeInterviewAccess` candidate branch) — mirrors the Phase 8
  interviewer namespace; Phase 7/8 APIs unchanged. Client-supplied candidate
  identity (body/query/URL) cannot influence authorization.
- **Monitoring disclosure:** neutral, non-punitive language (observable
  signals, permission purposes, recovery steps) — no accusatory or deceptive-
  detection claims (CLAUDE.md §3/§36).

**Alternatives:**
- Persisting system-check results (rejected: not documented; would require a
  schema change without approval).
- Inventing connectivity thresholds/browser allowlists (rejected: TBD
  preserved).
- Making the microphone mandatory (rejected: unsupported by the implemented
  configuration; SRS leaves blocking to the configured interview).
- A screen-sharing check (rejected: screen sharing is not required by the
  implemented feature).

**Rationale:**
- Smallest implementation satisfying PRD-FR-003/SRS-FR-006/007/UX-CAN-002
  with real capability checks, honest TBD handling and the Phase 10 boundary.

**Impact:**
- Phase 10 (interview room) will enforce its own entry authorization; the
  system-check completion state does not grant server-side access.
- The readiness state model is a single-file implementation
  (`SystemCheckPage.tsx`) — no abstraction framework introduced.

**Verification:**
- 192/192 backend tests (15 new Phase 9: auth/role/ownership/bypass matrix,
  lifecycle handling, regression); frontend `tsc -b && vite build` + lint 0
  errors; live candidate-flow verification on the dev server.

**Related requirements:**
UX-CAN-001/002 (§10.1/10.2), PRD-FR-003, SRS-FR-006/007, SRS §9.3
(browser/device interface), IMPLEMENTATION_PLAN.md Phase 9, CLAUDE.md
§2/§5/§6/§7/§36, DEC-005, DEC-011, DEC-023, DEC-029, DEC-030.

---

---
## DEC-032 — Phase 10 Interview Room Session Lifecycle, Role-Specific Room Interfaces and Entry Authorization

**Status:** APPROVED (by implementation)
**Date:** 2026-10-05
**Phase:** Phase 10 — Interview Room

**Context:**
Phase 10 delivers the Interview Room foundation (UX-CAN-003, UX-CAN-004, UX-INT-001,
PRD-FR-004, SRS-FR-008, SRS-FR-009). The interview room connects the candidate,
interviewer, and HR workflows. Strict phase boundaries apply: WebRTC and Socket.io
are deferred to Phase 11; webcam capture/sampling is deferred to Phase 12; computer
vision, signals, alerts, and reports are deferred to subsequent phases.

**Decision:**
- **Entry authorization & role boundaries:**
  Candidate room endpoints (`/api/interviewee/interviews/:id/room`, `.../room/join`,
  `.../room/leave`) enforce `authorizeInterviewAccess` against the authenticated
  candidate's profile. Interviewer room endpoints (`/api/interviewer/interviews/:id/room`,
  `.../room/join`, `.../room/end`) enforce that the authenticated user is the assigned
  interviewer (`interview_sessions.interviewer_id`). Cross-candidate and cross-interviewer
  access is strictly forbidden (403).
- **Session lifecycle transitions:**
  `startInterviewSession`: Transitions an enterable interview (`draft`, `scheduled`,
  `invited`, `ready`) to `in_progress`, recording `started_at` timestamp. Idempotent
  for ongoing sessions. Completed sessions cannot be restarted (409 Conflict).
  `completeInterviewSession`: Transitions an active interview to `completed`,
  recording `ended_at` timestamp.
- **Role-specific UI:**
  - Candidate room (`/interviewee/interviews/:id/room`): clear self-view and interviewer
    status tile, live session duration timer, audio/video control toggles, non-punitive
    monitoring disclosure notice (UX-CAN-003), and safe exit flow.
  - Completion page (`/interviewee/interviews/:id/completed`): unambiguous completion
    confirmation, next-steps review guidance, non-punitive and professional (UX-CAN-004).
  - Interviewer room (`/interviewer/interviews/:id/room`): assigned session controls,
    candidate status tile, self-view, active timer, and "End Session" modal workflow.
- **No schema change:**
  Existing `interview_sessions` collection (`status`, `started_at`, `ended_at`,
  `candidate_id`, `interviewer_id`) completely satisfies session state requirements.

**Verification:**
- 207/207 backend tests pass (15 new Phase 10 tests in `backend/tests/room.test.js`).
- 24/24 FastAPI AI-service pytest tests pass (`ai-service/tests`).
- Frontend `tsc -b && vite build` passed (0 errors); ESLint passed (0 errors).

**Related requirements:**
PRD-FR-004, SRS-FR-008, SRS-FR-009, UX-CAN-003, UX-CAN-004, UX-INT-001,
IMPLEMENTATION_PLAN.md Phase 10, CLAUDE.md §2/§3/§4/§5/§6/§7/§8/§10, DEC-029, DEC-031.

### DEC-033 — WebRTC & Socket.io Signaling Architecture

**Status:** APPROVED  
**Date:** 2026-11-05  
**Phase:** Phase 11 — WebRTC & Socket.io: Real-Time Communication and Signaling  

**Context:**  
Phase 11 implements real-time audio/video communication infrastructure for the interview room established in Phase 10 (UX-CAN-003, UX-INT-001, PRD-FR-004, SRS-FR-008/009). The goal is establishing a direct peer-to-peer WebRTC connection between the candidate and interviewer, mediated by an authenticated Socket.io signaling server. Strict phase boundaries apply: continuous video frame sampling, CV analysis, violation scoring, and live alerts are deferred to Phase 12+.

**Decision:**  
- **Socket.io Signaling Infrastructure (`backend/src/socket/server.js`):**
  Mounted directly onto the Node.js HTTP server in `backend/server.js`.
  - Handshake JWT verification via `verifyToken` and `findUserById` resolves user identity and role. Unauthenticated sockets are rejected immediately.
  - `join-room` enforces `authorizeInterviewAccess` against the database; unassigned interviewers and unauthorized candidates are denied entry.
  - Room events: `participant-joined`, `participant-left`, `webrtc-offer`, `webrtc-answer`, and `webrtc-ice-candidate` with room-membership validation and payload sanity checking.
  - Clean leave on `leave-room` and disconnection broadcast via `disconnecting`.
- **Native Browser WebRTC Client (`frontend/src/hooks/useWebRTC.ts`):**
  - Utilizes native browser WebRTC APIs (`RTCPeerConnection`, `RTCSessionDescription`, `RTCIceCandidate`, `MediaStream`) with Google STUN servers (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`). No third-party WebRTC SDK bloat.
  - Glare-free negotiation: existing room member initiates offer on `participant-joined` / `join-room` response; peer answers on `webrtc-offer`.
  - ICE Candidate Queueing: buffers incoming ICE candidates arriving before `setRemoteDescription` completes and applies them sequentially.
  - Safe media permission handling: non-blocking camera/mic acquisition via `navigator.mediaDevices.getUserMedia` with fallback error states and retry mechanism.
  - Complete lifecycle management: track stopping (`track.stop()`), peer connection closure, room leaving, and socket disconnection on hook unmount.
- **Frontend Room Integration (`frontend/src/pages/interviewee/InterviewRoomPage.tsx`, `frontend/src/pages/interviewer/InterviewRoomPage.tsx`):**
  - Explicit UI differentiation between signaling state (`Signaling: Connected`) and WebRTC peer connection (`P2P: Connected` / `Waiting for Peer`).
  - Local stream rendered mirrored and muted in self-view tile; remote stream rendered in partner view tile.
  - Functional mic and video toggle controls altering `MediaStreamTrack.enabled`.
- **Vite Proxy & API Status:**
  - Added `/socket.io` proxy configuration with `ws: true` in `frontend/vite.config.ts`.
  - Updated API root status to `'Phase 11: WebRTC & Socket.io'`.

**Verification:**  
- 223/223 backend tests pass (16 new automated tests in `backend/tests/webrtc-socket.test.js`).
- 24/24 AI service pytest tests pass (`ai-service/tests`).
- Frontend production build succeeds (`npm run build --prefix frontend`, 0 errors).
- Frontend linting passes (`npm run lint --prefix frontend`, 0 errors).

**Related requirements:**  
PRD-FR-004, SRS-FR-008, SRS-FR-009, UX-CAN-003, UX-INT-001, DEC-004, DEC-032.

---

## DEC-034 — Phase 12 Webcam Frame Capture Engine, Sampling Strategy, and Monitoring Telemetry

**Status:** APPROVED (by implementation)  
**Date:** 2026-11-07  
**Phase:** Phase 12 — Webcam Capture  

**Context:**  
Phase 12 delivers the webcam frame-capture pipeline for active interview sessions (PRD-FR-005, SRS-FR-008, SRS-FR-011, UX-CAN-003, UX-INT-001). Building directly upon Phase 11's WebRTC infrastructure, Phase 12 periodically samples candidate webcam frames and transmits them to the backend for downstream vision analysis. Strict phase boundaries apply: Computer vision detection, facial landmark extraction, behavioral signals, real-time alerts, and long-term evidence storage are strictly deferred to subsequent phases (Phases 13–19).

**Decision:**  
- **Stream Reuse & Video Integration:**
  - Reuses the existing `MediaStream` established by `useWebRTC`. Zero redundant camera access prompts or second hardware streams.
  - Video track readiness check: verifies that video track is enabled and in `live` state before capturing.
- **Canvas-based Frame Extraction (`frontend/src/hooks/useWebcamCapture.ts`):**
  - Uses an internal, reusable offscreen `HTMLCanvasElement` to extract video frames from the local preview video element.
  - Preserves source aspect ratio while resizing to conservative CV-ready dimensions (`640x360` default).
  - Uses asynchronous `canvas.toBlob(..., 'image/jpeg', 0.8)` and converts to base64 data URL for universal transport.
- **Configurable Sampling & Backpressure:**
  - Default sampling interval of 1000ms (1 fps), configurable via `UseWebcamCaptureOptions` (`intervalMs`, `targetWidth`, `targetHeight`, `imageFormat`, `imageQuality`).
  - Backpressure handling: if a previous transmission is in-flight, the current capture tick is skipped and `droppedCount` is incremented. Unbounded memory queues and network piling are strictly prevented.
- **Transmission Architecture & API Surface:**
  - **HTTP Endpoint (`backend/src/routes/interviewee.js`):** `POST /api/interviewee/interviews/:id/frames` with mandatory JWT auth, candidate profile requirement, `authorizeInterviewAccess`, and `in_progress` session guarding (409 Conflict if completed or not in progress).
  - **Socket.io Relay (`backend/src/socket/server.js`):** `webcam-frame` event with room-membership validation and candidate-role enforcement. Broadcasts telemetry (`monitoring-frame-status`) to the interviewer without flooding raw frame payloads.
  - **Validation (`backend/src/monitoring/frameValidator.js`):** Validates sequence number, ISO timestamp, dimension bounds (64–3840px), MIME types (`image/jpeg`, `image/webp`, `image/png`), and payload size limits (100B–2MB).
  - **Telemetry Endpoints:** `GET /api/interviewee/interviews/:id/frames/status` and `GET /api/interviewer/interviews/:id/frames/status` report active capture metrics.
- **Zero Raw-Frame Persistence (DEC-012, DEC-015):**
  - No raw frame blobs are permanently written to MongoDB in Phase 12. Transient operational statistics are tracked via `sessionFrameTracker` in-memory. Long-term evidence storage belongs strictly to Phase 17.
- **User Privacy & UI Transparency:**
  - Candidate room header displays active capture status badge (`Capture: Active (N)`).
  - Candidate video tile displays active sampling indicator ("Sampling 1 fps").
  - Interviewer room displays candidate monitoring telemetry badge and feed indicator.
  - Monitoring Disclosure Modal provides explicit notice of 1 fps sampling and human review policy.

**Verification:**  
- 242/242 backend tests pass (19 new automated tests in `backend/tests/webcam-capture.test.js`).
- 24/24 AI service pytest tests pass (`ai-service/tests`).
- Frontend production build succeeds (`npm run build --prefix frontend`, 0 errors).
- Frontend linting passes (`npm run lint --prefix frontend`, 0 errors).

**Related requirements:**  
PRD-FR-005, SRS-FR-008, SRS-FR-011, UX-CAN-003, UX-INT-001, DEC-004, DEC-012, DEC-015, DEC-033.

---

## DEC-035 — Phase 13: Computer Vision Engine — Model Selection, Architecture, and Privacy Strategy

**Date:** 2026-11-07  
**Phase:** 13 — Computer Vision  
**Status:** ACCEPTED

**Context:**  
Phase 12 delivers a 1 fps webcam frame capture pipeline. Phase 13 must analyse these frames and return structured visual observations per AI-MOD-001 (AI/ML Specification v1.0, Section 5). The CV engine must run entirely locally, respect strict privacy constraints, and avoid external paid APIs or identity recognition.

**Decisions:**

- **Model: YuNet (face_detection_yunet_2023mar.onnx)**
  - Selected over: Haar Cascades (unavailable in OpenCV 5 headless), MediaPipe (heavy transitive dependencies ~200 MB), cloud APIs (privacy/cost/offline constraints).
  - Source: `opencv/opencv_zoo` — MIT licensed.
  - File size: **227 KB** ONNX.
  - Integration: `cv2.FaceDetectorYN` (native OpenCV 5).
  - Measured inference: **~1–4 ms** per 640×360 frame on Apple M-series CPU (avg 1.4 ms over 10 sequential frames).
  - Outputs: bounding boxes + confidence scores only. No face crops, embeddings, or identity information.

- **Dependencies added:**
  - `opencv-python-headless==5.0.0.93` — OpenCV without GUI, includes DNN and YuNet support.
  - `numpy==2.5.4` — Required by OpenCV for array operations.
  - `pillow==13.0.0` — Used in tests for synthetic image generation.
  - `requirements.txt` updated with pinned versions.

- **Architecture (ai-service):**
  - `app/services/computer_vision/__init__.py` — Package documentation and design principles.
  - `app/services/computer_vision/schemas.py` — Versioned Pydantic output schema (`CVAnalysisResult`, `DetectedFace`, `BoundingBox`, `FrameQualityMetrics`).
  - `app/services/computer_vision/preprocessor.py` — Decodes base64 frames, validates format/dimensions, assesses quality via Laplacian variance (CV-SIG-006).
  - `app/services/computer_vision/face_detector.py` — Thread-safe YuNet wrapper with `FaceDetectorRegistry` singleton; uses `threading.local` to avoid `setInputSize` race conditions.
  - `app/services/computer_vision/engine.py` — Orchestrates preprocessing + detection; offloads sync CPU work via `asyncio.to_thread()` to keep the event loop non-blocking.
  - `app/routes/analysis.py` — `POST /analysis/frame` FastAPI endpoint; returns `CVAnalysisResult`.
  - `app/main.py` — Wires lifespan model loading (`FaceDetectorRegistry.initialise()`) and registers the analysis router.
  - `app/routes/health.py` — `/ready` endpoint updated to include `"computer-vision"` component when detector is loaded.
  - `models/face_detection_yunet_2023mar.onnx` — Downloaded model file (not committed to git; download instructions in `models/README.md`).

- **CV Signal Coverage:**
  - CV-SIG-001 (Face Present): `face_detected: bool` — ✅ Implemented.
  - CV-SIG-002 (Multiple Faces): `multiple_faces_detected: bool` (face_count > 1) — ✅ Implemented.
  - CV-SIG-003 (Face Absence): expressed as `face_detected = False` — ✅ Available for downstream signal extraction in Phase 14.
  - CV-SIG-006 (Frame Quality): Laplacian variance + brightness mean + grade (good/degraded/unusable) — ✅ Implemented.
  - CV-SIG-004 (Head Orientation) and CV-SIG-005 (Gaze Direction): **Deferred** — marked as "Proposed" in the AI/ML Specification; not required for MVP CV.

- **Quality Gate:**
  - Frames with Laplacian variance < 1.0 (fully uniform, no texture) are classified UNUSABLE and skipped before inference.
  - Degraded frames (blur < 80, brightness < 20 or > 240, resolution < 100 px) run inference but confidence is contextually lower.

- **Privacy and Data-Retention:**
  - Raw frame bytes are never logged (not at any log level).
  - No face crops, embeddings, or identity information is generated or stored.
  - Decoded numpy arrays exist only for the duration of a single request (GC'd after each call).
  - `CVAnalysisResult` contains only bounding boxes, confidence scores, quality metrics, and processing metadata.
  - Raw frame persistence continues to be deferred to Phase 17 (Evidence System).

- **Thread Safety:**
  - `FaceDetectorRegistry` uses a class-level `threading.Lock` for initialisation.
  - Per-thread `FaceDetectorYN` instances stored in `threading.local` avoid `setInputSize` contention under concurrent requests.

- **Performance (measured, Apple M-series CPU, Python 3.14.8):**
  - Model load time: ~instant on second call (singleton registry — loaded once at startup).
  - First frame total (including decode + quality assessment + inference): **~3.9 ms**.
  - 10-frame sequential average: **~1.4 ms/frame**.
  - Well within the 1 fps (1000 ms) Phase 12 sampling interval — no queue buildup risk.

**Verification:**  
- 91/91 AI service pytest tests pass (67 new in `ai-service/tests/test_computer_vision.py`, including real single-face and multi-face image verification).
- 242/242 backend Node.js tests pass (no regressions).
- Frontend production build: 0 errors (`npm run build`).
- Frontend lint: 0 errors (`npm run lint`).

**Related requirements:**  
PRD-FR-005, AI-MOD-001, CV-SIG-001, CV-SIG-002, CV-SIG-003, CV-SIG-006, DEC-012, DEC-018, DEC-034.

---

## DEC-036 — Phase 14: Observable Behaviour Signal Extraction — Architecture, Thresholds, and Neutral Observation Contract

**Date:** 2026-11-07  
**Phase:** 14 — Observable Behaviour Signals  
**Status:** ACCEPTED

**Context:**  
Phase 13 delivers frame-level Computer Vision observations (`CVAnalysisResult`). Phase 14 must extract time-varying behavioural signals across sequential frames per AI-MOD-005 (AI/ML Specification v1.0, Section 9) without declaring cheating or inferring intent. Observations must be distinguished between single-frame blips, temporal patterns, and unreliable monitoring data.

**Decisions:**

- **Modular Temporal Extraction Engine (`ai-service/app/services/behaviour/`):**
  - `schemas.py`: Versioned contract (`schema_version = '1.0'`) containing `BehaviourAnalysisResult`, `BehaviourSignal`, `MonitoringQuality`, and specific metric dataclasses.
  - `config.py`: Centralized thresholds (`min_absence_observations = 3`, `min_absence_duration_ms = 2500`, `min_multiple_faces_observations = 2`, `min_observations_for_consistency = 5`, `sampling_gap_threshold_ms = 3000`, `max_session_history = 1000`).
  - `analyzers.py`: Modular single-responsibility analyzers:
    - `FaceAbsenceAnalyzer` (BEH-003): Detects contiguous absence runs. Requires >= 3 consecutive frames or >= 2500 ms duration. Suppresses 1-frame blips (e.g. blinks). Tracks ongoing flag and intra-run sampling gaps.
    - `MultipleFacesAnalyzer` (BEH-002): Extracts repeated multi-face occurrences (>= 2 frames). Suppresses isolated single-frame blips as `not_observed`. Tracks maximum observed face count.
    - `FacePresenceConsistencyAnalyzer` (BEH-001): Calculates presence ratio over valid frames. Classifies as `HIGH` (>=90%), `MODERATE` (70–89%), `LOW` (<70%), or `INSUFFICIENT_DATA` (<5 frames).
    - `FrameQualitySummaryAnalyzer` (CV-SIG-006): Evaluates distribution of good, degraded, and unusable frames, mean blur score (Laplacian variance), and mean brightness.
    - `MonitoringQualityAnalyzer`: Identifies sequence gaps, missing frames, duplicate sequence numbers, out-of-order deliveries, and sampling gaps (>3000 ms). Rates stream reliability as `SUFFICIENT`, `DEGRADED`, `UNRELIABLE`, or `INSUFFICIENT_DATA`.
  - `engine.py`: Coordinates session state management (`SessionBehaviourTracker`) and signal orchestration (`BehaviourSignalEngine`).

- **In-Memory Session State & Memory Bounds:**
  - `SessionBehaviourTracker` manages per-interview observation deques isolated by `interview_id`.
  - Capped at `max_session_history = 1000` observations (~16.6 minutes at 1 fps), preventing unbounded memory growth.
  - Zero raw image retention (only lightweight `CVAnalysisResult` metadata is stored).
  - Explicit session purge supported via `DELETE /analysis/behaviour/{interview_id}`.

- **FastAPI Endpoints (`app/routes/behaviour.py`):**
  - `POST /analysis/behaviour`: Ingests and processes a batch of CV observations.
  - `GET /analysis/behaviour/{interview_id}`: Queries accumulated session behavioural observations.
  - `DELETE /analysis/behaviour/{interview_id}`: Clears session history.
  - `/ready` endpoint updated to verify `"behaviour-analysis"` readiness.

- **Strict Ethics & Neutral Language Contract (Section 8):**
  - Prohibits all subjective, accusatory, or intent-inferring terms ("cheating", "fraud", "suspicious", "dishonest", "guilty", "deception").
  - Outputs are strictly factual descriptions of observable visual phenomena (e.g. "No face was detected across 4 consecutive observations (4.0s duration).").
  - No facial recognition, identity matching, or emotion inference.
  - Raw frame persistence remains strictly deferred to Phase 17 (Evidence System).

- **Performance (measured, Apple M-series CPU, Python 3.14.8):**
  - 10 frames (~10s): **0.24 ms**
  - 60 frames (~1 min): **0.31 ms**
  - 300 frames (~5 min): **1.16 ms**
  - 1000 frames (~16.6 min): **3.92 ms**
  - Processing 1000 frames consumes <0.4% of a single 1-second capture tick.

**Verification:**  
- 123/123 AI service pytest tests pass (32 new Phase 14 tests in `ai-service/tests/test_behaviour.py`).
- 242/242 backend Node.js tests pass (0 regressions).
- Frontend production build: 0 errors (`npm run build`).
- Frontend lint: 0 errors (`npm run lint`).

**Related requirements:**  
PRD-FR-005, PRD-FR-006, AI-MOD-005, BEH-001, BEH-002, BEH-003, CV-SIG-006, DEC-012, DEC-034, DEC-035.

---

## DEC-037 — Phase 15: Event Engine & Persistence — Architecture, MongoDB Ingestion, Idempotency, and Lifecycle Strategy

**Date:** 2026-11-10  
**Phase:** 15 — Event Engine & Persistence  
**Status:** ACCEPTED

**Context:**  
Phase 14 extracted temporal behavioural signals (`BehaviourAnalysisResult`) from sequential frames. Phase 15 must normalize these signals into persistent monitoring events, manage their lifecycle (`ACTIVE` vs `RESOLVED`), guarantee replay idempotency, and provide secure, paginated REST endpoints and aggregations for authorized review.

**Decisions:**

- **Service Boundary & Persistence Ownership:**
  - The **Node.js Express backend** owns MongoDB persistence in `monitoring_events` (`COLLECTIONS.MONITORING_EVENTS`), indexing, transaction-free atomic upserts, and RBAC-controlled REST endpoints.
  - The **Python FastAPI AI service** remains a stateless inference and temporal signal extraction service, avoiding unnecessary database drivers, connection pools, or schema duplication.
  - Integration between services is handled via HTTP (`fetchSessionBehaviour` / `postBatchBehaviour` in `backend/src/services/aiServiceClient.js`).

- **Deterministic Idempotency Key & Database Indexing:**
  - Idempotency key format:
    - `FACE_ABSENCE`: `${interview_id}:FACE_ABSENCE:${absence_start_sequence}`
    - `MULTIPLE_FACES`: `${interview_id}:MULTIPLE_FACES:${start_sequence}`
    - `FACE_PRESENCE_CONSISTENCY`: `${interview_id}:FACE_PRESENCE_CONSISTENCY:${start_timestamp}`
    - `FRAME_QUALITY_SUMMARY`: `${interview_id}:FRAME_QUALITY:${start_timestamp}`
    - `MONITORING_DATA_QUALITY`: `${interview_id}:MONITORING_DATA_QUALITY:${sequence_range_start}`
  - Backed by MongoDB indexes in `backend/src/db/indexes.js`:
    - `idx_evt_004_idempotency_unique`: `{ idempotency_key: 1 }` (unique, sparse)
    - `idx_evt_005_interview_status_timestamp`: `{ interview_id: 1, status: 1, timestamp: 1 }`

- **Atomic Upsert & State Lifecycle Management:**
  - `processBehaviourAnalysis` in `backend/src/events/eventEngine.js` uses atomic `findOneAndUpdate` with `{ upsert: true, returnDocument: 'after' }`:
    - `$setOnInsert`: Sets `_id` (UUIDv4), business `event_id` (`evt_${interview_id}_${uuid8}`), `first_observed_at`, `timestamp`, `review_status: 'unreviewed'`, and `created_at`.
    - `$set`: Updates `last_observed_at`, `duration_ms`, `occurrence_count`, `metrics`, `status`, `reliability`, `severity`, `confidence`, `explanation`, and `updated_at`.
    - When a signal transitions from ongoing to cleared (`is_ongoing: false`), status is set to `RESOLVED` and `resolved_at` is stamped.
    - Explicit resolution is also supported via `resolveMonitoringEvent` and `PATCH /api/monitoring-events/:eventId/resolve`.

- **Event Repository & Aggregation:**
  - `findEventsByInterview` (`backend/src/events/eventRepository.js`): Provides paginated querying with multi-criteria filtering (`status`, `eventType`, `severity`, `category`, and ISO date bounds).
  - `findEventById`: Lookups by either MongoDB `_id` or public `event_id`.
  - `getEventsSummary`: Real-time aggregation of total events, active/resolved counts, severity breakdown, event type breakdown, and temporal bounds (`first_event_at`, `latest_event_at`).

- **REST API & Strict RBAC Enforcement:**
  - `POST /api/interviews/:id/monitoring-events/process`: Ingests a Phase 14 analysis payload directly, or automatically pulls from the AI service if not provided in the request body.
  - `GET /api/interviews/:id/monitoring-events`: Lists paginated events. Restricted to HR owner and assigned Interviewer. Candidates are rejected with 403 Forbidden.
  - `GET /api/interviews/:id/monitoring-events/summary`: Retrieves aggregated event metrics.
  - `GET /api/monitoring-events/:eventId`: Retrieves a single event, verifying interview resource access.
  - `PATCH /api/monitoring-events/:eventId/resolve`: Marks an active event as resolved.

- **Ethics, Neutral Language, and Privacy Guarantees:**
  - All event descriptions and explanations are strictly neutral and factual (no words implying guilt, dishonesty, deception, or cheating).
  - Zero raw webcam frame persistence and zero raw image logging in the database or logs.

**Verification:**
- 268/268 backend Node.js tests pass (26 new Phase 15 tests in `backend/tests/event-engine.test.js`, 0 regressions).
- 123/123 AI service pytest tests pass.
- Frontend production build: 0 errors (`npm run build`).
- Frontend lint: 0 errors (`npm run lint`).

**Related requirements:**  
PRD-FR-005, PRD-FR-006, SRS-FR-007, SRS-FR-008, Database Spec §9, AI/ML Spec §10, DEC-006, DEC-007, DEC-011, DEC-036.

---

## DEC-038 — Phase 16: Real-Time Alerts & Notification Engine — Architecture, Policies, Lifecycle, and Recipient Isolation

**Date:** 2026-11-10  
**Phase:** 16 — Real-Time Alerts  
**Status:** ACCEPTED

**Context:**  
Phase 15 normalized and persisted temporal monitoring events into MongoDB. Phase 16 must evaluate these events against configured policies, generate persistent alert records idempotently, deliver real-time notifications to authorized HR users and assigned interviewers through Socket.io, manage lifecycle states (`NEW`, `ACKNOWLEDGED`, `DISMISSED`), handle escalation, and strictly prevent candidate exposure to recruiter alerts.

**Decisions:**

- **Modular Alert Architecture (`backend/src/alerts/`):**
  - `alertConstants.js`: Canonical lifecycle states (`NEW`, `ACKNOWLEDGED`, `DISMISSED`), priorities (`HIGH`, `MEDIUM`, `LOW`, `INFO`), alert types (`MONITORING_EVENT`, `SYSTEM_ALERT`), and socket event names (`monitoring-alert:new`, `monitoring-alert:updated`, `monitoring-alert:acknowledged`, `monitoring-alert:dismissed`, `monitoring-alert:escalated`).
  - `alertPolicyService.js`: Configurable policy registry mapping event types to priorities, trigger conditions, and neutral messages.
  - `alertDeduplicator.js`: Builds deterministic idempotency keys and suppresses duplicate socket emissions on ongoing runs.
  - `alertRepository.js`: Atomic MongoDB operations on `alerts` collection, unique idempotency indexing, filtering, pagination, and summary aggregation.
  - `alertDispatcher.js`: Dispatches sanitized alert payloads over Socket.io exclusively to reviewer-specific rooms and personal recipient user rooms.
  - `alertEscalationService.js`: Evaluates unacknowledged alerts exceeding delay thresholds (30s default) up to maximum level (2) without unbounded in-memory timers.
  - `alertEngine.js`: Ingestion orchestrator linking Phase 15 event persistence with policy evaluation, persistence, and dispatch.

- **Deterministic Idempotency Key & Database Indexing:**
  - Idempotency key: `${interview_id}:${policy_id}:${event.idempotency_key || event.event_id}` backed by unique sparse index `idx_alt_003_idempotency_unique`.
  - Additional indexes in `backend/src/db/indexes.js`:
    - `idx_alt_001_interview_created`: `{ interview_id: 1, created_at: 1 }`
    - `idx_alt_002_recipient_status_created`: `{ recipient_user_id: 1, status: 1, created_at: 1 }`
    - `idx_alt_004_event_id`: `{ event_id: 1 }`
    - `idx_alt_005_interview_status_created`: `{ interview_id: 1, status: 1, created_at: -1 }`

- **Socket.io Recipient Isolation & Candidate Protection:**
  - Reuses existing Socket.io server (Phase 11).
  - Authenticated sockets automatically join their personal notification room (`user:${socket.user.id}`).
  - When joining an interview room, interviewer and HR sockets additionally join `interview:${interviewId}:reviewers`.
  - Candidate sockets ONLY join `interview:${interviewId}` and never join the reviewer room.
  - All alerts emit strictly to `interview:${interviewId}:reviewers` and direct recipient `user:${id}` rooms. Candidates can never receive recruiter-facing monitoring alerts.

- **Alert Lifecycle & Atomic State Transitions:**
  - `NEW`: Created and unacknowledged.
  - `ACKNOWLEDGED`: Acknowledged by authorized actor (`acknowledged_at`, `acknowledged_by`). Escalation halted.
  - `DISMISSED`: Dismissed by authorized actor (`dismissed_at`, `dismissed_by`). Preserved in database audit history.
  - Invalid transitions (e.g. `DISMISSED` -> `ACKNOWLEDGED`) reject with 409 Conflict.

- **REST Endpoints & RBAC:**
  - `GET /api/interviews/:id/alerts`: List alerts (paginated, filtered).
  - `GET /api/interviews/:id/alerts/summary`: Summary metrics.
  - `GET /api/alerts/:alertId`: Retrieve individual alert.
  - `PATCH /api/alerts/:alertId/acknowledge`: Acknowledge alert.
  - `PATCH /api/alerts/:alertId/dismiss`: Dismiss alert.
  - `POST /api/interviews/:id/alerts/escalate`: Trigger escalation sweep.
  - All endpoints enforce HR ownership or interviewer assignment. Candidates receive 403 Forbidden.

- **Frontend Interview Room Integration:**
  - Interviewer room features an Alert toggle button with live unacknowledged badge counter.
  - Collapsible Alert Drawer allows reviewing alerts, inspecting factual descriptions, and one-click "Acknowledge" / "Dismiss" actions.
  - Candidate room UI has zero alert components or listeners.

- **Privacy & Ethics Constraints:**
  - 100% neutral, objective explanations (e.g. "No face was detected across the configured observation interval.").
  - Prohibits all subjective, accusatory, or intent-inferring terms ("cheating", "fraud", "dishonesty", "suspicious").
  - Zero raw webcam frame persistence and zero raw image logging.

**Verification:**
- 298/298 backend Node.js tests pass (30 new Phase 16 tests in `backend/tests/alerts.test.js`, 0 regressions across all 82 test suites).
- 123/123 AI service pytest tests pass.
- Frontend production build: 0 errors (`npm run build`).
- Frontend lint: 0 errors (`npm run lint`).

**Related requirements:**  
PRD-FR-007, SRS-FR-007, Database Spec §11, AI/ML Spec §12, DEC-006, DEC-007, DEC-011, DEC-037.

---

## DEC-039 — System Check State Machine, Mandatory Microphone Gating & Bounded Device Check Isolation

**Status:** APPROVED (by implementation)  
**Date:** 2026-11-18  
**Phase:** Critical Bug Fix & End-to-End Interview Workflow Stabilization  

**Context:**
During candidate pre-interview verification, `SystemCheckPage.tsx` experienced recursive re-render loops due to an unstable dependency cycle between check callbacks, state setters, and mount effects. This flooded the browser with unbounded concurrent `getUserMedia` calls, locking device hardware and resulting in "Page Unresponsive" crashes. Furthermore, microphone checks were previously marked as optional, allowing candidates to enter proctored sessions without confirmed two-way audio.

**Decision:**
1. **Decoupled Execution & Ref Guards:**
   - Redesigned `SystemCheckPage.tsx` into an explicit state machine (`IDLE`, `CHECKING`, `PASSED`, `PERMISSION_DENIED`, `UNAVAILABLE`, `TIMED_OUT`, `FAILED`).
   - Replaced state-dependent `useCallback` triggers with independent functional setters (`setChecks(prev => ...)`).
   - Guarded component mount checks with an execution ref (`hasMountedRef`), ensuring `runAllChecks()` runs exactly once without re-triggering across state updates.
2. **Strict Timeouts & Track Disposal:**
   - Implemented bounded `Promise.race` timeouts (8000ms for Camera and Microphone device queries, 5000ms for network backend health checks).
   - Late-resolving stream promises register cleanup callbacks to terminate (`track.stop()`) any unmanaged media tracks immediately upon eventual arrival.
3. **Mandatory Microphone Gating:**
   - Classified both Camera and Microphone as mandatory requirements (`MANDATORY_CHECKS = ['browser', 'camera', 'microphone', 'connection']`).
   - Removed all "(optional)" indicators and strictly disabled the "Continue" button until all four mandatory checks achieve the `passed` state.
4. **Backend Health Verification:**
   - Supplemented `navigator.onLine` checks with an active `fetch('/health')` ping over a 5000ms AbortSignal to verify real API server connectivity.

**Verification:**
- Browser automation tests verify zero infinite loop locks, 100% responsive event loop, and correct handling of permission denial, timeout, and device retry.
- All 11 browser verification artifacts captured in `docs/verification/interview-workflow/`.

---

## DEC-040 — Theme-Aware Custom Select Dropdown & Dark Mode Visibility Stabilization

**Status:** APPROVED (by implementation)  
**Date:** 2026-11-18  
**Phase:** Critical Bug Fix & End-to-End Interview Workflow Stabilization  

**Context:**
The Create Interview form suffered from unreadable option menus where native `<select>` elements inherited dark-mode foreground text styles while retaining hardcoded light backgrounds (`bg-white`). This caused candidate and interviewer options to appear faint or invisible in dark mode, leading to interviews being submitted without assigned interviewers. Additionally, native dropdowns could not display dual-line content (prominent candidate name with secondary email).

**Decision:**
1. **Custom Accessible Dropdown Component (`Select.tsx`):**
   - Replaced unstyled native `<select>` dropdowns with a theme-aware custom component adhering to WAI-ARIA combobox/listbox standards.
   - Built dual-line item presentation prominently displaying the primary Name (`font-medium text-surface-900 dark:text-surface-50`) and secondary Email (`text-xs text-surface-500 dark:text-surface-400`).
   - Implemented high-contrast theme classes (`bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-700`) across trigger, popup menu, search bar, and option rows.
2. **Accessibility & Form Compatibility:**
   - Full keyboard navigation (ArrowUp, ArrowDown, Enter, Space, Escape, Tab, Home, End).
   - Embedded a hidden synchronized native `<select>` to preserve standard HTML form validation, screen reader semantics, and browser automation compatibility.
   - Integrated type-ahead search filtering when options list exceeds 5 entries.
3. **Interviewer Workflow & Direct Entry:**
   - Enhanced `InterviewerInterviewsPage.tsx` with a direct "Enter Room" action for active interviews, facilitating immediate room access.
   - Hardened room loading in `InterviewerInterviewRoomPage.tsx` to surface descriptive error messages if room start or assignment verification fails.

**Verification:**
- Real browser verification in dark mode (`01_create_interview_candidate_select_dark.png`, `02_create_interview_interviewer_select_dark.png`).
- 298/298 backend tests and 123/123 AI service tests pass with zero regressions.
- Frontend production build (`npm run build`) passes with 0 errors.

---

## Future Decision Template

``` text

