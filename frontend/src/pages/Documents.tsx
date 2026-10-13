
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  UploadCloud,
  FileText,
  File,
  Trash2,
  Search,
  Info,
  X,
  CheckCircle2,
  LoaderCircle,
  AlertCircle,
} from 'lucide-react'

type UploadStatus = 'uploading' | 'stored' | 'failed'

type LocalDocument = {
  id: string
  file: File
  addedAt: Date
  status: UploadStatus
  serverId?: string
  error?: string
}

type UploadResponse = {
  id: string
  originalName: string
  size: number
  status: string
}

const allowedExtensions = ['pdf', 'docx', 'txt']
const maxSize = 20 * 1024 * 1024

export default function Documents() {
  const [documents, setDocuments] = useState<LocalDocument[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  async function uploadDocument(document: LocalDocument) {
    const formData = new FormData()
    formData.append('file', document.file)

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: HTTP ${response.status}`)
      }

      const result: UploadResponse = await response.json()

      if (result.status !== 'STORED' || !result.id) {
        throw new Error('Unexpected server response')
      }

      setDocuments(previous =>
        previous.map(item =>
          item.id === document.id
            ? {
                ...item,
                status: 'stored',
                serverId: result.id,
                error: undefined,
              }
            : item
        )
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'

      setDocuments(previous =>
        previous.map(item =>
          item.id === document.id
            ? {
                ...item,
                status: 'failed',
                error: message,
              }
            : item
        )
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

  const filtered = documents.filter(document =>
    document.file.name.toLowerCase().includes(search.toLowerCase())
  )

  const storedCount = documents.filter(document => document.status === 'stored').length
  const uploadingCount = documents.filter(document => document.status === 'uploading').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Document Management
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload and manage documents for your enterprise knowledge base.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info size={20} className="shrink-0" />
        <p>
          Development Mode: files are uploaded to your local Spring Boot server.
          AI indexing is not yet enabled. The document list is kept in browser
          memory and will reset when you refresh the page.
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
        className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
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
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Documents ({documents.length})
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {storedCount} stored · {uploadingCount} uploading
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <Search size={17} className="text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search documents..."
              aria-label="Search documents"
              className="w-48 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-600">
              {documents.length === 0
                ? 'No documents uploaded yet'
                : 'No matching documents'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {documents.length === 0
                ? 'Choose a file to start uploading.'
                : 'Try another search term.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(document => (
              <div
                key={document.id}
                className="flex items-center gap-4 p-4"
              >
                <div className="rounded-lg bg-indigo-50 p-3 text-indigo-600">
                  <File size={22} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {document.file.name}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {formatSize(document.file.size)}
                    {' · '}
                    {document.addedAt.toLocaleString()}
                  </p>

                  {document.error && (
                    <p className="mt-1 text-xs text-red-600">
                      {document.error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {document.status === 'uploading' && (
                    <span className="flex items-center gap-1.5 text-sm text-amber-600">
                      <LoaderCircle size={17} className="animate-spin" />
                      Uploading
                    </span>
                  )}

                  {document.status === 'stored' && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <CheckCircle2 size={17} />
                      Stored
                    </span>
                  )}

                  {document.status === 'failed' && (
                    <span className="flex items-center gap-1.5 text-sm text-red-600">
                      <AlertCircle size={17} />
                      Failed
                    </span>
                  )}

                  <button
                    type="button"
                    aria-label={`Remove ${document.file.name} from list`}
                    title="Remove from list only"
                    onClick={() => removeDocument(document.id)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={19} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Removing an item only removes it from this list.
        Files already stored on the server are not deleted.
      </p>
    </div>
  )
}
