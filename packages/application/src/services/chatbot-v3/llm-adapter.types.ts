export interface LlmNodeAdapter<TInput, TOutput> {
  promptVersion: string;
  model?: string;
  run(input: TInput): Promise<TOutput>;
}
