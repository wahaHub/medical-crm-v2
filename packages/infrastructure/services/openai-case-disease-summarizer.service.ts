import OpenAI from 'openai';
import type { CaseDiseaseInput, ICaseDiseaseSummarizer } from '@medical-crm/domain';

/** Produces a short operational disease label, not a diagnosis or recommendation. */
export class OpenAICaseDiseaseSummarizerService implements ICaseDiseaseSummarizer {
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly cache = new Map<string, string>();

  constructor(apiKey: string, model = process.env['CASE_DISEASE_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini') {
    this.client = apiKey.trim() ? new OpenAI({ apiKey }) : null;
    this.model = model;
  }

  async summarize(inputs: CaseDiseaseInput[]): Promise<Record<string, string>> {
    const missing = inputs.filter(({ caseId }) => !this.cache.has(caseId));
    const result = Object.fromEntries(this.cache.entries());
    if (!this.client || missing.length === 0) return result;
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: Math.min(800, Math.max(120, missing.length * 40)),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Classify medical CRM intake text. Return JSON only as {"caseId":"short disease or medical concern"}. Use the provided case IDs. Values must be concise English labels of 2-6 words. Do not invent a diagnosis; use "Unspecified medical concern" when insufficient.',
        },
        { role: 'user', content: JSON.stringify(missing) },
      ],
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return {};
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const generated = Object.fromEntries(
        missing
          .map(({ caseId }) => [caseId, parsed[caseId]])
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
          .map(([caseId, label]) => [caseId, label.trim().slice(0, 120)]),
      );
      for (const [caseId, label] of Object.entries(generated)) this.cache.set(caseId, label);
      return { ...result, ...generated };
    } catch {
      return {};
    }
  }
}
