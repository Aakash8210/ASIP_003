import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Eye,
  FileText,
  Lock,
  Monitor,
  Scale,
  Shield,
  Video,
  Activity,
  Users,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const capabilities = [
  {
    icon: Eye,
    title: 'Face Presence & Multi-Face Detection',
    description:
      'Local OpenCV YuNet inference at 1 fps detects face presence, sustained absence, and secondary faces without external cloud calls.',
    meta: 'CV-SIG-001 · CV-SIG-002',
  },
  {
    icon: Activity,
    title: 'Temporal Behavioural Signals',
    description:
      'Aggregates frame-level detections into duration-aware behavioural events with quality gates that suppress transient single-frame glitches.',
    meta: 'BEH-001 · BEH-002 · BEH-003',
  },
  {
    icon: Video,
    title: 'Peer-to-Peer WebRTC Rooms',
    description:
      'Authenticated Socket.io signaling and low-latency WebRTC media rooms for candidates and interviewers with live capture telemetry.',
    meta: 'WebRTC · Socket.io',
  },
  {
    icon: Shield,
    title: 'Interpretable Integrity Indicators',
    description:
      'Transparent continuity, stream reliability, and multi-presence metrics backed by linked observation evidence—never opaque fraud scores.',
    meta: 'Human-in-the-loop',
  },
  {
    icon: FileText,
    title: 'Structured Post-Interview Reports',
    description:
      'Idempotent session reports combining chronological event timelines, alert summaries, and reviewer sign-off workflows.',
    meta: 'PENDING_REVIEW → REVIEWED',
  },
  {
    icon: Lock,
    title: 'Privacy & Tenant Governance',
    description:
      'Explicit candidate disclosure and consent, zero raw-frame persistence by default, configurable retention windows, and immutable audit logs.',
    meta: 'RBAC · Retention Purge',
  },
]

const workflowSteps = [
  {
    step: '01',
    title: 'Schedule & Invite',
    description: 'HR creates the interview session, assigns an interviewer, and issues a role-scoped invitation.',
  },
  {
    step: '02',
    title: 'Pre-Flight System Check',
    description: 'Candidates verify camera, microphone, browser compatibility, and acknowledge monitoring disclosures.',
  },
  {
    step: '03',
    title: 'Live Room & 1 fps Telemetry',
    description: 'WebRTC video connects participants while 1 fps sampled frames feed the isolated reviewer monitoring view.',
  },
  {
    step: '04',
    title: 'Evidence-Linked Review',
    description: 'Reviewers inspect structured indicators, acknowledge alerts, and finalize the human review status.',
  },
]

const guardrails = [
  {
    icon: Scale,
    title: 'No Automated Hiring Decisions',
    description: 'Signals surface observable events for human reviewers. Final evaluation always belongs to your hiring team.',
  },
  {
    icon: Eye,
    title: 'No Emotion or Deception Claims',
    description: 'Strictly measures objective visual and acoustic telemetry—never psychological state, stress, or intent.',
  },
  {
    icon: Cpu,
    title: 'Local-First & Zero-Cost Stack',
    description: 'Runs self-contained with FastAPI, OpenCV YuNet, Node.js, and MongoDB—no paid third-party AI APIs required.',
  },
  {
    icon: Lock,
    title: 'Zero Raw-Frame Persistence',
    description: 'Sampled frames are analyzed in memory and discarded; only structured metadata and retention-bounded context remain.',
  },
]

export function HomePage() {
  return (
    <div className="bg-surface-50 dark:bg-surface-950 text-surface-900 dark:text-surface-50">
      {/* Hero */}
      <section className="relative border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-2.5 py-1 text-xs font-mono text-surface-600 dark:text-surface-400 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              LOCAL-FIRST · OPENCV YUNET + WEBRTC
            </div>

            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-surface-950 dark:text-surface-50 leading-[1.12] mb-5">
              Structured interview integrity, built on observable signals.
            </h1>

            <p className="text-base sm:text-lg text-surface-600 dark:text-surface-400 leading-relaxed mb-8 max-w-2xl">
              An end-to-end interview workspace combining peer-to-peer WebRTC rooms, 1 fps computer vision telemetry,
              and evidence-linked integrity reports for transparent human review.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/signin"
                className={buttonVariants({ variant: 'primary', size: 'lg' })}
              >
                Open Console
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/signup"
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                Create Account
              </Link>
            </div>
          </div>

          {/* Architectural Product Preview */}
          <div className="mt-14 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-surface-500" aria-hidden="true" />
                <span className="text-xs font-mono text-surface-600 dark:text-surface-400">
                  live-monitoring / session-preview
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="font-mono text-[11px]">
                  1.0 FPS ACTIVE
                </Badge>
                <Badge variant="neutral" className="font-mono text-[11px]">
                  YUNET-2023MAR
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-surface-200 dark:divide-surface-800">
              <div className="p-5 bg-white dark:bg-surface-900/60">
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400">Visual Continuity</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-surface-900 dark:text-surface-50">99.4%</p>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-mono">STATUS: CONSISTENT</p>
              </div>
              <div className="p-5 bg-white dark:bg-surface-900/60">
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400">Stream Reliability</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-surface-900 dark:text-surface-50">142 frames</p>
                <p className="mt-1 text-xs text-surface-500 dark:text-surface-400 font-mono">MEDIAN LATENCY: 10.6ms</p>
              </div>
              <div className="p-5 bg-white dark:bg-surface-900/60">
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400">Multi-Presence Events</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-surface-900 dark:text-surface-50">0</p>
                <p className="mt-1 text-xs text-surface-500 dark:text-surface-400 font-mono">CV-SIG-002: CLEAR</p>
              </div>
              <div className="p-5 bg-white dark:bg-surface-900/60">
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400">Human Review</p>
                <p className="mt-2 text-2xl font-semibold text-surface-900 dark:text-surface-50">Ready</p>
                <p className="mt-1 text-xs text-brand-600 dark:text-brand-400 font-mono">EVIDENCE LINKED</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="features" className="py-20 border-b border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
              Capabilities
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-950 dark:text-surface-50">
              Built for operational clarity across HR, interviewers, and candidates
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {capabilities.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="h-9 w-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 flex items-center justify-center mb-4">
                    <item.icon className="h-4 w-4 text-surface-700 dark:text-surface-300" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <p className="mt-5 pt-3 border-t border-surface-100 dark:border-surface-800 text-[11px] font-mono text-surface-500 dark:text-surface-400">
                  {item.meta}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="how-it-works" className="py-20 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
              Workflow
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-950 dark:text-surface-50">
              From scheduling to verified report in four stages
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {workflowSteps.map((step) => (
              <div
                key={step.step}
                className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 p-5"
              >
                <span className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400">
                  STEP {step.step}
                </span>
                <h3 className="mt-2 text-base font-semibold text-surface-900 dark:text-surface-50">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Responsible AI & Guardrails */}
      <section id="trust" className="py-20 border-b border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
              Ethics & Privacy
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-950 dark:text-surface-50">
              Strict guardrails by architecture
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {guardrails.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 p-6 flex items-start gap-4"
              >
                <div className="h-9 w-9 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 flex items-center justify-center shrink-0">
                  <item.icon className="h-4 w-4 text-surface-700 dark:text-surface-300" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 p-8 sm:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-surface-950 dark:text-surface-50">
                Ready to run a structured interview session?
              </h2>
              <p className="mt-1.5 text-sm text-surface-600 dark:text-surface-400 flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                Role-scoped portals for HR, Interviewers, and Candidates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/signin"
                className={buttonVariants({ variant: 'primary', size: 'lg' })}
              >
                Sign In
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/signup"
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Register
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
