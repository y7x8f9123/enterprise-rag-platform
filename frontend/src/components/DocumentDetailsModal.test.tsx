import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDocumentDetails,
  getDocumentContent,
  getDocumentPreview,
} from '../api/client'
import DocumentDetailsModal from './DocumentDetailsModal'

vi.mock('../api/client', () => ({
  getDocumentDetails: vi.fn(),
  getDocumentContent: vi.fn(),
  getDocumentDownloadUrl: vi.fn(() => '/download'),
  getDocumentPreview: vi.fn(),
}))

const detailsRequest = vi.mocked(getDocumentDetails)
const contentRequest = vi.mocked(getDocumentContent)
const previewRequest = vi.mocked(getDocumentPreview)

describe('DocumentDetailsModal', () => {
  beforeEach(() => {
    detailsRequest.mockReset()
    contentRequest.mockReset()
    previewRequest.mockReset()
  })

  it('shows independent loading states while requests are pending', () => {
    detailsRequest.mockReturnValue(new Promise(() => undefined))
    contentRequest.mockReturnValue(new Promise(() => undefined))
    previewRequest.mockReturnValue(new Promise(() => undefined))

    render(
      <DocumentDetailsModal documentId="document.txt" onClose={vi.fn()} />,
    )

    expect(screen.getByText('Loading metadata…')).toBeInTheDocument()
    expect(screen.getByText('Loading original document…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Extracted Text' }))
    expect(screen.getByText('Extracting preview…')).toBeInTheDocument()
  })

  it('opens on the configured default view without changing manual tab behavior', () => {
    detailsRequest.mockReturnValue(new Promise(() => undefined))
    contentRequest.mockReturnValue(new Promise(() => undefined))
    previewRequest.mockReturnValue(new Promise(() => undefined))

    render(
      <DocumentDetailsModal
        documentId="document.txt"
        defaultView="extracted"
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Extracted Text' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Original View' }))
    expect(screen.getByRole('tab', { name: 'Original View' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows metadata and preview API failures', async () => {
    detailsRequest.mockRejectedValue(new Error('Details request failed.'))
    contentRequest.mockRejectedValue(new Error('Original request failed.'))
    previewRequest.mockRejectedValue(new Error('Preview request failed.'))

    render(
      <DocumentDetailsModal documentId="document.txt" onClose={vi.fn()} />,
    )

    expect(await screen.findByText('Details request failed.')).toBeInTheDocument()
    expect(await screen.findByText('Original request failed.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Extracted Text' }))
    expect(await screen.findByText('Preview request failed.')).toBeInTheDocument()
  })

  it('aborts both requests when the modal closes', async () => {
    let detailsSignal: AbortSignal | undefined
    let contentSignal: AbortSignal | undefined
    let previewSignal: AbortSignal | undefined
    detailsRequest.mockImplementation((_documentId, signal) => {
      detailsSignal = signal
      return new Promise(() => undefined)
    })
    previewRequest.mockImplementation((_documentId, signal) => {
      previewSignal = signal
      return new Promise(() => undefined)
    })
    contentRequest.mockImplementation((_documentId, signal) => {
      contentSignal = signal
      return new Promise(() => undefined)
    })

    const { unmount } = render(
      <DocumentDetailsModal documentId="document.txt" onClose={vi.fn()} />,
    )
    await waitFor(() => expect(detailsSignal).toBeDefined())
    unmount()

    expect(detailsSignal?.aborted).toBe(true)
    expect(contentSignal?.aborted).toBe(true)
    expect(previewSignal?.aborted).toBe(true)
  })

  it('does not show stale results after switching documents', async () => {
    let resolveFirstDetails: ((value: ReturnType<typeof documentDetails>) => void) | undefined
    let resolveFirstContent: ((value: Blob) => void) | undefined
    detailsRequest.mockImplementation(documentId => {
      if (documentId === 'first.txt') {
        return new Promise(resolve => { resolveFirstDetails = resolve })
      }
      return Promise.resolve(documentDetails('second.txt', 'second.txt'))
    })
    contentRequest.mockImplementation(documentId => {
      if (documentId === 'first.txt') {
        return new Promise(resolve => { resolveFirstContent = resolve })
      }
      return Promise.resolve(new Blob(['second content']))
    })
    previewRequest.mockResolvedValue({ text: 'preview', truncated: false })

    const { rerender } = render(
      <DocumentDetailsModal key="first" documentId="first.txt" onClose={vi.fn()} />,
    )
    rerender(
      <DocumentDetailsModal key="second" documentId="second.txt" onClose={vi.fn()} />,
    )

    expect(await screen.findByText('second.txt')).toBeInTheDocument()
    expect(await screen.findByText('second content')).toBeInTheDocument()
    await act(async () => {
      resolveFirstDetails?.(documentDetails('first.txt', 'first.txt'))
      resolveFirstContent?.(new Blob(['stale first content']))
    })

    expect(screen.queryByText('first.txt')).not.toBeInTheDocument()
    expect(screen.queryByText('stale first content')).not.toBeInTheDocument()
  })
})

function documentDetails(documentId: string, originalName: string) {
  return {
    id: documentId,
    documentId,
    originalName,
    size: 10,
    status: 'STORED' as const,
    indexingStatus: 'INDEXED' as const,
    characters: 10,
    words: 2,
    chunkCount: 1,
    indexedChunks: 1,
    createdAt: '2026-10-18T00:00:00Z',
  }
}
