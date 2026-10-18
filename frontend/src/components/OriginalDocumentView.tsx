import { useEffect, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { renderAsync } from 'docx-preview'
import { getDocumentContent, getDocumentContentUrl } from '../api/client'

type Props = {
  documentId: string
}

type FileType = 'pdf' | 'docx' | 'txt' | 'unsupported'

function fileTypeOf(documentId: string): FileType {
  const extension = documentId.split('.').pop()?.toLowerCase()
  return extension === 'pdf' || extension === 'docx' || extension === 'txt'
    ? extension
    : 'unsupported'
}

function sanitizeDocxPreview(root: HTMLElement) {
  root.querySelectorAll('script, iframe, object, embed').forEach(node => node.remove())
  root.querySelectorAll('[href]').forEach(node => node.removeAttribute('href'))
  root.querySelectorAll('[src]').forEach(node => {
    const source = node.getAttribute('src') ?? ''
    if (!source.startsWith('data:') && !source.startsWith('blob:')) {
      node.removeAttribute('src')
    }
  })
  root.querySelectorAll<HTMLElement>('[style]').forEach(node => {
    if (/url\s*\(\s*['"]?(?:https?:|\/\/)/i.test(node.style.cssText)) {
      node.removeAttribute('style')
    }
  })
  root.querySelectorAll('style').forEach(node => {
    node.textContent = (node.textContent ?? '')
      .replace(/@import[^;]+;/gi, '')
      .replace(/url\s*\(\s*(['"]?)(?:https?:|\/\/).*?\1\s*\)/gi, 'none')
  })
}

export default function OriginalDocumentView({ documentId }: Props) {
  const fileType = fileTypeOf(documentId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)
  const docxContainerRef = useRef<HTMLDivElement>(null)
  const styleContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let objectUrl = ''

    getDocumentContent(documentId, controller.signal)
      .then(async blob => {
        if (!active) return
        if (fileType === 'pdf') {
          objectUrl = URL.createObjectURL(blob)
          setPdfUrl(objectUrl)
        } else if (fileType === 'docx') {
          setDocxBlob(blob)
        } else if (fileType === 'txt') {
          const originalText = await blob.text()
          if (active) setText(originalText)
        } else {
          throw new Error('This file type cannot be previewed.')
        }
      })
      .catch(requestError => {
        if (active && !controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load the original document.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [documentId, fileType])

  useEffect(() => {
    if (!docxBlob || !docxContainerRef.current || !styleContainerRef.current) {
      return
    }
    const bodyContainer = docxContainerRef.current
    const styleContainer = styleContainerRef.current
    const detachedBody = document.createElement('div')
    const detachedStyles = document.createElement('div')
    let active = true
    bodyContainer.replaceChildren()
    styleContainer.replaceChildren()

    renderAsync(docxBlob, detachedBody, detachedStyles, {
      useBase64URL: true,
      renderAltChunks: false,
      ignoreFonts: true,
      renderChanges: false,
    })
      .then(() => {
        if (!active) return
        sanitizeDocxPreview(detachedBody)
        sanitizeDocxPreview(detachedStyles)
        bodyContainer.replaceChildren(...detachedBody.childNodes)
        styleContainer.replaceChildren(...detachedStyles.childNodes)
      })
      .catch(() => {
        if (active) setError('The DOCX file could not be rendered in the browser.')
      })

    return () => {
      active = false
      bodyContainer.replaceChildren()
      styleContainer.replaceChildren()
    }
  }, [docxBlob])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        <LoaderCircle size={19} className="animate-spin" /> Loading original document…
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <AlertCircle size={19} className="shrink-0" /> {error}
      </div>
    )
  }

  if (fileType === 'pdf' && pdfUrl) {
    return (
      <div className="space-y-2">
        <iframe
          title="Original PDF document"
          src={pdfUrl}
          onError={() => setError('The PDF file could not be displayed in the browser.')}
          className="h-[60vh] min-h-96 w-full rounded-xl border border-slate-200 bg-slate-50"
        />
        <p className="text-right text-xs text-slate-500">
          If the embedded viewer is unavailable,{' '}
          <a
            href={getDocumentContentUrl(documentId)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            open the PDF in a new tab
          </a>
          .
        </p>
      </div>
    )
  }

  if (fileType === 'docx') {
    return (
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-4">
        <div ref={styleContainerRef} />
        <div ref={docxContainerRef} className="min-h-64 bg-white" />
      </div>
    )
  }

  return (
    <pre className="max-h-[60vh] min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700">
      {text || 'This text file is empty.'}
    </pre>
  )
}
