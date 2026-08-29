export type SpeechStartDecision = 'START_TURN' | 'DISCARD_ACTIVE' | 'DROP';

/**
 * Synchronous utterance boundary used before any provider/control-plane await.
 * Once a turn is discarded, every PCM frame remains inadmissible until the
 * matching VAD speech-end, so cleanup latency cannot leak tail audio into the
 * next turn's pre-roll or provider session.
 */
export class SpeakerTurnBoundary {
  #dropUntilSpeechEnd = false;

  acceptsPcm(): boolean {
    return !this.#dropUntilSpeechEnd;
  }

  onSpeechStart(hasActiveTurn: boolean): SpeechStartDecision {
    if (this.#dropUntilSpeechEnd) return 'DROP';
    if (!hasActiveTurn) return 'START_TURN';
    this.#dropUntilSpeechEnd = true;
    return 'DISCARD_ACTIVE';
  }

  discardUntilSpeechEnd(): void {
    this.#dropUntilSpeechEnd = true;
  }

  onSpeechEnd(): 'DROPPED_END' | 'NORMAL_END' {
    if (!this.#dropUntilSpeechEnd) return 'NORMAL_END';
    this.#dropUntilSpeechEnd = false;
    return 'DROPPED_END';
  }
}
