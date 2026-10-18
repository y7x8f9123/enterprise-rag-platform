import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServiceHealth } from '../api/client'
import { AppSettingsProvider } from '../settings/AppSettingsProvider'
import { SETTINGS_STORAGE_KEY } from '../settings/settings'
import Settings from './Settings'

vi.mock('../api/client', () => ({ getServiceHealth: vi.fn() }))

const healthRequest = vi.mocked(getServiceHealth)

describe('Settings', () => {
  beforeEach(() => healthRequest.mockReset())

  it('shows both services as unavailable when health requests fail', async () => {
    healthRequest.mockImplementation(async service => ({ status: 'DOWN', service }))
    render(<AppSettingsProvider><Settings /></AppSettingsProvider>)

    await waitFor(() => expect(screen.getAllByText('Unavailable')).toHaveLength(2))
    expect(healthRequest).toHaveBeenCalledWith('backend')
    expect(healthRequest).toHaveBeenCalledWith('ai')
  })

  it('asks for confirmation and resets all preferences', async () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      appearance: 'dark',
      defaultDocumentView: 'extracted',
      documentsPerPage: 50,
    }))
    healthRequest.mockImplementation(async service => ({ status: 'DOWN', service }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AppSettingsProvider><Settings /></AppSettingsProvider>)
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Reset preferences' }))

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('radio', { name: /System/ })).toBeChecked()
    expect(screen.getByLabelText('Default Document View')).toHaveValue('original')
    expect(screen.getByLabelText('Documents Per Page')).toHaveValue('10')
  })
})
