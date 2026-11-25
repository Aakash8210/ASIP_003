import {
  LayoutDashboard,
  Calendar,
  FileText,
  Settings,
  Computer,
  Shield,
} from 'lucide-react'
import { AppShell, type ShellNavItem, type ShellNotification } from './AppShell'

const navigation: ShellNavItem[] = [
  { name: 'Dashboard', href: '/interviewee/dashboard', icon: LayoutDashboard },
  { name: 'Upcoming Interviews', href: '/interviewee/interviews', icon: Calendar },
  { name: 'System Check', href: '/interviewee/system-check', icon: Computer, badge: 'Check', badgeTone: 'success' },
  { name: 'History', href: '/interviewee/history', icon: FileText },
  { name: 'Settings', href: '/interviewee/settings', icon: Settings },
]

const notifications: ShellNotification[] = [
  { id: '1', title: 'Interview scheduled', message: 'Senior Frontend Engineer interview scheduled for tomorrow 2:00 PM', time: '1 hour ago', read: false },
  { id: '2', title: 'System check required', message: 'Please complete your system check before the interview', time: '3 hours ago', read: false },
  { id: '3', title: 'Interview completed', message: 'Your interview session has been completed', time: '2 days ago', read: true },
]

export function IntervieweeLayout() {
  return (
    <AppShell
      portalLabel="Candidate"
      homeHref="/interviewee/dashboard"
      settingsHref="/interviewee/settings"
      notificationsHref="/interviewee/notifications"
      navigation={navigation}
      notifications={notifications}
      brandIcon={Shield}
      layoutId="interviewee-nav-pill"
    />
  )
}
