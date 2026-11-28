import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Building2,
  Crown,
  Trash2,
  CheckCircle,
  RefreshCw,
  Send,
  Webhook,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, TableColumn } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import {
  apiClient,
  OrganizationProfile,
  OrganizationMember,
  AuditLogEntry,
} from '@/lib/api'

export function HROrganizationPage() {
  const [activeTab, setActiveTab] = useState<'team' | 'plan' | 'governance' | 'webhooks' | 'audit'>('team')
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Team Member state
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('INTERVIEWER')
  const [isInviting, setIsInviting] = useState(false)

  // Governance state
  const [evidenceDays, setEvidenceDays] = useState(30)
  const [eventsDays, setEventsDays] = useState(90)
  const [autoPurge, setAutoPurge] = useState(false)
  const [isSavingGov, setIsSavingGov] = useState(false)
  const [isPurging, setIsPurging] = useState(false)

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [isSavingWebhook, setIsSavingWebhook] = useState(false)
  const [isTestingWebhook, setIsTestingWebhook] = useState(false)
  const [testWebhookResult, setTestWebhookResult] = useState<unknown | null>(null)

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)

  // Load organization profile on mount
  const loadOrganization = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await apiClient.getOrganization()
      setOrganization(res.organization)
      if (res.organization.governance) {
        setEvidenceDays(res.organization.governance.evidence_retention_days || 30)
        setEventsDays(res.organization.governance.events_retention_days || 90)
        setAutoPurge(Boolean(res.organization.governance.auto_purge_enabled))
      }
      if (res.organization.webhook_config) {
        setWebhookUrl(res.organization.webhook_config.url || '')
        setWebhookEnabled(Boolean(res.organization.webhook_config.enabled))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load organization profile'
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrganization()
  }, [loadOrganization])

  // Load audit logs when switching to audit tab
  useEffect(() => {
    if (activeTab === 'audit') {
      setIsLoadingLogs(true)
      apiClient
        .getAuditLogs({ limit: 50 })
        .then((res) => {
          setAuditLogs(res.logs || [])
        })
        .catch(() => {})
        .finally(() => setIsLoadingLogs(false))
    }
  }, [activeTab])

  // Invite member
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !inviteName) return
    setIsInviting(true)
    setErrorMessage(null)
    try {
      const res = await apiClient.addOrganizationMember({
        email: inviteEmail,
        name: inviteName,
        role: inviteRole,
      })
      setOrganization(res.organization)
      setShowInviteModal(false)
      setInviteEmail('')
      setInviteName('')
      setStatusMessage(`Successfully added member ${inviteName}.`)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setIsInviting(false)
    }
  }

  // Remove member
  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return
    try {
      const res = await apiClient.removeOrganizationMember(userId)
      setOrganization(res.organization)
      setStatusMessage('Member removed successfully.')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  // Update Plan Tier
  const handlePlanTierChange = async (newTier: string) => {
    setIsLoading(true)
    try {
      const res = await apiClient.updateOrganization({ plan_tier: newTier })
      setOrganization(res.organization)
      setStatusMessage(`Plan tier updated to ${newTier}.`)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update plan tier')
    } finally {
      setIsLoading(false)
    }
  }

  // Save Governance
  const handleSaveGovernance = async () => {
    setIsSavingGov(true)
    setStatusMessage(null)
    try {
      const res = await apiClient.updateGovernanceSettings({
        governance: {
          evidence_retention_days: evidenceDays,
          events_retention_days: eventsDays,
          auto_purge_enabled: autoPurge,
        },
      })
      if (organization) {
        setOrganization({
          ...organization,
          governance: res.governance,
        })
      }
      setStatusMessage('Data retention governance policy saved.')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save governance')
    } finally {
      setIsSavingGov(false)
    }
  }

  // Purge Expired Data
  const handlePurgeData = async () => {
    if (!confirm('Execute retention purge now? This will permanently delete expired observation records.')) return
    setIsPurging(true)
    try {
      const res = await apiClient.purgeExpiredData()
      setStatusMessage(`Retention purge complete: ${res.purged_evidence_count} evidence items and ${res.purged_events_count} events purged.`)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to execute purge')
    } finally {
      setIsPurging(false)
    }
  }

  // Save Webhook
  const handleSaveWebhook = async () => {
    setIsSavingWebhook(true)
    try {
      const res = await apiClient.updateGovernanceSettings({
        webhook_config: {
          url: webhookUrl.trim() || null,
          enabled: webhookEnabled,
        },
      })
      if (organization) {
        setOrganization({
          ...organization,
          webhook_config: res.webhook_config,
        })
      }
      setStatusMessage('Webhook integration configuration saved.')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save webhook settings')
    } finally {
      setIsSavingWebhook(false)
    }
  }

  // Test Webhook
  const handleTestWebhook = async () => {
    setIsTestingWebhook(true)
    setTestWebhookResult(null)
    try {
      const res = await apiClient.testWebhook()
      setTestWebhookResult(res)
      setStatusMessage('Test webhook emitted and signature verified.')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to test webhook')
    } finally {
      setIsTestingWebhook(false)
    }
  }

  const members = useMemo(() => organization?.members || [], [organization?.members])

  const filteredMembers = useMemo(() => {
    let result = [...members]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    }
    if (roleFilter !== 'all') {
      result = result.filter((m) => m.role === roleFilter)
    }
    return result
  }, [members, searchQuery, roleFilter])

  const memberColumns: TableColumn<OrganizationMember>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="sm" />
          <div>
            <p className="font-medium text-surface-900 dark:text-surface-50">{row.name}</p>
            <p className="text-xs text-surface-500 dark:text-surface-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <Badge variant="neutral" className="font-mono text-xs">
          {row.role}
        </Badge>
      ),
    },
    {
      key: 'added_at',
      header: 'Joined',
      render: (row) => (
        <span className="text-xs text-surface-500">
          {new Date(row.added_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRemoveMember(row.user_id)}
          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1 h-auto"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  const auditColumns: TableColumn<AuditLogEntry>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge variant="neutral" className="font-mono text-[11px] bg-surface-100 text-surface-800 dark:bg-surface-800 dark:text-surface-200">
          {row.action}
        </Badge>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="text-xs">
          <span className="font-medium text-surface-900 dark:text-surface-100">{row.actor_name}</span>
          <span className="text-surface-400 text-[10px] ml-1">({row.actor_role})</span>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Context & Details',
      render: (row) => (
        <span className="text-xs text-surface-600 dark:text-surface-400 font-mono text-[11px]">
          {JSON.stringify(row.details).slice(0, 80)}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Timestamp',
      className: 'text-right',
      render: (row) => (
        <span className="text-[11px] text-surface-500">
          {new Date(row.created_at).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
                {organization?.name || 'Enterprise Workspace'}
              </h1>
              <p className="text-xs text-surface-500 mt-0.5">
                Multi-Tenant Governance, Member Roster, Retention Policies & Audit Trail (Phase 24)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {organization && (
            <Badge variant="neutral" className="bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300 font-semibold px-3 py-1">
              <Crown className="h-3.5 w-3.5 mr-1" />
              {organization.plan_tier} TIER
            </Badge>
          )}
          <Button size="sm" variant="neutral" onClick={loadOrganization} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs font-semibold">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-xs font-semibold">✕</button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} variant="pills">
        <TabsList>
          <TabsTrigger value="team" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            Team Roster ({members.length})
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5 text-xs">
            <Crown className="h-3.5 w-3.5" />
            Plan & Entitlements
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Data Retention & Purge
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-1.5 text-xs">
            <Webhook className="h-3.5 w-3.5" />
            Webhooks & API
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Enterprise Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Team Roster */}
        <TabsContent value="team" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team members by name or email..."
                  className="pl-8 text-xs"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-surface-700 dark:text-surface-300"
              >
                <option value="all">All Roles</option>
                <option value="HR_ADMIN">HR Admin</option>
                <option value="RECRUITER">Recruiter</option>
                <option value="INTERVIEWER">Interviewer</option>
              </select>
            </div>

            <Button size="sm" onClick={() => setShowInviteModal(true)} className="gap-1.5 text-xs">
              <UserPlus className="h-3.5 w-3.5" />
              Add Team Member
            </Button>
          </div>

          <Card className="border-surface-200 dark:border-surface-700">
            <DataTable
              data={filteredMembers}
              columns={memberColumns}
              keyExtractor={(row) => row.user_id}
              emptyMessage="No organization members match your search criteria."
            />
          </Card>
        </TabsContent>

        {/* Tab 2: Plan & Entitlements */}
        <TabsContent value="plan" className="space-y-4 pt-2">
          <Card className="border-surface-200 dark:border-surface-700">
            <CardHeader className="py-4 px-5 border-b border-surface-200 dark:border-surface-700">
              <CardTitle className="text-sm font-semibold">Subscription Tier & Operational Entitlements</CardTitle>
              <CardDescription className="text-xs">
                Select a plan tier to configure member capacity, concurrent interview limits, and multimodal intelligence entitlements.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Starter */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    organization?.plan_tier === 'STARTER'
                      ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20 ring-1 ring-brand-500'
                      : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">Starter Tier</span>
                    {organization?.plan_tier === 'STARTER' && (
                      <Badge variant="neutral" className="bg-brand-100 text-brand-800 text-[10px]">CURRENT</Badge>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mb-4">Small teams conducting standard structured video interviews.</p>
                  <ul className="text-xs space-y-1.5 text-surface-700 dark:text-surface-300 list-disc list-inside mb-4">
                    <li>Up to 5 Team Members</li>
                    <li>Up to 20 Active Interviews</li>
                    <li>Visual Integrity Monitoring</li>
                    <li>30-day Observation Retention</li>
                  </ul>
                  <Button
                    size="sm"
                    variant={organization?.plan_tier === 'STARTER' ? 'neutral' : 'primary'}
                    onClick={() => handlePlanTierChange('STARTER')}
                    disabled={organization?.plan_tier === 'STARTER' || isLoading}
                    className="w-full text-xs"
                  >
                    {organization?.plan_tier === 'STARTER' ? 'Active Tier' : 'Switch to Starter'}
                  </Button>
                </div>

                {/* Growth */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    organization?.plan_tier === 'GROWTH'
                      ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20 ring-1 ring-brand-500'
                      : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">Growth Tier</span>
                    {organization?.plan_tier === 'GROWTH' && (
                      <Badge variant="neutral" className="bg-brand-100 text-brand-800 text-[10px]">CURRENT</Badge>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mb-4">Mid-size hiring teams requiring V2 multimodal insights & webhooks.</p>
                  <ul className="text-xs space-y-1.5 text-surface-700 dark:text-surface-300 list-disc list-inside mb-4">
                    <li>Up to 25 Team Members</li>
                    <li>Up to 100 Active Interviews</li>
                    <li>V2 Multimodal Intelligence (Audio/NLP)</li>
                    <li>Webhooks & HMAC Signatures</li>
                    <li>90-day Observation Retention</li>
                  </ul>
                  <Button
                    size="sm"
                    variant={organization?.plan_tier === 'GROWTH' ? 'neutral' : 'primary'}
                    onClick={() => handlePlanTierChange('GROWTH')}
                    disabled={organization?.plan_tier === 'GROWTH' || isLoading}
                    className="w-full text-xs"
                  >
                    {organization?.plan_tier === 'GROWTH' ? 'Active Tier' : 'Switch to Growth'}
                  </Button>
                </div>

                {/* Enterprise */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    organization?.plan_tier === 'ENTERPRISE'
                      ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20 ring-1 ring-brand-500'
                      : 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-850'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">Enterprise Tier</span>
                    {organization?.plan_tier === 'ENTERPRISE' && (
                      <Badge variant="neutral" className="bg-brand-100 text-brand-800 text-[10px]">CURRENT</Badge>
                    )}
                  </div>
                  <p className="text-xs text-surface-500 mb-4">High-volume organizations requiring high limits & custom retention.</p>
                  <ul className="text-xs space-y-1.5 text-surface-700 dark:text-surface-300 list-disc list-inside mb-4">
                    <li>Up to 250 Team Members</li>
                    <li>Up to 1,000 Active Interviews</li>
                    <li>Full Multimodal Suite + Diarization</li>
                    <li>Up to 365-day Custom Retention</li>
                    <li>Dedicated Operational SLA</li>
                  </ul>
                  <Button
                    size="sm"
                    variant={organization?.plan_tier === 'ENTERPRISE' ? 'neutral' : 'primary'}
                    onClick={() => handlePlanTierChange('ENTERPRISE')}
                    disabled={organization?.plan_tier === 'ENTERPRISE' || isLoading}
                    className="w-full text-xs"
                  >
                    {organization?.plan_tier === 'ENTERPRISE' ? 'Active Tier' : 'Switch to Enterprise'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Governance & Retention */}
        <TabsContent value="governance" className="space-y-4 pt-2">
          <Card className="border-surface-200 dark:border-surface-700">
            <CardHeader className="py-4 px-5 border-b border-surface-200 dark:border-surface-700">
              <CardTitle className="text-sm font-semibold">Data Retention & Governance Policies</CardTitle>
              <CardDescription className="text-xs">
                Configure GDPR and privacy-compliant retention periods for interview evidence keyframes and telemetry events.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-surface-800 dark:text-surface-200">
                    Evidence Retention Period (Days)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={organization?.entitlements?.max_retention_days || 90}
                    value={evidenceDays}
                    onChange={(e) => setEvidenceDays(parseInt(e.target.value, 10) || 30)}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-surface-400">
                    Maximum allowed by plan: {organization?.entitlements?.max_retention_days || 90} days.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-surface-800 dark:text-surface-200">
                    Monitoring Events Retention Period (Days)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={organization?.entitlements?.max_retention_days || 90}
                    value={eventsDays}
                    onChange={(e) => setEventsDays(parseInt(e.target.value, 10) || 90)}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-surface-400">
                    Telemetry logs and alert audit entries older than this will be pruned.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button size="sm" onClick={handleSaveGovernance} loading={isSavingGov} className="text-xs">
                  Save Retention Policy
                </Button>

                <Button
                  size="sm"
                  variant="neutral"
                  onClick={handlePurgeData}
                  loading={isPurging}
                  className="text-xs text-rose-600 hover:text-rose-700 gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Purge Expired Data Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Webhooks & API */}
        <TabsContent value="webhooks" className="space-y-4 pt-2">
          <Card className="border-surface-200 dark:border-surface-700">
            <CardHeader className="py-4 px-5 border-b border-surface-200 dark:border-surface-700">
              <CardTitle className="text-sm font-semibold">Outgoing Webhook Dispatch & ATS Integration</CardTitle>
              <CardDescription className="text-xs">
                Receive real-time signed event notifications for interview lifecycle transitions, alert triggers, and report reviews.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-surface-800 dark:text-surface-200">
                  Webhook Endpoint URL
                </label>
                <Input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.yourdomain.com/webhooks/interview-monitoring"
                  className="text-xs font-mono"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={webhookEnabled}
                    onChange={(e) => setWebhookEnabled(e.target.checked)}
                    className="rounded border-surface-300 text-brand-600"
                  />
                  <span className="font-medium text-surface-800 dark:text-surface-200">
                    Enable Webhook Event Dispatch
                  </span>
                </label>
              </div>

              {organization?.webhook_config?.secret && (
                <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-xs space-y-1">
                  <span className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">
                    HMAC-SHA256 Signing Secret:
                  </span>
                  <p className="font-mono text-surface-900 dark:text-surface-100 text-xs select-all">
                    {organization.webhook_config.secret}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button size="sm" onClick={handleSaveWebhook} loading={isSavingWebhook} className="text-xs">
                  Save Webhook Settings
                </Button>

                <Button
                  size="sm"
                  variant="neutral"
                  onClick={handleTestWebhook}
                  loading={isTestingWebhook}
                  className="gap-1.5 text-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  Emit Test Ping
                </Button>
              </div>

              {testWebhookResult && (
                <div className="mt-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 text-xs font-mono space-y-1">
                  <div className="font-semibold text-emerald-600">Webhook Emission Output:</div>
                  <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(testWebhookResult, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Enterprise Audit Log */}
        <TabsContent value="audit" className="space-y-4 pt-2">
          <Card className="border-surface-200 dark:border-surface-700">
            <CardHeader className="py-4 px-5 border-b border-surface-200 dark:border-surface-700">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Administrative & Review Audit Trail</CardTitle>
                  <CardDescription className="text-xs">
                    Immutable log of membership modifications, governance changes, and sensitive session events.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsLoadingLogs(true)
                    apiClient.getAuditLogs({ limit: 50 }).then((r) => setAuditLogs(r.logs || [])).finally(() => setIsLoadingLogs(false))
                  }}
                  className="text-xs gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingLogs ? (
                <div className="py-8 text-center text-xs text-surface-500">Loading audit log entries...</div>
              ) : (
                <DataTable
                  data={auditLogs}
                  columns={auditColumns}
                  keyExtractor={(row) => row.log_id || row._id}
                  emptyMessage="No audit log entries recorded yet."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invite Member Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite Team Member"
        description="Add an interviewer or HR administrator to your organization workspace."
      >
        <form onSubmit={handleInviteMember} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-700 dark:text-surface-300">Full Name</label>
            <Input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Elena Rostova"
              required
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-700 dark:text-surface-300">Email Address</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="elena@company.com"
              required
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-700 dark:text-surface-300">Workspace Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full text-xs rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 p-2 text-surface-900 dark:text-surface-100"
            >
              <option value="INTERVIEWER">Interviewer (Conduct & Review Sessions)</option>
              <option value="RECRUITER">Recruiter (Schedule & Invite Candidates)</option>
              <option value="HR_ADMIN">HR Admin (Full Workspace & Governance Control)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="neutral" size="sm" onClick={() => setShowInviteModal(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={isInviting}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
