import OpenAI from 'openai';
import type { CaseDiseaseInput, CaseListLabel, ICaseDiseaseSummarizer } from '@medical-crm/domain';

/** Produces concise, operational list labels; never a diagnosis or recommendation. */
export class OpenAICaseDiseaseSummarizerService implements ICaseDiseaseSummarizer {
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly cache = new Map<string, CaseListLabel>();

  constructor(apiKey: string, model = process.env['CASE_LIST_LABEL_MODEL'] ?? 'gpt-4o') {
    this.client = apiKey.trim() ? new OpenAI({ apiKey }) : null;
    this.model = model;
  }

  async summarize(inputs: CaseDiseaseInput[]): Promise<Record<string, CaseListLabel>> {
    const missing = inputs.filter(({ caseId }) => !this.cache.has(caseId));
    const result = Object.fromEntries(this.cache.entries());
    if (!this.client || missing.length === 0) return result;
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: Math.min(1200, Math.max(160, missing.length * 60)),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Create compact medical CRM list labels. Return JSON only as {"caseId":{"disease":"...","country":"..."}} using every provided caseId. disease: 2-5 English words, a broad medical concern (for example "Knee osteoarthritis"), never a sentence, never a treatment request, never an invented diagnosis; use "Unspecified concern" if inadequate. country: infer the country from the international phone number when unambiguous; otherwise use fallbackCountry; return null if uncertain. Use standard English country names only.',
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
          .map(({ caseId }) => [caseId, parsed[caseId]] as const)
          .map(([caseId, value]) => {
            if (!value || typeof value !== 'object') return null;
            const label = value as Record<string, unknown>;
            const disease = typeof label['disease'] === 'string' ? label['disease'].trim().slice(0, 60) : '';
            const country = typeof label['country'] === 'string' ? label['country'].trim().slice(0, 60) : null;
            return disease ? [caseId, { disease, country }] as const : null;
          })
          .filter((entry): entry is [string, CaseListLabel] => entry !== null),
      );
      for (const [caseId, label] of Object.entries(generated)) this.cache.set(caseId, label);
      return { ...result, ...generated };
    } catch {
      return {};
    }
  }
}
