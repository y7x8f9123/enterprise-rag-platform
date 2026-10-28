import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDocuments, retryDocumentIndex, type UploadDocumentResponse } from '../api/client'
import { AppSettingsProvider } from '../settings/AppSettingsProvider'
import { useAppSettings } from '../settings/useAppSettings'
import { SETTINGS_STORAGE_KEY } from '../settings/settings'
import Documents from './Documents'

vi.mock('../api/client', () => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  retryDocumentIndex: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks()
  })
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

  it('starts with a global filename query and sends it to backend pagination', async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      documents: [], page: 0, size: 10, totalElements: 0, totalPages: 0,
    })

    render(
      <AppSettingsProvider>
        <Documents initialQuery="annual report" />
      </AppSettingsProvider>,
    )

    expect(screen.getByRole('textbox', { name: 'Search stored documents' })).toHaveValue('annual report')
    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith(
      'annual report', 0, 10, undefined,
    ))
  })

  it('retries failed indexing and replaces the row with indexed statistics', async () => {
    const failedDocument = {
      id: 'record-1',
      documentId: '550e8400-e29b-41d4-a716-446655440000.txt',
      originalName: 'retry.txt',
      size: 7,
      status: 'STORED' as const,
      indexingStatus: 'INDEX_FAILED' as const,
      characters: null,
      words: null,
      chunkCount: null,
      indexedChunks: null,
      createdAt: '2026-10-29T01:00:00Z',
    }
    vi.mocked(listDocuments).mockResolvedValue({
      documents: [failedDocument], page: 0, size: 10, totalElements: 1, totalPages: 1,
    })
    let resolveRetry!: (value: UploadDocumentResponse) => void
    vi.mocked(retryDocumentIndex).mockReturnValue(new Promise(resolve => {
      resolveRetry = resolve
    }))

    render(<AppSettingsProvider><Documents /></AppSettingsProvider>)
    const retryButton = await screen.findByRole('button', { name: 'Retry indexing retry.txt' })
    fireEvent.click(retryButton)
    expect(screen.getByText('Retrying')).toBeInTheDocument()
    expect(retryButton).toBeDisabled()

    resolveRetry({
      ...failedDocument,
      indexingStatus: 'INDEXED',
      characters: 7,
      words: 1,
      chunkCount: 1,
      indexedChunks: 1,
    })
    await waitFor(() => expect(screen.getByText('Indexed')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Retry indexing retry.txt' })).not.toBeInTheDocument()
    expect(retryDocumentIndex).toHaveBeenCalledWith(failedDocument.documentId)
  })

  it('shows a retry error and allows another attempt', async () => {
    const failedDocument = {
      id: 'record-2',
      documentId: '550e8400-e29b-41d4-a716-446655440001.txt',
      originalName: 'offline.txt',
      size: 7,
      status: 'STORED' as const,
      indexingStatus: 'INDEX_FAILED' as const,
      characters: null,
      words: null,
      chunkCount: null,
      indexedChunks: null,
      createdAt: '2026-10-29T01:00:00Z',
    }
    vi.mocked(listDocuments).mockResolvedValue({
      documents: [failedDocument], page: 0, size: 10, totalElements: 1, totalPages: 1,
    })
    vi.mocked(retryDocumentIndex).mockRejectedValue(new Error('AI indexing service is unavailable'))

    render(<AppSettingsProvider><Documents /></AppSettingsProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry indexing offline.txt' }))

    expect(await screen.findByText('AI indexing service is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry indexing offline.txt' })).toBeEnabled()
    expect(screen.getByText('Index Failed')).toBeInTheDocument()
  })

  it('shows the OCR guidance for a PDF without extractable text', async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      documents: [{
        id: 'scan-id',
        documentId: '550e8400-e29b-41d4-a716-446655440002.pdf',
        originalName: 'scan.pdf',
        size: 128,
        status: 'STORED',
        indexingStatus: 'INDEX_FAILED',
        characters: null,
        words: null,
        chunkCount: null,
        indexedChunks: null,
        createdAt: '2026-10-29T01:00:00Z',
        indexingErrorCode: 'NO_EXTRACTABLE_TEXT',
        indexingError: 'upstream wording is safely normalized',
      }],
      page: 0,
      size: 10,
      totalElements: 1,
      totalPages: 1,
    })

    render(<AppSettingsProvider><Documents /></AppSettingsProvider>)

    expect(await screen.findByText(
      'No extractable text. This PDF may require OCR.',
    )).toBeInTheDocument()
  })
})
