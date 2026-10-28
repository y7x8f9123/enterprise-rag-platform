import { useRef, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  BookOpenText,
  FileText,
  LoaderCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import {
  searchDocuments,
  type SearchLimit,
  type SearchResult,
} from '../api/client'

type SearchState = 'idle' | 'loading' | 'success' | 'error'

const limitOptions: SearchLimit[] = [3, 5, 10]

function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`
}

type Props = {
  initialQuery?: string
}

export default function AIAssistant({ initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [limit, setLimit] = useState<SearchLimit>(3)
  const [state, setState] = useState<SearchState>('idle')
  const [results, setResults] = useState<SearchResult[]>([])
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [error, setError] = useState('')
  const requestInFlight = useRef(false)

  const loading = state === 'loading'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedQuery = query.trim()

    if (!normalizedQuery || requestInFlight.current) return

    requestInFlight.current = true
    setState('loading')
    setError('')
    setResults([])

    try {
      const response = await searchDocuments(normalizedQuery, limit)
      const sortedResults = [...response.results].sort(
        (left, right) => right.score - left.score,
      )

      setSubmittedQuery(response.query)
      setResults(sortedResults)
      setState('success')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Search is temporarily unavailable.',
      )
      setState('error')
    } finally {
      requestInFlight.current = false
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 p-6 text-white shadow-sm md:p-8">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-indigo-100">
            <Sparkles size={14} />
            Semantic retrieval
          </div>
          <h2 className="text-2xl font-bold md:text-3xl">
            Search your enterprise knowledge
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100/80">
            Ask a natural-language question to find the most relevant indexed
            passages. This retrieves source text only—it does not generate an
            AI answer.
          </p>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
      >
        <label
          htmlFor="assistant-query"
          className="text-sm font-semibold text-slate-800"
        >
          Question
        </label>
        <textarea
          id="assistant-query"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="What does EnterpriseMind provide?"
          rows={4}
          maxLength={10_000}
          disabled={loading}
          className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 disabled:cursor-not-allowed disabled:opacity-70"
        />

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label
              htmlFor="result-limit"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Retrieved passages
            </label>
            <select
              id="result-limit"
              value={limit}
              disabled={loading}
              onChange={event =>
                setLimit(Number(event.target.value) as SearchLimit)
              }
              className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            >
              {limitOptions.map(option => (
                <option key={option} value={option}>
                  Top {option}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <Search size={18} />
            )}
            {loading ? 'Searching…' : 'Search knowledge'}
          </button>
        </div>
      </form>

      {state === 'idle' && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <BookOpenText size={36} className="mx-auto text-slate-300" />
          <h3 className="mt-4 font-semibold text-slate-700">
            Retrieved passages will appear here
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
            Results always include their exact file and chunk identifiers so
            you can evaluate the source directly.
          </p>
        </div>
      )}

      {state === 'loading' && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-10 text-sm font-medium text-slate-600 shadow-sm"
        >
          <LoaderCircle size={22} className="animate-spin text-indigo-600" />
          Comparing your question with indexed passages…
        </div>
      )}

      {state === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Search failed</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {state === 'success' && (
        <section className="space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Retrieved Passages
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {results.length} source{results.length === 1 ? '' : 's'} found
              </h3>
            </div>
            <p className="max-w-xl truncate text-sm text-slate-500">
              Query: “{submittedQuery}”
            </p>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
              <FileText size={34} className="mx-auto text-slate-300" />
              <p className="mt-4 font-semibold text-slate-700">
                No matching passages found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try a broader phrase or index more documents first.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((result, index) => (
                <article
                  key={`${result.document_id}-${result.chunk_index}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <FileText size={18} className="shrink-0 text-indigo-600" />
                        <span className="truncate">{result.filename}</span>
                      </div>
                      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <div className="flex gap-1">
                          <dt>Document:</dt>
                          <dd className="break-all font-mono">
                            {result.document_id}
                          </dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>Chunk:</dt>
                          <dd>{result.chunk_index}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-right">
                      <p className="text-xs font-medium text-emerald-700">
                        Similarity
                      </p>
                      <p className="text-lg font-bold text-emerald-800">
                        {formatScore(result.score)}
                      </p>
                      <p className="text-[11px] text-emerald-700/70">
                        score {result.score.toFixed(4)}
                      </p>
                    </div>
                  </div>

                  <blockquote className="mt-5 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                    {result.content}
                  </blockquote>
                  <p className="mt-3 text-xs text-slate-400">
                    Source offsets: {result.start_char}–{result.end_char}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
