import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Sun,
} from 'lucide-react'
import { useAppSettings } from '../settings/useAppSettings'
import { readServiceHealth, type HealthState } from '../settings/serviceHealth'
import type {
  AppearancePreference,
  DocumentViewPreference,
  DocumentsPerPage,
} from '../settings/settings'

const appearanceOptions: Array<{
  value: AppearancePreference
  label: string
  description: string
  icon: typeof Sun
}> = [
  { value: 'light', label: 'Light', description: 'Always use the light theme.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Always use the dark theme.', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow your operating system.', icon: Monitor },
]

function HealthRow({ label, state, icon: Icon }: {
  label: string
  state: HealthState
  icon: typeof Server
}) {
  const status = {
    loading: { label: 'Checking…', icon: LoaderCircle, classes: 'bg-slate-100 text-slate-600 ring-slate-200' },
    healthy: { label: 'Healthy', icon: CheckCircle2, classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    unavailable: { label: 'Unavailable', icon: AlertCircle, classes: 'bg-red-50 text-red-700 ring-red-200' },
  }[state]
  const StatusIcon = status.icon

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600"><Icon size={20} /></span>
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">Read-only health endpoint</p>
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${status.classes}`}>
        <StatusIcon size={13} className={state === 'loading' ? 'animate-spin' : undefined} />
        {status.label}
      </span>
    </div>
  )
}

export default function Settings() {
  const { settings, updateSettings, resetSettings } = useAppSettings()
  const [backendHealth, setBackendHealth] = useState<HealthState>('loading')
  const [aiHealth, setAiHealth] = useState<HealthState>('loading')

  const refreshHealth = useCallback(async () => {
    setBackendHealth('loading')
    setAiHealth('loading')

    async function checkService(
      service: 'backend' | 'ai',
      setState: (state: HealthState) => void,
    ) {
      setState(await readServiceHealth(service))
    }

    await Promise.all([
      checkService('backend', setBackendHealth),
      checkService('ai', setAiHealth),
    ])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshHealth(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshHealth])

  function confirmReset() {
    if (window.confirm('Reset all application preferences to their defaults?')) {
      resetSettings()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Application Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Preferences are stored only in this browser.</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="appearance-heading">
        <h3 id="appearance-heading" className="text-lg font-semibold text-slate-900">Appearance</h3>
        <p className="mt-1 text-sm text-slate-500">Choose how EnterpriseMind looks on this device.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {appearanceOptions.map(option => {
            const Icon = option.icon
            const checked = settings.appearance === option.value
            return (
              <label key={option.value} className={`cursor-pointer rounded-xl border p-4 outline-none transition-colors focus-within:ring-4 focus-within:ring-indigo-100 ${checked ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                <input type="radio" name="appearance" value={option.value} checked={checked}
                  onChange={() => updateSettings({ appearance: option.value })} className="sr-only" />
                <Icon size={21} className="text-indigo-600" />
                <span className="mt-3 block text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><FileText size={20} className="text-indigo-600" /><h3 className="text-lg font-semibold text-slate-900">Document preferences</h3></div>
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="default-document-view" className="text-sm font-semibold text-slate-800">Default Document View</label>
              <p className="mt-1 text-xs text-slate-500">The tab selected whenever document details open.</p>
              <select id="default-document-view" value={settings.defaultDocumentView}
                onChange={event => updateSettings({ defaultDocumentView: event.target.value as DocumentViewPreference })}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
                <option value="original">Original View</option>
                <option value="extracted">Extracted Text</option>
              </select>
            </div>
            <div>
              <label htmlFor="documents-per-page" className="text-sm font-semibold text-slate-800">Documents Per Page</label>
              <p className="mt-1 text-xs text-slate-500">Controls the server-side Documents page size.</p>
              <select id="documents-per-page" value={settings.documentsPerPage}
                onChange={event => updateSettings({ documentsPerPage: Number(event.target.value) as DocumentsPerPage })}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
                {[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-lg font-semibold text-slate-900">Service Status</h3><p className="mt-1 text-sm text-slate-500">Live status from configured local services.</p></div>
            <button type="button" onClick={() => void refreshHealth()} disabled={backendHealth === 'loading' || aiHealth === 'loading'}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw size={15} className={backendHealth === 'loading' || aiHealth === 'loading' ? 'animate-spin' : undefined} /> Refresh status
            </button>
          </div>
          <div className="mt-5 space-y-3">
            <HealthRow label="Spring Boot Backend" state={backendHealth} icon={Server} />
            <HealthRow label="FastAPI AI Service" state={aiHealth} icon={Bot} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-semibold text-red-700">Reset Preferences</h3><p className="mt-1 text-sm text-red-700">Restore appearance, document view and page size defaults.</p></div>
        <button type="button" onClick={confirmReset} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
          <RotateCcw size={16} /> Reset preferences
        </button>
      </section>
    </div>
  )
}
