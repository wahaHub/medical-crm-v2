import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  RealtimeTranslationSession,
  safetyIdentifierForJob,
  type TranslationLanguage,
} from './openai-realtime-translation.js';

interface ProbeOptions {
  input: string;
  output: string;
  target: TranslationLanguage;
}

function parseOptions(args: string[]): ProbeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('expected --input, --output, and --target');
    values.set(key, value);
  }
  const input = values.get('--input');
  const output = values.get('--output');
  const target = values.get('--target');
  if (!input || !output || (target !== 'zh' && target !== 'en')) {
    throw new Error('usage: probe-realtime-translation --input input.pcm --output translated.pcm --target zh|en');
  }
  return { input, output, target };
}

export async function runProbe(options: ProbeOptions): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const input = await readFile(options.input);
  if (input.byteLength === 0 || input.byteLength % 2 !== 0) throw new Error('input must be raw 24 kHz mono PCM16');

  const session = new RealtimeTranslationSession({
    apiKey,
    targetLanguage: options.target,
    safetyIdentifier: safetyIdentifierForJob('deidentified-capability-probe'),
  });
  const translatedAudio: Uint8Array[] = [];
  let sourceTranscript = '';
  let translatedTranscript = '';
  const eventTypes = new Set<string>();
  session.on('event', (event) => eventTypes.add(event.type));
  session.on('inputTranscriptDelta', (event) => { sourceTranscript += event.delta; });
  session.on('outputTranscriptDelta', (event) => { translatedTranscript += event.delta; });
  session.on('outputAudioDelta', (_event, pcm16) => translatedAudio.push(pcm16));

  await session.connect();
  const bytesPer20Ms = 24_000 * 2 / 50;
  for (let offset = 0; offset < input.byteLength; offset += bytesPer20Ms) {
    session.appendPcm16(input.subarray(offset, Math.min(offset + bytesPer20Ms, input.byteLength)));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await session.closeAndDrain();
  const output = Buffer.concat(translatedAudio.map((value) => Buffer.from(value)));
  if (!sourceTranscript.trim()) throw new Error('probe did not receive a source transcript');
  if (!translatedTranscript.trim()) throw new Error('probe did not receive a translated transcript');
  if (output.byteLength === 0 || output.byteLength % 2 !== 0) throw new Error('probe did not receive valid translated PCM16 audio');
  await writeFile(options.output, output, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    success: true,
    sourceTranscript,
    translatedTranscript,
    translatedAudioBytes: output.byteLength,
    eventTypes: [...eventTypes].sort(),
  }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runProbe(parseOptions(process.argv.slice(2)));
}
