import {
  LayoutDashboard,
  Calendar,
  Activity,
  FileText,
  Settings,
  Video,
} from 'lucide-react'
import { AppShell, type ShellNavItem, type ShellNotification } from './AppShell'

const navigation: ShellNavItem[] = [
  { name: 'Dashboard', href: '/interviewer/dashboard', icon: LayoutDashboard },
  { name: 'My Interviews', href: '/interviewer/interviews', icon: Calendar },
  { name: 'Live Monitoring', href: '/interviewer/live', icon: Activity, badge: 'Live', badgeTone: 'success' },
  { name: 'Post-Session Reports', href: '/interviewer/reports', icon: FileText },
  { name: 'Settings', href: '/interviewer/settings', icon: Settings },
]

const notifications: ShellNotification[] = [
  { id: '1', title: 'Upcoming interview session', message: 'Senior Frontend Engineer interview starting soon', time: '10 min ago', read: false },
  { id: '2', title: 'Candidate ready in room', message: 'Candidate joined WebRTC peer session', time: '2 min ago', read: false },
  { id: '3', title: 'Telemetry verified', message: '1 fps face presence sampling operating normally', time: '1 hour ago', read: true },
]

export function InterviewerLayout() {
  return (
    <AppShell
      portalLabel="Reviewer Console"
      homeHref="/interviewer/dashboard"
      settingsHref="/interviewer/settings"
      notificationsHref="/interviewer/reports"
      navigation={navigation}
      notifications={notifications}
      brandIcon={Video}
      layoutId="interviewer-nav-pill"
    />
  )
}
