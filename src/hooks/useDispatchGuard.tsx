import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { ITermRequiredModal } from '@/components/ITermRequiredModal';

interface DispatchGuardContextValue {
  /** Show the iTerm2 required modal. Called from error handlers when a dispatch fails with an iTerm2 error. */
  showITermModal: (status: 'installed' | 'not-installed') => void;
}

const DispatchGuardContext = createContext<DispatchGuardContextValue>({
  showITermModal: () => {},
});

const LAUNCH_URL = '/api/orbital/aggregate/dispatch/iterm-launch';

export function DispatchGuardProvider({ children }: { children: ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<'installed' | 'not-installed'>('not-installed');

  const showITermModal = useCallback((status: 'installed' | 'not-installed') => {
    setModalStatus(status);
    setModalOpen(true);
  }, []);

  const launchAndWait = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(LAUNCH_URL, { method: 'POST' });
      if (!res.ok) return false;
      const data = await res.json();
      return data.ok;
    } catch {
      return false;
    }
  }, []);

  const onClose = useCallback(() => setModalOpen(false), []);

  return (
    <DispatchGuardContext.Provider value={{ showITermModal }}>
      {children}
      <ITermRequiredModal
        open={modalOpen}
        status={modalStatus}
        onRetry={onClose}
        onCancel={onClose}
        launchAndWait={launchAndWait}
      />
    </DispatchGuardContext.Provider>
  );
}

export function useDispatchGuard(): DispatchGuardContextValue {
  return useContext(DispatchGuardContext);
}
