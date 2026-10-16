import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleCheck,
  Clock3,
  File,
  FileText,
  Info,
  LoaderCircle,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  uploadDocument as uploadDocumentRequest,
  type UploadDocumentResponse,
} from '../api/client'

type UploadStatus =
  | 'uploading'
  | 'stored'
  | 'indexed'
  | 'index_failed'
  | 'failed'

type LocalDocument = {
  id: string
  file: File
  originalName: string
  addedAt: Date
  status: UploadStatus
  serverId?: string
  characters?: number | null
  words?: number | null
  chunkCount?: number | null
  indexedChunks?: number | null
  error?: string
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

export default function Documents() {
  const [documents, setDocuments] = useState<LocalDocument[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadDocument(document: LocalDocument) {
    try {
      const result = await uploadDocumentRequest(document.file)
      const finalStatus = statusFromResponse(result)

      setDocuments(previous =>
        previous.map(item =>
          item.id === document.id
            ? {
                ...item,
                originalName: result.originalName,
                status: finalStatus,
                serverId: result.documentId || result.id,
                characters: result.characters,
                words: result.words,
                chunkCount: result.chunkCount,
                indexedChunks: result.indexedChunks,
                error:
                  finalStatus === 'index_failed'
                    ? result.indexingError ?? 'Vector indexing failed.'
                    : undefined,
              }
            : item,
        ),
      )
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unknown upload error'

      setDocuments(previous =>
        previous.map(item =>
          item.id === document.id
            ? {
                ...item,
                status: 'failed',
                error: message,
              }
            : item,
        ),
      )
    }
  }

  function addFiles(files: FileList | File[]) {
    setError('')

    const accepted: LocalDocument[] = []
    const rejected: string[] = []

    for (const file of Array.from(files)) {
      const extension = file.name.split('.').pop()?.toLowerCase()

      if (!extension || !allowedExtensions.includes(extension)) {
        rejected.push(`${file.name}: unsupported format`)
        continue
      }

      if (file.size === 0) {
        rejected.push(`${file.name}: file is empty`)
        continue
      }

      if (file.size > maxSize) {
        rejected.push(`${file.name}: exceeds 20 MB`)
        continue
      }

      accepted.push({
        id: crypto.randomUUID(),
        file,
        originalName: file.name,
        addedAt: new Date(),
        status: 'uploading',
      })
    }

    if (rejected.length > 0) {
      setError(rejected.join('; '))
    }

    if (accepted.length === 0) return

    setDocuments(previous => [...previous, ...accepted])

    for (const document of accepted) {
      void uploadDocument(document)
    }
  }

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(event.target.files)
    }

    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  function removeDocument(id: string) {
    setDocuments(previous => previous.filter(item => item.id !== id))
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = documents.filter(document =>
    document.originalName.toLowerCase().includes(normalizedSearch),
  )

  const indexedCount = documents.filter(
    document => document.status === 'indexed',
  ).length
  const processingCount = documents.filter(
    document => document.status === 'uploading',
  ).length
  const attentionCount = documents.filter(
    document =>
      document.status === 'index_failed' || document.status === 'failed',
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Document Management
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload, index, and review documents in your local knowledge workspace.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={20} className="shrink-0" />
        <p>
          Development Mode: files are stored by your local Spring Boot service
          and indexed by the local AI service. This list exists only in browser
          memory and resets when the page is refreshed.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        multiple
        className="hidden"
        onChange={handleSelect}
      />

      <div
        onDragOver={event => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragging(false)
          }
        }}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors md:p-10 ${
          dragging
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-slate-300 bg-white'
        }`}
      >
        <UploadCloud size={42} className="mx-auto mb-4 text-indigo-600" />

        <h3 className="text-lg font-semibold text-slate-900">
          Upload Documents
        </h3>

        <p className="mt-2 text-sm text-slate-500">
          Drag and drop files here, or choose files from your computer.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Choose Files
        </button>

        <p className="mt-4 text-xs text-slate-400">
          PDF, DOCX, TXT · Maximum 20 MB per file
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={19} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Documents ({documents.length})
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {indexedCount} indexed · {processingCount} processing ·{' '}
              {attentionCount} need attention
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50">
            <Search size={17} className="text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Filter this session…"
              aria-label="Filter uploaded documents"
              className="w-full bg-transparent text-sm outline-none sm:w-56"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-600">
              {documents.length === 0
                ? 'No documents uploaded this session'
                : 'No matching documents'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {documents.length === 0
                ? 'Choose a file to start uploading and indexing.'
                : 'Try another filename.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(document => (
              <article key={document.id} className="p-4 md:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="h-fit rounded-lg bg-indigo-50 p-3 text-indigo-600">
                      <File size={22} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">
                        {document.originalName}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {formatSize(document.file.size)}
                        {' · '}
                        {document.addedAt.toLocaleString()}
                      </p>

                      {document.serverId && (
                        <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                          ID: {document.serverId}
                        </p>
                      )}

                      {document.error && (
                        <p
                          className={`mt-2 text-xs ${
                            document.status === 'index_failed'
                              ? 'text-orange-700'
                              : 'text-red-600'
                          }`}
                        >
                          {document.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <DocumentStatus status={document.status} />
                    <button
                      type="button"
                      aria-label={`Remove ${document.originalName} from this session list`}
                      title="Remove from this browser list only"
                      onClick={() => removeDocument(document.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={19} />
                    </button>
                  </div>
                </div>

                {(document.characters !== undefined ||
                  document.words !== undefined ||
                  document.chunkCount !== undefined) && (
                  <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-slate-400">Characters</dt>
                      <dd className="mt-1 font-semibold text-slate-700">
                        {document.characters?.toLocaleString() ?? '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-slate-400">Words</dt>
                      <dd className="mt-1 font-semibold text-slate-700">
                        {document.words?.toLocaleString() ?? '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-slate-400">Chunks</dt>
                      <dd className="mt-1 font-semibold text-slate-700">
                        {document.chunkCount?.toLocaleString() ?? '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-slate-400">Indexed</dt>
                      <dd className="mt-1 flex items-center gap-1 font-semibold text-slate-700">
                        {document.status === 'indexed' && (
                          <CircleCheck size={13} className="text-emerald-600" />
                        )}
                        {document.indexedChunks?.toLocaleString() ?? '—'}
                      </dd>
                    </div>
                  </dl>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Removing an item only removes it from this in-memory browser list.
        Files already stored on the server are not deleted.
      </p>
    </div>
  )
}
