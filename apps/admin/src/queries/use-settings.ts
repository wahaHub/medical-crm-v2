import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => queryFetch('/api/users/me'),
  });
}

export function useAdminEmails() {
  return useQuery({
    queryKey: ['admin-emails'],
    queryFn: () => queryFetch<{ emails: string[] }>('/api/settings/admin-emails'),
  });
}
