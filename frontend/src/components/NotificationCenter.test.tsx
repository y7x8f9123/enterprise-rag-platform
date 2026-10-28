import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDocumentDetails,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationResponse,
} from '../api/client'
import NotificationCenter from './NotificationCenter'

vi.mock('../api/client', () => ({
  getDocumentDetails: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}))

const indexedNotification: NotificationResponse = {
  id: 'notification-1',
  title: 'Indexing complete',
  message: 'report.pdf is ready for semantic search.',
  type: 'INDEX_SUCCEEDED',
  documentId: 'document-1.pdf',
  createdAt: '2026-10-29T01:00:00Z',
  read: false,
  documentAvailable: true,
}

function page(notifications: NotificationResponse[] = [indexedNotification]) {
  return {
    notifications,
    page: 0,
    size: 20,
    totalElements: notifications.length,
    totalPages: notifications.length ? 1 : 0,
  }
}

function renderCenter(overrides?: {
  onClose?: () => void
  onOpenDocument?: (documentId: string) => void
  onUnreadCountChange?: (count: number) => void
}) {
  const onClose = overrides?.onClose ?? vi.fn()
  const onOpenDocument = overrides?.onOpenDocument ?? vi.fn()
  const onUnreadCountChange = overrides?.onUnreadCountChange ?? vi.fn()
  render(
    <NotificationCenter
      open
      onClose={onClose}
      onOpenDocument={onOpenDocument}
      onUnreadCountChange={onUnreadCountChange}
    />,
  )
  return { onClose, onOpenDocument, onUnreadCountChange }
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listNotifications).mockResolvedValue(page())
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(1)
    vi.mocked(markNotificationRead).mockResolvedValue({
      ...indexedNotification,
      read: true,
    })
    vi.mocked(markAllNotificationsRead).mockResolvedValue(0)
    vi.mocked(getDocumentDetails).mockResolvedValue({} as never)
  })

  it('loads real notifications, updates the unread count, and closes with Escape', async () => {
    const onClose = vi.fn()
    const onUnreadCountChange = vi.fn()
    renderCenter({ onClose, onUnreadCountChange })

    expect(await screen.findByText('Indexing complete')).toBeInTheDocument()
    expect(onUnreadCountChange).toHaveBeenCalledWith(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('marks one notification and all notifications as read', async () => {
    renderCenter()
    await screen.findByText('Indexing complete')

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument())

    vi.mocked(listNotifications).mockResolvedValue(page([
      { ...indexedNotification, id: 'notification-2' },
    ]))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByRole('button', { name: 'Mark all as read' })
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled())
  })

  it('verifies an available document before opening its existing details modal', async () => {
    vi.mocked(listNotifications).mockResolvedValue(page([
      { ...indexedNotification, read: true },
    ]))
    const onOpenDocument = vi.fn()
    const onClose = vi.fn()
    renderCenter({ onOpenDocument, onClose })

    fireEvent.click(await screen.findByRole('button', { name: /Indexing complete/ }))
    await waitFor(() => expect(getDocumentDetails).toHaveBeenCalledWith('document-1.pdf'))
    expect(onOpenDocument).toHaveBeenCalledWith('document-1.pdf')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps deleted document notifications without opening a missing file', async () => {
    vi.mocked(listNotifications).mockResolvedValue(page([{
      ...indexedNotification,
      type: 'DOCUMENT_DELETED',
      title: 'Document deleted',
      documentAvailable: false,
      read: true,
    }]))
    const onOpenDocument = vi.fn()
    renderCenter({ onOpenDocument })

    fireEvent.click(await screen.findByRole('button', { name: /Document deleted/ }))
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument()
    expect(getDocumentDetails).not.toHaveBeenCalled()
    expect(onOpenDocument).not.toHaveBeenCalled()
  })

  it('shows a retryable API error and remains accessible in dark mode', async () => {
    document.documentElement.classList.add('dark')
    vi.mocked(listNotifications).mockRejectedValue(new Error('Backend unavailable'))
    renderCenter()

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveAttribute('aria-modal', 'true')
    expect(await screen.findByText('Backend unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2))
  })
})
