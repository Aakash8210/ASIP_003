import {
  LayoutDashboard,
  Calendar,
  FileText,
  Settings,
  Video,
} from 'lucide-react'
import { AppShell, type ShellNavItem, type ShellNotification } from './AppShell'

const navigation: ShellNavItem[] = [
  { name: 'Dashboard', href: '/interviewer/dashboard', icon: LayoutDashboard },
  { name: 'My Interviews', href: '/interviewer/interviews', icon: Calendar },
  { name: 'Live Sessions', href: '/interviewer/live', icon: Video, badge: 'LIVE', badgeTone: 'danger' },
  { name: 'Reports', href: '/interviewer/reports', icon: FileText },
  { name: 'Settings', href: '/interviewer/settings', icon: Settings },
]

const notifications: ShellNotification[] = [
  { id: '1', title: 'Interview starting soon', message: 'Senior Frontend Engineer interview in 10 minutes', time: '5 min ago', read: false },
  { id: '2', title: 'Candidate joined', message: 'Alex Rivera has joined the waiting room', time: '2 min ago', read: false },
  { id: '3', title: 'Interview completed', message: 'Interview with Jane Smith completed successfully', time: '1 hour ago', read: true },
]

export function InterviewerLayout() {
  return (
    <AppShell
      portalLabel="Interviewer"
      homeHref="/interviewer/dashboard"
      settingsHref="/interviewer/settings"
      notificationsHref="/interviewer/notifications"
      navigation={navigation}
      notifications={notifications}
      brandIcon={Video}
      layoutId="interviewer-nav-pill"
    />
  )
}
