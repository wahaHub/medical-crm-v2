import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { AI_POLICY_BACKEND_NEXT_ACTIONS } from '@medical-crm/application';

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
    body?: {
      type?: string;
      data?: Array<{
        key?: string;
        value?: string;
      }>;
    };
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

function nodeCaseValues(node: DifyNode): string[] {
  return (node.data?.cases ?? [])
    .flatMap((item) => item.conditions ?? [])
    .map((condition) => condition.value)
    .filter((value): value is string => typeof value === 'string');
}

function systemPrompt(node: DifyNode): string {
  return (node.data?.prompt_template ?? [])
    .find((item) => item.role === 'system')
    ?.text ?? '';
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
    const values = nodeCaseValues(riskGate);

    expect(values).toEqual(expect.arrayContaining(['CRISIS', 'HIGH_RISK']));
  });

  it('pins current backend action coverage against the action gate and direct-response fallback', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;
    const actionGate = findNode(dsl.workflow.graph.nodes, 'action_gate');
    const explicitCases = nodeCaseValues(actionGate);

    expect(explicitCases).toEqual([
      'SHOW_PACKAGE',
      'SHOW_HOSPITAL_RECOMMENDATIONS',
      'EXPLORE_HOSPITAL_RECOMMENDATIONS',
      'ANSWER_FAQ',
    ]);

    expect(new Set(AI_POLICY_BACKEND_NEXT_ACTIONS)).toEqual(new Set([
      'ANSWER_FAQ',
      'SHOW_PACKAGE',
      'REQUEST_DOC_UPLOAD',
      'SHOW_HOSPITAL_RECOMMENDATIONS',
      'EXPLORE_HOSPITAL_RECOMMENDATIONS',
      'EXPLAIN_DOC_UPLOAD',
      'EXPLAIN_CONSULT_PROCESS',
      'SAFETY_HANDOFF',
    ]));

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'action_gate',
          sourceHandle: 'false',
          target: 'response_composer',
        }),
      ]),
    );
  });

  it('preserves the response -> writeback -> final answer chain and writeback contract invariants', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;
    const writebackNode = findNode(dsl.workflow.graph.nodes, 'writeback_http');
    const finalAnswerNode = findNode(dsl.workflow.graph.nodes, 'final_answer');
    const writebackBody = writebackNode.data?.body?.data?.[0]?.value ?? '';

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'response_composer',
          target: 'writeback_http',
        }),
        expect.objectContaining({
          source: 'writeback_http',
          target: 'final_answer',
        }),
      ]),
    );

    expect(writebackBody).toContain('"assistant_message_id": "{{#start.assistantMessageId#}}"');
    expect(writebackBody).toContain('"policy_decision": {{#decide_http.body.data#}}');
    expect(writebackBody).toContain('"final_response_metadata": {{#response_composer.text#}}');
    expect(finalAnswerNode.data?.answer).toBe('{{#response_composer.text#}}');
  });

  it('documents safety and API metadata invariants in the response composer prompt', () => {
    const dsl = loadDsl();
    const responseComposer = findNode(dsl.workflow.graph.nodes, 'response_composer');
    const prompt = systemPrompt(responseComposer);

    expect(prompt).toContain('HIGH_RISK');
    expect(prompt).toContain('safety-only');
    expect(prompt).toContain('metadata.engagementMode');
    expect(prompt).toContain('metadata.internalNextAction');
    expect(prompt).toContain('metadata.pathMode');
    expect(prompt).toContain('REQUEST_DOC_UPLOAD');
    expect(prompt).toContain('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(prompt).toContain('EXPLORE_HOSPITAL_RECOMMENDATIONS');
  });
});
