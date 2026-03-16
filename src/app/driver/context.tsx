'use client';
import { createContext, useContext } from 'react';

interface DriverCtx {
  openDrawer: () => void;
  email: string;
  displayName: string;
  profilePhoto: string;
  setProfilePhoto: (url: string) => void;
}

export const DriverContext = createContext<DriverCtx>({
  openDrawer: () => {},
  email: '',
  displayName: '',
  profilePhoto: '',
  setProfilePhoto: () => {},
});

export function useDriverContext() {
  return useContext(DriverContext);
}
