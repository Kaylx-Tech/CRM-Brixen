import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { isAdminRole } from '@/lib/permissions'
import { IconDeviceFloppy, IconLoader2, IconMail, IconBuilding, IconCloud, IconWorld, IconWebhook, IconId, IconCopy } from '@tabler/icons-react'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import { apiRequest, getApiBase } from '@/lib/api'
import { IS_FINSTAP, getWorkspace } from '@/lib/workspace'
import { loadBranding } from '@/lib/branding'
import BrandingTab from './BrandingTab'
import InvoicesTab from './InvoicesTab'
import PlanTab from './PlanTab'
import { accountsFromSaved, accountsToSaved, linksFromSaved, linksToSaved } from './invoiceSettings'

// Where Didit posts verification results (the API may live on another address than this page);
// on Finstap it names the workspace, so the result is saved in that company's database
function diditWebhookUrl() {
  const url = new URL(`${getApiBase()}/webhooks/didit`, window.location.origin)
  const workspace = IS_FINSTAP ? getWorkspace() : ''
  if (workspace) url.searchParams.set('workspace', workspace)
  return url.href
}

const MIN_PASSWORD = 10
// Branding (logo, icon, accent colour) and Invoices (bank accounts per country, links) are Finstap company
// settings; Brixen keeps its own look and its own bank details. Finstap manages integrations (Didit, Companies
// House …) for every workspace itself, so workspaces have no Integrations tab.
const SETTINGS_TABS = new Set(['general', ...(IS_FINSTAP ? ['branding'] : []), 'email',
  ...(IS_FINSTAP ? [] : ['integrations']), 'compliance',
  ...(IS_FINSTAP ? ['invoices', 'plan'] : []), 'profile'])

function syncLocalUser(user) {
  if (!user) return
  try {
    const prev = JSON.parse(localStorage.getItem('user') || '{}')
    localStorage.setItem(
      'user',
      JSON.stringify({
        ...prev,
        ...user,
        name: user.full_name || user.name || prev.name,
        full_name: user.full_name || user.name || prev.full_name,
      })
    )
  } catch (_) {
    /* ignore */
  }
}

const EMPTY_FORM = {
  company_name: '',
  brand_name: '',
  support_email: '',
  support_phone: '',
  legal_name: '',
  company_number: '',
  registered_office: '',
  ico_number: '',
  invoice_payment_details: '',
  invoice_bank_accounts: [],
  invoice_links: [],
  team_notification_emails: '',
  currency: '£',
  order_prefix: '',
  order_number_prefix: 'ORD',
  invoice_prefix: 'INV-',
  portal_url: '',
  frontend_url: '',
  uk_formfill_pro_url: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  companies_house_api_key: '',
  didit_api_key: '',
  didit_webhook_secret: '',
  didit_workflow_id: '',
  didit_callback_url: '',
  getaddress_api_key: '',
  google_drive_root_folder: '',
  google_service_account_json: '',
  wordpress_url: '',
  wordpress_webhook_secret: '',
  compliance_alerts_enabled: false,
  emails_enabled: true,
  compliance_alerts_verified_only: false,
  compliance_alerts_whatsapp_enabled: true,
  compliance_alerts_test_mode: false,
  compliance_alerts_send_hour: '11',
  compliance_alerts_interval_hours: '24',
  compliance_alerts_timezone: 'Asia/Karachi',
  compliance_alerts_test_recipient: '',
  compliance_alerts_website: '',
  compliance_alerts_whatsapp_url: '',
  brand_logo: '',
  brand_logo_dark: '',
  brand_icon: '',
  accent_color: '',
  accent_auto: true,
}

function asBool(val, fallback = false) {
  if (val === undefined || val === null || val === '') return fallback
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(s)) return true
  if (['0', 'false', 'no', 'off'].includes(s)) return false
  return fallback
}

function Field({ id, label, hint, children }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground m-0">{hint}</p> : null}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <div className="rounded-md border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

// "OCT26" for this month (example in the Order prefix hint)
const MONTH_TAG = (() => {
  const d = new Date()
  return `${d.toLocaleString('en-GB', { month: 'short' }).toUpperCase().slice(0, 3)}${String(d.getFullYear()).slice(-2)}`
})()

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  // System settings are admin-only (old portal rule); everyone else only gets their own profile
  const canManageSettings = isAdminRole()
  const tab = !canManageSettings ? 'profile' : (SETTINGS_TABS.has(tabParam) ? tabParam : 'general')
  const isProfileTab = tab === 'profile'

  const setTab = (next) => {
    const value = SETTINGS_TABS.has(next) ? next : 'general'
    if (value === 'general') setSearchParams({}, { replace: true })
    else setSearchParams({ tab: value }, { replace: true })
  }

  const [form, setForm] = useState(EMPTY_FORM)
  const [profile, setProfile] = useState({
    email: '',
    role: '',
    full_name: '',
    phone: '',
    country: '',
    address: '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [flags, setFlags] = useState({
    smtp_pass_set: false,
    companies_house_api_key_set: false,
    companies_house_platform: false,
    didit_platform: false,
    didit_api_key_set: false,
    didit_webhook_secret_set: false,
    google_service_account_json_set: false,
    wordpress_webhook_secret_set: false,
    getaddress_configured: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [testing, setTesting] = useState('')
  const [loadError, setLoadError] = useState(null)

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  const setProfileField = (key, value) => {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  const loadProfile = useCallback(async () => {
    const res = await apiRequest('/auth/me', { label: 'Profile', silent: true })
    if (!res.ok) return
    const user = res.data?.data?.user || res.data?.user || {}
    syncLocalUser(user)
    setProfile({
      email: user.email || '',
      role: user.role || '',
      full_name: user.full_name || user.name || '',
      phone: user.phone || '',
      country: user.country || '',
      address: user.address || '',
      current_password: '',
      new_password: '',
      confirm_password: '',
    })
  }, [])

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      if (!canManageSettings) {
        await loadProfile()
        return
      }
      const [res] = await Promise.all([
        apiRequest('/admin/settings', { label: 'System Settings' }),
        loadProfile(),
      ])
      if (!res.ok) {
        setLoadError(res.reason || 'Failed to load settings')
        return
      }
      const payload = res.data?.data || res.data || {}
      const brand = payload.brand || {}
      const smtp = payload.smtp || {}
      const drive = payload.google_drive || {}
      const ch = payload.companies_house || {}
      const didit = payload.didit || {}
      const webhooks = payload.webhooks || {}
      const compliance = payload.compliance || {}
      const flat = payload.flat || {}

      setForm({
        ...EMPTY_FORM,
        company_name: brand.company_name || flat.company_name || '',
        brand_name: brand.brand_name || flat.brand_name || '',
        support_email: brand.support_email || flat.support_email || '',
        support_phone: brand.support_phone || flat.support_phone || '',
        legal_name: brand.legal_name || flat.legal_name || '',
        company_number: flat.company_number || '',
        registered_office: flat.registered_office || '',
        ico_number: flat.ico_number || '',
        invoice_payment_details: brand.invoice_payment_details || flat.invoice_payment_details || '',
        invoice_bank_accounts: accountsFromSaved(flat.invoice_bank_accounts),
        invoice_links: linksFromSaved(flat.invoice_links),
        team_notification_emails: flat.team_notification_emails || '',
        currency: brand.currency || flat.currency || '£',
        order_prefix: brand.order_prefix || flat.order_prefix || '',
        order_number_prefix: brand.order_number_prefix || flat.order_number_prefix || 'ORD',
        invoice_prefix: brand.invoice_prefix || flat.invoice_prefix || 'INV-',
        portal_url: brand.portal_url || flat.portal_url || '',
        frontend_url: brand.frontend_url || flat.frontend_url || '',
        uk_formfill_pro_url: flat.uk_formfill_pro_url || '',
        smtp_host: smtp.smtp_host || '',
        smtp_port: smtp.smtp_port || '587',
        smtp_user: smtp.smtp_user || '',
        smtp_pass: '',
        smtp_from: smtp.smtp_from || '',
        companies_house_api_key: '',
        didit_api_key: '',
        didit_webhook_secret: '',
        didit_workflow_id: didit.didit_workflow_id || '',
        didit_callback_url: didit.didit_callback_url || '',
        getaddress_api_key: '',
        google_drive_root_folder: drive.google_drive_root_folder || '',
        google_service_account_json: '',
        wordpress_url: webhooks.wordpress_url || '',
        wordpress_webhook_secret: '',
        compliance_alerts_enabled: asBool(compliance.compliance_alerts_enabled, false),
        emails_enabled: asBool(flat.emails_enabled, true),
        compliance_alerts_verified_only: asBool(flat.compliance_alerts_verified_only, false),
        compliance_alerts_whatsapp_enabled: asBool(flat.compliance_alerts_whatsapp_enabled, true),
        compliance_alerts_test_mode: asBool(flat.compliance_alerts_test_mode, false),
        compliance_alerts_send_hour: String(
          compliance.compliance_alerts_send_hour || compliance.compliance_send_hour || '11'
        ),
        compliance_alerts_interval_hours: String(flat.compliance_alerts_interval_hours || '24'),
        compliance_alerts_timezone: flat.compliance_alerts_timezone || 'Asia/Karachi',
        compliance_alerts_test_recipient:
          compliance.compliance_alerts_test_recipient ||
          compliance.compliance_test_recipient ||
          '',
        compliance_alerts_website: flat.compliance_alerts_website || '',
        compliance_alerts_whatsapp_url: flat.compliance_alerts_whatsapp_url || '',
        brand_logo: brand.brand_logo || '',
        brand_logo_dark: brand.brand_logo_dark || '',
        brand_icon: brand.brand_icon || '',
        accent_color: brand.accent_color || '',
        accent_auto: brand.accent_auto !== false,
      })

      setFlags({
        smtp_pass_set: !!smtp.smtp_pass_set,
        companies_house_api_key_set: !!ch.companies_house_api_key_set,
        companies_house_platform: !!ch.companies_house_platform,
        didit_platform: !!didit.didit_platform,
        didit_api_key_set: !!didit.didit_api_key_set,
        didit_webhook_secret_set: !!didit.didit_webhook_secret_set,
        google_service_account_json_set: !!drive.google_service_account_json_set,
        wordpress_webhook_secret_set: !!webhooks.wordpress_webhook_secret_set,
        getaddress_configured: !!flat.getaddress_api_key,
      })
    } catch (err) {
      setLoadError(err?.message || 'Unexpected error')
    } finally {
      setIsLoading(false)
    }
  }, [loadProfile, canManageSettings])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSaveProfile = async () => {
    const changingPassword = !!(
      profile.current_password ||
      profile.new_password ||
      profile.confirm_password
    )
    if (changingPassword) {
      if (!profile.current_password) {
        toast.error('Enter your current password to change it.')
        return
      }
      if (profile.new_password.length < MIN_PASSWORD) {
        toast.error(`New password must be at least ${MIN_PASSWORD} characters.`)
        return
      }
      if (profile.new_password !== profile.confirm_password) {
        toast.error('New passwords do not match.')
        return
      }
    }
    if (!profile.full_name.trim()) {
      toast.error('Full name is required.')
      return
    }

    setIsSaving(true)
    const toastId = toastProcessing(
      changingPassword ? 'Updating profile & password…' : 'Saving profile…',
    )
    try {
      const payload = {
        full_name: profile.full_name.trim(),
        phone: profile.phone.trim(),
        country: profile.country.trim(),
        address: profile.address.trim(),
      }
      if (changingPassword) {
        payload.current_password = profile.current_password
        payload.new_password = profile.new_password
        payload.confirm_password = profile.confirm_password
      }
      const res = await apiRequest('/auth/profile', {
        method: 'POST',
        body: JSON.stringify(payload),
        label: 'Save profile',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Failed to save profile')
        return
      }
      const user = res.data?.data?.user || res.data?.user
      if (user) syncLocalUser(user)
      toastDone(
        toastId,
        res.data?.message ||
          (changingPassword
            ? 'Profile and password updated.'
            : 'Profile updated.'),
      )
      await loadProfile()
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (isProfileTab) {
      await handleSaveProfile()
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        company_name: form.company_name.trim(),
        brand_name: (form.brand_name || form.company_name).trim(),
        support_email: form.support_email.trim(),
        support_phone: form.support_phone.trim(),
        legal_name: form.legal_name.trim(),
        company_number: form.company_number.trim(),
        registered_office: form.registered_office.trim(),
        ico_number: form.ico_number.trim(),
        invoice_payment_details: form.invoice_payment_details.trim(),
        team_notification_emails: form.team_notification_emails.trim(),
        currency: form.currency.trim() || '£',
        order_prefix: form.order_prefix.trim(),
        order_number_prefix: (form.order_number_prefix || '').trim() || 'ORD',
        invoice_prefix: form.invoice_prefix.trim(),
        portal_url: form.portal_url.trim(),
        frontend_url: form.frontend_url.trim(),
        uk_formfill_pro_url: form.uk_formfill_pro_url.trim().replace(/\/$/, ''),
        smtp_host: form.smtp_host.trim(),
        smtp_port: form.smtp_port.trim(),
        smtp_user: form.smtp_user.trim(),
        smtp_from: form.smtp_from.trim(),
        google_drive_root_folder: form.google_drive_root_folder.trim(),
        wordpress_url: form.wordpress_url.trim(),
        didit_workflow_id: form.didit_workflow_id.trim(),
        didit_callback_url: form.didit_callback_url.trim(),
        compliance_alerts_enabled: form.compliance_alerts_enabled ? '1' : '0',
        emails_enabled: form.emails_enabled ? 'true' : 'false',
        compliance_alerts_verified_only: form.compliance_alerts_verified_only ? '1' : '0',
        compliance_alerts_whatsapp_enabled: form.compliance_alerts_whatsapp_enabled ? '1' : '0',
        compliance_alerts_test_mode: form.compliance_alerts_test_mode ? '1' : '0',
        compliance_alerts_send_hour: form.compliance_alerts_send_hour.trim() || '11',
        compliance_alerts_interval_hours: form.compliance_alerts_interval_hours.trim() || '24',
        compliance_alerts_timezone: form.compliance_alerts_timezone.trim() || 'Asia/Karachi',
        compliance_alerts_test_recipient: form.compliance_alerts_test_recipient.trim(),
        compliance_alerts_website: form.compliance_alerts_website.trim(),
        compliance_alerts_whatsapp_url: form.compliance_alerts_whatsapp_url.trim(),
      }
      if (IS_FINSTAP) {
        Object.assign(payload, {
          brand_logo: form.brand_logo,
          brand_logo_dark: form.brand_logo_dark,
          brand_icon: form.brand_icon,
          accent_color: form.accent_color,
          accent_auto: form.accent_auto ? '1' : '0',
          invoice_bank_accounts: accountsToSaved(form.invoice_bank_accounts),
          invoice_links: linksToSaved(form.invoice_links),
        })
      }

      // Secrets: only send when user typed a new value (blank = keep current)
      if (form.smtp_pass.trim()) payload.smtp_pass = form.smtp_pass.trim()
      if (form.companies_house_api_key.trim()) {
        payload.companies_house_api_key = form.companies_house_api_key.trim()
      }
      if (form.didit_api_key.trim()) payload.didit_api_key = form.didit_api_key.trim()
      if (form.didit_webhook_secret.trim()) payload.didit_webhook_secret = form.didit_webhook_secret.trim()
      if (form.getaddress_api_key.trim()) {
        payload.getaddress_api_key = form.getaddress_api_key.trim()
      }
      if (form.google_service_account_json.trim()) {
        payload.google_service_account_json = form.google_service_account_json.trim()
      }
      if (form.wordpress_webhook_secret.trim()) {
        payload.wordpress_webhook_secret = form.wordpress_webhook_secret.trim()
      }

      const toastId = toastProcessing('Saving system settings…')
      const res = await apiRequest('/admin/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
        label: 'Save settings',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Failed to save settings')
        return
      }
      toastDone(toastId, res.data?.message || 'System settings saved.')
      await loadSettings()
      // New logo / colour everywhere (sidebar, tab icon) and remembered for the next visit
      if (IS_FINSTAP) await loadBranding()
    } finally {
      setIsSaving(false)
    }
  }

  const runTest = async (kind) => {
    setTesting(kind)
    const labels = {
      smtp: 'Testing SMTP…',
      ch: 'Testing Companies House…',
      drive: 'Testing Google Drive…',
      wp: 'Testing WordPress connection…',
      wphook: 'Setting up the signup webhook…',
    }
    const toastId = toastProcessing(labels[kind] || 'Testing connection…')
    try {
      let path = ''
      let body = {}
      if (kind === 'smtp') {
        path = '/admin/settings/test-smtp'
        body = {
          test_email: form.support_email || form.smtp_from || undefined,
          smtp_config: {
            smtp_host: form.smtp_host,
            smtp_port: form.smtp_port,
            smtp_user: form.smtp_user,
            smtp_from: form.smtp_from,
            ...(form.smtp_pass.trim() ? { smtp_pass: form.smtp_pass.trim() } : {}),
          },
        }
      } else if (kind === 'ch') {
        path = '/admin/settings/test-companies-house'
        body = form.companies_house_api_key.trim()
          ? { companies_house_api_key: form.companies_house_api_key.trim() }
          : {}
      } else if (kind === 'didit') {
        path = '/admin/settings/test-didit'
        body = {
          ...(form.didit_api_key.trim() ? { didit_api_key: form.didit_api_key.trim() } : {}),
          ...(form.didit_workflow_id.trim() ? { didit_workflow_id: form.didit_workflow_id.trim() } : {}),
        }
      } else if (kind === 'drive') {
        path = '/admin/settings/test-google-drive'
        body = form.google_service_account_json.trim()
          ? { google_service_account_json: form.google_service_account_json.trim() }
          : {}
      } else if (kind === 'wp') {
        path = '/admin/settings/test-wordpress'
      } else if (kind === 'wphook') {
        path = '/admin/settings/wordpress-webhooks'
      }
      const res = await apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(body),
        label: 'Connection test',
        silent: true,
      })
      if (res.ok) {
        toastDone(
          toastId,
          res.data?.message || res.data?.data?.message || 'Connection OK',
        )
      } else {
        toastFail(toastId, res.reason || 'Connection test failed')
      }
    } finally {
      setTesting('')
    }
  }

  // Invoice business details: General tab for Brixen, Invoices tab (with the invoice prefix) for Finstap
  const invoiceDetails = (
    <Section
      title={IS_FINSTAP ? 'Business details' : 'Invoices'}
      description={IS_FINSTAP
        ? 'Printed at the top of your invoices.'
        : 'Your business details and how customers pay, printed on invoices and payment emails.'}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {IS_FINSTAP && (
          <Field id="invoice_prefix" label="Invoice prefix">
            <Input
              id="invoice_prefix"
              value={form.invoice_prefix}
              onChange={(e) => setField('invoice_prefix', e.target.value)}
              disabled={isLoading}
            />
          </Field>
        )}
        <Field id="legal_name" label="Registered business name">
          <Input
            id="legal_name"
            value={form.legal_name}
            onChange={(e) => setField('legal_name', e.target.value)}
            placeholder="Acme Accountants Ltd"
            disabled={isLoading}
          />
        </Field>
        <Field id="company_number" label="Company number">
          <Input
            id="company_number"
            value={form.company_number}
            onChange={(e) => setField('company_number', e.target.value)}
            placeholder="12345678"
            disabled={isLoading}
          />
        </Field>
        <Field id="registered_office" label="Registered office">
          <Input
            id="registered_office"
            value={form.registered_office}
            onChange={(e) => setField('registered_office', e.target.value)}
            placeholder="1 High Street, London, EC1A 1AA"
            disabled={isLoading}
          />
        </Field>
        <Field id="ico_number" label="ICO registration number">
          <Input
            id="ico_number"
            value={form.ico_number}
            onChange={(e) => setField('ico_number', e.target.value)}
            placeholder="ZA123456"
            disabled={isLoading}
          />
        </Field>
        {/* Finstap: payment details live in the Invoices tab */}
        {!IS_FINSTAP && <div className="md:col-span-2">
          <Field
            id="invoice_payment_details"
            label="Payment details"
            hint="One per line, e.g. “Account name: Acme Ltd”. Left empty, invoices show no payment details."
          >
            <Textarea
              id="invoice_payment_details"
              rows={4}
              value={form.invoice_payment_details}
              onChange={(e) => setField('invoice_payment_details', e.target.value)}
              placeholder={'Account name: Acme Accountants Ltd\nAccount number: 12345678\nSort code: 00-00-00'}
              disabled={isLoading}
            />
          </Field>
        </div>}
      </div>
    </Section>
  )

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{canManageSettings ? 'System Settings' : 'My Profile'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {canManageSettings
              ? (IS_FINSTAP ? 'Branding, email, compliance, invoices, and your profile'
                : 'Branding, email, integrations, compliance, and your profile')
              : 'Your details and password'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="mr-2 h-4 w-4" />
            )}
            {isProfileTab ? 'Save Profile' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList >
          {[
            ['general', 'General'],
            ...(IS_FINSTAP ? [['branding', 'Branding']] : []),
            ['email', 'Email (SMTP)'],
            ...(IS_FINSTAP ? [] : [['integrations', 'Integrations']]),
            ['compliance', 'Compliance'],
            ...(IS_FINSTAP ? [['invoices', 'Invoices'], ['plan', 'Plan & usage']] : []),
            ['profile', 'Profile & Password'],
          ].filter(([value]) => canManageSettings || value === 'profile').map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <TabsContent value="general" className="mt-0 space-y-4">
            <Section title="Brand & contact" description="Shown across admin CRM and client-facing emails.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="company_name" label="Company name">
                  <Input
                    id="company_name"
                    value={form.company_name}
                    onChange={(e) => setField('company_name', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="brand_name" label="Brand name">
                  <Input
                    id="brand_name"
                    value={form.brand_name}
                    onChange={(e) => setField('brand_name', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="support_email" label="Support email">
                  <Input
                    id="support_email"
                    type="email"
                    value={form.support_email}
                    onChange={(e) => setField('support_email', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="support_phone" label="Support phone">
                  <Input
                    id="support_phone"
                    value={form.support_phone}
                    onChange={(e) => setField('support_phone', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field
                  id="team_notification_emails"
                  label="Team notification emails"
                  hint="Comma-separated. Alerts for new orders and support tickets."
                >
                  <Input
                    id="team_notification_emails"
                    value={form.team_notification_emails}
                    onChange={(e) => setField('team_notification_emails', e.target.value)}
                    placeholder="orders@yourcompany.com, support@…"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="currency" label="Currency symbol">
                  <Input
                    id="currency"
                    value={form.currency}
                    onChange={(e) => setField('currency', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field
                  id="order_number_prefix"
                  label="Order prefix"
                  hint={`New CRM orders: ${form.order_number_prefix || 'ORD'}-1001-${MONTH_TAG}. Letters and numbers only; the count carries on.`}
                >
                  <Input
                    id="order_number_prefix"
                    value={form.order_number_prefix}
                    maxLength={8}
                    onChange={(e) => setField('order_number_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    disabled={isLoading}
                  />
                </Field>
                {!IS_FINSTAP && (
                  <Field id="invoice_prefix" label="Invoice prefix">
                    <Input
                      id="invoice_prefix"
                      value={form.invoice_prefix}
                      onChange={(e) => setField('invoice_prefix', e.target.value)}
                      disabled={isLoading}
                    />
                  </Field>
                )}
                <Field id="frontend_url" label="Admin URL">
                  <Input
                    id="frontend_url"
                    value={form.frontend_url}
                    onChange={(e) => setField('frontend_url', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="portal_url" label="Portal URL">
                  <Input
                    id="portal_url"
                    value={form.portal_url}
                    onChange={(e) => setField('portal_url', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field
                  id="uk_formfill_pro_url"
                  label="UK FormFill Pro URL"
                  hint="Quick Tasks → AD01 opens this wizard."
                >
                  <Input
                    id="uk_formfill_pro_url"
                    value={form.uk_formfill_pro_url}
                    onChange={(e) => setField('uk_formfill_pro_url', e.target.value)}
                    placeholder="https://yourcompany.com/formfill"
                    disabled={isLoading}
                  />
                </Field>
              </div>
            </Section>

            {!IS_FINSTAP && invoiceDetails}
          </TabsContent>

          {IS_FINSTAP && (
            <TabsContent value="branding" className="mt-0 space-y-4">
              <BrandingTab form={form} setField={setField} disabled={isLoading || isSaving} />
            </TabsContent>
          )}

          <TabsContent value="email" className="mt-0 space-y-4">
            <Section
              title="Sending"
              description="Master switch for every email to customers and the team (password resets always go out)."
            >
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={!!form.emails_enabled}
                  onCheckedChange={(v) => setField('emails_enabled', !!v)}
                  disabled={isLoading}
                />
                <span className="font-medium">Send emails</span>
              </label>
              <p className={`text-xs ${form.emails_enabled ? 'text-muted-foreground' : 'text-amber-600'}`}>
                {form.emails_enabled
                  ? 'On: order, document, compliance, invoice and team emails are sent.'
                  : 'Off: emails are not sent; they are kept in the Email Log as "Suppressed" and can be sent from there.'}
              </p>
            </Section>

            <Section
              title="Customer email (SMTP)"
              description={
                flags.smtp_pass_set
                  ? 'SMTP password is configured. Leave blank to keep the current password.'
                  : 'Add Hostinger (or other) SMTP so clients receive document and order emails.'
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="smtp_host" label="SMTP host">
                  <Input
                    id="smtp_host"
                    value={form.smtp_host}
                    onChange={(e) => setField('smtp_host', e.target.value)}
                    placeholder="smtp.hostinger.com"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="smtp_port" label="SMTP port">
                  <Input
                    id="smtp_port"
                    value={form.smtp_port}
                    onChange={(e) => setField('smtp_port', e.target.value)}
                    placeholder="587"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="smtp_user" label="SMTP username">
                  <Input
                    id="smtp_user"
                    value={form.smtp_user}
                    onChange={(e) => setField('smtp_user', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="smtp_pass" label="SMTP password">
                  <Input
                    id="smtp_pass"
                    type="password"
                    value={form.smtp_pass}
                    onChange={(e) => setField('smtp_pass', e.target.value)}
                    placeholder={flags.smtp_pass_set ? '•••••••• (unchanged)' : 'SMTP password'}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="smtp_from" label="Send from address">
                  <Input
                    id="smtp_from"
                    value={form.smtp_from}
                    onChange={(e) => setField('smtp_from', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-sm"
                  disabled={!!testing || isLoading}
                  onClick={() => runTest('smtp')}
                >
                  {testing === 'smtp' ? (
                    <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconMail className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Send test email
                </Button>
              </div>
            </Section>
          </TabsContent>

          {/* Finstap runs every integration for its workspaces: no Integrations page there at all */}
          {!IS_FINSTAP && (
          <TabsContent value="integrations" className="mt-0 space-y-4">
            <Section
              title="Companies House"
              description={
                flags.companies_house_platform
                  ? 'Connected for your workspace. Nothing to set up.'
                  : flags.companies_house_api_key_set
                  ? 'API key is connected. Paste a new key only to replace it.'
                  : 'Create a free key at developer.company-information.service.gov.uk'
              }
            >
              {/* The server's own key covers every workspace: no key to paste */}
              {!flags.companies_house_platform && (
                <Field id="companies_house_api_key" label="REST API key">
                  <Input
                    id="companies_house_api_key"
                    type="password"
                    value={form.companies_house_api_key}
                    onChange={(e) => setField('companies_house_api_key', e.target.value)}
                    placeholder={flags.companies_house_api_key_set ? '•••••••• (unchanged)' : 'Paste API key'}
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </Field>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-sm"
                disabled={!!testing || isLoading}
                onClick={() => runTest('ch')}
              >
                {testing === 'ch' ? (
                  <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <IconBuilding className="mr-1.5 h-3.5 w-3.5" />
                )}
                Test Companies House
              </Button>
            </Section>

            <Section
              title="Didit identity verification"
              description={
                flags.didit_platform
                  ? 'Connected for your workspace: Smart Operations > ID Verification verifies identities for KYC orders. Nothing to set up.'
                  : flags.didit_api_key_set
                  ? 'Didit is connected: Smart Operations > ID Verification starts verifications for KYC orders. Paste new keys only to replace them.'
                  : 'Used by Smart Operations > ID Verification. Find the keys in the Didit console (business.didit.me) under API & Webhooks.'
              }
            >
              {/* Finstap's own Didit account covers every workspace: no keys or webhook to set up */}
              {!flags.didit_platform && (
              <>
              <div className="grid gap-3 md:grid-cols-2">
                <Field id="didit_api_key" label="API key">
                  <Input
                    id="didit_api_key"
                    type="password"
                    value={form.didit_api_key}
                    onChange={(e) => setField('didit_api_key', e.target.value)}
                    placeholder={flags.didit_api_key_set ? '•••••••• (unchanged)' : 'Paste API key'}
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="didit_webhook_secret" label="Webhook secret key">
                  <Input
                    id="didit_webhook_secret"
                    type="password"
                    value={form.didit_webhook_secret}
                    onChange={(e) => setField('didit_webhook_secret', e.target.value)}
                    placeholder={flags.didit_webhook_secret_set ? '•••••••• (unchanged)' : 'Paste webhook secret'}
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="didit_workflow_id" label="Workflow ID" hint="The workflow to run, e.g. ID document + liveness + face match.">
                  <Input
                    id="didit_workflow_id"
                    value={form.didit_workflow_id}
                    onChange={(e) => setField('didit_workflow_id', e.target.value)}
                    placeholder="Workflow ID from the Didit console"
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="didit_callback_url" label="Finish page (optional)" hint="Where people land after verifying, e.g. your website's thank-you page.">
                  <Input
                    id="didit_callback_url"
                    value={form.didit_callback_url}
                    onChange={(e) => setField('didit_callback_url', e.target.value)}
                    placeholder="https://"
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </Field>
              </div>
              <Field id="didit_webhook_url" label="Webhook URL" hint="Paste this in the Didit console as the webhook address, so results arrive in the CRM by themselves.">
                <div className="flex gap-2">
                  <Input id="didit_webhook_url" readOnly value={diditWebhookUrl()} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(diditWebhookUrl())
                        .then(() => toast.success('Webhook URL copied'), () => toast.error('Could not copy'))
                    }}
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </Field>
              </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-sm"
                disabled={!!testing || isLoading}
                onClick={() => runTest('didit')}
              >
                {testing === 'didit' ? (
                  <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <IconId className="mr-1.5 h-3.5 w-3.5" />
                )}
                Test Didit
              </Button>
            </Section>

            <Section
              title="WordPress website"
              description="Uses the Application Password set on the server (WORDPRESS_API_USER / WORDPRESS_APP_PASSWORD). Service price, name, description and active status sync to the linked WooCommerce product when you change them; new website signups arrive through the signup webhook."
            >
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-sm"
                  disabled={!!testing || isLoading}
                  onClick={() => runTest('wp')}
                >
                  {testing === 'wp' ? (
                    <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconWorld className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test WordPress connection
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-sm"
                  disabled={!!testing || isLoading}
                  onClick={() => runTest('wphook')}
                >
                  {testing === 'wphook' ? (
                    <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconWebhook className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Set up signup webhook
                </Button>
              </div>
            </Section>

            <Section
              title="getAddress.io (optional)"
              description={
                flags.getaddress_configured
                  ? 'Connected for full UK street lists. Paste a new key only to replace it.'
                  : 'Optional. Without it, postcode lookup still works via postcodes.io.'
              }
            >
              <Field id="getaddress_api_key" label="API key">
                <Input
                  id="getaddress_api_key"
                  type="password"
                  value={form.getaddress_api_key}
                  onChange={(e) => setField('getaddress_api_key', e.target.value)}
                  placeholder={flags.getaddress_configured ? '•••••••• (unchanged)' : 'Paste getAddress.io key'}
                  autoComplete="off"
                  disabled={isLoading}
                />
              </Field>
            </Section>

            <Section
              title="Google Drive"
              description={
                flags.google_service_account_json_set
                  ? 'Service account is configured. Paste new JSON only to replace it.'
                  : 'Paste the service-account JSON for Drive storage.'
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="google_drive_root_folder" label="Root folder name">
                  <Input
                    id="google_drive_root_folder"
                    value={form.google_drive_root_folder}
                    onChange={(e) => setField('google_drive_root_folder', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
              </div>
              <Field id="google_service_account_json" label="Service account JSON">
                <textarea
                  id="google_service_account_json"
                  className="flex min-h-[110px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
                  value={form.google_service_account_json}
                  onChange={(e) => setField('google_service_account_json', e.target.value)}
                  placeholder='{"type":"service_account", ...}'
                  disabled={isLoading}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-sm"
                disabled={!!testing || isLoading}
                onClick={() => runTest('drive')}
              >
                {testing === 'drive' ? (
                  <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <IconCloud className="mr-1.5 h-3.5 w-3.5" />
                )}
                Test Google Drive
              </Button>
            </Section>

            <Section title="WordPress / website" description="Website webhook + public site URL.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="wordpress_url" label="WordPress URL">
                  <Input
                    id="wordpress_url"
                    value={form.wordpress_url}
                    onChange={(e) => setField('wordpress_url', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field
                  id="wordpress_webhook_secret"
                  label="Webhook secret"
                  hint={
                    flags.wordpress_webhook_secret_set
                      ? 'Secret is set. Leave blank to keep it.'
                      : 'Shared secret for order / user webhooks.'
                  }
                >
                  <Input
                    id="wordpress_webhook_secret"
                    type="password"
                    value={form.wordpress_webhook_secret}
                    onChange={(e) => setField('wordpress_webhook_secret', e.target.value)}
                    placeholder={flags.wordpress_webhook_secret_set ? '•••••••• (unchanged)' : 'Webhook secret'}
                    autoComplete="off"
                    disabled={isLoading}
                  />
                </Field>
              </div>
            </Section>
          </TabsContent>
          )}

          <TabsContent value="compliance" className="mt-0 space-y-4">
            <Section
              title="Compliance alerts"
              description="Automated filing reminders. Default OFF until enabled."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ['compliance_alerts_enabled', 'Enable automated compliance notifications'],
                  ['compliance_alerts_verified_only', 'Send only to staff-verified emails'],
                  ['compliance_alerts_whatsapp_enabled', 'Include WhatsApp contact option'],
                  ['compliance_alerts_test_mode', 'Test mode (redirect all to test recipient)'],
                ].map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!form[key]}
                      onCheckedChange={(v) => setField(key, !!v)}
                      disabled={isLoading}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <Field id="compliance_alerts_send_hour" label="Send hour">
                  <Input
                    id="compliance_alerts_send_hour"
                    type="number"
                    min={0}
                    max={23}
                    value={form.compliance_alerts_send_hour}
                    onChange={(e) => setField('compliance_alerts_send_hour', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="compliance_alerts_interval_hours" label="Interval hours">
                  <Input
                    id="compliance_alerts_interval_hours"
                    type="number"
                    min={1}
                    value={form.compliance_alerts_interval_hours}
                    onChange={(e) => setField('compliance_alerts_interval_hours', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="compliance_alerts_timezone" label="Timezone">
                  <Input
                    id="compliance_alerts_timezone"
                    value={form.compliance_alerts_timezone}
                    onChange={(e) => setField('compliance_alerts_timezone', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="compliance_alerts_test_recipient" label="Test recipient">
                  <Input
                    id="compliance_alerts_test_recipient"
                    type="email"
                    value={form.compliance_alerts_test_recipient}
                    onChange={(e) => setField('compliance_alerts_test_recipient', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="compliance_alerts_website" label="Website">
                  <Input
                    id="compliance_alerts_website"
                    value={form.compliance_alerts_website}
                    onChange={(e) => setField('compliance_alerts_website', e.target.value)}
                    placeholder="https://yourcompany.com"
                    disabled={isLoading}
                  />
                </Field>
                <Field id="compliance_alerts_whatsapp_url" label="WhatsApp link">
                  <Input
                    id="compliance_alerts_whatsapp_url"
                    value={form.compliance_alerts_whatsapp_url}
                    onChange={(e) => setField('compliance_alerts_whatsapp_url', e.target.value)}
                    placeholder="https://wa.me/447700900000"
                    disabled={isLoading}
                  />
                </Field>
              </div>
            </Section>
          </TabsContent>

          {IS_FINSTAP && (
            <TabsContent value="invoices" className="mt-0 space-y-4">
              {invoiceDetails}
              <InvoicesTab form={form} setField={setField} disabled={isLoading || isSaving} />
            </TabsContent>
          )}

          {IS_FINSTAP && (
            <TabsContent value="plan" className="mt-0 space-y-4">
              <PlanTab />
            </TabsContent>
          )}

          <TabsContent value="profile" className="mt-0 space-y-4">
            {/* Customers see this tab in the portal: no staff wording or role */}
            <Section
              title="Account"
              description={profile.role === 'CLIENT'
                ? 'Your login details. To change your email, contact us.'
                : 'Your staff login details. Email cannot be changed here.'}
            >
              {profile.role !== 'CLIENT' && (
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm text-muted-foreground">Signed-in role</span>
                  {profile.role ? (
                    <Badge className="badge-sky text-[11px]">{profile.role}</Badge>
                  ) : null}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="prof_email" label="Email">
                  <Input
                    id="prof_email"
                    type="email"
                    value={profile.email}
                    readOnly
                    disabled
                    className="bg-muted/40"
                  />
                </Field>
                {profile.role !== 'CLIENT' && (
                  <Field id="prof_role" label="Role">
                    <Input
                      id="prof_role"
                      value={profile.role}
                      readOnly
                      disabled
                      className="bg-muted/40"
                    />
                  </Field>
                )}
                <Field id="prof_full_name" label="Full name">
                  <Input
                    id="prof_full_name"
                    value={profile.full_name}
                    onChange={(e) => setProfileField('full_name', e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </Field>
                <Field id="prof_phone" label="Phone number">
                  <Input
                    id="prof_phone"
                    value={profile.phone}
                    onChange={(e) => setProfileField('phone', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="prof_country" label="Country">
                  <Input
                    id="prof_country"
                    value={profile.country}
                    onChange={(e) => setProfileField('country', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="prof_address" label="Billing address">
                  <Input
                    id="prof_address"
                    value={profile.address}
                    onChange={(e) => setProfileField('address', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Change password"
              description={`Leave blank to keep your current password. New password must be at least ${MIN_PASSWORD} characters.`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field id="prof_current_password" label="Current password">
                  <Input
                    id="prof_current_password"
                    type="password"
                    autoComplete="current-password"
                    value={profile.current_password}
                    onChange={(e) => setProfileField('current_password', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <div className="hidden md:block" />
                <Field id="prof_new_password" label="New password">
                  <Input
                    id="prof_new_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD}
                    value={profile.new_password}
                    onChange={(e) => setProfileField('new_password', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
                <Field id="prof_confirm_password" label="Confirm new password">
                  <Input
                    id="prof_confirm_password"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD}
                    value={profile.confirm_password}
                    onChange={(e) => setProfileField('confirm_password', e.target.value)}
                    disabled={isLoading}
                  />
                </Field>
              </div>
            </Section>
          </TabsContent>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="submit" disabled={isLoading || isSaving}>
              {isSaving ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconDeviceFloppy className="mr-2 h-4 w-4" />
              )}
              {isProfileTab ? 'Save Profile' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </Tabs>
    </div>
  )
}
