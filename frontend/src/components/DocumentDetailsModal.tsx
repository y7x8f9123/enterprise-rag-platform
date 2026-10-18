import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  getDocumentDetails,
  getDocumentDownloadUrl,
  getDocumentPreview,
  type DocumentPreviewResponse,
  type UploadDocumentResponse,
} from '../api/client'
import OriginalDocumentView from './OriginalDocumentView'
import type { DocumentViewPreference } from '../settings/settings'

type Props = {
  documentId: string
  defaultView?: DocumentViewPreference
  onClose: () => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function IndexingStatus({ status }: { status?: string }) {
  const indexed = status === 'INDEXED'
  const Icon = indexed ? CheckCircle2 : TriangleAlert
  const label = indexed ? 'Indexed' : status === 'INDEX_FAILED' ? 'Index Failed' : 'Stored'
  const className = indexed
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : status === 'INDEX_FAILED'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : 'bg-slate-100 text-slate-600 ring-slate-200'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}>
      <Icon size={13} /> {label}
    </span>
  )
}

export default function DocumentDetailsModal({
  documentId,
  defaultView = 'original',
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<DocumentViewPreference>(defaultView)
  const [details, setDetails] = useState<UploadDocumentResponse | null>(null)
  const [preview, setPreview] = useState<DocumentPreviewResponse | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [detailsError, setDetailsError] = useState('')
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    getDocumentDetails(documentId, controller.signal)
      .then(result => {
        if (active) setDetails(result)
      })
      .catch(requestError => {
        if (active && !controller.signal.aborted) {
          setDetailsError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load document details.',
          )
        }
      })
      .finally(() => {
        if (active) setDetailsLoading(false)
      })

    getDocumentPreview(documentId, controller.signal)
      .then(result => {
        if (active) setPreview(result)
      })
      .catch(requestError => {
        if (active && !controller.signal.aborted) {
          setPreviewError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load document preview.',
          )
        }
      })
      .finally(() => {
        if (active) setPreviewLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [documentId])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-details-title"
        className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Document details</p>
            <h3 id="document-details-title" className="mt-1 truncate text-xl font-bold text-slate-900">
              {details?.originalName ?? 'Loading document…'}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={getDocumentDownloadUrl(documentId)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Download Original</span>
              <span className="sm:hidden">Download</span>
            </a>
            <button
              type="button"
              aria-label="Close document details"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={21} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {detailsLoading ? (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
              <LoaderCircle size={19} className="animate-spin" /> Loading metadata…
            </div>
          ) : detailsError ? (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={19} className="shrink-0" /> {detailsError}
            </div>
          ) : details ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">File size</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{formatSize(details.size)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Uploaded</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{new Date(details.createdAt).toLocaleString()}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Status</dt>
                <dd className="mt-1"><IndexingStatus status={details.indexingStatus} /></dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Characters</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{details.characters?.toLocaleString() ?? '—'}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Words</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{details.words?.toLocaleString() ?? '—'}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Chunks</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{details.chunkCount?.toLocaleString() ?? '—'}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Indexed chunks</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{details.indexedChunks?.toLocaleString() ?? '—'}</dd>
              </div>
            </dl>
          ) : null}

          <div className="mt-6">
            <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Document views">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'original'}
                onClick={() => setActiveTab('original')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeTab === 'original' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Original View
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'extracted'}
                onClick={() => setActiveTab('extracted')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeTab === 'extracted' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Extracted Text
              </button>
            </div>

            {activeTab === 'original' ? (
              <OriginalDocumentView key={documentId} documentId={documentId} />
            ) : previewLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                <LoaderCircle size={19} className="animate-spin" /> Extracting preview…
              </div>
            ) : previewError ? (
              <div role="alert" className="flex min-h-40 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                <AlertCircle size={19} className="shrink-0" /> {previewError}
              </div>
            ) : preview && preview.text.trim() ? (
              <div>
                {preview.truncated && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Preview truncated after 100,000 characters.
                  </p>
                )}
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700">
                  {preview.text}
                </pre>
              </div>
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                No readable text was found in this document.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
