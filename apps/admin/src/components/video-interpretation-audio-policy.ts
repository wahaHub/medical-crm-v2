export type RemoteAudioTrust = 'ORIGINAL' | 'TRANSLATED' | 'BLOCKED_AGENT';

/** Never render translator-like audio as human audio while server state is unknown. */
export function classifyRemoteAudioTrust(
  participantIdentity: string,
  statusResolved: boolean,
  interpretationActive: boolean,
  trustedAgentIdentity: string | null,
): RemoteAudioTrust {
  if (statusResolved && participantIdentity === trustedAgentIdentity) {
    return interpretationActive ? 'TRANSLATED' : 'BLOCKED_AGENT';
  }
  if (participantIdentity.startsWith('translator-')) return 'BLOCKED_AGENT';
  return 'ORIGINAL';
}
