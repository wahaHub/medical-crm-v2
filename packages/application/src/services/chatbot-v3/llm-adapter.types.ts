export interface LlmNodeAdapter<TInput, TOutput> {
  promptVersion: string;
  run(input: TInput): Promise<TOutput>;
}
