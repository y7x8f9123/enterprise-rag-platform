import type { IndexingStatus } from './api/client'

export type Page = 'dashboard' | 'documents' | 'assistant' | 'settings'

export type NavigationTarget =
  | { page: 'dashboard' }
  | { page: 'documents'; status?: IndexingStatus; query?: string }
  | { page: 'assistant'; query?: string }
  | { page: 'settings' }
