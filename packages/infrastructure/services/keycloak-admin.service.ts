import type { IKeycloakAdminService } from '@medical-crm/domain';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface RoleRepresentation {
  id: string;
  name: string;
}

export class KeycloakAdminService implements IKeycloakAdminService {
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly realm: string,
    private readonly adminUsername: string,
    private readonly adminPassword: string,
  ) {}

  private async getAdminToken(): Promise<string> {
    const now = Date.now();
    if (this.token !== null && now < this.tokenExpiry) {
      return this.token;
    }

    const url = `${this.baseUrl}/realms/master/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.adminUsername,
      password: this.adminPassword,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Failed to get admin token: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as TokenResponse;
    this.token = data.access_token;
    // Subtract 30 seconds buffer from expiry
    this.tokenExpiry = now + (data.expires_in - 30) * 1000;
    return this.token;
  }

  async createUser(
    username: string,
    email: string,
    hospitalName: string,
    hospitalId: string,
  ): Promise<string> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username,
        email,
        enabled: true,
        attributes: {
          hospital_name: [hospitalName],
          hospital_id: [hospitalId],
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create Keycloak user: ${res.status} ${await res.text()}`);
    }

    const location = res.headers.get('Location');
    if (!location) {
      throw new Error('Keycloak did not return a Location header after user creation');
    }

    const userId = location.split('/').pop();
    if (!userId) {
      throw new Error(`Could not extract user ID from Location header: ${location}`);
    }

    return userId;
  }

  async setPassword(keycloakUserId: string, password: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakUserId}/reset-password`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'password',
        value: password,
        temporary: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to set password for user ${keycloakUserId}: ${res.status} ${await res.text()}`);
    }
  }

  async assignRole(keycloakUserId: string, role: string): Promise<void> {
    const token = await this.getAdminToken();

    // Get available realm roles
    const rolesUrl = `${this.baseUrl}/admin/realms/${this.realm}/roles`;
    const rolesRes = await fetch(rolesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!rolesRes.ok) {
      throw new Error(`Failed to fetch roles: ${rolesRes.status} ${await rolesRes.text()}`);
    }

    const roles = (await rolesRes.json()) as RoleRepresentation[];
    const targetRole = roles.find((r) => r.name === role);
    if (!targetRole) {
      throw new Error(`Role '${role}' not found in realm ${this.realm}`);
    }

    // Assign role to user
    const assignUrl = `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakUserId}/role-mappings/realm`;
    const assignRes = await fetch(assignUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([targetRole]),
    });

    if (!assignRes.ok) {
      throw new Error(`Failed to assign role '${role}' to user ${keycloakUserId}: ${assignRes.status} ${await assignRes.text()}`);
    }
  }

  async deleteUser(keycloakUserId: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakUserId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to delete user ${keycloakUserId}: ${res.status} ${await res.text()}`);
    }
  }

  async checkUsernameExists(username: string): Promise<boolean> {
    const token = await this.getAdminToken();
    const params = new URLSearchParams({ username, exact: 'true' });
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users?${params.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to check username existence: ${res.status} ${await res.text()}`);
    }

    const users = (await res.json()) as unknown[];
    return users.length > 0;
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const token = await this.getAdminToken();
    const params = new URLSearchParams({ email, exact: 'true' });
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users?${params.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to check email existence: ${res.status} ${await res.text()}`);
    }

    const users = (await res.json()) as unknown[];
    return users.length > 0;
  }

  async updateUserEmail(keycloakUserId: string, email: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakUserId}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      throw new Error(`Failed to update email for user ${keycloakUserId}: ${res.status} ${await res.text()}`);
    }
  }

  async verifyPassword(username: string, password: string, clientId: string, clientSecret?: string): Promise<boolean> {
    const url = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      username,
      password,
    });
    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    return res.ok;
  }
}
