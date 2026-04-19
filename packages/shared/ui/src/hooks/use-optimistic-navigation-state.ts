import { useEffect, useState } from 'react';

export function useOptimisticNavigationState(committedKey: string, transitionPending = false) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [didObservePendingTransition, setDidObservePendingTransition] = useState(false);

  useEffect(() => {
    if (!pendingKey) {
      if (didObservePendingTransition) {
        setDidObservePendingTransition(false);
      }
      return;
    }

    if (pendingKey === committedKey) {
      setPendingKey(null);
      setDidObservePendingTransition(false);
      return;
    }

    if (transitionPending) {
      if (!didObservePendingTransition) {
        setDidObservePendingTransition(true);
      }
      return;
    }

    if (didObservePendingTransition) {
      setPendingKey(null);
      setDidObservePendingTransition(false);
    }
  }, [committedKey, didObservePendingTransition, pendingKey, transitionPending]);

  return {
    displayActiveKey: pendingKey ?? committedKey,
    pendingKey,
    isNavigating: pendingKey !== null,
    navigateTo(nextKey: string, navigate: () => void) {
      if (nextKey === committedKey) {
        return;
      }

      setPendingKey(nextKey);
      setDidObservePendingTransition(false);
      navigate();
    },
  };
}
