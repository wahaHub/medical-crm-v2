export type UserEmailState =
  | { state: 'NONE' }
  | { state: 'PATIENT'; userId: string }
  | { state: 'HOSPITAL'; userId: string }
  | { state: 'ADMIN'; userId: string };

export interface IUserEmailLookupRepository {
  findEmailState(email: string): Promise<UserEmailState>;
}
