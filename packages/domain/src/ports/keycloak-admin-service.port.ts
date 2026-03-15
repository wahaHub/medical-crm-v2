export interface KeycloakUser {
  id: string;
  username: string;
  email: string;
}

export interface IKeycloakAdminService {
  createUser(username: string, email: string, hospitalName: string, hospitalId: string): Promise<string>;
  setPassword(keycloakUserId: string, password: string): Promise<void>;
  assignRole(keycloakUserId: string, role: string): Promise<void>;
  deleteUser(keycloakUserId: string): Promise<void>;
  checkUsernameExists(username: string): Promise<boolean>;
  checkEmailExists(email: string): Promise<boolean>;
}
