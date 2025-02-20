import { useEffect, DependencyList } from 'react';

function useAsyncEffect(
  asyncEffect: () => Promise<void | (() => void)>,
  deps: DependencyList = [],
) {
  useEffect(() => {
    const boxedCleanupOrNoop = asyncEffect();

    return () => {
      boxedCleanupOrNoop.then(cleanupOrNoop => {
        typeof cleanupOrNoop === 'function' && cleanupOrNoop();
      });
    };
  }, deps);
}

export default useAsyncEffect;