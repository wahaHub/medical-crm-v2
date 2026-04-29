# Chatbot V3 Domain Skill Taxonomy Design

Date: 2026-04-29

## Goal

Replace the current small skill-pack set with business-domain skills that match how Medora actually serves medical-travel users. The skill taxonomy must support natural, messy, multi-turn sessions where the user asks, hesitates, confirms, contradicts themselves, gives unreasonable input, or needs help understanding the next step.

This design intentionally removes a standalone `safety_skill`. Medical-advice boundaries belong in `medical_advice_skill`. Service-scope and out-of-scope boundaries belong in `service_scope_skill`.

## Non-Goals

- Do not turn FAQ spreadsheet categories directly into runtime skill IDs.
- Do not make regex heuristics the authority for medical advice or service scope.
- Do not let skill packs advance the journey stage. Stage changes remain owned by the reducer/runtime authority.
- Do not let any skill diagnose, prescribe, guarantee outcomes, invent provider facts, or invent prices.

## Skill Pack Set

### `core_interaction_contract`

This is a global contract injected before domain skill sections. It is not a user-facing domain skill, not a supervisor target, and not a standalone worker route.

It owns the shared interaction rules every skill needs:

- validate whether the user input is sufficient, ambiguous, contradictory, illogical, urgent, or out of service scope
- identify the user posture: ask, provide, confirm, reject, hesitate, correct, compare, revisit, request action, urgent, unknown
- preserve useful recent context
- avoid fake certainty
- ask one focused clarification when needed
- when safe, make a reasonable assumption and ask the user to confirm it

Domain skills must still define their own missing-detail rules. For example, missing pricing detail is different from missing travel detail, medical-advice detail, or payment detail.

Human requests are classified as `USER_REQUESTED_HUMAN` with `target=handoff`, not as a posture modifier.

### `service_scope_skill`

Owns Medora identity, public contact facts, service scope, service catalog, city coverage, and service-boundary answers.

Trigger this skill when the user asks:

- Who is Medora?
- What does Medora do?
- What can Medora help with?
- What services are included?
- Which cities does Medora cover?
- Does Medora provide translation, accompanied hospital visits, visa support, hotel support, airport pickup, remote consultation, or follow-up?
- How can I contact Medora?
- Where is Medora located or registered?
- What is Medora's relationship to hospitals, doctors, travel agencies, or ordinary intermediaries?
- Can Medora help with a non-medical or loosely related request?

Medora identity:

- Medora Health is a cross-border medical travel coordination platform serving international patients, overseas Chinese, self-pay medical travelers, families, and institutions seeking medical care in China.
- Existing materials state that Medora Health was founded or registered in Hong Kong SAR, China.
- Medora's role is to coordinate access, preparation, logistics, communication, and follow-up support across the medical journey.
- Explain Medora through what it helps coordinate. Do not lead with a defensive list of what Medora is not.

Public contact facts:

- Address: RM H2 4/F CENTURY IND CTR, 33-35 AU PUI WAN ST FOTAN SHA TIN, HONG KONG
- Phone: US +1 4708613825
- Email: contact@medicaltourismchina.health
- Website: https://www.medicaltourismchina.health

Use contact facts when the user asks how to contact Medora, where Medora is located, how to verify the company, or how to reach a person. Do not force contact details into unrelated answers.

Service catalog:

Use this catalog to answer what Medora can help with. Do not recite the full catalog unless the user asks for a complete overview. Select the service area most relevant to the user's question.

1. Cross-border medical journey coordination
   - Help international patients, overseas Chinese, self-pay patients, families, and institutional clients coordinate medical care in China.
   - Help the user understand whether the need fits treatment, second opinion, surgery, rehabilitation, health screening, medical aesthetics, or another medical service in China.
   - Help the user move from inquiry to hospital review, appointment, arrival, treatment, discharge, and follow-up.
   - Coordinate between the patient, family members, hospitals, doctors, interpreters, travel/logistics providers, and Medora care coordinators.
   - Explain Medora as a coordination partner for the medical journey, not just a travel booking service.

2. Hospital, department, and doctor coordination
   - Help identify and coordinate with suitable hospitals, departments, and doctors in China.
   - Match the user's condition or goal with appropriate medical specialties.
   - Help compare possible hospitals, departments, or doctors when suitable data is available.
   - Coordinate appointment requests, specialist consultation opportunities, and admission possibilities.
   - Support users who already have a target hospital or doctor.
   - Offer alternatives if the preferred hospital, doctor, city, or timing is not practical.
   - Coordinate public hospitals, high-level specialty centers, and selected private or international medical institutions where appropriate.
   - Do not imply guaranteed access to a specific doctor, guaranteed appointment/admission, or invented rankings, credentials, or success rates.

3. Medical records and case material support
   - Organize existing medical records, reports, imaging summaries, lab results, pathology reports, discharge summaries, and prior treatment history.
   - Translate or summarize records for medical review.
   - Help the user understand what types of documents are useful for hospital evaluation.
   - Prepare a clearer case packet for hospitals, doctors, second opinions, remote consultations, or admission planning.
   - Help users continue even when records are incomplete, while explaining that fuller records usually improve matching and estimate quality.

4. Remote consultation and second opinion coordination
   - Coordinate remote consultation or second-opinion pathways when available.
   - Support video, phone, or written medical review coordination.
   - Support pre-travel specialist consultation.
   - Coordinate multi-hospital or multi-specialty opinion paths when appropriate.
   - Help users decide whether travel to China is worth further evaluation.
   - Support users who want clarity before committing to travel.
   - Do not imply every doctor or hospital supports remote consultation or that remote consultation replaces final in-person evaluation when physical examination or updated testing is required.

5. Treatment journey and hospital admission support
   - Coordinate the non-clinical parts of the treatment journey.
   - Coordinate appointment scheduling, pre-arrival hospital communication, admission process support, registration, check-in, hospital navigation, and route guidance.
   - Support coordination around tests, consultations, ward admission, surgery or treatment scheduling, and discharge documents.
   - Support communication between the patient, family, and hospital team.
   - Help the user understand the general care pathway and what happens before, during, and after hospital treatment.
   - Do not imply Medora controls clinical decisions, hospital admission criteria, doctor judgment, or hospital scheduling.

6. Accompanied hospital visit / patient escort support
   - Provide or coordinate accompanied hospital visit support for international patients and families.
   - Help the patient arrive at and navigate the hospital.
   - Guide registration, check-in, payment windows, testing routes, consultation rooms, pharmacy, inpatient admission, and discharge areas.
   - Help the patient understand hospital procedures and reduce confusion in an unfamiliar environment.
   - Assist communication between patient, family, hospital staff, nurses, and doctors.
   - Support family members who need help understanding the process.
   - Help with practical hospital-day needs: where to go next, what documents are needed at each window, and how to keep the visit moving.
   - Keep the boundary clear: accompanied visit support is coordination, navigation, and communication support; it is not clinical decision-making.

7. Medical interpretation and translation services
   - Support medical communication across languages.
   - Provide or coordinate medical record translation, consultation interpretation, checkup/test/treatment discussion interpretation, admission/discharge/follow-up interpretation, and family communication support.
   - Help explain doctor instructions, discharge summaries, medication instructions, recheck plans, and rehabilitation guidance in the user's language.
   - Support remote interpretation where in-person support is unavailable or unnecessary.
   - Support on-site interpretation for hospital visits where service arrangements allow.
   - If the user asks whether Medora has translators, answer clearly yes, then mention that language availability and in-person/remote format depend on city, hospital, timing, and service plan.

8. Visa, invitation letter, and entry support
   - Assist with medical-travel document coordination.
   - Coordinate hospital invitation letters or appointment-related documents when available.
   - Help users understand whether they may need visa support based on country, stay length, itinerary, and treatment plan.
   - Support preparation of medical visit documents, appointment proof, itinerary materials, and related records.
   - Help users understand short-stay or transit options when relevant.
   - Guide users toward appropriate visa preparation steps for medical travel.
   - Do not imply guaranteed visa approval, legal/immigration advice, or control over embassy, consulate, border, or government decisions.

9. Airport pickup, local transport, and arrival support
   - Coordinate medical-travel arrival support.
   - Support airport pickup and transfer to hotel, hospital, or accommodation.
   - Support local transport between hospital, hotel, testing centers, and related appointments.
   - Support patients with mobility limits, luggage, medical equipment, wheelchair needs, or family companions.
   - Adjust pickup planning around flight arrival, delay, terminal, city, and treatment schedule when arranged.

10. Accommodation and stay planning
   - Coordinate accommodation for the medical journey.
   - Support hotels near hospitals, international or higher-comfort hotel options, longer-stay accommodation, or serviced-apartment-style options where suitable.
   - Support accommodation for accompanying family members.
   - Plan recovery-friendly location choices based on hospital proximity, transport convenience, food needs, mobility needs, and follow-up schedule.
   - Adjust stay plans around admission date, discharge timing, and post-treatment recovery.
   - Do not imply guaranteed hotel availability, fixed hotel price without confirmation, or medical suitability of accommodation without considering patient condition.

11. Companion and family support
   - Help companions understand the treatment schedule.
   - Coordinate accommodation and transport for companions.
   - Support family communication during hospital visits.
   - Help families understand hospital process, doctor communication, documents, and follow-up instructions.
   - Support pediatric, elderly, mobility-limited, or complex-care patients who need family involvement.

12. Payment, billing, and cost communication support
   - Help users understand and coordinate payment and billing communication.
   - Explain the difference between platform service fees and hospital medical costs when relevant.
   - Help users understand estimated cost components when available.
   - Coordinate billing questions with hospitals or service providers.
   - Help organize receipts, invoices, bills, or payment-related documents.
   - Support communication around payment methods, deposits, balances, currencies, and payment timing when confirmed.
   - Help users understand that final medical cost depends on hospital evaluation, treatment plan, tests, consumables, length of stay, and complications.
   - Do not invent payment methods, deposit amount, refund promises, insurance acceptance, or final medical cost.

13. Insurance and claims-related coordination
   - Coordinate insurance-related communication for medical travel where applicable.
   - Explain available medical tourism insurance or supplemental coverage information when confirmed.
   - Help users prepare hospital documents, receipts, or reports for insurance use.
   - Coordinate with insurance or billing contacts when the service plan supports it.
   - Help users understand that coverage depends on the insurer, policy, exclusions, and formal claim review.
   - Do not guarantee coverage, reimbursement, direct billing, or claim approval.

14. Post-treatment follow-up coordination
   - Coordinate follow-up after treatment or discharge.
   - Support discharge document organization, translation or explanation of discharge instructions, remote follow-up coordination, recheck reminders, report sharing, and communication after the patient returns home.
   - Help patients reconnect with the treating hospital if questions arise.
   - Support rehabilitation or recovery-plan communication when arranged.
   - For urgent post-treatment symptoms, prioritize local medical attention or emergency care first, then offer coordination support after safety is addressed.

15. Rehabilitation and recovery support
   - Coordinate rehabilitation or recovery-related services when relevant.
   - Support rehabilitation consultation coordination, recovery-plan communication, physical therapy or specialist follow-up coordination when available.
   - Support post-surgery recovery, mobility recovery, chronic disease follow-up, or functional rehabilitation.
   - Help the patient connect discharge instructions with practical follow-up steps.

16. Health screening and checkup services
   - Support health screening or medical checkup needs in China.
   - Coordinate general physical examination packages, advanced screening packages, cancer marker or imaging-based screening where available, executive health checks, family health screening, report interpretation, and follow-up coordination.

17. Medical aesthetics and elective procedures
   - Evaluate and coordinate selected medical aesthetics or elective medical services.
   - Coordinate cosmetic surgery or aesthetic medicine inquiries.
   - Match users with licensed medical institutions and appropriate specialists where available.
   - Support pre-procedure consultation, records/photo preparation, risk explanation, travel planning, and follow-up coordination.
   - Keep the answer careful: aesthetic outcomes are subjective and cannot be guaranteed. Final suitability and plan must be determined by licensed clinicians.

18. Complex disease and advanced treatment inquiry
   - Help users explore medical options for complex or serious conditions.
   - Support oncology, cardiovascular, orthopedics, spine, minimally invasive surgery, ophthalmology, ENT, urology, women's health, reproductive/endocrine, rehabilitation, metabolic disease, and other specialty inquiries.
   - Coordinate complex case review, second opinion, or multi-disciplinary consultation when available.
   - Coordinate advanced treatment inquiries subject to hospital capability, clinical suitability, ethics approval, and regulations.
   - Do not overpromise: for severe or complex disease, Medora can coordinate review and access, but hospital acceptance and treatment suitability depend on clinical evaluation.

City coverage:

- Core medical resource cities: Beijing, Shanghai, Guangzhou, Shenzhen, Chengdu, and Chongqing.
- City choice depends on disease area, hospital specialty strength, doctor availability, appointment/admission timing, and the patient's travel plan.
- Other cities may be considered when specialty resources, hospital cooperation, and the user's travel plan support them.

Service boundary:

- Explain boundaries only when relevant to the user's question.
- Medora coordinates the journey and communication; clinical decisions, final treatment plans, official approvals, exact pricing, and outcomes depend on hospitals, doctors, official authorities, insurers, or other responsible parties.
- For non-medical requests, briefly state the boundary and return to the closest medical-travel service Medora can actually support.

Response style:

- Answer with relevant facts, not full boilerplate.
- If the user asks generally, summarize Medora's role and a few representative services.
- If the user asks about one service, answer only that service and explain what it includes.
- If the user provides a need, map it to the closest Medora service when it fits.
- If the user corrects the assumed need, update the assumption without arguing.
- If the user hesitates or asks about trust, explain Medora's role, public contact facts, and low-commitment starting options without pressure.
- If the user compares Medora with contacting a hospital directly or using a travel agency, compare service models only: coordination, language, logistics, records preparation, and follow-up support. Do not invent quality rankings.
- If the user asks Medora to take action, say whether the requested action is within Medora's service scope and suggest the next service path.
- If urgent medical concerns appear, keep the service-scope answer brief and prioritize local urgent medical care before coordination.

### `policy_skill`

Owns process policy, privacy, refunds, insurance policy boundaries, cancellation, data handling, consent, and platform responsibility.

It answers:

- What is the process?
- What happens after I upload records?
- How does insurance work?
- What is refundable?
- Who sees my information?
- What can Medora promise or not promise?

Rules:

- Separate policy from logistics. Visa, hotel, pickup, and interpreter support belong in `travel_skill`.
- Separate payment mechanics from policy unless the question is about refund/cancellation rules.
- Preserve the current journey stage when answering process or policy detours.

### `medical_advice_skill`

Owns medical-advice boundary handling. This replaces the old broad `safety_scope_skill` behavior for medical questions.

It answers:

- Is this dangerous?
- Should I go to ER or wait for an appointment?
- Is this cancer, neuralgia, infection, or another diagnosis?
- Which specialty should I see?
- Can I take this medication?
- Should I avoid surgery?
- Can you guarantee recovery?

Sections:

- `triage_or_urgency_question`: no diagnosis; provide red-flag and local urgent-care principles, then continue Medora flow when safe.
- `specialty_or_department_question`: no final routing as a doctor; help organize facts for a suitable specialty or second opinion.
- `diagnosis_uncertainty_question`: no confirmation of disease; collect records and explain what evidence would help clinicians evaluate.
- `medication_or_prescription_question`: no dosing, prescription, or medication decision; say a doctor must review history, interactions, allergies, and tests.
- `treatment_decision_question`: do not decide surgery versus conservative treatment; offer second opinion and records review.
- `outcome_guarantee_request`: refuse guarantees; explain evaluation, risks, uncertainty, and next steps.

Rules:

- This skill should not blanket-dismiss all medical advice.
- It can provide safe framing, triage principles, record guidance, second-opinion routing, and specialty-preparation help.
- It must not diagnose, prescribe, provide dosage, replace local emergency care, or guarantee outcomes.
- It also owns medically grounded intake and record questions, such as what symptoms, reports, tests, or prior treatment facts are needed for review.

### `hospital_skill`

Owns hospital, doctor, department, specialty, provider credential, match, comparison, and recommendation logic.

It answers:

- Which hospital or doctor should I choose?
- Can you compare hospitals?
- Is this hospital good for my condition?
- Why do you recommend this provider?
- Can I see a specific doctor or department?

Rules:

- Recommend only from retrieved candidates or explicit approved provider data.
- Explain match dimensions: specialty fit, case complexity, records needed, language/international patient support, location, appointment availability, and user preferences.
- Do not invent rankings, success rates, doctor credentials, or hospital capabilities.

### `treatment_skill`

Owns treatment journey preparation and treatment-option discussion that is not pure medical advice.

It answers:

- What happens before treatment?
- What should I prepare before surgery or therapy?
- What kinds of options might be reviewed?
- What happens during hospital admission?
- What do I need to know before deciding?
- What records or facts are needed before a treatment review?

Rules:

- Keep treatment descriptions general unless retrieved clinical/provider information supports details.
- For decision-making, pair with `medical_advice_skill` boundaries.
- For aftercare, keep the follow-up logic inside `treatment_skill` when the user asks about recovery, post-treatment, remote follow-up, or returning home.
- For document upload or records-first review, treat the request as treatment preparation instead of a separate records skill.

### `pricing_skill`

Owns price estimation, cost factors, price uncertainty, and price hesitation.

It answers:

- How much does it cost?
- Why can you not give a fixed price?
- Is China cheaper?
- What affects the estimate?
- Can I get a rough range?

Rules:

- Do not quote package totals, discounts, or typical prices unless retrieved policy or approved FAQ supports them.
- Explain cost drivers: diagnosis, records, hospital, doctor, tests, treatment plan, inpatient days, medication, travel logistics, currency, and timing.
- For payment method, deposit, invoice, insurance direct-pay, refund, and currency mechanics, route to `payment_skill`.

### `payment_skill`

Owns payment mechanics, billing, deposits, invoices, refunds as transactions, currencies, installment requests, and insurance payment logistics.

It answers:

- How do I pay?
- Do you take card, wire, cash, RMB, USD, or insurance?
- Is there a deposit?
- Can I get an invoice?
- Can I pay in installments?
- What happens if I cancel?

Rules:

- Do not invent payment methods, deposit amounts, refund promises, or insurance acceptance.
- If policy is missing, say Medora needs to confirm the payment policy for the selected provider or service.
- For insurance coverage interpretation, keep the answer policy-level and avoid legal or insurer-specific guarantees.

### `travel_skill`

Owns medical-travel logistics.

It answers:

- Visa support
- Hotel
- Airport pickup
- City selection
- Interpreter and translation support
- Companion and family travel
- Local transport
- Food, culture, accessibility, and practical arrival planning

Rules:

- Do not promise visa approval, exact hotel availability, or immigration outcomes.
- Keep logistics tied to the medical plan and destination city.
- If the ask becomes immigration/legal, route through `service_scope_skill`.

### `sales_skill`

Owns trust, hesitation, conversion, value explanation, comparison against alternatives, and non-pushy next-step guidance.

It answers:

- Why should I trust you?
- Are you a scam?
- Why should I give records?
- Can I talk to a human first?
- Why use Medora instead of contacting a hospital directly?
- I am not ready yet.

Rules:

- Build trust by explaining process, boundaries, and low-friction next steps.
- Do not pressure, shame, exaggerate, invent success stories, or promise outcomes.
- When a user hesitates, reduce the ask: one report, one symptom summary, one coordinator question, or a general explanation.

### `faq_skill`

Owns FAQ answer behavior, not a business domain by itself.

It answers:

- Standard FAQ questions from the FAQ corpus.
- Variants of known FAQ questions.
- FAQ detours during another journey stage.

Rules:

- Use retrieved FAQ entries or approved policy as grounding.
- If the FAQ corpus lacks a public answer, say the public answer is not available and offer coordinator confirmation.
- Pair with the domain skill for the topic: `faq_skill + pricing_skill`, `faq_skill + travel_skill`, `faq_skill + service_scope_skill`, etc.
- FAQ answers must preserve the current journey stage unless the reducer/runtime authority explicitly advances it.

### `handoff_skill`

Owns human transfer, contact collection, coordinator ticket context, and handoff denial recovery.

It answers:

- I want a human.
- Can someone call me?
- Here is my phone number.
- I do not want the bot.
- Can a coordinator handle this?

Rules:

- Do not promise exact human response time unless policy exists.
- Collect only useful contact details and a short reason for handoff.
- If handoff is denied or unavailable, return to the current Medora flow with a helpful next step.

### `clarification_recovery_skill`

Owns unclear, contradictory, non-standard, typo-heavy, irrational, or incomplete input.

It answers:

- The user gives unclear text.
- The user contradicts earlier facts.
- The user changes topic mid-turn.
- The user says something impossible or not enough to act on.

Rules:

- Ask one focused clarification when needed.
- When a reasonable assumption is available, state it and ask the user to confirm.
- Preserve useful prior context and avoid fake certainty.

## Universal Input Handling Contract

Every skill must follow `core_interaction_contract` before producing domain guidance.

This contract should be injected globally with loaded skill sections. It should not be modeled as a supervisor target because users do not ask for "input validation" as a business domain.

### 1. Validate Input

Classify the input as one of:

- `sufficient`: enough information to answer or route.
- `missing_required_detail`: answer depends on one or two missing details.
- `ambiguous_reference`: pronouns, vague entities, unclear target, or unclear previous context.
- `contradictory`: conflicts with prior session facts.
- `illogical_or_impossible`: cannot be true as stated or cannot be acted on.
- `unsafe_or_urgent`: indicates possible emergency, severe risk, or urgent medical escalation.
- `out_of_service_scope`: not a Medora medical-travel service.

Required behavior:

- If `sufficient`, answer or route normally.
- If `missing_required_detail`, ask one focused question or offer a small next step.
- If `ambiguous_reference`, name the ambiguity and ask the user to confirm.
- If `contradictory`, gently surface the conflict and ask which version is correct.
- If `illogical_or_impossible`, make the safest reasonable interpretation and ask for confirmation.
- If `unsafe_or_urgent`, use `medical_advice_skill` urgency handling.
- If `out_of_service_scope`, use `service_scope_skill`.

Each domain skill must define what `missing_required_detail` means for that domain:

- `pricing_skill`: missing treatment plan, hospital/provider, records, inpatient days, or cost basis.
- `payment_skill`: missing payer, currency, provider, payment stage, refund/cancellation context, or insurance/payment method.
- `travel_skill`: missing destination city, timing, patient mobility, companion count, visa status, or logistics scope.
- `hospital_skill`: missing condition, specialty, location preference, budget/insurance constraints, or hospital comparison candidates.
- `treatment_skill`: missing treatment goal, current diagnosis, prior treatment, procedure context, or preparation stage.
- `medical_advice_skill`: missing symptom duration, severity, red flags, diagnosis uncertainty, medication context, tests, or prior clinician advice.
- `policy_skill`: missing which policy area is being asked about: process, privacy, insurance, cancellation, refund, responsibility, or service duration.
- `sales_skill`: missing objection type, trust concern, comparison basis, or desired next step.
- `service_scope_skill`: missing whether the user is asking about Medora's supported medical-travel coordination or an unsupported external service.

### 2. Identify User Posture

Every skill should identify the user's intent posture, not just topic:

- `ask`: asks for information.
- `confirm`: checks whether something is correct.
- `hesitate`: shows concern, fear, price sensitivity, distrust, or reluctance.
- `reject`: refuses a requested step.
- `provide`: provides facts, files, preferences, or contact details.
- `correct`: corrects previous information.
- `compare`: compares hospitals, prices, providers, routes, or options.
- `revisit`: returns to a prior topic or recommendation.
- `request_action`: asks Medora to do something.
- `urgent`: signals time-sensitive, worsening, severe, or safety-sensitive concern.
- `unknown`: posture cannot be determined confidently.

Required behavior:

- `ask`: answer directly, then return to the active workflow.
- `confirm`: confirm only what is supported; correct uncertainty.
- `hesitate`: acknowledge, reduce pressure, and offer a smaller step.
- `reject`: respect refusal and offer an alternate path.
- `provide`: acknowledge and use the new facts.
- `correct`: update the working assumption and avoid arguing.
- `compare`: compare on supported dimensions only.
- `revisit`: summarize the prior context and continue from there.
- `request_action`: say what Medora can do next and what is needed.
- `urgent`: use urgent-domain handling. For medical urgency, use `medical_advice_skill`; for urgent logistics or payment, state what can be coordinated without overpromising.
- `unknown`: ask one focused clarification or state the safest assumption and ask for confirmation.

Human requests are represented by `eventType=USER_REQUESTED_HUMAN` and `target=handoff`, not by a separate modifier.

## Domain Posture Handling Matrix

Every domain skill must declare how it handles each modifier:

- `ask`
- `provide`
- `confirm`
- `reject`
- `hesitate`
- `correct`
- `compare`
- `revisit`
- `request_action`
- `urgent`
- `unknown`

This matrix belongs inside each skill, not only in the global contract, because the same posture needs different behavior by domain.

Minimum expected patterns:

- `ask`: answer the domain question directly using retrieved context or approved policy, then continue the current journey.
- `provide`: acknowledge new facts and explain what they change or what next step they enable.
- `confirm`: confirm only supported facts; name uncertainty instead of over-confirming.
- `reject`: downgrade the ask, offer an alternative, or keep the workflow open without pressure.
- `hesitate`: acknowledge the concern, reduce friction, and offer a smaller step.
- `correct`: update the working assumption and avoid defending the previous assumption.
- `compare`: compare only on supported dimensions and avoid invented rankings.
- `revisit`: briefly restore prior context before answering again.
- `request_action`: say what Medora can do now, what information is required, and what cannot be promised.
- `urgent`: switch to the domain's urgency-safe path.
- `unknown`: ask one focused clarification.

Examples:

- `pricing_skill.reject`: if the user rejects a price or refuses records, do not argue; offer a records-first estimate, a general cost-factor explanation, or coordinator confirmation.
- `travel_skill.reject`: if the user rejects visa/hotel/pickup support, continue with the medical coordination path and keep logistics optional.
- `medical_advice_skill.urgent`: advise local emergency care for red flags, avoid diagnosis, and only continue Medora flow once the urgent boundary is handled.
- `hospital_skill.compare`: compare candidate hospitals on known match dimensions only; do not invent rankings, success rates, or unavailable credentials.
- `sales_skill.hesitate`: validate distrust or fear, explain Medora's role and boundaries, and offer a small non-committal next step.
- `payment_skill.confirm`: confirm only retrieved/approved payment rules; otherwise offer coordinator verification.
- `treatment_skill.revisit`: summarize the previous treatment concern or preparation question, then continue without resetting the whole journey.

## Domain Follow-Up Handling

Follow-up behavior should live inside the same primary domain skill that produced the main answer. Do not create a standalone `followup_skill`.

Reason:

- Follow-up is not a business domain; it is the continuation strategy after a domain answer.
- Keeping the main answer and next step inside the same skill avoids split logic, mismatched tone, and disconnected response composition.
- Each domain has different good follow-up behavior.

Examples:

- `treatment_skill.followup_after_treatment_review`: invite the next useful medical fact, record, or coordinator step.
- `hospital_skill.followup_after_recommendation`: ask whether the user wants comparison, doctor detail, or next appointment step.
- `pricing_skill.followup_after_price_question`: invite records-first estimate or explain cost factors.
- `payment_skill.followup_after_payment_policy`: offer coordinator confirmation for exact payment/refund terms.
- `travel_skill.followup_after_logistics_question`: ask for city, date, companion, visa, or mobility constraints.
- `medical_advice_skill.followup_after_safe_boundary`: continue toward records review, second opinion, or local urgent care when needed.
- `sales_skill.followup_after_hesitation`: reduce pressure and offer a smaller next step.
- `policy_skill.followup_after_process_answer`: return to the current journey stage and ask the next relevant process question.

Post-treatment and aftercare questions should be handled by existing primary skills:

- Recovery, remote follow-up, return-home continuity, report sharing, and re-contacting providers belong to `treatment_skill`.
- Medora responsibility, service duration, privacy, and coordination policy belong to `policy_skill`.
- Urgent post-treatment symptoms or complications belong to `medical_advice_skill`.

## FAQ Spreadsheet Mapping

The Excel FAQ categories should seed content and retrieval taxonomy, not become one-to-one runtime skills.

Suggested mapping:

- 公司与定位 -> `service_scope_skill`, `sales_skill`, `faq_skill`
- 服务范围与流程 -> `service_scope_skill`, `policy_skill`, `faq_skill`
- 医院医生与治疗 -> `hospital_skill`, `treatment_skill`, `medical_advice_skill`, `faq_skill`
- 费用与支付 -> `pricing_skill`, `payment_skill`, `policy_skill`, `faq_skill`
- 签证出行住宿 -> `travel_skill`, `service_scope_skill`, `faq_skill`
- 院内支持与陪同 -> `travel_skill`, `treatment_skill`, `handoff_skill`, `faq_skill`
- 术后随访与隐私 -> `treatment_skill`, `policy_skill`, `medical_advice_skill`, `faq_skill`
- 保险与风险 -> `policy_skill`, `payment_skill`, `medical_advice_skill`, `faq_skill`
- 体检与特色项目 -> `treatment_skill`, `hospital_skill`, `pricing_skill`, `faq_skill`
- 转化与联系 -> `sales_skill`, `handoff_skill`, `service_scope_skill`, `faq_skill`

## Event Model Direction

Semantic event types should describe the user's action, not the business domain. Business domain belongs in `target`, and user posture belongs in `modifier`.

### Semantic Event Types

Use a small semantic event set:

- `USER_EXPRESSED_INTEREST`: user expresses a service goal or desire, such as wanting treatment in China or help finding care.
- `USER_ASKED_QUESTION`: user asks an informational question, including medical-advice questions and service-scope questions.
- `USER_PROVIDED_INFORMATION`: user provides facts, preferences, symptoms, prior treatment, files, contact details, or corrections.
- `USER_RESPONDED_TO_REQUEST`: user answers, rejects, hesitates about, or confirms an assistant request.
- `USER_REQUESTED_ACTION`: user asks Medora to do something, such as book, compare, arrange, estimate, or prepare.
- `USER_REQUESTED_HUMAN`: user explicitly wants a person, coordinator, call, WeChat, or manual support.
- `USER_MESSAGE_UNCLEAR`: latest user input is too unclear to classify or act on.

Remove domain-specific event types from the semantic set:

- Remove `USER_ASKED_MEDICAL_ADVICE`; represent it as `USER_ASKED_QUESTION` with `target=medical_advice`.
- Remove `USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE`; represent it as `USER_ASKED_QUESTION` or `USER_REQUESTED_ACTION` with `target=service_scope` and service-scope metadata.

### Supervisor Event Targets

Align targets with the skill set:

- `service_scope`
- `policy`
- `medical_advice`
- `hospital`
- `treatment`
- `pricing`
- `payment`
- `travel`
- `sales`
- `faq`
- `handoff`
- `unknown`

Do not keep `eligibility_intake`, `records`, `documents`, `process`, `recommendation`, `hospital_selection`, `medical_facts`, `consult`, `contact`, or `human` as authoritative targets. Existing runtime code can use temporary compatibility aliases during migration, but the canonical target names should be the skill-aligned set above.

Contact details should be classified as `USER_PROVIDED_INFORMATION` with `target=handoff` and `modifier=provide`. Human contact requests should be `USER_REQUESTED_HUMAN` with `target=handoff`. Existing `consult` output must be normalized by meaning during migration: scheduling or action requests go to `handoff`, process/timing questions go to `policy`, and clinical review/preparation questions go to `treatment`.

### Supervisor Event Modifiers

Use modifiers for posture:

- `ask`
- `provide`
- `confirm`
- `reject`
- `hesitate`
- `correct`
- `compare`
- `revisit`
- `request_action`
- `urgent`
- `unknown`

## Conversation Context Window

Supervisor and worker agents need both durable memory and fresh wording. Passing only `conversationSummary` loses important recent details; passing full history is slow and noisy.

Use a two-part context:

1. `recentMessages`: the latest 8 direct messages, preserving role, text, timestamp/order, attachments summary, and relevant runtime metadata when available.
2. `conversationSummary`: a rolling summary of everything before those latest 8 messages.

The current implementation only stores a short `conversationSummary` patch made from the latest stage/user/assistant turn. That is not enough for long, messy sessions and should be replaced with a real rolling summary mechanism.

### Who Generates The Summary

The API runtime should own summary maintenance, not individual worker agents.

Recommended component:

- `ConversationContextService` or `chatbot-v3/conversation-context.ts`
- Reads recent persisted `ai_chat_messages` for the session and accepts the current in-flight user message before it has been persisted.
- Builds `recentMessages` for the prompt window.
- Decides whether rolling summary needs refresh.
- Emits a `conversationSummaryPatch` with coverage metadata that the existing status snapshot write path can persist after the assistant response is available.

Supervisor, FaqAgent, RecommendationAgent, and other workers should consume this context. They should not each decide how to summarize history.

### Compression Cadence

Compress by completed turns, not raw messages.

One completed turn is usually two messages: user + assistant. The proposed "every 4 messages" cadence is equivalent to every 2 turns. That is workable but may be too frequent and adds cost/noise.

Recommended early cadence:

- Keep the latest 8 messages verbatim.
- When there are more than 8 messages, summarize only messages older than the latest 8.
- Refresh the rolling summary every 4 completed turns, or whenever the count of unsummarized older messages reaches 8.
- Also allow deterministic refresh after important state changes that are already known from runtime state, without adding another LLM call: hospital selected, handoff requested, contact captured, documents uploaded, explicit rejection, explicit correction, or destination/treatment target changed.

This gives the desired behavior: the model sees the latest 8 messages directly, while `conversationSummary` represents earlier conversation only.

Important-state refresh must not add synchronous latency to the user turn. It should use one of these low-cost paths:

- If the current turn already has enough structured information from supervisor output, reducer output, status patches, or action metadata, refresh using those deterministic signals.
- If a higher-quality LLM summary is needed, enqueue it after the response is returned and use the previous summary for the current turn.
- If the async summarizer fails or times out, keep the previous summary and rely on the latest 8 messages until the next cadence refresh.

Do not add a separate blocking LLM call just to decide whether a state change is important.

### Summary Content Contract

The rolling summary should be structured enough for downstream agents:

- patient goal and current concern
- known condition/symptoms and uncertainty
- destination, timing, budget, travel constraints
- selected or compared hospitals/providers
- user preferences, hesitations, objections, and corrections
- documents or facts already provided
- prior assistant promises or pending next step
- current journey stage and unresolved question

The summary must not invent facts. If a fact is uncertain or contradicted, mark it as uncertain.

The summary must also have a durable coverage boundary. Persist summary metadata such as:

- `conversationSummaryThroughMessageId`
- `conversationSummaryThroughCreatedAt`
- `conversationSummaryMessageCount`

When this metadata is missing, treat the existing summary as legacy/unknown coverage. Do not claim it represents "only messages before the latest 8" until a deterministic or asynchronous refresh has rebuilt it with a coverage cursor.

## Implementation Direction

The migration should be incremental:

1. Add the new skill IDs and keep existing runtime contracts intact.
2. Rename or replace `safety_scope_skill` with `medical_advice_skill` and `service_scope_skill` routes.
3. Split `process_skill` content into `policy_skill`, `travel_skill`, and `payment_skill`.
4. Fold the current records/documents behavior into `treatment_skill` and `medical_advice_skill`; do not introduce `records_skill`.
5. Do not introduce `eligibility_intake_skill`; early suitability and messy first-intake questions should route to `treatment_skill` or `medical_advice_skill` depending on whether the user is asking about service fit or medical uncertainty.
6. Do not introduce `followup_skill`; add follow-up sections inside each primary domain skill.
7. Add `core_interaction_contract` as a global injected contract, not a supervisor target.
8. Add `faq_skill` as an auxiliary skill for FAQ-style answers.
9. Add `recentMessages` and rolling `conversationSummary` context plumbing before relying on long-session behavior.
10. Add unit tests proving every key target routes to the intended skill.
11. Add dogfood/debug evidence showing loaded skill sections and context windows for messy sessions.

## Acceptance Criteria

- No standalone `safety_skill` or `safety_scope_skill` remains in the authoritative taxonomy.
- No standalone `records_skill` or `eligibility_intake_skill` remains in the authoritative taxonomy.
- No standalone `followup_skill` remains in the authoritative taxonomy.
- `core_interaction_contract` is injected globally but is not a `SupervisorEventTarget`.
- Every domain skill declares posture handling for ask/provide/confirm/reject/hesitate/correct/compare/revisit/request_action/urgent/unknown.
- `USER_ASKED_QUESTION` with `target=medical_advice` loads `medical_advice_skill`.
- `USER_ASKED_QUESTION` or `USER_REQUESTED_ACTION` with `target=service_scope` loads `service_scope_skill`.
- Travel targets no longer load process policy as their primary skill.
- Payment targets no longer load process policy as their primary skill.
- FAQ answers load `faq_skill` plus the relevant domain skill.
- Supervisor and worker tasks receive `recentMessages` containing the latest 8 direct messages.
- Supervisor and worker tasks receive `conversationSummary` representing messages before the latest 8, not the latest turn only.
- Conversation summary patches include durable coverage metadata such as summarized-through message id/time/count.
- Every skill has validation guidance and posture guidance for ask/provide/confirm/reject/hesitate/correct/compare/revisit/request_action/urgent/unknown.
- Existing journey authority remains the only owner of stage progression.
