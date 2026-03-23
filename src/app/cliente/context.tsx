'use client';
import { createContext, useContext } from 'react';

interface ClientCtx {
  openDrawer: () => void;
  email: string;
  displayName: string;
  profilePhoto: string;
  setProfilePhoto: (url: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  avgRating: number;
  setAvgRating: (v: number) => void;
  totalRatings: number;
  setTotalRatings: (v: number) => void;
}

export const ClientContext = createContext<ClientCtx>({
  openDrawer: () => {},
  email: '',
  displayName: '',
  profilePhoto: '',
  setProfilePhoto: () => {},
  phone: '',
  setPhone: () => {},
  avgRating: 0,
  setAvgRating: () => {},
  totalRatings: 0,
  setTotalRatings: () => {},
});

export function useClientContext() {
  return useContext(ClientContext);
}
