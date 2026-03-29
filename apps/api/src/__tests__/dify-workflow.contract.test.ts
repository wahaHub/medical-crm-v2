import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type DifyEdge = {
  source: string;
  sourceHandle?: string;
  target: string;
};

type DifyNode = {
  id: string;
  data?: {
    cases?: Array<{
      id?: string;
      case_id?: string;
      conditions?: Array<{
        value?: string;
      }>;
    }>;
    prompt_template?: Array<{
      role?: string;
      text?: string;
    }>;
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
  '../../../../dify-config/medora-ai-chatbot-v1.dsl.yml',
);

function loadDsl(): DifyWorkflow {
  const json = execFileSync(
    'ruby',
    [
      '-e',
      "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV[0]))",
      dslPath,
    ],
    {
      encoding: 'utf8',
    },
  );

  return JSON.parse(json) as DifyWorkflow;
}

function outgoingEdges(edges: DifyEdge[], source: string): DifyEdge[] {
  return edges.filter((edge) => edge.source === source);
}

function findNode(nodes: DifyNode[], id: string): DifyNode {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) {
    throw new Error(`Node not found: ${id}`);
  }
  return node;
}

describe('Dify workflow contract', () => {
  it('routes through backend engagement resolution before hospital/tool prefetch', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;

    expect(outgoingEdges(edges, 'extraction_llm')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'decide_http',
        }),
      ]),
    );

    expect(outgoingEdges(edges, 'extraction_llm')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'search_hospitals_http',
        }),
      ]),
    );

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'action_gate',
          sourceHandle: 'show_hospital_recommendations',
          target: 'search_hospitals_http',
        }),
        expect.objectContaining({
          source: 'action_gate',
          sourceHandle: 'explore_hospital_recommendations',
          target: 'search_hospitals_http',
        }),
      ]),
    );
  });

  it('keeps LIGHT_DISCOVERY on a cheap path before context or tool branches', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'engagement_gate',
          sourceHandle: 'light_discovery',
          target: 'response_composer',
        }),
      ]),
    );

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'engagement_gate',
          target: 'context_http',
        }),
      ]),
    );
  });

  it('has explicit risk-first gating for both CRISIS and HIGH_RISK', () => {
    const dsl = loadDsl();
    const riskGate = findNode(dsl.workflow.graph.nodes, 'risk_gate');
    const values = (riskGate.data?.cases ?? [])
      .flatMap((item) => item.conditions ?? [])
      .map((condition) => condition.value)
      .filter((value): value is string => typeof value === 'string');

    expect(values).toEqual(expect.arrayContaining(['CRISIS', 'HIGH_RISK']));
  });

  it('documents HIGH_RISK as safety-governed in the response composer prompt', () => {
    const dsl = loadDsl();
    const responseComposer = findNode(dsl.workflow.graph.nodes, 'response_composer');
    const systemPrompt = (responseComposer.data?.prompt_template ?? [])
      .find((item) => item.role === 'system')
      ?.text;

    expect(systemPrompt).toContain('HIGH_RISK');
    expect(systemPrompt).toContain('safety-only');
  });
});
