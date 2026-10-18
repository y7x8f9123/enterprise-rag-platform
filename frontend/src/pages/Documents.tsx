import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleCheck,
  Clock3,
  File,
  FileText,
  Eye,
  Info,
  LoaderCircle,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import DocumentDetailsModal from '../components/DocumentDetailsModal'
import { useAppSettings } from '../settings/useAppSettings'
import {
  deleteDocument as deleteDocumentRequest,
  listDocuments,
  uploadDocument as uploadDocumentRequest,
  type UploadDocumentResponse,
  type IndexingStatus,
} from '../api/client'

type UploadStatus =
  | 'uploading'
  | 'stored'
  | 'indexed'
  | 'index_failed'
  | 'failed'

type DisplayDocument = {
  id: string
  originalName: string
  size: number
  createdAt: Date
  status: UploadStatus
  file?: File
  serverId?: string
  characters?: number | null
  words?: number | null
  chunkCount?: number | null
  indexedChunks?: number | null
  error?: string
  deleting?: boolean
}

const allowedExtensions = ['pdf', 'docx', 'txt']
const maxSize = 20 * 1024 * 1024
const statusPresentation = {
  uploading: {
    label: 'Uploading',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    icon: LoaderCircle,
  },
  stored: {
    label: 'Stored',
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
    icon: Clock3,
  },
  indexed: {
    label: 'Indexed',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    icon: CheckCircle2,
  },
  index_failed: {
    label: 'Index Failed',
    className: 'bg-orange-50 text-orange-700 ring-orange-200',
    icon: AlertCircle,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 ring-red-200',
    icon: AlertCircle,
  },
} satisfies Record<
  UploadStatus,
  { label: string; className: string; icon: typeof AlertCircle }
>

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function statusFromResponse(response: UploadDocumentResponse): UploadStatus {
  if (response.indexingStatus === 'INDEXED') return 'indexed'
  if (response.indexingStatus === 'INDEX_FAILED') return 'index_failed'
  return 'stored'
}

function fromResponse(response: UploadDocumentResponse): DisplayDocument {
  return {
    id: response.documentId,
    serverId: response.documentId,
    originalName: response.originalName,
    size: response.size,
    createdAt: new Date(response.createdAt),
    status: statusFromResponse(response),
    characters: response.characters,
    words: response.words,
    chunkCount: response.chunkCount,
    indexedChunks: response.indexedChunks,
    error: response.indexingError,
  }
}

function DocumentStatus({ status }: { status: UploadStatus }) {
  const presentation = statusPresentation[status]
  const Icon = presentation.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${presentation.className}`}
    >
      <Icon
        size={15}
        className={status === 'uploading' ? 'animate-spin' : undefined}
      />
      {presentation.label}
    </span>
  )
}

type Props = {
  initialStatusFilter?: IndexingStatus
}

export default function Documents({ initialStatusFilter }: Props) {
  const { settings } = useAppSettings()
  const [documents, setDocuments] = useState<DisplayDocument[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<IndexingStatus | undefined>(
    initialStatusFilter,
  )
  const [page, setPage] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(async (requestedPage: number, query: string) => {
    setLoading(true)
    try {
      const result = await listDocuments(
        query,
        requestedPage,
        settings.documentsPerPage,
        statusFilter,
      )
      setDocuments(result.documents.map(fromResponse))
      setPage(result.page)
      setTotalElements(result.totalElements)
      setTotalPages(result.totalPages)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load documents.',
      )
    } finally {
      setLoading(false)
    }
  }, [settings.documentsPerPage, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocuments(0, search.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [loadDocuments, search])

  async function uploadDocument(document: DisplayDocument) {
    if (!document.file) return
    try {
      const result = await uploadDocumentRequest(document.file)
      setDocuments(previous =>
        previous.map(item =>
          item.id === document.id ? fromResponse(result) : item,
        ),
      )
      setTotalElements(previous => previous + 1)
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unknown upload error'
      setDocuments(previous =>
        previous.map(item =>
          item.id === document.id
            ? { ...item, status: 'failed', error: message }
            : item,
        ),
      )
    }
  }

  function addFiles(files: FileList | File[]) {
    setError('')
    const accepted: DisplayDocument[] = []
    const rejected: string[] = []

    for (const file of Array.from(files)) {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (!extension || !allowedExtensions.includes(extension)) {
        rejected.push(`${file.name}: unsupported format`)
      } else if (file.size === 0) {
        rejected.push(`${file.name}: file is empty`)
      } else if (file.size > maxSize) {
        rejected.push(`${file.name}: exceeds 20 MB`)
      } else {
        accepted.push({
          id: crypto.randomUUID(),
          file,
          originalName: file.name,
          size: file.size,
          createdAt: new Date(),
          status: 'uploading',
        })
      }
    }

    if (rejected.length > 0) setError(rejected.join('; '))
    if (accepted.length === 0) return
    setDocuments(previous => [...accepted, ...previous])
    for (const document of accepted) void uploadDocument(document)
  }

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  async function removeDocument(document: DisplayDocument) {
    if (!document.serverId) {
      setDocuments(previous => previous.filter(item => item.id !== document.id))
      return
    }
    if (!window.confirm(
      `Permanently delete “${document.originalName}”, its stored file, and its vector index?`,
    )) return

    setDocuments(previous => previous.map(item =>
      item.id === document.id ? { ...item, deleting: true } : item,
    ))
    try {
      await deleteDocumentRequest(document.serverId)
      if (selectedDocumentId === document.serverId) setSelectedDocumentId(null)
      setDocuments(previous => previous.filter(item => item.id !== document.id))
      setTotalElements(previous => Math.max(0, previous - 1))
      if (documents.length === 1 && page > 0) {
        await loadDocuments(page - 1, search.trim())
      }
    } catch (requestError) {
      setDocuments(previous => previous.map(item =>
        item.id === document.id ? { ...item, deleting: false } : item,
      ))
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Document deletion failed.',
      )
    }
  }

  const indexedCount = documents.filter(item => item.status === 'indexed').length
  const processingCount = documents.filter(item => item.status === 'uploading').length
  const attentionCount = documents.filter(
    item => item.status === 'index_failed' || item.status === 'failed',
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Document Management</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload, index, search, and permanently manage your local knowledge files.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={20} className="shrink-0" />
        <p>
          Development Mode: metadata and files persist locally. Deleting a
          document removes its stored file, metadata, and Qdrant vectors.
        </p>
      </div>

      <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" multiple
        className="hidden" onChange={handleSelect} />

      <div
        onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors md:p-10 ${
          dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white'
        }`}
      >
        <UploadCloud size={42} className="mx-auto mb-4 text-indigo-600" />
        <h3 className="text-lg font-semibold text-slate-900">Upload Documents</h3>
        <p className="mt-2 text-sm text-slate-500">
          Drag and drop files here, or choose files from your computer.
        </p>
        <button type="button" onClick={() => inputRef.current?.click()}
          className="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700">
          Choose Files
        </button>
        <p className="mt-4 text-xs text-slate-400">PDF, DOCX, TXT · Maximum 20 MB per file</p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={19} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={18} />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Documents ({totalElements})</h3>
            <p className="mt-1 text-xs text-slate-500">
              On this page: {indexedCount} indexed · {processingCount} processing · {attentionCount} need attention
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
            <Search size={17} className="text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Search stored filenames…" aria-label="Search stored documents"
              className="w-full bg-transparent text-sm outline-none sm:w-56" />
          </div>
        </div>

        {statusFilter && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-indigo-50 px-5 py-3 text-sm">
            <p className="font-medium text-indigo-700">
              Showing {statusFilter === 'INDEXED' ? 'indexed documents' : 'documents with failed indexing'}
            </p>
            <button
              type="button"
              onClick={() => setStatusFilter(undefined)}
              className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
            >
              Clear filter
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle size={20} className="animate-spin" /> Loading documents…
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-600">
              {statusFilter === 'INDEXED'
                ? 'No indexed documents'
                : statusFilter === 'INDEX_FAILED'
                  ? 'No failed documents'
                  : search.trim()
                    ? 'No matching documents'
                    : 'No stored documents'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {statusFilter
                ? 'Clear the status filter or try another filename.'
                : search.trim()
                  ? 'Try another filename.'
                  : 'Choose a file to start uploading and indexing.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map(document => (
              <article key={document.id} className="p-4 md:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="h-fit rounded-lg bg-indigo-50 p-3 text-indigo-600"><File size={22} /></div>
                    <div className="min-w-0 flex-1">
                      {document.serverId ? (
                        <button
                          type="button"
                          onClick={() => setSelectedDocumentId(document.serverId ?? null)}
                          className="block max-w-full truncate text-left font-semibold text-slate-800 hover:text-indigo-600 hover:underline"
                        >
                          {document.originalName}
                        </button>
                      ) : (
                        <p className="truncate font-semibold text-slate-800">{document.originalName}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        {formatSize(document.size)} · {document.createdAt.toLocaleString()}
                      </p>
                      {document.serverId && (
                        <p className="mt-1 truncate font-mono text-[11px] text-slate-400">ID: {document.serverId}</p>
                      )}
                      {document.error && (
                        <p className={`mt-2 text-xs ${document.status === 'index_failed' ? 'text-orange-700' : 'text-red-600'}`}>
                          {document.error}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <DocumentStatus status={document.status} />
                    {document.serverId && (
                      <button
                        type="button"
                        onClick={() => setSelectedDocumentId(document.serverId ?? null)}
                        aria-label={`View details for ${document.originalName}`}
                        title="View details"
                        className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <Eye size={19} />
                      </button>
                    )}
                    <button type="button" disabled={document.deleting || document.status === 'uploading'}
                      aria-label={`Delete ${document.originalName}`}
                      title={document.serverId ? 'Permanently delete document' : 'Dismiss failed upload'}
                      onClick={() => void removeDocument(document)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50">
                      {document.deleting ? <LoaderCircle size={19} className="animate-spin" /> : <Trash2 size={19} />}
                    </button>
                  </div>
                </div>

                {(document.characters !== undefined || document.words !== undefined || document.chunkCount !== undefined) && (
                  <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs sm:grid-cols-4">
                    {[
                      ['Characters', document.characters],
                      ['Words', document.words],
                      ['Chunks', document.chunkCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-slate-400">{label}</dt>
                        <dd className="mt-1 font-semibold text-slate-700">
                          {typeof value === 'number' ? value.toLocaleString() : '—'}
                        </dd>
                      </div>
                    ))}
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-slate-400">Indexed</dt>
                      <dd className="mt-1 flex items-center gap-1 font-semibold text-slate-700">
                        {document.status === 'indexed' && <CircleCheck size={13} className="text-emerald-600" />}
                        {document.indexedChunks?.toLocaleString() ?? '—'}
                      </dd>
                    </div>
                  </dl>
                )}
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
            <span className="text-slate-500">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 0 || loading}
                onClick={() => void loadDocuments(page - 1, search.trim())}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button type="button" disabled={page + 1 >= totalPages || loading}
                onClick={() => void loadDocuments(page + 1, search.trim())}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {selectedDocumentId && (
        <DocumentDetailsModal
          key={selectedDocumentId}
          documentId={selectedDocumentId}
          defaultView={settings.defaultDocumentView}
          onClose={() => setSelectedDocumentId(null)}
        />
      )}
    </div>
  )
}
