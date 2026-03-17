import { describe, it, expect, vi } from 'vitest';
import { WsManager } from '../ws/ws-manager.js';

describe('WsManager', () => {
  it('broadcasts message to all clients in a room', () => {
    const manager = new WsManager();
    const ws1 = { send: vi.fn(), readyState: 1 } as any;
    const ws2 = { send: vi.fn(), readyState: 1 } as any;

    manager.join('conv-1', ws1);
    manager.join('conv-1', ws2);
    manager.broadcast('conv-1', { type: 'new_message', data: {} });

    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
  });

  it('removes client on leave', () => {
    const manager = new WsManager();
    const ws1 = { send: vi.fn(), readyState: 1 } as any;

    manager.join('conv-1', ws1);
    manager.leave('conv-1', ws1);
    manager.broadcast('conv-1', { type: 'test', data: {} });

    expect(ws1.send).not.toHaveBeenCalled();
  });

  it('removes client from all rooms', () => {
    const manager = new WsManager();
    const ws1 = { send: vi.fn(), readyState: 1 } as any;

    manager.join('room-a', ws1);
    manager.join('room-b', ws1);
    manager.removeFromAll(ws1);
    manager.broadcast('room-a', { type: 'test', data: {} });
    manager.broadcast('room-b', { type: 'test', data: {} });

    expect(ws1.send).not.toHaveBeenCalled();
  });
});
