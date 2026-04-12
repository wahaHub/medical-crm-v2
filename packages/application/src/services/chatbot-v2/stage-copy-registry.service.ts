import type { JourneySnapshot, StageCopyReference } from './types.js';

const STAGE_COPY: Record<string, string> = {
  'COLLECT_MEDICAL_INPUTS.pre': 'The next step is to gather the patient medical inputs so the team can review the case with enough context before moving into formal recommendations.',
  'COLLECT_MEDICAL_INPUTS.post': 'The patient medical inputs have been received, and the journey can now move into recommendation guidance based on the submitted information.',
  'RECOMMENDATION.pre': 'The next step is to explain that recommendation is starting, including that the team will use the submitted information to suggest hospitals or packages.',
  'RECOMMENDATION.post': 'A recommendation direction has been accepted, and the journey can now move into preparing the online consultation step.',
  'ONLINE_CONSULT.pre': 'The next step is to explain the purpose of the online consultation, make it clear that this is a required step, and tell the patient that it cannot be dismissed or skipped.',
  'ONLINE_CONSULT.post': 'The online consultation step has been submitted, and the patient should be told what happens next without rewinding the journey.',
  'HUMAN_HANDOFF.pre': 'A human advisor can take over this conversation, and the patient should be asked whether they want the case sent to the administrator team now.',
  'HUMAN_HANDOFF.post': 'The case has already been sent to the administrator team, and the patient should be told that the human team will contact them within 24 hours.',
};

export class StageCopyRegistryService {
  resolve(snapshot: JourneySnapshot): StageCopyReference | null {
    const key = `${snapshot.currentStage}.${snapshot.currentPhase}`;
    const referenceText = STAGE_COPY[key];
    if (!referenceText) {
      return null;
    }

    return {
      stage: snapshot.currentStage,
      phase: snapshot.currentPhase,
      referenceText,
    };
  }
}
