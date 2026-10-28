
import { useCallback, useEffect, useState } from 'react'
import AppLayout from './layouts/AppLayout'
import GlobalSearchDialog from './components/GlobalSearchDialog'
import NotificationCenter from './components/NotificationCenter'
import DocumentDetailsModal from './components/DocumentDetailsModal'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import AIAssistant from './pages/AIAssistant'
import Settings from './pages/Settings'
import type { NavigationTarget, Page } from './navigation'
import { getUnreadNotificationCount } from './api/client'
import { useAppSettings } from './settings/useAppSettings'

function App() {
  const { settings } = useAppSettings()
  const [target, setTarget] = useState<NavigationTarget>({ page: 'dashboard' })
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notificationDocumentId, setNotificationDocumentId] = useState<string | null>(null)
  const currentPage: Page = target.page
  const openSearch = useCallback(() => {
    setNotificationsOpen(false)
    setSearchOpen(true)
  }, [])
  const refreshUnreadNotifications = useCallback(async () => {
    try {
      setUnreadNotifications(await getUnreadNotificationCount())
    } catch {
      // The notification panel exposes a retryable error state when opened.
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshUnreadNotifications()
    }, 0)
    const timer = window.setInterval(() => {
      void refreshUnreadNotifications()
    }, 30_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [refreshUnreadNotifications])

  function renderPage() {
    switch (target.page) {
      case 'dashboard':
        return <Dashboard onNavigate={setTarget} />
      case 'documents':
        return (
          <Documents
            key={`${target.status ?? 'all'}:${target.query ?? ''}`}
            initialStatusFilter={target.status}
            initialQuery={target.query}
          />
        )
      case 'assistant':
        return (
          <AIAssistant
            key={target.query ?? ''}
            initialQuery={target.query}
          />
        )
      case 'settings':
        return <Settings />
    }
  }

  return (
    <AppLayout
      currentPage={currentPage}
      onNavigate={page => setTarget({ page })}
      onOpenSearch={openSearch}
      unreadNotifications={unreadNotifications}
      onOpenNotifications={() => {
        setSearchOpen(false)
        setNotificationsOpen(true)
      }}
    >
      {renderPage()}
      <GlobalSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={setTarget}
      />
      <NotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onUnreadCountChange={setUnreadNotifications}
        onOpenDocument={documentId => setNotificationDocumentId(documentId)}
      />
      {notificationDocumentId && (
        <DocumentDetailsModal
          key={notificationDocumentId}
          documentId={notificationDocumentId}
          defaultView={settings.defaultDocumentView}
          onClose={() => setNotificationDocumentId(null)}
        />
      )}
    </AppLayout>
  )
}

export default App
