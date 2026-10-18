import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { listDocuments } from '../api/client'
import { AppSettingsProvider } from '../settings/AppSettingsProvider'
import { useAppSettings } from '../settings/useAppSettings'
import { SETTINGS_STORAGE_KEY } from '../settings/settings'
import Documents from './Documents'

vi.mock('../api/client', () => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  getDocumentDetails: vi.fn(),
  getDocumentContent: vi.fn(),
  getDocumentDownloadUrl: vi.fn(),
  getDocumentPreview: vi.fn(),
}))

function DocumentsHarness() {
  const { updateSettings } = useAppSettings()
  return (
    <>
      <button type="button" onClick={() => updateSettings({ documentsPerPage: 50 })}>Show 50</button>
      <Documents />
    </>
  )
}

describe('Documents preferences', () => {
  it('uses backend pagination and resets to page one when page size changes', async () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      appearance: 'light',
      defaultDocumentView: 'original',
      documentsPerPage: 20,
    }))
    vi.mocked(listDocuments).mockResolvedValue({
      documents: [], page: 0, size: 20, totalElements: 0, totalPages: 0,
    })

    render(<AppSettingsProvider><DocumentsHarness /></AppSettingsProvider>)
    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith('', 0, 20, undefined))

    fireEvent.click(screen.getByRole('button', { name: 'Show 50' }))
    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith('', 0, 50, undefined))
  })

  it('requests filtered backend pages and can clear an empty status filter', async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      documents: [], page: 0, size: 10, totalElements: 0, totalPages: 0,
    })

    render(
      <AppSettingsProvider>
        <Documents initialStatusFilter="INDEX_FAILED" />
      </AppSettingsProvider>,
    )

    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith(
      '', 0, 10, 'INDEX_FAILED',
    ))
    expect(screen.getByText('No failed documents')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith(
      '', 0, 10, undefined,
    ))
  })
})
