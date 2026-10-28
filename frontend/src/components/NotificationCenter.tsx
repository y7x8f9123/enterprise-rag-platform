import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  getDocumentDetails,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationResponse,
  type NotificationType,
} from '../api/client'

type Props = {
  open: boolean
  onClose: () => void
  onOpenDocument: (documentId: string) => void
  onUnreadCountChange: (count: number) => void
}

const presentation: Record<
  NotificationType,
  { icon: typeof Bell; className: string }
> = {
  DOCUMENT_UPLOADED: {
    icon: FileUp,
    className: 'bg-blue-50 text-blue-700',
  },
  INDEX_SUCCEEDED: {
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700',
  },
  INDEX_FAILED: {
    icon: TriangleAlert,
    className: 'bg-red-50 text-red-700',
  },
  DOCUMENT_DELETED: {
    icon: Trash2,
    className: 'bg-slate-100 text-slate-600',
  },
}

export default function NotificationCenter({
  open,
  onClose,
  onOpenDocument,
  onUnreadCountChange,
}: Props) {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const [page, unreadCount] = await Promise.all([
        listNotifications(0, 20, signal),
        getUnreadNotificationCount(signal),
      ])
      setNotifications(page.notifications)
      setTotalElements(page.totalElements)
      onUnreadCountChange(unreadCount)
    } catch (requestError) {
      if (!signal?.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load notifications.',
        )
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [onUnreadCountChange])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const loadTimer = window.setTimeout(() => {
      void refresh(controller.signal)
    }, 0)
    window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      window.clearTimeout(loadTimer)
      controller.abort()
    }
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  async function updateUnreadCount() {
    try {
      onUnreadCountChange(await getUnreadNotificationCount())
    } catch {
      // The list remains usable if refreshing only the badge fails.
    }
  }

  async function markRead(notification: NotificationResponse) {
    if (notification.read) return
    setActionId(notification.id)
    setError('')
    try {
      const updated = await markNotificationRead(notification.id)
      setNotifications(current => current.map(item =>
        item.id === updated.id ? updated : item,
      ))
      await updateUnreadCount()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to mark notification as read.',
      )
    } finally {
      setActionId(null)
    }
  }

  async function openNotification(notification: NotificationResponse) {
    await markRead(notification)
    if (
      !notification.documentId ||
      !notification.documentAvailable ||
      notification.type === 'DOCUMENT_DELETED'
    ) {
      setNotice('This document is no longer available. The notification has been kept in history.')
      return
    }

    setActionId(notification.id)
    setNotice('')
    try {
      await getDocumentDetails(notification.documentId)
      onOpenDocument(notification.documentId)
      onClose()
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : ''
      setNotice(
        message.includes('HTTP 404')
          ? 'This document is no longer available. The notification has been kept in history.'
          : 'The document could not be verified. Refresh and try again.',
      )
      if (message.includes('HTTP 404')) void refresh()
    } finally {
      setActionId(null)
    }
  }

  async function markAllRead() {
    setActionId('all')
    setError('')
    try {
      const unreadCount = await markAllNotificationsRead()
      setNotifications(current => current.map(item => ({ ...item, read: true })))
      onUnreadCountChange(unreadCount)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to mark all notifications as read.',
      )
    } finally {
      setActionId(null)
    }
  }

  if (!open) return null

  const hasUnread = notifications.some(notification => !notification.read)

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/30"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        className="absolute inset-x-3 top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-6 sm:w-[28rem]"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="notification-center-title" className="font-semibold text-slate-900">
              Notifications
            </h2>
            <p className="mt-1 text-xs text-slate-500">Persistent document activity</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close notifications"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
          >
            <X size={19} />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={!hasUnread || actionId === 'all'}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionId === 'all'
              ? <LoaderCircle size={15} className="animate-spin" />
              : <CheckCheck size={15} />}
            Mark all as read
          </button>
        </div>

        {error && (
          <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {notice}
          </div>
        )}

        <div className="min-h-48 flex-1 overflow-y-auto" aria-live="polite">
          {loading && notifications.length === 0 ? (
            <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle size={19} className="animate-spin text-indigo-600" /> Loading notifications…
            </div>
          ) : !loading && !error && notifications.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <Bell size={32} className="text-slate-300" />
              <p className="mt-3 font-medium text-slate-700">No notifications yet</p>
              <p className="mt-1 text-sm text-slate-500">Document activity will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map(notification => {
                const item = presentation[notification.type]
                const Icon = item.icon
                const busy = actionId === notification.id
                return (
                  <article
                    key={notification.id}
                    className={`flex gap-3 p-4 ${notification.read ? 'bg-white' : 'bg-indigo-50'}`}
                  >
                    <div className={`h-fit rounded-lg p-2 ${item.className}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void openNotification(notification)}
                        className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-900">{notification.title}</span>
                          {!notification.read && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="Unread" />
                          )}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-slate-600">{notification.message}</span>
                        <span className="mt-2 block text-xs text-slate-500">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </button>
                      {!notification.read && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void markRead(notification)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 disabled:opacity-50"
                        >
                          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                          Mark as read
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {totalElements > notifications.length && (
          <p className="border-t border-slate-200 px-5 py-3 text-center text-xs text-slate-500">
            Showing the latest {notifications.length} of {totalElements} notifications.
          </p>
        )}
      </section>
    </div>
  )
}
