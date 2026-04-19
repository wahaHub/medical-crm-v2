import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOptimisticNavigationState } from '../use-optimistic-navigation-state';

describe('useOptimisticNavigationState', () => {
  it('switches to the target tab immediately and clears pending state once pathname catches up', () => {
    const push = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedKey, transitionPending }) =>
        useOptimisticNavigationState(committedKey, transitionPending),
      { initialProps: { committedKey: 'dashboard', transitionPending: false } },
    );

    expect(result.current.displayActiveKey).toBe('dashboard');
    expect(result.current.pendingKey).toBeNull();
    expect(result.current.isNavigating).toBe(false);

    act(() => {
      result.current.navigateTo('messages', () => push('/messages'));
    });

    expect(push).toHaveBeenCalledWith('/messages');
    expect(result.current.displayActiveKey).toBe('messages');
    expect(result.current.pendingKey).toBe('messages');
    expect(result.current.isNavigating).toBe(true);

    rerender({ committedKey: 'dashboard', transitionPending: true });

    expect(result.current.displayActiveKey).toBe('messages');
    expect(result.current.pendingKey).toBe('messages');
    expect(result.current.isNavigating).toBe(true);

    rerender({ committedKey: 'messages', transitionPending: false });

    expect(result.current.displayActiveKey).toBe('messages');
    expect(result.current.pendingKey).toBeNull();
    expect(result.current.isNavigating).toBe(false);
  });

  it('ignores same-tab navigation requests', () => {
    const push = vi.fn();
    const { result } = renderHook(() => useOptimisticNavigationState('messages', false));

    act(() => {
      result.current.navigateTo('messages', () => push('/messages'));
    });

    expect(push).not.toHaveBeenCalled();
    expect(result.current.displayActiveKey).toBe('messages');
    expect(result.current.pendingKey).toBeNull();
    expect(result.current.isNavigating).toBe(false);
  });

  it('clears the pending state once an observed pending transition settles without committing the target key', () => {
    const push = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedKey, transitionPending }) =>
        useOptimisticNavigationState(committedKey, transitionPending),
      { initialProps: { committedKey: 'dashboard', transitionPending: false } },
    );

    act(() => {
      result.current.navigateTo('messages', () => push('/messages'));
    });

    expect(result.current.pendingKey).toBe('messages');
    expect(result.current.displayActiveKey).toBe('messages');

    rerender({ committedKey: 'dashboard', transitionPending: true });

    expect(result.current.pendingKey).toBe('messages');
    expect(result.current.displayActiveKey).toBe('messages');

    rerender({ committedKey: 'dashboard', transitionPending: false });

    expect(result.current.pendingKey).toBeNull();
    expect(result.current.displayActiveKey).toBe('dashboard');
    expect(result.current.isNavigating).toBe(false);
  });
});
