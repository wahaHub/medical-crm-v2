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
    variables?: Array<{
      variable?: string;
    }>;
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

    expect(outgoingEdges(edges, 'decide_http')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: 'parse_decide_code',
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
          target: 'light_faq_scope',
        }),
      ]),
    );

    expect(edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'engagement_gate',
          sourceHandle: 'light_discovery',
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
    const explicitActionValues = explicitCases.filter((value) => AI_POLICY_BACKEND_NEXT_ACTIONS.includes(
      value as (typeof AI_POLICY_BACKEND_NEXT_ACTIONS)[number],
    ));
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(explicitActionValues).toEqual([
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
      'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
      'EXPLAIN_CONSULT_PROCESS',
      'INVITE_ONLINE_CONSULT',
      'HUMAN_HANDOFF',
      'SAFETY_HANDOFF',
    ]));

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'action_gate',
          sourceHandle: 'false',
          target: 'normalize_direct_inputs',
        }),
      ]),
    );

    expect(yaml).toContain('allow_search_hospitals');
    expect(yaml).toContain('allow_list_packages');
    expect(yaml).toContain('allow_search_faq');
  });

  it('preserves the response -> writeback -> final answer chain and writeback contract invariants', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;
    const writebackNode = findNode(dsl.workflow.graph.nodes, 'writeback_http');
    const finalAnswerNode = findNode(dsl.workflow.graph.nodes, 'final_answer');
    const writebackBody = writebackNode.data?.body?.data?.[0]?.value ?? '';
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

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
    expect(writebackBody).toContain('"policy_decision": {{#parse_decide_code.writeback_policy_decision#}}');
    expect(writebackBody).toContain('"final_response_metadata": {{#response_composer.text#}}');
    expect(finalAnswerNode.data?.answer).toBe('{{#response_composer.text#}}');
    expect(yaml).toContain('"selected_hospital_id": data.get("selected_hospital_id") or writeback_plan.get("selected_hospital_id")');
  });

  it('avoids stale http body.data selectors and parses decide_http before field-level branching', () => {
    const dsl = loadDsl();
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(yaml).not.toContain('decide_http.body.data');
    expect(yaml).not.toContain('context_http.body.data');
    expect(yaml).not.toContain('search_hospitals_http.body.data');
    expect(yaml).not.toContain('list_packages_http.body.data');
    expect(yaml).toContain('{{#parse_decide_code.policy_decision#}}');
    expect(yaml).toContain('{{#parse_decide_code.writeback_policy_decision#}}');
    expect(yaml).toContain('{{#prompt_inputs_aggregator.ContextBody.output#}}');
    expect(yaml).toContain('{{#prompt_inputs_aggregator.HospitalsBody.output#}}');
    expect(yaml).toContain('{{#prompt_inputs_aggregator.PackagesBody.output#}}');
    expect(yaml).toContain('"page_context": {{#start.pageContextJson#}}');
  });

  it('forwards CRM page context through workflow start inputs into both decide and context requests', () => {
    const dsl = loadDsl();
    const startNode = findNode(dsl.workflow.graph.nodes, 'start');
    const contextNode = findNode(dsl.workflow.graph.nodes, 'context_http');
    const decideNode = findNode(dsl.workflow.graph.nodes, 'decide_http');
    const startVariables = startNode.data?.variables ?? [];
    const contextBody = contextNode.data?.body?.data?.[0]?.value ?? '';
    const decideBody = decideNode.data?.body?.data?.[0]?.value ?? '';

    expect(startVariables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variable: 'pageContextJson',
        }),
      ]),
    );
    expect(contextBody).toContain('"page_context": {{#start.pageContextJson#}}');
    expect(decideBody).toContain('"page_context": {{#start.pageContextJson#}}');
  });

  it('normalizes branch-specific prompt inputs before the response composer reads optional tool outputs', () => {
    const dsl = loadDsl();
    const promptInputsAggregator = findNode(dsl.workflow.graph.nodes, 'prompt_inputs_aggregator');
    const responseComposer = findNode(dsl.workflow.graph.nodes, 'response_composer');
    const writebackNode = findNode(dsl.workflow.graph.nodes, 'writeback_http');
    const prompt = (responseComposer.data?.prompt_template ?? [])
      .map((item) => item.text ?? '')
      .join('\n');
    const writebackBody = writebackNode.data?.body?.data?.[0]?.value ?? '';

    expect(promptInputsAggregator.data?.type).toBe('variable-aggregator');
    expect(prompt).toContain('{{#prompt_inputs_aggregator.ContextBody.output#}}');
    expect(prompt).toContain('{{#prompt_inputs_aggregator.HospitalsBody.output#}}');
    expect(prompt).toContain('{{#prompt_inputs_aggregator.GeneralFaqResult.output#}}');
    expect(prompt).toContain('{{#prompt_inputs_aggregator.HospitalFaqResult.output#}}');
    expect(prompt).toContain('{{#prompt_inputs_aggregator.PackagesBody.output#}}');

    expect(prompt).not.toContain('{{#context_http.body#}}');
    expect(prompt).not.toContain('{{#search_hospitals_http.body#}}');
    expect(prompt).not.toContain('{{#faq_cosmetic_kr.result#}}');
    expect(prompt).not.toContain('{{#faq_regular_kr.result#}}');
    expect(prompt).not.toContain('{{#list_packages_http.body#}}');

    expect(writebackBody).toContain('"tool_results": {}');
    expect(writebackBody).not.toContain('{{#search_hospitals_http.body#}}');
    expect(writebackBody).not.toContain('{{#faq_cosmetic_kr.result#}}');
    expect(writebackBody).not.toContain('{{#faq_regular_kr.result#}}');
    expect(writebackBody).not.toContain('{{#list_packages_http.body#}}');
  });

  it('routes LIGHT_DISCOVERY through cheap FAQ retrieval and avoids hardcoded internal transport settings', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'light_faq_scope',
          sourceHandle: 'cosmetic',
          target: 'faq_categories_http',
        }),
        expect.objectContaining({
          source: 'light_faq_scope',
          sourceHandle: 'false',
          target: 'faq_categories_http',
        }),
      ]),
    );

    expect(yaml).toContain('{{#env.crm_base_url#}}');
    expect(yaml).toContain('{{#env.internal_api_secret#}}');
    expect(yaml).toContain("/api/v2/internal/mcp/faq-categories?hospitalType={{#start.hospitalType#}}&hospitalId={{#parse_decide_code.active_hospital_id#}}");
    expect(yaml).not.toContain('params: hospitalType={{#start.hospitalType#}}&hospitalId={{#parse_decide_code.active_hospital_id#}}');
    expect(yaml).not.toContain('http://host.docker.internal:3001');
    expect(yaml).not.toContain('dev-internal-api-secret-32chars-min-ok');
    expect(() => findNode(dsl.workflow.graph.nodes, 'light_faq_cosmetic_kr')).toThrow('Node not found: light_faq_cosmetic_kr');
    expect(() => findNode(dsl.workflow.graph.nodes, 'light_faq_regular_kr')).toThrow('Node not found: light_faq_regular_kr');
    expect(() => findNode(dsl.workflow.graph.nodes, 'normalize_light_faq_cosmetic_inputs')).toThrow('Node not found: normalize_light_faq_cosmetic_inputs');
    expect(() => findNode(dsl.workflow.graph.nodes, 'normalize_light_faq_regular_inputs')).toThrow('Node not found: normalize_light_faq_regular_inputs');
  });

  it('adds category-aware FAQ resolution before scoped FAQ retrieval', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(findNode(dsl.workflow.graph.nodes, 'faq_categories_http')).toBeDefined();
    expect(findNode(dsl.workflow.graph.nodes, 'faq_category_resolver_llm')).toBeDefined();
    expect(findNode(dsl.workflow.graph.nodes, 'parse_faq_category_code')).toBeDefined();
    expect(findNode(dsl.workflow.graph.nodes, 'faq_scope_gate')).toBeDefined();

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'faq_categories_http',
          target: 'faq_category_resolver_llm',
        }),
        expect.objectContaining({
          source: 'faq_category_resolver_llm',
          target: 'parse_faq_category_code',
        }),
        expect.objectContaining({
          source: 'parse_faq_category_code',
          target: 'faq_scope_gate',
        }),
      ]),
    );

    expect(yaml).toContain('Available CRM category list:');
    expect(yaml).toContain('{{#faq_categories_http.body#}}');
    expect(yaml).toContain('"categories": ["string"]');
    expect(yaml).toContain('type: array[string]');
  });

  it('keeps the LIGHT_DISCOVERY FAQ path on category-aware lookup only', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'light_faq_scope',
          sourceHandle: 'cosmetic',
          target: 'faq_categories_http',
        }),
        expect.objectContaining({
          source: 'light_faq_scope',
          sourceHandle: 'false',
          target: 'faq_categories_http',
        }),
      ]),
    );

    expect(edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'light_faq_scope',
          target: 'light_faq_cosmetic_kr',
        }),
        expect.objectContaining({
          source: 'light_faq_scope',
          target: 'light_faq_regular_kr',
        }),
      ]),
    );
  });

  it('keeps FAQ context selection explicitly wired into the FAQ normalization nodes', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'light_faq_scope',
          sourceHandle: 'cosmetic',
          target: 'default_faq_context_body',
        }),
        expect.objectContaining({
          source: 'light_faq_scope',
          sourceHandle: 'false',
          target: 'default_faq_context_body',
        }),
        expect.objectContaining({
          source: 'default_faq_context_body',
          target: 'faq_context_selector',
        }),
        expect.objectContaining({
          source: 'context_http',
          target: 'faq_context_selector',
        }),
        expect.objectContaining({
          source: 'faq_context_selector',
          target: 'normalize_general_faq_cosmetic_inputs',
        }),
        expect.objectContaining({
          source: 'faq_context_selector',
          target: 'normalize_general_faq_regular_inputs',
        }),
        expect.objectContaining({
          source: 'faq_context_selector',
          target: 'normalize_hospital_faq_cosmetic_inputs',
        }),
        expect.objectContaining({
          source: 'faq_context_selector',
          target: 'normalize_hospital_faq_regular_inputs',
        }),
      ]),
    );
  });

  it('removes legacy unscoped FAQ retrieval nodes and wires general FAQ normalization into the prompt aggregator', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;

    expect(() => findNode(dsl.workflow.graph.nodes, 'faq_cosmetic_kr')).toThrow('Node not found: faq_cosmetic_kr');
    expect(() => findNode(dsl.workflow.graph.nodes, 'faq_regular_kr')).toThrow('Node not found: faq_regular_kr');

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'normalize_general_faq_cosmetic_inputs',
          target: 'prompt_inputs_aggregator',
        }),
        expect.objectContaining({
          source: 'normalize_general_faq_regular_inputs',
          target: 'prompt_inputs_aggregator',
        }),
      ]),
    );
  });

  it('uses metadata-filtered general FAQ retrieval keyed by hospital type, GENERAL scope, and resolved categories', () => {
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(yaml).toContain('id: general_faq_cosmetic_kr');
    expect(yaml).toContain('id: general_faq_regular_kr');
    expect(yaml).toContain('metadata_filtering_mode: manual');
    expect(yaml).toContain('name: hospital_type');
    expect(yaml).toContain('name: scope');
    expect(yaml).toContain('value: GENERAL');
    expect(yaml).toContain('name: category');
    expect(yaml).toContain('comparison_operator: in');
    expect(yaml).toContain("value: '{{#parse_faq_category_code.categories#}}'");
  });

  it('uses metadata-filtered hospital FAQ retrieval keyed by hospital type, HOSPITAL scope, hospital_id, and resolved categories', () => {
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(yaml).toContain('id: hospital_faq_cosmetic_kr');
    expect(yaml).toContain('id: hospital_faq_regular_kr');
    expect(yaml).toContain('value: HOSPITAL');
    expect(yaml).toContain('name: hospital_id');
    expect(yaml).toContain('name: category');
    expect(yaml).toContain('comparison_operator: in');
    expect(yaml).toContain("value: '{{#parse_faq_category_code.categories#}}'");
  });

  it('keeps the general-only FAQ path free of hospital FAQ execution', () => {
    const dsl = loadDsl();
    const edges = dsl.workflow.graph.edges;

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'faq_scope_gate',
          sourceHandle: 'general_only',
          target: 'general_faq_scope',
        }),
        expect.objectContaining({
          source: 'faq_scope_gate',
          sourceHandle: 'hospital_aware',
          target: 'hospital_faq_scope',
        }),
      ]),
    );

    expect(edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'faq_scope_gate',
          sourceHandle: 'general_only',
          target: 'hospital_faq_scope',
        }),
      ]),
    );
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
    expect(prompt).toContain('EXPLAIN_DOC_UPLOAD');
    expect(prompt).toContain('EXPLAIN_CONSULT_PROCESS');
    expect(prompt).toContain('SHOW_HOSPITAL_RECOMMENDATIONS');
    expect(prompt).toContain('EXPLORE_HOSPITAL_RECOMMENDATIONS');
    expect(prompt).toContain('SAFETY_HANDOFF');
    expect(prompt).toContain('explain the upload process without pretending an upload widget has already started');
    expect(prompt).toContain('explain the consult workflow and keep the tone exploratory rather than forceful');
    expect(prompt).toContain('If backend next_action is SAFETY_HANDOFF, keep the response safety-only and direct the user toward human or emergency support without any commercial CTA');
    expect(prompt).toContain('append at most one short soft-confirmation CTA only when it matches the backend next_action');
    expect(prompt).toContain('If you\'d like, I can next...');
    expect(prompt).toContain('Eligible soft-confirmation CTA actions are REQUEST_DOC_UPLOAD, EXPLAIN_DOC_UPLOAD, EXPLAIN_CONSULT_PROCESS, EXPLORE_HOSPITAL_RECOMMENDATIONS, SHOW_HOSPITAL_RECOMMENDATIONS, and SHOW_PACKAGE');
    expect(prompt).toContain('Do not append a conversion-style CTA on SAFETY_HANDOFF or any HIGH_RISK/CRISIS turn');
    expect(prompt).toContain('On LIGHT_DISCOVERY, keep any CTA especially soft, optional, and trust-building rather than salesy');
  });

  it('pins extraction_llm to the canonical semantic contract with multilingual examples only', () => {
    const dsl = loadDsl();
    const extractionNode = findNode(dsl.workflow.graph.nodes, 'extraction_llm');
    const prompt = systemPrompt(extractionNode);
    const yaml = execFileSync('cat', [dslPath], { encoding: 'utf8' });

    expect(prompt).toContain('"resolvedIntent": "GENERAL_INFO|ASK_MEDICAL_TRAVEL_PROCESS|ASK_CONSULT_PROCESS|ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION|ASK_FOR_HOSPITAL_RECOMMENDATION|REQUEST_DOC_UPLOAD|ACCEPT_DOC_UPLOAD|ACCEPT_ONLINE_CONSULT_INVITE|REQUEST_HUMAN_HANDOFF|ASK_PACKAGE_INFO|SMALL_TALK_OR_GREETING|UNKNOWN"');
    expect(prompt).toContain('"engagementSignal": "LIGHT_DISCOVERY|QUALIFIED_EXPLORATION|DEEP_WORKFLOW"');
    expect(prompt).toContain('"progressionSignal": "NONE|CURIOUS|OPEN_TO_NEXT_STEP|READY_TO_PROCEED|EXPLICITLY_COMMITTING"');
    expect(prompt).toContain('"recommendationSignal": "NONE|SEEKING_DIRECTION|SEEKING_RECOMMENDATION|READY_FOR_RECOMMENDATION"');
    expect(prompt).toContain('"mentionsCondition": false');
    expect(prompt).toContain('"mentionsDoctorOrHospitalNeed": false');
    expect(prompt).toContain('"possibleIntent":');
    expect(prompt).toContain('"possibleRisk":');
    expect(prompt).toContain('"mentionedBudget":');
    expect(prompt).toContain('"topicHint":');
    expect(prompt).not.toContain('non-authoritative candidate signals');
    expect(prompt).not.toContain('only a hint for the backend policy engine');
    expect(prompt).toContain('Compatibility-only fields for the current backend');
    expect(prompt).toContain('These compatibility fields are transitional/deprecated support and are not the canonical semantic contract');

    expect(prompt).toContain('English: "Can you recommend which hospital or doctor I should talk to?"');
    expect(prompt).toContain('Arabic: "ممكن ترشح لي مستشفى أو دكتور مناسب؟"');
    expect(prompt).toContain('Chinese: "你能推荐适合我的医院或医生吗？"');
    expect(prompt).toContain('Spanish: "¿Me pueden recomendar un hospital o doctor adecuado?"');
    expect(prompt).toContain('English: "Can you recommend which hospital or doctor I should talk to?" -> {"resolvedIntent":"ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION","engagementSignal":"QUALIFIED_EXPLORATION","progressionSignal":"OPEN_TO_NEXT_STEP","recommendationSignal":"SEEKING_DIRECTION","mentionsCondition":false,"mentionsDoctorOrHospitalNeed":true}');
    expect(prompt).toContain('Arabic: "ممكن ترشح لي مستشفى أو دكتور مناسب؟" -> {"resolvedIntent":"ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION","engagementSignal":"QUALIFIED_EXPLORATION","progressionSignal":"OPEN_TO_NEXT_STEP","recommendationSignal":"SEEKING_DIRECTION","mentionsCondition":false,"mentionsDoctorOrHospitalNeed":true}');
    expect(prompt).toContain('Chinese: "你能推荐适合我的医院或医生吗？" -> {"resolvedIntent":"ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION","engagementSignal":"QUALIFIED_EXPLORATION","progressionSignal":"OPEN_TO_NEXT_STEP","recommendationSignal":"SEEKING_DIRECTION","mentionsCondition":false,"mentionsDoctorOrHospitalNeed":true}');
    expect(prompt).toContain('Spanish: "¿Me pueden recomendar un hospital o doctor adecuado?" -> {"resolvedIntent":"ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION","engagementSignal":"QUALIFIED_EXPLORATION","progressionSignal":"OPEN_TO_NEXT_STEP","recommendationSignal":"SEEKING_DIRECTION","mentionsCondition":false,"mentionsDoctorOrHospitalNeed":true}');

    expect(prompt).not.toContain('"affirmative"');
    expect(prompt).not.toContain('"negative"');

    expect(yaml).toContain('possibleIntent');
    expect(yaml).toContain('possibleRisk');
    expect(yaml).toContain('mentionedBudget');
    expect(yaml).toContain('topicHint');
    expect(yaml).not.toContain('"affirmative"');
    expect(yaml).not.toContain('"negative"');
  });
});
