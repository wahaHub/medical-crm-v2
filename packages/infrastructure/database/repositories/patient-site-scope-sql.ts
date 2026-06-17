import { sql, type SQL } from 'drizzle-orm';
import type { PatientSiteAccessScope } from '@medical-crm/domain';

export function patientSiteScopeSql(
  patientSiteExpression: SQL,
  scope?: PatientSiteAccessScope,
): SQL | undefined {
  if (!scope) return undefined;
  if (scope.mode === 'ONLY') {
    return sql`${patientSiteExpression} = 'beauty'`;
  }
  return sql`(${patientSiteExpression} is null or ${patientSiteExpression} <> 'beauty')`;
}
