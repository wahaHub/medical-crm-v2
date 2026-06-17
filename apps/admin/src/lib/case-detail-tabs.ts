export type CaseDetailHospitalType = 'COSMETIC' | 'REGULAR' | null | undefined;

export function shouldShowCaseDetailTab(tabKey: string, hospitalType: CaseDetailHospitalType) {
  if (tabKey === 'beauty') {
    return hospitalType === 'COSMETIC';
  }

  if (tabKey === 'intake') {
    return hospitalType !== 'COSMETIC';
  }

  return true;
}
