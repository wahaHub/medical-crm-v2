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
    body?: {
      type?: string;
      data?: Array<{
        key?: string;
        value?: string;
      }>;
    };
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
  '../../../../dify-config/medora-ai-chatbot-v2-classifier.dsl.yml',
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

function userPrompt(node: DifyNode): string {
  return (node.data?.prompt_template ?? [])
    .find((item) => item.role === 'user')
    ?.text ?? '';
}

describe('Dify classifier v2 contract', () => {
  it('defines the dedicated classifier input contract and minimal classification-only node chain', () => {
    const dsl = loadDsl();
    const startNode = findNode(dsl.workflow.graph.nodes, 'start');
    const variableNames = new Set(
      (startNode.data?.variables ?? [])
        .map((item) => item.variable)
        .filter((value): value is string => typeof value === 'string'),
    );

    expect(Array.from(variableNames)).toEqual(expect.arrayContaining([
      'recentMessages',
      'conversationSummary',
      'journeySnapshot',
      'allowedResourceHints',
    ]));

    expect(Array.from(variableNames)).not.toEqual(expect.arrayContaining([
      'chatbotV2',
      'sessionId',
      'assistantMessageId',
      'hospitalType',
      'currentStatus',
      'pageContext',
      'attachments',
    ]));

    expect(dsl.workflow.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'start',
        target: 'classifier_llm',
      }),
      expect.objectContaining({
        source: 'classifier_llm',
        target: 'normalize_classifier_output',
      }),
      expect.objectContaining({
        source: 'normalize_classifier_output',
        target: 'final_answer',
      }),
    ]));

    const nodeIds = new Set(dsl.workflow.graph.nodes.map((node) => node.id));
    expect(nodeIds.has('classifier_llm')).toBe(true);
    expect(nodeIds.has('normalize_classifier_output')).toBe(true);
    expect(nodeIds.has('final_answer')).toBe(true);
    expect(nodeIds.has('parse_chatbot_v2_context')).toBe(false);
    expect(nodeIds.has('response_composer_v2')).toBe(false);
    expect(nodeIds.has('normalize_response_v2')).toBe(false);
    expect(nodeIds.has('writeback_http')).toBe(false);
  });

  it('keeps the classifier prompt description-driven, multilingual, and bound to the approved output contract', () => {
    const dsl = loadDsl();
    const classifierNode = findNode(dsl.workflow.graph.nodes, 'classifier_llm');
    const prompt = systemPrompt(classifierNode);
    const promptInputs = userPrompt(classifierNode);
    const outputNames = Object.keys(findNode(dsl.workflow.graph.nodes, 'normalize_classifier_output').data?.outputs ?? {});

    expect(outputNames).toEqual(expect.arrayContaining([
      'request_class',
      'target_resource_types',
      'include_progression_follow_up',
    ]));

    expect(prompt).toContain('multilingual');
    expect(prompt).toContain('description-driven');
    expect(prompt).toContain('recentMessages');
    expect(prompt).toContain('conversationSummary');
    expect(prompt).toContain('journeySnapshot');
    expect(prompt).toContain('allowedResourceHints');
    expect(prompt).toContain('requestClass');
    expect(prompt).toContain('targetResourceTypes');
    expect(prompt).toContain('includeProgressionFollowUp');
    expect(prompt).toContain('faq');
    expect(prompt).toContain('process_explanation');
    expect(prompt).toContain('progression_request');
    expect(prompt).toContain('resource_request');
    expect(prompt).toContain('resource_status_question');
    expect(prompt).toContain('human_help_request');
    expect(prompt).toContain('PROCESS_GUIDE');
    expect(prompt).toContain('HUMAN_HANDOFF');
    expect(prompt).toContain('If HUMAN_HANDOFF is not present in allowedResourceHints, human_help_request may still return an empty targetResourceTypes array.');
    expect(prompt).not.toContain('writeback_http');
    expect(prompt).not.toContain('response_composer_v2');
    expect(prompt).not.toContain('assistant_message_id');
    expect(prompt).not.toContain('idempotency_key');
    expect(prompt).not.toContain('policy_decision');
    expect(prompt).not.toContain('example-heavy');
    expect(prompt).not.toContain('keyword list');

    expect(promptInputs).toContain('{{#start.recentMessages#}}');
    expect(promptInputs).toContain('{{#start.conversationSummary#}}');
    expect(promptInputs).toContain('{{#start.journeySnapshot#}}');
    expect(promptInputs).toContain('{{#start.allowedResourceHints#}}');
  });

  it('does not write back chat responses or include composer-only fields', () => {
    const dsl = loadDsl();
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });
    const finalAnswerNode = findNode(dsl.workflow.graph.nodes, 'final_answer');

    expect(yaml).not.toContain('writeback_http');
    expect(yaml).not.toContain('response_composer_v2');
    expect(yaml).not.toContain('normalize_response_v2');
    expect(yaml).not.toContain('assistant_message_id');
    expect(yaml).not.toContain('idempotency_key');
    expect(yaml).not.toContain('policy_decision');
    expect(yaml).not.toContain('currentStatus');
    expect(yaml).not.toContain('pageContext');
    expect(yaml).not.toContain('attachments');
    expect(finalAnswerNode.data?.answer).toContain('normalize_classifier_output');
  });
});
