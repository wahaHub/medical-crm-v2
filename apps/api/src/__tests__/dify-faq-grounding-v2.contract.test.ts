import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DifyEdge = {
  source: string;
  sourceHandle?: string;
  target: string;
};

type DifyNode = {
  id: string;
  data?: {
    variables?: Array<{
      variable?: string;
    }>;
    prompt_template?: Array<{
      role?: string;
      text?: string;
    }>;
    outputs?: Record<string, { type?: string }>;
    code?: string;
    url?: string;
    answer?: string;
  };
};

type DifyWorkflow = {
  workflow: {
    graph: {
      edges: DifyEdge[];
      nodes: DifyNode[];
    };
  };
};

const dslPath = resolve(
  import.meta.dirname,
  '../../../../dify-config/medora-ai-chatbot-v2-faq-grounding.dsl.yml',
);

function loadDsl(path = dslPath): DifyWorkflow {
  const json = execFileSync(
    'ruby',
    [
      '-e',
      "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV[0]))",
      path,
    ],
    {
      encoding: 'utf8',
    },
  );

  return JSON.parse(json) as DifyWorkflow;
}

function findNode(nodes: DifyNode[], id: string): DifyNode {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) {
    throw new Error(`Node not found: ${id}`);
  }
  return node;
}

function systemPrompt(node: DifyNode): string {
  return (node.data?.prompt_template ?? [])
    .find((item) => item.role === 'system')
    ?.text ?? '';
}

describe('Dify FAQ grounding v2 contract', () => {
  it('defines a dedicated FAQ grounding workflow with a compact routing shape', () => {
    const dsl = loadDsl();
    const startNode = findNode(dsl.workflow.graph.nodes, 'start');
    const variableNames = new Set(
      (startNode.data?.variables ?? [])
        .map((item) => item.variable)
        .filter((value): value is string => typeof value === 'string'),
    );
    const nodeIds = new Set(dsl.workflow.graph.nodes.map((node) => node.id));

    expect(Array.from(variableNames)).toEqual(expect.arrayContaining([
      'hospitalType',
      'query',
      'activeHospitalId',
      'activeHospitalName',
    ]));

    expect(dsl.workflow.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'start',
        target: 'faq_categories_http',
      }),
      expect.objectContaining({
        source: 'faq_categories_http',
        target: 'faq_category_resolver_llm',
      }),
      expect.objectContaining({
        source: 'faq_category_resolver_llm',
        target: 'faq_retrieval_router',
      }),
      expect.objectContaining({
        source: 'faq_retrieval_router',
        target: 'faq_retrieval_gate',
      }),
      expect.objectContaining({
        source: 'faq_retrieval_gate',
        target: 'general_faq_cosmetic_kr',
      }),
      expect.objectContaining({
        source: 'faq_retrieval_gate',
        target: 'general_faq_regular_kr',
      }),
      expect.objectContaining({
        source: 'faq_retrieval_gate',
        target: 'hospital_faq_cosmetic_kr',
      }),
      expect.objectContaining({
        source: 'faq_retrieval_gate',
        target: 'hospital_faq_regular_kr',
      }),
      expect.objectContaining({
        source: 'general_faq_cosmetic_kr',
        target: 'normalize_grounded_context',
      }),
      expect.objectContaining({
        source: 'general_faq_regular_kr',
        target: 'normalize_grounded_context',
      }),
      expect.objectContaining({
        source: 'hospital_faq_cosmetic_kr',
        target: 'normalize_grounded_context',
      }),
      expect.objectContaining({
        source: 'hospital_faq_regular_kr',
        target: 'normalize_grounded_context',
      }),
      expect.objectContaining({
        source: 'normalize_grounded_context',
        target: 'final_answer',
      }),
    ]));

    expect(nodeIds.has('general_faq_cosmetic_kr')).toBe(true);
    expect(nodeIds.has('general_faq_regular_kr')).toBe(true);
    expect(nodeIds.has('hospital_faq_cosmetic_kr')).toBe(true);
    expect(nodeIds.has('hospital_faq_regular_kr')).toBe(true);
    expect(nodeIds.has('faq_retrieval_gate')).toBe(true);
    expect(nodeIds.has('normalize_grounded_context')).toBe(true);
    expect(nodeIds.has('faq_scope_gate')).toBe(false);
    expect(nodeIds.has('general_faq_scope')).toBe(false);
    expect(nodeIds.has('hospital_faq_scope')).toBe(false);
    expect(nodeIds.has('response_composer_v2')).toBe(false);
    expect(nodeIds.has('writeback_http')).toBe(false);
  });

  it('preserves faq scope semantics and forbids hospital-aware fallback on general misses', () => {
    const dsl = loadDsl();
    const resolverPrompt = systemPrompt(findNode(dsl.workflow.graph.nodes, 'faq_category_resolver_llm'));
    const routerCode = findNode(dsl.workflow.graph.nodes, 'faq_retrieval_router').data?.code ?? '';
    const outputNames = Object.keys(findNode(dsl.workflow.graph.nodes, 'normalize_grounded_context').data?.outputs ?? {});

    expect(outputNames).toEqual(expect.arrayContaining([
      'faq_scope',
      'categories',
      'grounded_context_json',
    ]));

    expect(resolverPrompt).toContain('GENERAL_ONLY');
    expect(resolverPrompt).toContain('HOSPITAL_AWARE');
    expect(resolverPrompt).toContain('Use only category names that already exist');
    expect(routerCode).toContain('GENERAL_ONLY');
    expect(routerCode).toContain('HOSPITAL_AWARE');
    expect(routerCode).toContain('active_hospital_id');
    expect(routerCode).toContain('retrieval_path');
    expect(routerCode).not.toContain('fallback to HOSPITAL_AWARE');
    expect(routerCode).not.toContain('faq_scope_gate');
  });

  it('returns grounded FAQ context instead of final user-facing copy', () => {
    const dsl = loadDsl();
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });
    const normalizeCode = findNode(dsl.workflow.graph.nodes, 'normalize_grounded_context').data?.code ?? '';

    expect(yaml).not.toContain('response_composer_v2');
    expect(yaml).not.toContain('writeback_http');
    expect(yaml).not.toContain('assistantMessageId');
    expect(yaml).not.toContain('idempotency_key');
    expect(yaml).not.toContain('"answer"');
    expect(normalizeCode).toContain('general_faq_result');
    expect(normalizeCode).toContain('hospital_faq_result');
  });
});
