import { createContext, useContext, ReactNode } from 'react';

export type ImpersonatedRole = 'driver' | 'owner';

interface ImpersonationState {
  viewAsUserId: string;
  role: ImpersonatedRole;
  displayName?: string;
  email?: string;
}

const ImpersonationContext = createContext<ImpersonationState | null>(null);

export const ImpersonationProvider = ({
  value,
  children,
}: {
  value: ImpersonationState;
  children: ReactNode;
}) => (
  <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>
);

export const useImpersonation = () => useContext(ImpersonationContext);
