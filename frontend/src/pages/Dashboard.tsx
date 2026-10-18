
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Files,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Server,
  TriangleAlert,
} from 'lucide-react'
import {
  getDashboardSummary,
  getServiceHealth,
  type DashboardSummaryResponse,
  type IndexingStatus,
} from '../api/client'

type HealthState = 'loading' | 'healthy' | 'unavailable'

const statusPresentation: Record<
  IndexingStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  INDEXED: {
    label: 'Indexed',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    icon: CheckCircle2,
  },
  INDEX_FAILED: {
    label: 'Index Failed',
    className: 'bg-red-50 text-red-700 ring-red-200',
    icon: AlertCircle,
  },
}

function DocumentStatus({ status }: { status?: IndexingStatus }) {
  if (!status) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
        Stored
      </span>
    )
  }

  const presentation = statusPresentation[status]
  const Icon = presentation.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${presentation.className}`}>
      <Icon size={13} />
      {presentation.label}
    </span>
  )
}

function HealthIndicator({
  label,
  state,
  icon: Icon,
}: {
  label: string
  state: HealthState
  icon: typeof Server
}) {
  const presentation = {
    loading: {
      label: 'Checking…',
      icon: LoaderCircle,
      className: 'bg-slate-50 text-slate-600 ring-slate-200',
    },
    healthy: {
      label: 'Healthy',
      icon: CheckCircle2,
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    },
    unavailable: {
      label: 'Unavailable',
      icon: AlertCircle,
      className: 'bg-red-50 text-red-700 ring-red-200',
    },
  }[state]
  const StateIcon = presentation.icon

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
          <Icon size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="mt-0.5 text-xs text-slate-500">HTTP health endpoint</p>
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${presentation.className}`}>
        <StateIcon
          size={13}
          className={state === 'loading' ? 'animate-spin' : undefined}
        />
        {presentation.label}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [error, setError] = useState('')
  const [backendHealth, setBackendHealth] = useState<HealthState>('loading')
  const [aiHealth, setAiHealth] = useState<HealthState>('loading')

  const refresh = useCallback(async () => {
    setSummaryLoading(true)
    setError('')
    setBackendHealth('loading')
    setAiHealth('loading')

    const summaryRequest = getDashboardSummary()
      .then(setSummary)
      .catch(requestError => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load dashboard statistics.',
        )
      })
      .finally(() => setSummaryLoading(false))

    const backendRequest = getServiceHealth('backend')
      .then(response => setBackendHealth(response.status === 'UP' ? 'healthy' : 'unavailable'))
      .catch(() => setBackendHealth('unavailable'))

    const aiRequest = getServiceHealth('ai')
      .then(response => setAiHealth(response.status === 'UP' ? 'healthy' : 'unavailable'))
      .catch(() => setAiHealth('unavailable'))

    await Promise.allSettled([summaryRequest, backendRequest, aiRequest])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const stats = [
    {
      label: 'Total Documents',
      value: summary?.totalDocuments,
      icon: Files,
      description: 'Documents in your workspace',
    },
    {
      label: 'Indexed Documents',
      value: summary?.indexedDocuments,
      icon: CheckCircle2,
      description: 'Ready for semantic search',
    },
    {
      label: 'Failed Documents',
      value: summary?.failedDocuments,
      icon: TriangleAlert,
      description: 'Documents needing attention',
    },
    {
      label: 'Indexed Chunks',
      value: summary?.totalChunks,
      icon: Layers3,
      description: 'Searchable text segments',
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Workspace Overview
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage your knowledge and explore your AI workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={summaryLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={summaryLoading ? 'animate-spin' : undefined} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Dashboard statistics are unavailable</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(stat => {
          const Icon = stat.icon

          return (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-5 flex items-center">
                <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                  <Icon size={21} />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-500">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {summaryLoading && !summary ? (
                  <span className="inline-block h-7 w-14 animate-pulse rounded bg-slate-200" />
                ) : stat.value === undefined ? (
                  '—'
                ) : (
                  stat.value.toLocaleString()
                )}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {stat.description}
              </p>
            </div>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <Clock3 size={20} className="text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              Recent Documents
            </h3>
          </div>

          {summaryLoading && !summary ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle size={20} className="animate-spin" />
              Loading recent documents…
            </div>
          ) : !summary ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50 text-center">
              <AlertCircle size={32} className="mb-3 text-red-300" />
              <p className="font-medium text-red-700">Recent documents unavailable</p>
              <p className="mt-1 text-sm text-red-500">Check the backend and try again.</p>
            </div>
          ) : summary.recentDocuments.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
              <FileText size={32} className="mb-3 text-slate-300" />
              <p className="font-medium text-slate-600">No documents yet</p>
              <p className="mt-1 text-sm text-slate-400">
                Uploaded documents will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.recentDocuments.map(document => (
                <article key={document.documentId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="shrink-0 rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                      <FileText size={19} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {document.originalName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Uploaded {new Date(document.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <DocumentStatus status={document.indexingStatus} />
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Activity size={20} className="text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              Service Health
            </h3>
          </div>

          <div className="space-y-3">
            <HealthIndicator label="Backend" state={backendHealth} icon={Server} />
            <HealthIndicator label="AI Service" state={aiHealth} icon={Bot} />
          </div>
        </section>
      </div>
    </div>
  )
}
