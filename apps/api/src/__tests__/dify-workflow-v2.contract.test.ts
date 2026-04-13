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
  '../../../../dify-config/medora-ai-chatbot-v2.dsl.yml',
);
const v1DslPath = resolve(
  import.meta.dirname,
  '../../../../dify-config/medora-ai-chatbot-v1.dsl.yml',
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

describe('Dify workflow v2 contract', () => {
  it('defines a CRM-owned chatbotV2 start contract and the minimal v2 node chain', () => {
    const dsl = loadDsl();
    const startNode = findNode(dsl.workflow.graph.nodes, 'start');
    const variableNames = new Set(
      (startNode.data?.variables ?? [])
        .map((item) => item.variable)
        .filter((value): value is string => typeof value === 'string'),
    );

    expect(Array.from(variableNames)).toEqual(expect.arrayContaining([
      'chatbotV2',
      'faqGrounding',
      'sessionId',
      'assistantMessageId',
      'hospitalType',
      'currentStatus',
      'conversationSummary',
      'pageContext',
      'attachments',
    ]));

    expect(dsl.workflow.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'start',
        target: 'parse_chatbot_v2_context',
      }),
      expect.objectContaining({
        source: 'parse_chatbot_v2_context',
        target: 'response_composer_v2',
      }),
      expect.objectContaining({
        source: 'response_composer_v2',
        target: 'normalize_response_v2',
      }),
      expect.objectContaining({
        source: 'normalize_response_v2',
        target: 'writeback_http',
      }),
      expect.objectContaining({
        source: 'writeback_http',
        target: 'final_answer',
      }),
    ]));
  });

  it('parses chatbotV2 into CRM-owned turn intent, journey state, allowed resource types, and conservative next-action hints', () => {
    const dsl = loadDsl();
    const parseNode = findNode(dsl.workflow.graph.nodes, 'parse_chatbot_v2_context');
    const parseCode = parseNode.data?.code ?? '';
    const outputNames = Object.keys(parseNode.data?.outputs ?? {});

    expect(outputNames).toEqual(expect.arrayContaining([
      'request_class',
      'response_intent',
      'target_resource_types',
      'current_stage',
      'current_phase',
      'allowed_resource_types',
      'allowed_resources_json',
      'truth_summary_json',
      'stage_copy_json',
      'allowed_next_action_hints',
      'include_progression_follow_up',
    ]));

    expect(parseCode).toContain('journeySnapshot');
    expect(parseCode).toContain('journey_snapshot');
    expect(parseCode).toContain('requestClass');
    expect(parseCode).toContain('request_class');
    expect(parseCode).toContain('responseIntent');
    expect(parseCode).toContain('response_intent');
    expect(parseCode).toContain('targetResourceTypes');
    expect(parseCode).toContain('target_resource_types');
    expect(parseCode).toContain('allowedResources');
    expect(parseCode).toContain('allowed_resources');
    expect(parseCode).toContain('resources');
    expect(parseCode).toContain('truthSummary');
    expect(parseCode).toContain('truth_summary');
    expect(parseCode).toContain('stageCopy');
    expect(parseCode).toContain('stage_copy');
    expect(parseCode).toContain('PROCESS_GUIDE');
    expect(parseCode).toContain('MEDICAL_DOC_UPLOAD');
    expect(parseCode).toContain('QUESTIONNAIRE');
    expect(parseCode).toContain('ONLINE_CONSULT_BOOKING');
    expect(parseCode).toContain('HUMAN_HANDOFF');
    expect(parseCode).toContain('allowed_next_action_hints');
    expect(parseCode).toContain('includeProgressionFollowUp');
    expect(parseCode).not.toContain('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(parseCode).not.toContain('SHOW_PACKAGE');
    expect(parseCode).not.toContain('or "EXPLAIN_PROCESS"');
    expect(parseCode).not.toContain('or "active"');
    expect(parseCode).not.toContain('allowed_next_action_hints = ["ANSWER_FAQ"]');
    expect(parseCode).not.toContain('if current_stage == "EXPLAIN_PROCESS"');
    expect(parseCode).not.toContain('if current_stage == "COLLECT_MEDICAL_INPUTS"');
    expect(parseCode).not.toContain('if current_stage == "ONLINE_CONSULT"');
    expect(parseCode).not.toContain('if current_stage == "HUMAN_HANDOFF"');
  });

  it('accepts live chatbotV2 resources payloads when parsing allowed resources', () => {
    const dsl = loadDsl();
    const parseNode = findNode(dsl.workflow.graph.nodes, 'parse_chatbot_v2_context');
    const parseCode = parseNode.data?.code ?? '';
    const samplePayload = JSON.stringify({
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      resources: [
        {
          resourceType: 'PROCESS_GUIDE',
          status: 'available',
        },
        {
          resourceType: 'MEDICAL_DOC_UPLOAD',
          status: 'available',
        },
        {
          resourceType: 'QUESTIONNAIRE',
          status: 'available',
        },
      ],
      truthSummary: {
        medicalInputsSubmitted: false,
        onlineConsultSubmitted: false,
        recommendationConfirmed: false,
      },
      requestClass: 'resource_request',
      responseIntent: 'resource_request',
      targetResourceTypes: ['QUESTIONNAIRE'],
      includeProgressionFollowUp: false,
    });

    const output = execFileSync(
      'python3',
      [
        '-c',
        [
          'import json, sys',
          'ns = {}',
          'exec(sys.stdin.read(), ns)',
          'result = ns["main"](sys.argv[1])',
          'print(json.dumps(result))',
        ].join('\n'),
        samplePayload,
      ],
      {
        input: parseCode,
        encoding: 'utf8',
      },
    );

    const parsed = JSON.parse(output) as Record<string, string>;
    expect(JSON.parse(parsed.allowed_resource_types)).toEqual([
      'PROCESS_GUIDE',
      'MEDICAL_DOC_UPLOAD',
      'QUESTIONNAIRE',
    ]);
    expect(JSON.parse(parsed.allowed_resources_json)).toEqual([
      { resourceType: 'PROCESS_GUIDE', status: 'available' },
      { resourceType: 'MEDICAL_DOC_UPLOAD', status: 'available' },
      { resourceType: 'QUESTIONNAIRE', status: 'available' },
    ]);
    expect(JSON.parse(parsed.target_resource_types)).toEqual(['QUESTIONNAIRE']);
  });

  it('grounds the v2 composer prompt in CRM journey state and forbids Dify-owned progression', () => {
    const dsl = loadDsl();
    const composerNode = findNode(dsl.workflow.graph.nodes, 'response_composer_v2');
    const prompt = systemPrompt(composerNode);
    const promptInputs = userPrompt(composerNode);

    expect(prompt).toContain('The upstream system has already decided the current journey state');
    expect(prompt).toContain('Input meanings');
    expect(prompt).toContain('requestClass');
    expect(prompt).toContain('responseIntent');
    expect(prompt).toContain('currentStage');
    expect(prompt).toContain('currentPhase');
    expect(prompt).toContain('allowedResources');
    expect(prompt).toContain('truthSummary');
    expect(prompt).toContain('stageCopy');
    expect(prompt).toContain('currentStatus');
    expect(prompt).toContain('conversationSummary');
    expect(prompt).toContain('faqGrounding');
    expect(prompt).toContain('allowed next-action hints');
    expect(prompt).toContain('Return strict JSON only');
    expect(prompt).toContain('If requestClass is resource_request and a target resource type appears in allowedResources');
    expect(prompt).toContain('If requestClass is progression_request and targetResourceTypes are present');
    expect(prompt).toContain('candidate next-step resources only');
    expect(prompt).toContain('cannot be opened here');
    expect(prompt).toContain('You are not being asked to literally click the UI yourself');
    expect(prompt).toContain('they can use it now through the surfaced resource');
    expect(prompt).toContain('I can\'t open it from here');
    expect(prompt).toContain('If truthSummary says medicalInputsSubmitted is true');
    expect(prompt).toContain('do not imply a rewind');
    expect(prompt).toContain('If stageCopy is provided');
    expect(prompt).toContain('If faqGrounding is provided');
    expect(prompt).toContain('Do not invent hospitals, packages, upload flows, booking flows, questionnaires, or human handoff steps');
    expect(prompt).not.toContain('SAFETY_HANDOFF');
    expect(prompt).not.toContain('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(prompt).not.toContain('SHOW_PACKAGE');

    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.current_stage#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.current_phase#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.request_class#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.response_intent#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.target_resource_types#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.allowed_resource_types#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.allowed_resources_json#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.truth_summary_json#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.stage_copy_json#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.allowed_next_action_hints#}}');
    expect(promptInputs).toContain('{{#parse_chatbot_v2_context.include_progression_follow_up#}}');
    expect(promptInputs).toContain('{{#start.faqGrounding#}}');
    expect(promptInputs).toContain('{{#start.currentStatus#}}');
    expect(promptInputs).toContain('{{#start.conversationSummary#}}');
    expect(promptInputs).toContain('{{#start.pageContext#}}');
    expect(promptInputs).toContain('{{#start.attachments#}}');
  });

  it('normalizes composer output before writeback and final answer', () => {
    const dsl = loadDsl();
    const normalizeNode = findNode(dsl.workflow.graph.nodes, 'normalize_response_v2');
    const normalizeCode = normalizeNode.data?.code ?? '';
    const outputNames = Object.keys(normalizeNode.data?.outputs ?? {});

    expect(outputNames).toEqual(expect.arrayContaining([
      'policy_decision_json',
      'final_answer_json',
    ]));
    expect(normalizeCode).toContain('json.loads');
    expect(normalizeCode).toContain('```');
    expect(normalizeCode).toContain('safe minimal object');
    expect(normalizeCode).toContain('policy_decision_json');
    expect(normalizeCode).toContain('final_answer_json');
    expect(normalizeCode).toContain('"answer"');
    expect(normalizeCode).toContain('"nextAction"');
  });

  it('writes back through the internal v2 route with assistant_message_id, idempotency_key, and normalized policy data', () => {
    const dsl = loadDsl();
    const writebackNode = findNode(dsl.workflow.graph.nodes, 'writeback_http');
    const finalAnswerNode = findNode(dsl.workflow.graph.nodes, 'final_answer');
    const writebackBody = writebackNode.data?.body?.data?.[0]?.value ?? '';

    expect(writebackNode.data?.url).toBe('{{#env.crm_base_url#}}/api/v2/internal/ai-policy/writeback');
    expect(writebackBody).toContain('"version": "v1"');
    expect(writebackBody).toContain('"session_id": "{{#start.sessionId#}}"');
    expect(writebackBody).toContain('"payload": {');
    expect(writebackBody).toContain('"assistant_message_id": "{{#start.assistantMessageId#}}"');
    expect(writebackBody).toContain('"idempotency_key": "{{#start.sessionId#}}:{{#start.assistantMessageId#}}:chatbot-v2"');
    expect(writebackBody).toContain('"policy_decision": {{#normalize_response_v2.policy_decision_json#}}');
    expect(writebackBody).not.toContain('"request_id"');
    expect(writebackBody).not.toContain('"actor"');
    expect(writebackBody).not.toContain('"source_channel"');
    expect(writebackBody).not.toContain('"hospital_type"');
    expect(writebackBody).not.toContain('"final_response_metadata"');
    expect(finalAnswerNode.data?.answer).toBe('{{#normalize_response_v2.final_answer_json#}}');
  });

  it('stays free of old v1 heuristic nodes and fields', () => {
    const dsl = loadDsl();
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });
    const nodeIds = new Set(dsl.workflow.graph.nodes.map((node) => node.id));

    expect(yaml).not.toContain('pendingOffer');
    expect(yaml).not.toContain('pendingQuestion');
    expect(yaml).not.toContain('lead_maturity');
    expect(yaml).not.toContain('selected_hospital_id');
    expect(yaml).not.toContain('decide_http');
    expect(yaml).not.toContain('action_gate');
    expect(yaml).not.toContain('search_hospitals_http');
    expect(yaml).not.toContain('list_packages_http');
    expect(yaml).not.toContain('classifier_llm');
    expect(yaml).not.toContain('normalize_classifier_output');
    expect(yaml).not.toContain('recentMessages');
    expect(yaml).not.toContain('allowedResourceHints');
    expect(nodeIds.has('decide_http')).toBe(false);
    expect(nodeIds.has('action_gate')).toBe(false);
    expect(nodeIds.has('search_hospitals_http')).toBe(false);
    expect(nodeIds.has('list_packages_http')).toBe(false);
    expect(nodeIds.has('classifier_llm')).toBe(false);
    expect(nodeIds.has('normalize_classifier_output')).toBe(false);
  });

  it('keeps the legacy v1 file intact while v2 carries the new CRM-owned chain', () => {
    const v1Dsl = loadDsl(v1DslPath);
    const v2Dsl = loadDsl();
    const v1Yaml = execFileSync('cat', [v1DslPath], { encoding: 'utf8' });
    const v2Yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });
    const v1NodeIds = new Set(v1Dsl.workflow.graph.nodes.map((node) => node.id));
    const v2NodeIds = new Set(v2Dsl.workflow.graph.nodes.map((node) => node.id));

    expect(v1Yaml).toContain('decide_http');
    expect(v1Yaml).toContain('action_gate');
    expect(v1Yaml).toContain('search_hospitals_http');
    expect(v1Yaml).toContain('list_packages_http');
    expect(v1NodeIds.has('decide_http')).toBe(true);
    expect(v1NodeIds.has('action_gate')).toBe(true);

    expect(v2Yaml).toContain('parse_chatbot_v2_context');
    expect(v2Yaml).toContain('response_composer_v2');
    expect(v2Yaml).toContain('normalize_response_v2');
    expect(v2NodeIds.has('parse_chatbot_v2_context')).toBe(true);
    expect(v2NodeIds.has('response_composer_v2')).toBe(true);
    expect(v2NodeIds.has('normalize_response_v2')).toBe(true);
  });
});
