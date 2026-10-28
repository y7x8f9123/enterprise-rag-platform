import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  AlertCircle,
  ArrowRight,
  FileSearch,
  FileText,
  LoaderCircle,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import {
  listDocuments,
  type DocumentPageResponse,
  type UploadDocumentResponse,
} from '../api/client'
import type { NavigationTarget } from '../navigation'
import { useAppSettings } from '../settings/useAppSettings'
import DocumentDetailsModal from './DocumentDetailsModal'

type Props = {
  open: boolean
  onClose: () => void
  onNavigate: (target: NavigationTarget) => void
}

const RESULT_LIMIT = 10
const DEBOUNCE_MS = 300

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fileType(filename: string) {
  const extension = filename.split('.').pop()
  return extension && extension !== filename ? extension.toUpperCase() : 'FILE'
}

function statusLabel(document: UploadDocumentResponse) {
  if (document.indexingStatus === 'INDEXED') return 'Indexed'
  if (document.indexingStatus === 'INDEX_FAILED') return 'Index Failed'
  return 'Stored'
}

export default function GlobalSearchDialog({ open, onClose, onNavigate }: Props) {
  const { settings } = useAppSettings()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<DocumentPageResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryVersion, setRetryVersion] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const requestVersionRef = useRef(0)

  const documents = result?.documents ?? []
  const normalizedQuery = query.trim()

  const closeDialog = useCallback(() => {
    requestVersionRef.current += 1
    setQuery('')
    setResult(null)
    setError('')
    setLoading(false)
    setActiveIndex(-1)
    setSelectedDocumentId(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => previousFocusRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || !normalizedQuery) return

    const currentVersion = ++requestVersionRef.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      listDocuments(normalizedQuery, 0, RESULT_LIMIT, undefined, controller.signal)
        .then(response => {
          if (currentVersion === requestVersionRef.current && !controller.signal.aborted) {
            setResult(response)
          }
        })
        .catch(requestError => {
          if (currentVersion === requestVersionRef.current && !controller.signal.aborted) {
            setResult(null)
            setError(
              requestError instanceof Error
                ? requestError.message
                : 'Unable to search documents.',
            )
          }
        })
        .finally(() => {
          if (currentVersion === requestVersionRef.current && !controller.signal.aborted) {
            setLoading(false)
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalizedQuery, open, retryVersion])

  useEffect(() => {
    if (!open || selectedDocumentId) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDialog()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDialog, open, selectedDocumentId])

  function openDocument(documentId: string) {
    setSelectedDocumentId(documentId)
  }

  function retrySearch() {
    setResult(null)
    setError('')
    setLoading(true)
    setActiveIndex(-1)
    setRetryVersion(value => value + 1)
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown' && documents.length > 0) {
      event.preventDefault()
      setActiveIndex(current => (current + 1) % documents.length)
      return
    }
    if (event.key === 'ArrowUp' && documents.length > 0) {
      event.preventDefault()
      setActiveIndex(current => current <= 0 ? documents.length - 1 : current - 1)
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0 && documents[activeIndex]) {
      event.preventDefault()
      openDocument(documents[activeIndex].documentId)
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]',
      ),
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  if (selectedDocumentId) {
    return (
      <DocumentDetailsModal
        key={selectedDocumentId}
        documentId={selectedDocumentId}
        defaultView={settings.defaultDocumentView}
        onClose={() => {
          setSelectedDocumentId(null)
          window.requestAnimationFrame(() => inputRef.current?.focus())
        }}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-3 pt-[8vh] sm:p-6 sm:pt-[12vh]"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) closeDialog()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2 id="global-search-title" className="font-semibold text-slate-900">
              Search documents
            </h2>
            <p className="text-xs text-slate-500">File names only · Ctrl+K</p>
          </div>
          <button
            type="button"
            aria-label="Close global search"
            onClick={closeDialog}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
          >
            <X size={20} />
          </button>
        </header>

        <div className="border-b border-slate-200 p-4 sm:p-5">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
            <Search size={20} className="shrink-0 text-slate-400" />
            <span className="sr-only">Search document filenames</span>
            <input
              ref={inputRef}
              value={query}
              onChange={event => {
                const nextQuery = event.target.value
                setQuery(nextQuery)
                setResult(null)
                setError('')
                setLoading(Boolean(nextQuery.trim()))
                setActiveIndex(-1)
              }}
              aria-label="Search document filenames"
              placeholder="Type a file name…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-slate-900 outline-none"
            />
            {loading && <LoaderCircle aria-label="Searching" size={18} className="animate-spin text-indigo-600" />}
          </label>
        </div>

        <div className="min-h-48 flex-1 overflow-y-auto" aria-live="polite">
          {!normalizedQuery ? (
            <div className="px-6 py-12 text-center">
              <FileSearch size={36} className="mx-auto text-slate-300" />
              <p className="mt-4 font-medium text-slate-700">Find a stored document</p>
              <p className="mt-1 text-sm text-slate-500">Search by all or part of its file name.</p>
            </div>
          ) : error ? (
            <div role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
              <AlertCircle size={24} className="mx-auto" />
              <p className="mt-2 font-semibold">Search unavailable</p>
              <p className="mt-1">{error}</p>
              <button
                type="button"
                onClick={retrySearch}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 font-semibold hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
              >
                <RotateCcw size={16} /> Retry
              </button>
            </div>
          ) : !loading && result && documents.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText size={34} className="mx-auto text-slate-300" />
              <p className="mt-4 font-medium text-slate-700">No documents found</p>
              <p className="mt-1 text-sm text-slate-500">Try a different file name.</p>
            </div>
          ) : documents.length > 0 ? (
            <div className="divide-y divide-slate-100" role="listbox" aria-label="Document search results">
              {documents.map((document, index) => (
                <button
                  key={document.documentId}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openDocument(document.documentId)}
                  className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-indigo-100 sm:px-5 ${activeIndex === index ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="mt-0.5 rounded-lg bg-indigo-50 p-2 text-indigo-600">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{document.originalName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {fileType(document.originalName)} · {formatSize(document.size)} · {new Date(document.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${document.indexingStatus === 'INDEX_FAILED' ? 'bg-red-50 text-red-700' : document.indexingStatus === 'INDEXED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {statusLabel(document)}
                  </span>
                </button>
              ))}
            </div>
          ) : loading ? (
            <div role="status" className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
              <LoaderCircle size={20} className="animate-spin text-indigo-600" /> Searching documents…
            </div>
          ) : null}
        </div>

        {normalizedQuery && (
          <footer className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <button
              type="button"
              onClick={() => {
                onNavigate({ page: 'assistant', query: normalizedQuery })
                closeDialog()
              }}
              className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-white hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
            >
              Search document contents
            </button>
            {result && result.totalElements > documents.length && (
              <button
                type="button"
                onClick={() => {
                  onNavigate({ page: 'documents', query: normalizedQuery })
                  closeDialog()
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
              >
                View all {result.totalElements} results <ArrowRight size={16} />
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
