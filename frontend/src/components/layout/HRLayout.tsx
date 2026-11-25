import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Settings,
  Building2,
  Shield,
} from 'lucide-react'
import { AppShell, type ShellNavItem, type ShellNotification } from './AppShell'

const navigation: ShellNavItem[] = [
  { name: 'Dashboard', href: '/hr/dashboard', icon: LayoutDashboard },
  { name: 'Candidates', href: '/hr/candidates', icon: Users },
  { name: 'Interviews', href: '/hr/interviews', icon: Calendar },
  { name: 'Reports', href: '/hr/reports', icon: FileText },
  { name: 'Organization', href: '/hr/organization', icon: Building2 },
  { name: 'Settings', href: '/hr/settings', icon: Settings },
]

const notifications: ShellNotification[] = [
  { id: '1', title: 'New candidate registered', message: 'Alex Rivera applied for Senior Frontend Engineer', time: '2 min ago', read: false },
  { id: '2', title: 'Interview completed', message: 'Interview with Jane Smith has been completed', time: '15 min ago', read: false },
  { id: '3', title: 'System check passed', message: 'All candidates passed system checks for tomorrow', time: '1 hour ago', read: true },
]

export function HRLayout() {
  return (
    <AppShell
      portalLabel="HR Portal"
      homeHref="/hr/dashboard"
      settingsHref="/hr/settings"
      notificationsHref="/hr/notifications"
      navigation={navigation}
      notifications={notifications}
      brandIcon={Shield}
      layoutId="hr-nav-pill"
    />
  )
}
