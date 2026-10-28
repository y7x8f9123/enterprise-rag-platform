import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDocuments, type DocumentPageResponse } from '../api/client'
import type { NavigationTarget } from '../navigation'
import { AppSettingsProvider } from '../settings/AppSettingsProvider'
import GlobalSearchDialog from './GlobalSearchDialog'

vi.mock('../api/client', () => ({
  listDocuments: vi.fn(),
}))

vi.mock('./DocumentDetailsModal', () => ({
  default: ({ documentId, onClose }: { documentId: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Document details mock">
      <span>details:{documentId}</span>
      <button type="button" onClick={onClose}>Back to search</button>
    </div>
  ),
}))

const reportDocument = {
  id: 'record-1',
  documentId: 'document-1.pdf',
  originalName: 'Annual Report 2026.pdf',
  size: 2_048,
  status: 'STORED' as const,
  indexingStatus: 'INDEXED' as const,
  characters: 100,
  words: 20,
  chunkCount: 2,
  indexedChunks: 2,
  createdAt: '2026-10-20T03:00:00Z',
}

function page(
  documents = [reportDocument],
  totalElements = documents.length,
): DocumentPageResponse {
  return {
    documents,
    page: 0,
    size: 10,
    totalElements,
    totalPages: totalElements > 0 ? Math.ceil(totalElements / 10) : 0,
  }
}

function renderDialog(overrides?: {
  onClose?: () => void
  onNavigate?: (target: NavigationTarget) => void
}) {
  const onClose = overrides?.onClose ?? vi.fn()
  const onNavigate = overrides?.onNavigate ?? vi.fn()
  render(
    <AppSettingsProvider>
      <GlobalSearchDialog open onClose={onClose} onNavigate={onNavigate} />
    </AppSettingsProvider>,
  )
  return { onClose, onNavigate }
}

describe('GlobalSearchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debounces filename search and displays real result metadata', async () => {
    vi.mocked(listDocuments).mockResolvedValue(page())
    renderDialog()

    const input = screen.getByRole('textbox', { name: 'Search document filenames' })
    await waitFor(() => expect(input).toHaveFocus())
    fireEvent.change(input, { target: { value: 'annual' } })
    expect(listDocuments).not.toHaveBeenCalled()

    await waitFor(() => expect(listDocuments).toHaveBeenCalledWith(
      'annual', 0, 10, undefined, expect.any(AbortSignal),
    ))
    expect(await screen.findByText('Annual Report 2026.pdf')).toBeInTheDocument()
    expect(screen.getByText(/PDF · 2.0 KB/)).toBeInTheDocument()
    expect(screen.getByText('Indexed')).toBeInTheDocument()
  })

  it('shows empty and failed states and can retry a failed search', async () => {
    vi.mocked(listDocuments)
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(page([], 0))
    renderDialog()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'missing' } })
    expect(await screen.findByText('Search unavailable')).toBeInTheDocument()
    expect(screen.getByText('Network unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(await screen.findByText('No documents found')).toBeInTheDocument()
    expect(listDocuments).toHaveBeenCalledTimes(2)
  })

  it('opens the existing details modal and returns to the same search', async () => {
    vi.mocked(listDocuments).mockResolvedValue(page())
    renderDialog()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'report' } })
    fireEvent.click(await screen.findByRole('option', { name: /Annual Report 2026/ }))
    expect(screen.getByText('details:document-1.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to search' }))
    expect(await screen.findByText('Annual Report 2026.pdf')).toBeInTheDocument()
  })

  it('navigates to all backend results with the query preserved', async () => {
    vi.mocked(listDocuments).mockResolvedValue(page([reportDocument], 12))
    const onNavigate = vi.fn()
    renderDialog({ onNavigate })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' annual ' } })
    fireEvent.click(await screen.findByRole('button', { name: /View all 12 results/ }))
    expect(onNavigate).toHaveBeenCalledWith({ page: 'documents', query: 'annual' })
  })

  it('prefills content search without submitting and supports keyboard result opening', async () => {
    vi.mocked(listDocuments).mockResolvedValue(page())
    const onNavigate = vi.fn()
    renderDialog({ onNavigate })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'policy' } })
    await screen.findByText('Annual Report 2026.pdf')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('details:document-1.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to search' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search document contents' }))
    expect(onNavigate).toHaveBeenCalledWith({ page: 'assistant', query: 'policy' })
  })

  it('prevents an older request from replacing newer results', async () => {
    let resolveOld!: (value: DocumentPageResponse) => void
    let resolveNew!: (value: DocumentPageResponse) => void
    const oldRequest = new Promise<DocumentPageResponse>(resolve => { resolveOld = resolve })
    const newRequest = new Promise<DocumentPageResponse>(resolve => { resolveNew = resolve })
    vi.mocked(listDocuments).mockImplementation(query => query === 'old' ? oldRequest : newRequest)
    renderDialog()

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'old' } })
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(1))
    fireEvent.change(input, { target: { value: 'new' } })
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2))

    const newerDocument = { ...reportDocument, documentId: 'new.txt', originalName: 'new.txt' }
    await act(async () => resolveNew(page([newerDocument])))
    expect(await screen.findByText('new.txt')).toBeInTheDocument()
    await act(async () => resolveOld(page()))
    expect(screen.queryByText('Annual Report 2026.pdf')).not.toBeInTheDocument()
  })

  it('closes on Escape and remains accessible in dark mode', async () => {
    document.documentElement.classList.add('dark')
    const onClose = vi.fn()
    renderDialog({ onClose })

    expect(screen.getByRole('dialog', { name: 'Search documents' })).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
