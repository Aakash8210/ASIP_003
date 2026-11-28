import {
  LayoutDashboard,
  Users,
  Calendar,
  Activity,
  FileText,
  Building2,
  Settings,
  Shield,
} from 'lucide-react'
import { AppShell, type ShellNavItem, type ShellNotification } from './AppShell'

const navigation: ShellNavItem[] = [
  { name: 'Dashboard', href: '/hr/dashboard', icon: LayoutDashboard },
  { name: 'Interviews', href: '/hr/interviews', icon: Calendar },
  { name: 'Live Monitoring', href: '/hr/live', icon: Activity, badge: 'Active', badgeTone: 'success' },
  { name: 'Candidates', href: '/hr/candidates', icon: Users },
  { name: 'Reports', href: '/hr/reports', icon: FileText },
  { name: 'Organization', href: '/hr/organization', icon: Building2 },
  { name: 'Settings', href: '/hr/settings', icon: Settings },
]

const notifications: ShellNotification[] = [
  { id: '1', title: 'New candidate registered', message: 'Alex Rivera registered for Senior Frontend Engineer', time: '2 min ago', read: false },
  { id: '2', title: 'Session completed', message: 'Interview session with Jane Smith concluded', time: '15 min ago', read: false },
  { id: '3', title: 'System check passed', message: 'Pre-flight checks verified for scheduled sessions', time: '1 hour ago', read: true },
]

export function HRLayout() {
  return (
    <AppShell
      portalLabel="Recruitment Operations"
      homeHref="/hr/dashboard"
      settingsHref="/hr/settings"
      notificationsHref="/hr/reports"
      navigation={navigation}
      notifications={notifications}
      brandIcon={Shield}
      layoutId="hr-nav-pill"
    />
  )
}
