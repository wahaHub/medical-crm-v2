export interface SignalResolverInput {
  extraction?: Record<string, unknown>;
}

export interface ResolvedSignals {
  affirmative: boolean;
  negative: boolean;
  possibleRisk: string | null;
  possibleIntent: string | null;
  mentionedBudget: string | null;
}

export class SignalResolverService {
  resolve(input: SignalResolverInput): ResolvedSignals {
    const extraction = input.extraction ?? {};

    return {
      affirmative: extraction['affirmative'] === true,
      negative: extraction['negative'] === true,
      possibleRisk: asNullableString(extraction['possibleRisk']),
      possibleIntent: asNullableString(extraction['possibleIntent']),
      mentionedBudget: asNullableString(extraction['mentionedBudget']),
    };
  }
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
