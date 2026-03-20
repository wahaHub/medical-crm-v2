import type { UploadPolicy, UploadPolicyId } from './types.js';

export class UploadPolicyRegistry {
  private readonly policies: Map<UploadPolicyId, UploadPolicy>;

  constructor(policies: UploadPolicy[]) {
    this.policies = new Map(policies.map((p) => [p.policyId, p]));
  }

  get(policyId: UploadPolicyId): UploadPolicy {
    const policy = this.policies.get(policyId);
    if (!policy) throw new Error(`Unknown upload policy: ${policyId}`);
    return policy;
  }
}
