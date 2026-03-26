export interface DifyDocumentMappingProps {
  id: string;
  entityType: string;
  entityKey: string;
  difyDatasetId: string;
  difyDocumentId: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DifyDocumentMapping {
  readonly id: string;
  entityType: string;
  entityKey: string;
  difyDatasetId: string;
  difyDocumentId: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: DifyDocumentMappingProps) {
    this.id = props.id;
    this.entityType = props.entityType;
    this.entityKey = props.entityKey;
    this.difyDatasetId = props.difyDatasetId;
    this.difyDocumentId = props.difyDocumentId;
    this.lastSyncedAt = props.lastSyncedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
