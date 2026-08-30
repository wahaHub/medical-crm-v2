import * as silero from '@livekit/agents-plugin-silero';

const vad = await silero.VAD.load({
  minSilenceDuration: 550,
  maxBufferedSpeech: 30_000,
});

if (!vad) throw new Error('Silero VAD failed to load');
process.stdout.write('Silero VAD loaded successfully.\n');
