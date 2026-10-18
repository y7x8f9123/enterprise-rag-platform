
import { useState } from 'react'
import AppLayout from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import AIAssistant from './pages/AIAssistant'
import Settings from './pages/Settings'
import type { NavigationTarget, Page } from './navigation'

function App() {
  const [target, setTarget] = useState<NavigationTarget>({ page: 'dashboard' })
  const currentPage: Page = target.page

  function renderPage() {
    switch (target.page) {
      case 'dashboard':
        return <Dashboard onNavigate={setTarget} />
      case 'documents':
        return (
          <Documents
            key={target.status ?? 'all'}
            initialStatusFilter={target.status}
          />
        )
      case 'assistant':
        return <AIAssistant />
      case 'settings':
        return <Settings />
    }
  }

  return (
    <AppLayout
      currentPage={currentPage}
      onNavigate={page => setTarget({ page })}
    >
      {renderPage()}
    </AppLayout>
  )
}

export default App
