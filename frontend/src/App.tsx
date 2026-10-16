
import { useState } from 'react'
import AppLayout, { type Page } from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import AIAssistant from './pages/AIAssistant'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  function renderPage() {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'documents':
        return <Documents />
      case 'assistant':
        return <AIAssistant />
      case 'settings':
        return <Placeholder title="Settings" />
    }
  }

  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </AppLayout>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-500">
        This module is currently under development.
      </p>
    </div>
  )
}

export default App
