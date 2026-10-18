import type { IndexingStatus } from './api/client'

export type Page = 'dashboard' | 'documents' | 'assistant' | 'settings'

export type NavigationTarget =
  | { page: 'dashboard' }
  | { page: 'documents'; status?: IndexingStatus }
  | { page: 'assistant' }
  | { page: 'settings' }

