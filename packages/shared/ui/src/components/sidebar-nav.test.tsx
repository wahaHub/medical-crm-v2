import { render, screen } from '@testing-library/react';
import { Bell, Home, MessageSquare } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarNav } from './sidebar-nav';

describe('SidebarNav', () => {
  it('marks the active item, exposes accessible button labels, and shows a pending loading marker', () => {
    render(
      <SidebarNav
        items={[
          { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <Home /> },
          { key: 'messages', label: 'Messages', href: '/messages', icon: <MessageSquare /> },
        ]}
        activeKey="messages"
        committedKey="dashboard"
        pendingKey="messages"
        pendingLabel="Loading Messages"
        onNavigate={vi.fn()}
        footer={<button type="button" aria-label="Notifications"><Bell /></button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Messages' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByLabelText('Loading Messages')).toBeTruthy();
  });
});
