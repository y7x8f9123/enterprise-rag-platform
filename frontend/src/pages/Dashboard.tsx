
import {
  Files,
  Database,
  MessageSquareText,
  Activity,
  ArrowUpRight,
  Clock3,
  FileText,
  CheckCircle2,
  Info,
} from 'lucide-react'

const stats = [
  {
    label: 'Total Documents',
    value: '0',
    icon: Files,
    description: 'Documents in your workspace',
  },
  {
    label: 'Knowledge Bases',
    value: '0',
    icon: Database,
    description: 'Active knowledge collections',
  },
  {
    label: 'AI Questions',
    value: '0',
    icon: MessageSquareText,
    description: 'Questions asked so far',
  },
  {
    label: 'System Status',
    value: 'Not connected',
    icon: Activity,
    description: 'Backend integration pending',
  },
]

export default function Dashboard() {
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
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Development Mode
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(stat => {
          const Icon = stat.icon

          return (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                  <Icon size={21} />
                </div>
                <ArrowUpRight size={17} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {stat.value}
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
              Recent Activity
            </h3>
          </div>

          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
            <FileText size={32} className="mb-3 text-slate-300" />
            <p className="font-medium text-slate-600">
              No activity yet
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Your document and AI activity will appear here.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Database size={20} className="text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              Getting Started
            </h3>
          </div>

          <div className="space-y-5">
            <div className="flex gap-3">
              <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Initialize frontend
                </p>
                <p className="text-xs text-slate-500">
                  React and Tailwind are ready.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Clock3 size={20} className="shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Connect backend services
                </p>
                <p className="text-xs text-slate-500">
                  Spring Boot and FastAPI integration.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Clock3 size={20} className="shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Create your knowledge base
                </p>
                <p className="text-xs text-slate-500">
                  Upload and index your documents.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <Info size={19} className="mt-0.5 shrink-0 text-indigo-600" />
        <p className="text-sm text-indigo-800">
          This dashboard currently displays development placeholders.
          Real statistics will become available after backend integration.
        </p>
      </div>
    </div>
  )
}
