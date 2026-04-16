export type DepartmentStatsInput = Record<string, {
  specialists?: number | null;
  annualPatients?: number | null;
}>;

export function sanitizeDepartmentStats(
  stats: DepartmentStatsInput | null | undefined,
): Record<string, { specialists?: number; annualPatients?: number }> {
  if (!stats) return {};

  return Object.fromEntries(
    Object.entries(stats).map(([department, value]) => [
      department,
      {
        ...(typeof value?.specialists === 'number' ? { specialists: value.specialists } : {}),
        ...(typeof value?.annualPatients === 'number' ? { annualPatients: value.annualPatients } : {}),
      },
    ]),
  );
}
