import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDashboardSummary,
  getServiceHealth,
  type DashboardSummaryResponse,
} from '../api/client'
import { AppSettingsProvider } from '../settings/AppSettingsProvider'
import Dashboard from './Dashboard'

vi.mock('../api/client', () => ({
  getDashboardSummary: vi.fn(),
  getServiceHealth: vi.fn(),
}))

vi.mock('../components/DocumentDetailsModal', () => ({
  default: ({ documentId }: { documentId: string }) => (
    <div role="dialog">Details for {documentId}</div>
  ),
}))

const summaryRequest = vi.mocked(getDashboardSummary)
const healthRequest = vi.mocked(getServiceHealth)

const summary: DashboardSummaryResponse = {
  totalDocuments: 3,
  indexedDocuments: 2,
  failedDocuments: 0,
  totalChunks: 19,
  recentDocuments: [{
    id: 'document.pdf',
    documentId: 'document.pdf',
    originalName: 'Quarterly Report.pdf',
    size: 100,
    status: 'STORED',
    indexingStatus: 'INDEXED',
    characters: 1000,
    words: 200,
    chunkCount: 19,
    indexedChunks: 19,
    createdAt: '2026-10-19T00:00:00Z',
  }],
}

function renderDashboard(onNavigate = vi.fn()) {
  render(
    <AppSettingsProvider>
      <Dashboard onNavigate={onNavigate} />
    </AppSettingsProvider>,
  )
  return onNavigate
}

describe('Dashboard interactions', () => {
  beforeEach(() => {
    summaryRequest.mockReset().mockResolvedValue(summary)
    healthRequest.mockReset().mockImplementation(async service => ({
      status: 'UP',
      service,
    }))
  })

  it('navigates cards with the correct typed status filters', async () => {
    const navigate = renderDashboard()
    await screen.findByText('Quarterly Report.pdf')

    fireEvent.click(screen.getByRole('button', { name: /Total Documents/ }))
    expect(navigate).toHaveBeenLastCalledWith({ page: 'documents' })

    fireEvent.click(screen.getByRole('button', { name: /Indexed Documents/ }))
    expect(navigate).toHaveBeenLastCalledWith({ page: 'documents', status: 'INDEXED' })

    fireEvent.click(screen.getByRole('button', { name: /Failed Documents/ }))
    expect(navigate).toHaveBeenLastCalledWith({ page: 'documents', status: 'INDEX_FAILED' })

    const chunks = screen.getByRole('button', { name: /Indexed Chunks/ })
    chunks.focus()
    expect(chunks).toHaveFocus()
    fireEvent.click(chunks, { detail: 0 })
    expect(navigate).toHaveBeenLastCalledWith({ page: 'assistant' })
  })

  it('opens recent document details through the existing modal', async () => {
    renderDashboard()
    fireEvent.click(await screen.findByRole('button', {
      name: 'Open details for Quarterly Report.pdf',
    }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Details for document.pdf')
  })

  it('shows empty and failed dashboard states', async () => {
    summaryRequest.mockResolvedValueOnce({ ...summary, recentDocuments: [] })
    const { unmount } = render(
      <AppSettingsProvider><Dashboard onNavigate={vi.fn()} /></AppSettingsProvider>,
    )
    expect(await screen.findByText('No documents yet')).toBeInTheDocument()
    unmount()

    summaryRequest.mockRejectedValueOnce(new Error('Dashboard offline'))
    renderDashboard()
    expect(await screen.findByText('Dashboard statistics are unavailable')).toBeInTheDocument()
    expect(screen.getByText('Dashboard offline')).toBeInTheDocument()
  })

  it('shows real service details and refreshes the selected service', async () => {
    renderDashboard()
    await waitFor(() => expect(healthRequest).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /Backend.*Healthy/ }))
    expect(screen.getByText('Endpoint: /api/health')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh this service' }))
    await waitFor(() => expect(healthRequest).toHaveBeenCalledTimes(3))
    expect(healthRequest).toHaveBeenLastCalledWith('backend')
  })
})
