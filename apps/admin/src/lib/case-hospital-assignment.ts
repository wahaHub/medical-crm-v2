import type { HospitalSummary } from './api-types';

export interface AssignmentContactLike {
  id: string;
  hospitalId: string;
  hospitalName?: string;
  subStatus: string;
  removedAt: string | null;
}

export interface HospitalAssignmentRow {
  hospitalId: string;
  hospitalName: string;
  checked: boolean;
  statusLabel: 'Assigned' | 'Distributed' | 'Need Info' | 'Quoted' | 'Accepted' | 'Rejected' | 'Expired' | 'Available';
  contactId: string | null;
}

export type HospitalAssignmentFilter = 'ALL' | 'DISTRIBUTED' | 'AVAILABLE';

const ACTIVE_CHECKED_STATUSES = new Set(['DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED']);

interface DeriveHospitalAssignmentRowsInput {
  assignedHospitalId?: string | null;
  assignedHospitalName?: string | null;
  hospitals: Array<Pick<HospitalSummary, 'id' | 'name' | 'type'>>;
  contacts: AssignmentContactLike[];
}

function statusFromContact(subStatus: string): HospitalAssignmentRow['statusLabel'] {
  switch (subStatus) {
    case 'DISTRIBUTED':
      return 'Distributed';
    case 'NEED_INFO':
      return 'Need Info';
    case 'QUOTED':
      return 'Quoted';
    case 'ACCEPTED':
      return 'Accepted';
    case 'REJECTED':
      return 'Rejected';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'Available';
  }
}

export function deriveHospitalAssignmentRows(input: DeriveHospitalAssignmentRowsInput): HospitalAssignmentRow[] {
  const activeContacts = input.contacts.filter((contact) => !contact.removedAt);
  const activeContactByHospitalId = new Map(activeContacts.map((contact) => [contact.hospitalId, contact] as const));

  const hospitalEntries = new Map(
    input.hospitals.map((hospital) => [hospital.id, hospital.name] as const),
  );

  for (const contact of activeContacts) {
    if (!hospitalEntries.has(contact.hospitalId)) {
      hospitalEntries.set(contact.hospitalId, contact.hospitalName ?? contact.hospitalId);
    }
  }

  if (input.assignedHospitalId && !hospitalEntries.has(input.assignedHospitalId)) {
    hospitalEntries.set(
      input.assignedHospitalId,
      input.assignedHospitalName ?? input.assignedHospitalId,
    );
  }

  return Array.from(hospitalEntries.entries()).map(([hospitalId, hospitalName]) => {
    const contact = activeContactByHospitalId.get(hospitalId) ?? null;
    const checked = hospitalId === input.assignedHospitalId || Boolean(contact && ACTIVE_CHECKED_STATUSES.has(contact.subStatus));
    const statusLabel = hospitalId === input.assignedHospitalId
      ? 'Assigned'
      : contact
        ? statusFromContact(contact.subStatus)
        : 'Available';

    return {
      hospitalId,
      hospitalName,
      checked,
      statusLabel,
      contactId: contact?.id ?? null,
    };
  });
}

interface DiffHospitalSelectionsInput {
  initialSelectedHospitalIds: string[];
  nextSelectedHospitalIds: string[];
}

export function diffHospitalSelections(input: DiffHospitalSelectionsInput): {
  hospitalIdsToAdd: string[];
  hospitalIdsToRemove: string[];
} {
  const initialSelected = new Set(input.initialSelectedHospitalIds);
  const nextSelected = new Set(input.nextSelectedHospitalIds);

  return {
    hospitalIdsToAdd: input.nextSelectedHospitalIds.filter((hospitalId) => !initialSelected.has(hospitalId)),
    hospitalIdsToRemove: input.initialSelectedHospitalIds.filter((hospitalId) => !nextSelected.has(hospitalId)),
  };
}

export function filterHospitalAssignmentRows(
  rows: HospitalAssignmentRow[],
  filter: HospitalAssignmentFilter,
): HospitalAssignmentRow[] {
  if (filter === 'DISTRIBUTED') {
    return rows.filter((row) => row.checked);
  }

  if (filter === 'AVAILABLE') {
    return rows.filter((row) => !row.checked);
  }

  return rows;
}

interface PersistHospitalAssignmentSelectionChangesInput {
  caseId: string;
  assignedHospitalId?: string | null;
  assignmentStatus?: string | null;
  hospitalRows: HospitalAssignmentRow[];
  selectionDiff: {
    hospitalIdsToAdd: string[];
    hospitalIdsToRemove: string[];
  };
  addHospitalToCase: (caseId: string, hospitalId: string) => Promise<unknown>;
  removeHospitalContact: (contactId: string, caseId: string, reason?: string) => Promise<unknown>;
  resetCaseAssignment: (caseId: string) => Promise<unknown>;
}

export async function persistHospitalAssignmentSelectionChanges(
  input: PersistHospitalAssignmentSelectionChangesInput,
): Promise<{
  addedCount: number;
  removedCount: number;
  assignmentReset: boolean;
  failures: string[];
}> {
  let addedCount = 0;
  let removedCount = 0;
  let assignmentReset = false;
  const failures: string[] = [];
  const hospitalRowById = new Map(input.hospitalRows.map((row) => [row.hospitalId, row] as const));
  const assignedHospitalWasRemoved = Boolean(
    input.assignedHospitalId
      && input.assignmentStatus === 'ASSIGNED'
      && input.selectionDiff.hospitalIdsToRemove.includes(input.assignedHospitalId),
  );

  if (assignedHospitalWasRemoved) {
    try {
      await input.resetCaseAssignment(input.caseId);
      assignmentReset = true;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Failed to reset assigned hospital');
      return {
        addedCount,
        removedCount,
        assignmentReset,
        failures,
      };
    }
  }

  for (const hospitalId of input.selectionDiff.hospitalIdsToRemove) {
    const row = hospitalRowById.get(hospitalId);
    if (!row?.contactId) continue;
    if (hospitalId === input.assignedHospitalId && assignedHospitalWasRemoved && !assignmentReset) {
      continue;
    }
    try {
      await input.removeHospitalContact(row.contactId, input.caseId, 'Removed from Assigned Hospital checklist');
      removedCount += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `Failed to unassign ${row.hospitalName}`);
      return {
        addedCount,
        removedCount,
        assignmentReset,
        failures,
      };
    }
  }

  for (const hospitalId of input.selectionDiff.hospitalIdsToAdd) {
    try {
      await input.addHospitalToCase(input.caseId, hospitalId);
      addedCount += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `Failed to assign ${hospitalId}`);
      return {
        addedCount,
        removedCount,
        assignmentReset,
        failures,
      };
    }
  }

  return {
    addedCount,
    removedCount,
    assignmentReset,
    failures,
  };
}
