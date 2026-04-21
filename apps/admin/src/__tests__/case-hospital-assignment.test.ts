import { describe, expect, it, vi } from 'vitest';

import {
  deriveHospitalAssignmentRows,
  diffHospitalSelections,
  filterHospitalAssignmentRows,
  persistHospitalAssignmentSelectionChanges,
} from '../lib/case-hospital-assignment';

describe('case hospital assignment helpers', () => {
  it('marks assigned and distributed hospitals as checked, while leaving other same-type hospitals unchecked', () => {
    const rows = deriveHospitalAssignmentRows({
      assignedHospitalId: 'hospital-assigned',
      hospitals: [
        {
          id: 'hospital-assigned',
          name: 'Assigned Alpha',
          type: 'COSMETIC',
        },
        {
          id: 'hospital-distributed',
          name: 'Distributed Beta',
          type: 'COSMETIC',
        },
        {
          id: 'hospital-available',
          name: 'Available Gamma',
          type: 'COSMETIC',
        },
      ],
      contacts: [
        {
          id: 'contact-distributed',
          hospitalId: 'hospital-distributed',
          subStatus: 'DISTRIBUTED',
          removedAt: null,
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        hospitalId: 'hospital-assigned',
        hospitalName: 'Assigned Alpha',
        checked: true,
        statusLabel: 'Assigned',
      }),
      expect.objectContaining({
        hospitalId: 'hospital-distributed',
        hospitalName: 'Distributed Beta',
        checked: true,
        statusLabel: 'Distributed',
      }),
      expect.objectContaining({
        hospitalId: 'hospital-available',
        hospitalName: 'Available Gamma',
        checked: false,
        statusLabel: 'Available',
      }),
    ]);
  });

  it('computes added and removed hospitals from the checkbox selection diff', () => {
    const diff = diffHospitalSelections({
      initialSelectedHospitalIds: ['hospital-assigned', 'hospital-distributed'],
      nextSelectedHospitalIds: ['hospital-distributed', 'hospital-new'],
    });

    expect(diff).toEqual({
      hospitalIdsToAdd: ['hospital-new'],
      hospitalIdsToRemove: ['hospital-assigned'],
    });
  });

  it('filters hospital rows by distributed and available states for the checklist tabs', () => {
    const rows = deriveHospitalAssignmentRows({
      assignedHospitalId: 'hospital-assigned',
      hospitals: [
        {
          id: 'hospital-assigned',
          name: 'Assigned Alpha',
          type: 'COSMETIC',
        },
        {
          id: 'hospital-distributed',
          name: 'Distributed Beta',
          type: 'COSMETIC',
        },
        {
          id: 'hospital-available',
          name: 'Available Gamma',
          type: 'COSMETIC',
        },
      ],
      contacts: [
        {
          id: 'contact-distributed',
          hospitalId: 'hospital-distributed',
          subStatus: 'DISTRIBUTED',
          removedAt: null,
        },
      ],
    });

    expect(filterHospitalAssignmentRows(rows, 'ALL').map((row) => row.hospitalId)).toEqual([
      'hospital-assigned',
      'hospital-distributed',
      'hospital-available',
    ]);
    expect(filterHospitalAssignmentRows(rows, 'DISTRIBUTED').map((row) => row.hospitalId)).toEqual([
      'hospital-assigned',
      'hospital-distributed',
    ]);
    expect(filterHospitalAssignmentRows(rows, 'AVAILABLE').map((row) => row.hospitalId)).toEqual([
      'hospital-available',
    ]);
  });

  it('resets the primary assignment before removing its contact and then adds new hospitals', async () => {
    const addHospitalToCase = vi.fn().mockResolvedValue({});
    const removeHospitalContact = vi.fn().mockResolvedValue({});
    const resetCaseAssignment = vi.fn().mockResolvedValue({});

    const result = await persistHospitalAssignmentSelectionChanges({
      caseId: 'case-1',
      assignedHospitalId: 'hospital-assigned',
      assignmentStatus: 'ASSIGNED',
      hospitalRows: [
        {
          hospitalId: 'hospital-assigned',
          hospitalName: 'Assigned Alpha',
          checked: true,
          statusLabel: 'Assigned',
          contactId: 'contact-assigned',
        },
        {
          hospitalId: 'hospital-new',
          hospitalName: 'New Gamma',
          checked: false,
          statusLabel: 'Available',
          contactId: null,
        },
      ],
      selectionDiff: {
        hospitalIdsToAdd: ['hospital-new'],
        hospitalIdsToRemove: ['hospital-assigned'],
      },
      addHospitalToCase,
      removeHospitalContact,
      resetCaseAssignment,
    });

    expect(result).toEqual({
      addedCount: 1,
      removedCount: 1,
      assignmentReset: true,
      failures: [],
    });
    expect(resetCaseAssignment).toHaveBeenCalledWith('case-1');
    expect(removeHospitalContact).toHaveBeenCalledWith(
      'contact-assigned',
      'case-1',
      'Removed from Assigned Hospital checklist',
    );
    expect(addHospitalToCase).toHaveBeenCalledWith('case-1', 'hospital-new');
    expect(resetCaseAssignment.mock.invocationCallOrder[0]!).toBeLessThan(
      removeHospitalContact.mock.invocationCallOrder[0]!,
    );
    expect(removeHospitalContact.mock.invocationCallOrder[0]!).toBeLessThan(
      addHospitalToCase.mock.invocationCallOrder[0]!,
    );
  });

  it('stops immediately when resetting the primary assignment fails', async () => {
    const addHospitalToCase = vi.fn().mockResolvedValue({});
    const removeHospitalContact = vi.fn().mockResolvedValue({});
    const resetCaseAssignment = vi.fn().mockRejectedValue(new Error('reset failed'));

    const result = await persistHospitalAssignmentSelectionChanges({
      caseId: 'case-1',
      assignedHospitalId: 'hospital-assigned',
      assignmentStatus: 'ASSIGNED',
      hospitalRows: [
        {
          hospitalId: 'hospital-assigned',
          hospitalName: 'Assigned Alpha',
          checked: true,
          statusLabel: 'Assigned',
          contactId: 'contact-assigned',
        },
      ],
      selectionDiff: {
        hospitalIdsToAdd: ['hospital-new'],
        hospitalIdsToRemove: ['hospital-assigned'],
      },
      addHospitalToCase,
      removeHospitalContact,
      resetCaseAssignment,
    });

    expect(result).toEqual({
      addedCount: 0,
      removedCount: 0,
      assignmentReset: false,
      failures: ['reset failed'],
    });
    expect(removeHospitalContact).not.toHaveBeenCalled();
    expect(addHospitalToCase).not.toHaveBeenCalled();
  });

  it('stops before adds when a removal fails', async () => {
    const addHospitalToCase = vi.fn().mockResolvedValue({});
    const removeHospitalContact = vi.fn().mockRejectedValue(new Error('remove failed'));
    const resetCaseAssignment = vi.fn().mockResolvedValue({});

    const result = await persistHospitalAssignmentSelectionChanges({
      caseId: 'case-1',
      assignedHospitalId: null,
      assignmentStatus: 'UNASSIGNED',
      hospitalRows: [
        {
          hospitalId: 'hospital-distributed',
          hospitalName: 'Distributed Beta',
          checked: true,
          statusLabel: 'Distributed',
          contactId: 'contact-distributed',
        },
      ],
      selectionDiff: {
        hospitalIdsToAdd: ['hospital-new'],
        hospitalIdsToRemove: ['hospital-distributed'],
      },
      addHospitalToCase,
      removeHospitalContact,
      resetCaseAssignment,
    });

    expect(result).toEqual({
      addedCount: 0,
      removedCount: 0,
      assignmentReset: false,
      failures: ['remove failed'],
    });
    expect(addHospitalToCase).not.toHaveBeenCalled();
  });
});
