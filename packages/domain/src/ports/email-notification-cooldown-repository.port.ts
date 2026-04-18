export interface EmailNotificationCooldownSlotInput {
  recipientId: string;
  notificationKind: string;
  dedupeKey: string;
  cooldownMs: number;
  now?: Date;
}

export interface IEmailNotificationCooldownRepository {
  tryAcquireSlot(input: EmailNotificationCooldownSlotInput): Promise<boolean>;
  releaseSlot(input: {
    recipientId: string;
    notificationKind: string;
    dedupeKey: string;
  }): Promise<void>;
}
