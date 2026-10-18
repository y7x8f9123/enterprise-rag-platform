export type AppearancePreference = 'light' | 'dark' | 'system'
export type DocumentViewPreference = 'original' | 'extracted'
export type DocumentsPerPage = 10 | 20 | 50

export type AppSettings = {
  appearance: AppearancePreference
  defaultDocumentView: DocumentViewPreference
  documentsPerPage: DocumentsPerPage
}

export const SETTINGS_STORAGE_KEY = 'enterprisemind.preferences.v1'

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'system',
  defaultDocumentView: 'original',
  documentsPerPage: 10,
}

const appearances: AppearancePreference[] = ['light', 'dark', 'system']
const documentViews: DocumentViewPreference[] = ['original', 'extracted']
const pageSizes: DocumentsPerPage[] = [10, 20, 50]

export function parseStoredSettings(value: string | null): AppSettings {
  if (!value) return { ...DEFAULT_SETTINGS }

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS }

    const candidate = parsed as Partial<AppSettings>
    return {
      appearance: appearances.includes(candidate.appearance as AppearancePreference)
        ? candidate.appearance as AppearancePreference
        : DEFAULT_SETTINGS.appearance,
      defaultDocumentView: documentViews.includes(
        candidate.defaultDocumentView as DocumentViewPreference,
      )
        ? candidate.defaultDocumentView as DocumentViewPreference
        : DEFAULT_SETTINGS.defaultDocumentView,
      documentsPerPage: pageSizes.includes(candidate.documentsPerPage as DocumentsPerPage)
        ? candidate.documentsPerPage as DocumentsPerPage
        : DEFAULT_SETTINGS.documentsPerPage,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

