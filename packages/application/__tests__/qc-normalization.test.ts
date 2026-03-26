import { describe, it, expect } from 'vitest';
import {
  normalizeQCQuestions,
  normalizeQCResponses,
  extractTranslatableQCFields,
  extractTranslatableQCResponses,
} from '../src/services/qc-normalization.js';

// ---------------------------------------------------------------------------
// normalizeQCQuestions
// ---------------------------------------------------------------------------

describe('normalizeQCQuestions', () => {
  it('returns empty array for null', () => {
    expect(normalizeQCQuestions(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(normalizeQCQuestions(undefined)).toEqual([]);
  });

  it('returns empty array for a plain object (not an array)', () => {
    expect(normalizeQCQuestions({ id: 'q1', type: 'text', label: 'Name' })).toEqual([]);
  });

  it('returns empty array for an empty array', () => {
    expect(normalizeQCQuestions([])).toEqual([]);
  });

  it('parses a minimal valid question', () => {
    const raw = [{ id: 'q1', type: 'text', label: 'Full Name' }];
    expect(normalizeQCQuestions(raw)).toEqual([
      { id: 'q1', type: 'text', label: 'Full Name' },
    ]);
  });

  it('parses a question with all optional fields', () => {
    const raw = [
      {
        id: 'q2',
        type: 'select',
        label: 'Gender',
        placeholder: 'Pick one',
        options: ['Male', 'Female', 'Other'],
        required: true,
      },
    ];
    expect(normalizeQCQuestions(raw)).toEqual([
      {
        id: 'q2',
        type: 'select',
        label: 'Gender',
        placeholder: 'Pick one',
        options: ['Male', 'Female', 'Other'],
        required: true,
      },
    ]);
  });

  it('skips items with missing id', () => {
    const raw = [{ type: 'text', label: 'No ID' }];
    expect(normalizeQCQuestions(raw)).toEqual([]);
  });

  it('skips items with invalid type', () => {
    const raw = [{ id: 'q1', type: 'slider', label: 'Bad type' }];
    expect(normalizeQCQuestions(raw)).toEqual([]);
  });

  it('skips items with non-string label', () => {
    const raw = [{ id: 'q1', type: 'text', label: 42 }];
    expect(normalizeQCQuestions(raw)).toEqual([]);
  });

  it('accepts all valid QCQuestionType values', () => {
    const types = ['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date'] as const;
    for (const type of types) {
      const result = normalizeQCQuestions([{ id: 'q1', type, label: 'L' }]);
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe(type);
    }
  });

  it('skips items that are not plain objects', () => {
    const raw = ['string', 42, null, undefined, [1, 2]];
    expect(normalizeQCQuestions(raw)).toEqual([]);
  });

  it('silently drops options that contain non-strings', () => {
    const raw = [{ id: 'q1', type: 'select', label: 'L', options: ['a', 42, 'b'] }];
    const result = normalizeQCQuestions(raw);
    // options field should be absent because the array contains a non-string
    expect(result[0]).not.toHaveProperty('options');
  });

  it('silently drops non-boolean required', () => {
    const raw = [{ id: 'q1', type: 'text', label: 'L', required: 'yes' }];
    const result = normalizeQCQuestions(raw);
    expect(result[0]).not.toHaveProperty('required');
  });

  it('processes multiple questions, skipping invalid ones', () => {
    const raw = [
      { id: 'q1', type: 'text', label: 'Name' },
      { id: 'q2', type: 'bad', label: 'Skip me' },
      { id: 'q3', type: 'date', label: 'DOB' },
    ];
    const result = normalizeQCQuestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('q1');
    expect(result[1]!.id).toBe('q3');
  });
});

// ---------------------------------------------------------------------------
// normalizeQCResponses
// ---------------------------------------------------------------------------

describe('normalizeQCResponses', () => {
  it('returns empty object for null', () => {
    expect(normalizeQCResponses(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(normalizeQCResponses(undefined)).toEqual({});
  });

  it('returns empty object for a non-object', () => {
    expect(normalizeQCResponses('string')).toEqual({});
    expect(normalizeQCResponses(42)).toEqual({});
    expect(normalizeQCResponses([])).toEqual({});
  });

  it('passes through string values', () => {
    expect(normalizeQCResponses({ q1: 'John' })).toEqual({ q1: 'John' });
  });

  it('passes through null values', () => {
    expect(normalizeQCResponses({ q1: null })).toEqual({ q1: null });
  });

  it('passes through string array values', () => {
    expect(normalizeQCResponses({ q1: ['a', 'b'] })).toEqual({ q1: ['a', 'b'] });
  });

  it('skips values that are not string, string[], or null', () => {
    const raw = {
      q1: 'valid',
      q2: 42,
      q3: true,
      q4: { nested: 'obj' },
      q5: [1, 2, 3],
    };
    expect(normalizeQCResponses(raw)).toEqual({ q1: 'valid' });
  });

  it('handles mixed valid and invalid values', () => {
    const raw = { q1: 'text', q2: null, q3: ['opt1', 'opt2'], q4: 99 };
    expect(normalizeQCResponses(raw)).toEqual({ q1: 'text', q2: null, q3: ['opt1', 'opt2'] });
  });
});

// ---------------------------------------------------------------------------
// extractTranslatableQCFields
// ---------------------------------------------------------------------------

describe('extractTranslatableQCFields', () => {
  it('returns empty object for empty questions array', () => {
    expect(extractTranslatableQCFields([])).toEqual({});
  });

  it('extracts label for each question', () => {
    const questions = [{ id: 'q1', type: 'text' as const, label: 'Your name' }];
    const result = extractTranslatableQCFields(questions);
    expect(result['q.q1.label']).toBe('Your name');
  });

  it('extracts placeholder when present', () => {
    const questions = [
      { id: 'q1', type: 'text' as const, label: 'Name', placeholder: 'Enter name' },
    ];
    const result = extractTranslatableQCFields(questions);
    expect(result['q.q1.placeholder']).toBe('Enter name');
  });

  it('omits placeholder key when not present', () => {
    const questions = [{ id: 'q1', type: 'text' as const, label: 'Name' }];
    const result = extractTranslatableQCFields(questions);
    expect(result).not.toHaveProperty('q.q1.placeholder');
  });

  it('extracts options with indexed keys', () => {
    const questions = [
      { id: 'q2', type: 'select' as const, label: 'Gender', options: ['Male', 'Female', 'Other'] },
    ];
    const result = extractTranslatableQCFields(questions);
    expect(result['q.q2.opt.0']).toBe('Male');
    expect(result['q.q2.opt.1']).toBe('Female');
    expect(result['q.q2.opt.2']).toBe('Other');
  });

  it('extracts all fields for multiple questions', () => {
    const questions = [
      { id: 'q1', type: 'text' as const, label: 'Name', placeholder: 'Enter' },
      { id: 'q2', type: 'select' as const, label: 'Gender', options: ['M', 'F'] },
    ];
    const result = extractTranslatableQCFields(questions);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['q.q1.label', 'q.q1.placeholder', 'q.q2.label', 'q.q2.opt.0', 'q.q2.opt.1']),
    );
  });
});

// ---------------------------------------------------------------------------
// extractTranslatableQCResponses
// ---------------------------------------------------------------------------

describe('extractTranslatableQCResponses', () => {
  it('returns empty object for empty responses', () => {
    expect(extractTranslatableQCResponses({})).toEqual({});
  });

  it('extracts non-empty string values', () => {
    const responses = { q1: 'John Doe', q2: null, q3: ['opt1'] };
    const result = extractTranslatableQCResponses(responses);
    expect(result).toEqual({ q1: 'John Doe' });
  });

  it('skips empty string values', () => {
    const responses = { q1: '', q2: 'Some text' };
    const result = extractTranslatableQCResponses(responses);
    expect(result).toEqual({ q2: 'Some text' });
  });

  it('skips null values', () => {
    const responses = { q1: null };
    expect(extractTranslatableQCResponses(responses)).toEqual({});
  });

  it('skips string array values (selections are not free-text)', () => {
    const responses = { q1: ['A', 'B'] };
    expect(extractTranslatableQCResponses(responses)).toEqual({});
  });

  it('skips whitespace-only strings', () => {
    const responses = { q1: '   ', q2: 'real text' };
    expect(extractTranslatableQCResponses(responses)).toEqual({ q2: 'real text' });
  });

  it('preserves multiple text responses', () => {
    const responses = { q1: 'Answer one', q2: null, q3: 'Answer three', q4: ['x'] };
    const result = extractTranslatableQCResponses(responses);
    expect(result).toEqual({ q1: 'Answer one', q3: 'Answer three' });
  });
});
