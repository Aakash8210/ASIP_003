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
  { name: 'My Interviews', href: '/interviewee/interviews', icon: Calendar },
  { name: 'System Readiness', href: '/interviewee/system-check', icon: Computer, badge: 'Required', badgeTone: 'info' },
  { name: 'Interview History', href: '/interviewee/history', icon: FileText },
  { name: 'Settings', href: '/interviewee/settings', icon: Settings },
]

const notifications: ShellNotification[] = [
  { id: '1', title: 'Interview scheduled', message: 'Technical assessment session scheduled with engineering team', time: '1 hour ago', read: false },
  { id: '2', title: 'System check recommended', message: 'Verify camera and microphone readiness prior to call time', time: '3 hours ago', read: false },
  { id: '3', title: 'Privacy disclosure updated', message: 'Review data processing policies and transparency guidelines', time: '2 days ago', read: true },
]

export function IntervieweeLayout() {
  return (
    <AppShell
      portalLabel="Candidate Hub"
      homeHref="/interviewee/dashboard"
      settingsHref="/interviewee/settings"
      notificationsHref="/interviewee/history"
      navigation={navigation}
      notifications={notifications}
      brandIcon={Shield}
      layoutId="interviewee-nav-pill"
    />
  )
}
