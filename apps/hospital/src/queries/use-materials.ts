import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useMaterialsInfo() {
  return useQuery({
    queryKey: ['materials', 'info'],
    queryFn: () => queryFetch('/api/materials'),
  });
}

export function useProcedures() {
  return useQuery({
    queryKey: ['materials', 'procedures'],
    queryFn: () => queryFetch('/api/materials/procedures'),
  });
}

export function useSurgeons() {
  return useQuery({
    queryKey: ['materials', 'surgeons'],
    queryFn: () => queryFetch('/api/materials/surgeons'),
  });
}

export function useBeforeAfterCases() {
  return useQuery({
    queryKey: ['materials', 'cases'],
    queryFn: () => queryFetch('/api/materials/cases'),
  });
}
