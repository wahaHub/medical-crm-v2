import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalLogin } from './portal-login';

describe('PortalLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a safe localized invalid-credentials message instead of raw provider details', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errorCode: 'INVALID_CREDENTIALS',
            error: 'Invalid credentials',
            details: 'Invalid user credentials',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    render(
      <PortalLogin
        invalidCredentialsMessage="凭证不正确"
        genericLoginFailedMessage="登录失败"
      />,
    );

    await user.type(screen.getByLabelText('Username / Email'), 'doctor@example.com');
    await user.type(screen.getByLabelText('Password'), 'bad-password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByText('凭证不正确')).toBeTruthy();
    });
    expect(screen.queryByText('Invalid user credentials')).toBeNull();
  });
});
