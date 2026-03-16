'use client';
import { createContext, useContext } from 'react';

interface ClientCtx {
  openDrawer: () => void;
  email: string;
  displayName: string;
  profilePhoto: string;
  setProfilePhoto: (url: string) => void;
}

export const ClientContext = createContext<ClientCtx>({
  openDrawer: () => {},
  email: '',
  displayName: '',
  profilePhoto: '',
  setProfilePhoto: () => {},
});

export function useClientContext() {
  return useContext(ClientContext);
}
