export type IndexingStatus = 'INDEXED' | 'INDEX_FAILED'

export type UploadDocumentResponse = {
  id: string
  documentId: string
  originalName: string
  size: number
  status: 'STORED'
  indexingStatus?: IndexingStatus
  characters: number | null
  words: number | null
  chunkCount: number | null
  indexedChunks: number | null
  createdAt: string
  indexingError?: string
}

export type DocumentPageResponse = {
  documents: UploadDocumentResponse[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type SearchLimit = 3 | 5 | 10

export type SearchResult = {
  score: number
  document_id: string
  filename: string
  chunk_index: number
  content: string
  start_char: number
  end_char: number
}

export type SearchResponse = {
  query: string
  count: number
  results: SearchResult[]
}

type ErrorPayload = {
  detail?: unknown
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error('The server returned an invalid response.')
  }
}

async function requestJson(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await parseJson(response)

  if (!response.ok) {
    const errorPayload = payload as ErrorPayload
    const detail =
      typeof errorPayload.detail === 'string'
        ? ` ${errorPayload.detail}`
        : ''
    throw new Error(`Request failed (HTTP ${response.status}).${detail}`)
  }

  return payload
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function parseDocument(payload: unknown): UploadDocumentResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The upload service returned an unexpected response.')
  }

  const response = payload as Record<string, unknown>
  const indexingStatus = response.indexingStatus

  if (
    typeof response.id !== 'string' ||
    typeof response.documentId !== 'string' ||
    typeof response.originalName !== 'string' ||
    typeof response.size !== 'number' ||
    response.status !== 'STORED' ||
    (indexingStatus !== undefined &&
      indexingStatus !== 'INDEXED' &&
      indexingStatus !== 'INDEX_FAILED') ||
    !isNumberOrNull(response.characters) ||
    !isNumberOrNull(response.words) ||
    !isNumberOrNull(response.chunkCount) ||
    !isNumberOrNull(response.indexedChunks) ||
    typeof response.createdAt !== 'string'
  ) {
    throw new Error('The upload service returned an unexpected response.')
  }

  return {
    id: response.id,
    documentId: response.documentId,
    originalName: response.originalName,
    size: response.size,
    status: 'STORED',
    indexingStatus,
    characters: response.characters,
    words: response.words,
    chunkCount: response.chunkCount,
    indexedChunks: response.indexedChunks,
    createdAt: response.createdAt,
    indexingError:
      typeof response.indexingError === 'string'
        ? response.indexingError
        : undefined,
  }
}

function parseDocumentPage(payload: unknown): DocumentPageResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The document service returned an unexpected response.')
  }
  const response = payload as Record<string, unknown>
  if (
    !Array.isArray(response.documents) ||
    typeof response.page !== 'number' ||
    typeof response.size !== 'number' ||
    typeof response.totalElements !== 'number' ||
    typeof response.totalPages !== 'number'
  ) {
    throw new Error('The document service returned an unexpected response.')
  }

  return {
    documents: response.documents.map(parseDocument),
    page: response.page,
    size: response.size,
    totalElements: response.totalElements,
    totalPages: response.totalPages,
  }
}

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== 'object') return false

  const result = value as Record<string, unknown>
  return (
    typeof result.score === 'number' &&
    typeof result.document_id === 'string' &&
    typeof result.filename === 'string' &&
    typeof result.chunk_index === 'number' &&
    typeof result.content === 'string' &&
    typeof result.start_char === 'number' &&
    typeof result.end_char === 'number'
  )
}

function parseSearchResponse(payload: unknown): SearchResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The search service returned an unexpected response.')
  }

  const response = payload as Record<string, unknown>
  if (
    typeof response.query !== 'string' ||
    typeof response.count !== 'number' ||
    !Array.isArray(response.results) ||
    !response.results.every(isSearchResult)
  ) {
    throw new Error('The search service returned an unexpected response.')
  }

  return {
    query: response.query,
    count: response.count,
    results: response.results,
  }
}

export async function uploadDocument(
  file: File,
): Promise<UploadDocumentResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const payload = await requestJson('/api/documents/upload', {
    method: 'POST',
    body: formData,
  })
  return parseDocument(payload)
}

export async function listDocuments(
  query: string,
  page: number,
  size = 10,
): Promise<DocumentPageResponse> {
  const parameters = new URLSearchParams({
    query,
    page: String(page),
    size: String(size),
  })
  const payload = await requestJson(`/api/documents?${parameters}`, {
    method: 'GET',
  })
  return parseDocumentPage(payload)
}

export async function deleteDocument(documentId: string): Promise<void> {
  const payload = await requestJson(
    `/api/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
  )
  if (!payload || typeof payload !== 'object') {
    throw new Error('The delete service returned an unexpected response.')
  }
  const response = payload as Record<string, unknown>
  if (
    response.status !== 'DELETED' ||
    response.documentId !== documentId
  ) {
    throw new Error('The server did not confirm document deletion.')
  }
}

export async function searchDocuments(
  query: string,
  limit: SearchLimit,
): Promise<SearchResponse> {
  const payload = await requestJson('/api/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit }),
  })
  return parseSearchResponse(payload)
}
