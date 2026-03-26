import type { AiSyncAction, AiSyncStatus } from '../enums/index.js';

export interface AiSyncOutboxProps {
  id: string;
  entityType: string;
  entityKey: string;
  action: AiSyncAction;
  attempts: number;
  nextRetryAt: Date | null;
  status: AiSyncStatus;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class AiSyncOutbox {
  readonly id: string;
  entityType: string;
  entityKey: string;
  action: AiSyncAction;
  attempts: number;
  nextRetryAt: Date | null;
  status: AiSyncStatus;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: AiSyncOutboxProps) {
    this.id = props.id;
    this.entityType = props.entityType;
    this.entityKey = props.entityKey;
    this.action = props.action;
    this.attempts = props.attempts;
    this.nextRetryAt = props.nextRetryAt;
    this.status = props.status;
    this.payload = props.payload;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
