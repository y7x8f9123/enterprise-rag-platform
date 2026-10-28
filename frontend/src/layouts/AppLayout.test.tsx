import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppLayout from './AppLayout'

describe('AppLayout global search entry', () => {
  it('opens search from the header button and Ctrl+K', () => {
    const onOpenSearch = vi.fn()
    const onOpenNotifications = vi.fn()
    render(
      <AppLayout
        currentPage="dashboard"
        onNavigate={vi.fn()}
        onOpenSearch={onOpenSearch}
        unreadNotifications={3}
        onOpenNotifications={onOpenNotifications}
      >
        <p>Page content</p>
      </AppLayout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open global document search' }))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(onOpenSearch).toHaveBeenCalledTimes(2)

    expect(screen.getByLabelText('3 unread notifications')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }))
    expect(onOpenNotifications).toHaveBeenCalledTimes(1)
  })
})
