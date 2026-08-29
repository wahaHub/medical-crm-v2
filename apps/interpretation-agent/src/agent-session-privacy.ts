/**
 * Construct the only permitted AgentSession.start options for clinical
 * interpretation. LiveKit otherwise defers to the job/project recording
 * setting, which can upload audio, transcripts, traces, and logs.
 *
 * The media adapter is still hard-disabled. When it is implemented, it must
 * call `session.start(privateAgentSessionStartOptions(agent))` instead of
 * constructing start options directly.
 */
export function privateAgentSessionStartOptions(
  agent: AgentSessionStartOptions['agent'],
): AgentSessionStartOptions & { record: false } {
  return { agent, record: false };
}
import type { voice } from '@livekit/agents';

type AgentSessionStartOptions = Parameters<voice.AgentSession['start']>[0];
