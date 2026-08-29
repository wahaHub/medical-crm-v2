import { describe, expect, it } from 'vitest';
import { classifyRemoteAudioTrust } from '../components/video-interpretation-audio-policy';

describe('video interpretation remote audio trust', () => {
  it('blocks translator-like audio until server status establishes the exact fence', () => {
    expect(classifyRemoteAudioTrust('translator-job-1', false, false, null)).toBe('BLOCKED_AGENT');
    expect(classifyRemoteAudioTrust(
      'translator-job-1',
      true,
      true,
      'translator-job-1',
    )).toBe('TRANSLATED');
  });

  it('blocks a known agent after STOPPING but leaves human audio continuous', () => {
    expect(classifyRemoteAudioTrust(
      'translator-job-1',
      true,
      false,
      'translator-job-1',
    )).toBe('BLOCKED_AGENT');
    expect(classifyRemoteAudioTrust('patient-1', false, false, null)).toBe('ORIGINAL');
  });

  it('never trusts another translator execution under a stale fence', () => {
    expect(classifyRemoteAudioTrust(
      'translator-job-2',
      true,
      true,
      'translator-job-1',
    )).toBe('BLOCKED_AGENT');
  });
});
