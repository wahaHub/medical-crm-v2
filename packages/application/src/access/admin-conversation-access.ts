import type {
  Conversation,
  IConversationRepository,
  Message,
} from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../types/actor.js';
import {
  isStaffActor,
  type AdminPatientSiteAccessPolicy,
} from './admin-patient-site-access.js';

export async function assertStaffCanAccessConversationCase(
  actor: Actor,
  conversation: Conversation,
  adminAccess?: AdminPatientSiteAccessPolicy,
): Promise<void> {
  if (!isStaffActor(actor) || !conversation.caseId || !adminAccess) {
    return;
  }

  await adminAccess.assertActorCanAccessCase(actor, conversation.caseId);
}

export async function assertAdminCanAccessConversationCase(
  actor: Actor,
  conversation: Conversation,
  adminAccess?: AdminPatientSiteAccessPolicy,
): Promise<void> {
  if (actor.role !== 'ADMIN') return;
  await assertStaffCanAccessConversationCase(actor, conversation, adminAccess);
}

export async function assertAdminCanAccessMessageConversationCase(
  actor: Actor,
  message: Message,
  conversationRepo?: IConversationRepository,
  adminAccess?: AdminPatientSiteAccessPolicy,
): Promise<void> {
  if (actor.role !== 'ADMIN' || !conversationRepo || !adminAccess) {
    return;
  }

  const conversation = await conversationRepo.findById(message.conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation ${message.conversationId} not found`);
  }

  await assertStaffCanAccessConversationCase(actor, conversation, adminAccess);
}

export async function isAdminMessageConversationCaseAllowed(
  actor: Actor,
  message: Message,
  conversationRepo?: IConversationRepository,
  adminAccess?: AdminPatientSiteAccessPolicy,
): Promise<boolean> {
  try {
    await assertAdminCanAccessMessageConversationCase(
      actor,
      message,
      conversationRepo,
      adminAccess,
    );
    return true;
  } catch {
    return false;
  }
}
