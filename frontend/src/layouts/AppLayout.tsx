
import { useEffect, useState, type ReactNode } from 'react'
import {
  BrainCircuit,
  LayoutDashboard,
  Files,
  MessageSquareText,
  Settings,
  Menu,
  X,
  Search,
  Bell,
} from 'lucide-react'
import type { Page } from '../navigation'

export type { Page } from '../navigation'

interface AppLayoutProps {
  children: ReactNode
  currentPage: Page
  onNavigate: (page: Page) => void
  onOpenSearch: () => void
  unreadNotifications: number
  onOpenNotifications: () => void
}

const navigation: {
  id: Page
  label: string
  icon: typeof LayoutDashboard
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', icon: Files },
  { id: 'assistant', label: 'AI Assistant', icon: MessageSquareText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function AppLayout({
  children,
  currentPage,
  onNavigate,
  onOpenSearch,
  unreadNotifications,
  onOpenNotifications,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activePage = navigation.find(item => item.id === currentPage)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenSearch()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpenSearch])

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-18 items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2 text-white">
              <BrainCircuit size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              EnterpriseMind
            </span>
          </div>

          <button
            type="button"
            aria-label="Close navigation"
            className="text-slate-500 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3 py-6">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

          {navigation.map(item => {
            const Icon = item.icon
            const selected = currentPage === item.id

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id)
                  setSidebarOpen(false)
                }}
                aria-current={selected ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={19} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
              D
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Demo User</p>
              <p className="text-xs text-slate-500">Local Development</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Open navigation"
              className="text-slate-600 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={23} />
            </button>

            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {activePage?.label ?? 'Dashboard'}
              </h1>
              <p className="text-xs text-slate-500">
                Enterprise Knowledge Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-500">
            <button
              type="button"
              aria-label="Open global document search"
              title="Search documents (Ctrl+K)"
              onClick={onOpenSearch}
              className="rounded-lg p-2 transition-colors hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
            >
              <Search size={20} />
            </button>
            <button
              type="button"
              aria-label="Open notifications"
              title="Notifications"
              onClick={onOpenNotifications}
              className="relative rounded-lg p-2 transition-colors hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
            >
              <Bell size={20} />
              {unreadNotifications > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white"
                  aria-label={`${unreadNotifications} unread notifications`}
                >
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              D
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-5 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
