export class WsManager {
  private rooms = new Map<string, Set<any>>();

  join(roomId: string, ws: any): void {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(ws);
  }

  leave(roomId: string, ws: any): void {
    this.rooms.get(roomId)?.delete(ws);
    if (this.rooms.get(roomId)?.size === 0) this.rooms.delete(roomId);
  }

  broadcast(roomId: string, message: { type: string; data: unknown }): void {
    const clients = this.rooms.get(roomId);
    if (!clients) return;
    const payload = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  hasSubscribers(roomId: string): boolean {
    return (this.rooms.get(roomId)?.size ?? 0) > 0;
  }

  removeFromAll(ws: any): void {
    for (const [roomId, clients] of this.rooms) {
      clients.delete(ws);
      if (clients.size === 0) this.rooms.delete(roomId);
    }
  }
}

export const wsManager = new WsManager();
