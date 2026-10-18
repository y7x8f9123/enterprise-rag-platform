import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderAsync } from 'docx-preview'
import { getDocumentContent } from '../api/client'
import OriginalDocumentView from './OriginalDocumentView'

vi.mock('../api/client', () => ({
  getDocumentContent: vi.fn(),
  getDocumentContentUrl: (documentId: string) =>
    `/api/documents/${encodeURIComponent(documentId)}/content`,
}))

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(),
}))

const contentRequest = vi.mocked(getDocumentContent)
const renderDocx = vi.mocked(renderAsync)

describe('OriginalDocumentView', () => {
  beforeEach(() => {
    contentRequest.mockReset()
    renderDocx.mockReset()
  })

  it('shows a clear error when DOCX rendering fails', async () => {
    contentRequest.mockResolvedValue(new Blob(['broken docx']))
    renderDocx.mockRejectedValue(new Error('invalid package'))

    render(<OriginalDocumentView documentId="document.docx" />)

    expect(await screen.findByText(
      'The DOCX file could not be rendered in the browser.',
    )).toBeInTheDocument()
  })

  it('embeds PDFs without a blocking sandbox and revokes object URLs', async () => {
    contentRequest.mockResolvedValue(new Blob(['pdf bytes']))
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:document-preview')
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)

    const { unmount } = render(
      <OriginalDocumentView documentId="document.pdf" />,
    )
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledOnce())

    expect(screen.getByTitle('Original PDF document')).not.toHaveAttribute('sandbox')
    expect(screen.getByRole('link', { name: 'open the PDF in a new tab' }))
      .toHaveAttribute('href', '/api/documents/document.pdf/content')
    expect(screen.getByRole('link', { name: 'open the PDF in a new tab' }))
      .toHaveAttribute('target', '_blank')

    unmount()

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:document-preview')
  })
})
