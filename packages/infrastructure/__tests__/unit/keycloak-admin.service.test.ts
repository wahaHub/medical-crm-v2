import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeycloakAdminService } from '../../services/keycloak-admin.service.js';

// Helper to create a mock fetch response
function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const responseHeaders = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  } as unknown as Response;
}

const BASE_URL = 'https://keycloak.test';
const REALM = 'medical';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'secret';

const TOKEN_RESPONSE = {
  access_token: 'test-admin-token',
  expires_in: 300,
};

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = new KeycloakAdminService(BASE_URL, REALM, ADMIN_USER, ADMIN_PASS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createUser', () => {
    it('creates a user and returns the userId from Location header', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(
          mockResponse(201, '', {
            Location: `${BASE_URL}/admin/realms/${REALM}/users/new-user-id-123`,
          }),
        );

      const userId = await service.createUser('jsmith', 'j@example.com', 'Test Hospital', 'hosp-1');

      expect(userId).toBe('new-user-id-123');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify token request
      const tokenCall = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(tokenCall[0]).toBe(`${BASE_URL}/realms/master/protocol/openid-connect/token`);
      expect(tokenCall[1]?.method).toBe('POST');

      // Verify user creation request
      const createCall = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(createCall[0]).toBe(`${BASE_URL}/admin/realms/${REALM}/users`);
      expect(createCall[1]?.method).toBe('POST');
      const body = JSON.parse(createCall[1]?.body as string) as {
        username: string;
        email: string;
        attributes: { hospital_id: string[] };
      };
      expect(body.username).toBe('jsmith');
      expect(body.email).toBe('j@example.com');
      expect(body.attributes.hospital_id).toEqual(['hosp-1']);
    });

    it('throws when Keycloak returns a non-ok status', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(409, 'User exists already'));

      await expect(
        service.createUser('jsmith', 'j@example.com', 'Test Hospital', 'hosp-1'),
      ).rejects.toThrow('Failed to create Keycloak user');
    });

    it('throws when Location header is missing', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(201, ''));

      await expect(
        service.createUser('jsmith', 'j@example.com', 'Test Hospital', 'hosp-1'),
      ).rejects.toThrow('Keycloak did not return a Location header');
    });
  });

  describe('setPassword', () => {
    it('sends a PUT request to reset-password endpoint', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(204, ''));

      await service.setPassword('user-123', 'newpassword');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const call = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(call[0]).toBe(`${BASE_URL}/admin/realms/${REALM}/users/user-123/reset-password`);
      expect(call[1]?.method).toBe('PUT');
      const body = JSON.parse(call[1]?.body as string) as {
        type: string;
        value: string;
        temporary: boolean;
      };
      expect(body.type).toBe('password');
      expect(body.value).toBe('newpassword');
      expect(body.temporary).toBe(false);
    });

    it('throws on failure', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(404, 'User not found'));

      await expect(service.setPassword('user-123', 'pass')).rejects.toThrow(
        'Failed to set password',
      );
    });
  });

  describe('assignRole', () => {
    it('fetches roles and posts role mapping', async () => {
      const roles = [
        { id: 'role-id-1', name: 'hospital' },
        { id: 'role-id-2', name: 'admin' },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(200, roles))
        .mockResolvedValueOnce(mockResponse(204, ''));

      await service.assignRole('user-123', 'hospital');

      expect(fetchMock).toHaveBeenCalledTimes(3);

      const rolesCall = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(rolesCall[0]).toBe(`${BASE_URL}/admin/realms/${REALM}/roles`);

      const assignCall = fetchMock.mock.calls[2] as [string, RequestInit];
      expect(assignCall[0]).toBe(
        `${BASE_URL}/admin/realms/${REALM}/users/user-123/role-mappings/realm`,
      );
      expect(assignCall[1]?.method).toBe('POST');
      const body = JSON.parse(assignCall[1]?.body as string) as Array<{ id: string; name: string }>;
      expect(body).toEqual([{ id: 'role-id-1', name: 'hospital' }]);
    });

    it('throws when role is not found', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(200, [{ id: 'x', name: 'other' }]));

      await expect(service.assignRole('user-123', 'nonexistent')).rejects.toThrow(
        "Role 'nonexistent' not found",
      );
    });
  });

  describe('deleteUser', () => {
    it('sends a DELETE request', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(204, ''));

      await service.deleteUser('user-abc');

      const call = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(call[0]).toBe(`${BASE_URL}/admin/realms/${REALM}/users/user-abc`);
      expect(call[1]?.method).toBe('DELETE');
    });

    it('throws on failure', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(404, 'Not found'));

      await expect(service.deleteUser('user-abc')).rejects.toThrow('Failed to delete user');
    });
  });

  describe('checkUsernameExists', () => {
    it('returns true when user list is non-empty', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(200, [{ id: 'u1', username: 'jsmith' }]));

      const exists = await service.checkUsernameExists('jsmith');
      expect(exists).toBe(true);

      const call = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(call[0]).toContain('username=jsmith');
      expect(call[0]).toContain('exact=true');
    });

    it('returns false when user list is empty', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(200, []));

      const exists = await service.checkUsernameExists('nobody');
      expect(exists).toBe(false);
    });
  });

  describe('checkEmailExists', () => {
    it('returns true when email is found', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(200, [{ id: 'u1', email: 'a@b.com' }]));

      const exists = await service.checkEmailExists('a@b.com');
      expect(exists).toBe(true);

      const call = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(call[0]).toContain('email=a%40b.com');
      expect(call[0]).toContain('exact=true');
    });

    it('returns false when email is not found', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, TOKEN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(200, []));

      const exists = await service.checkEmailExists('nobody@example.com');
      expect(exists).toBe(false);
    });
  });

  describe('token caching', () => {
    it('reuses a cached token within its validity window', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(200, { access_token: 'cached-token', expires_in: 300 }))
        .mockResolvedValue(mockResponse(204, ''));

      // Two operations that each need a token
      await service.deleteUser('user-1');
      await service.deleteUser('user-2');

      // Token should have been fetched only once
      const tokenCalls = (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) =>
        url.includes('openid-connect/token'),
      );
      expect(tokenCalls).toHaveLength(1);
    });
  });
});
