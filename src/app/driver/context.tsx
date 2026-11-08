'use client';
import { createContext, useContext } from 'react';
import type { LiveLocation } from '@/lib/liveLocation';

/** Maps the vehicle_type stored in orders → driver filter key */
export const VEHICLE_TO_FILTER: Record<string, string> = {
  moto: 'moto_envios',
  auto: 'auto_envios',
  motocarro: 'moto_carro_fletes',
  camion2t: 'camion_fletes',
};

export type ServiceFilters = Record<string, boolean>;
export type WorkerPosition = Pick<LiveLocation, 'lat' | 'lng'> & Partial<Omit<LiveLocation, 'lat' | 'lng'>>;

export const DEFAULT_FILTERS: ServiceFilters = {
  moto_envios: true,
  auto_envios: true,
  moto_carro_fletes: true,
  camion_fletes: true,
};

interface WorkerCtx {
  openDrawer: () => void;
  email: string;
  displayName: string;
  profilePhoto: string;
  setProfilePhoto: (url: string) => void;
  avgRating: number;
  totalRatings: number;
  serviceFilters: ServiceFilters;
  toggleFilter: (key: string) => void;
  navApp: string;
  pickupRangeKm: number;
  setPickupRangeKm: (v: number) => void;
  /** Live GPS position shared from layout — avoids duplicate watchPosition instances */
  driverPos: WorkerPosition | null;
  setDriverPos: (v: WorkerPosition | null) => void;
}

export const WorkerContext = createContext<WorkerCtx>({
  openDrawer: () => {},
  email: '',
  displayName: '',
  profilePhoto: '',
  setProfilePhoto: () => {},
  avgRating: 0,
  totalRatings: 0,
  serviceFilters: DEFAULT_FILTERS,
  toggleFilter: () => {},
  navApp: 'google_maps',
  pickupRangeKm: 10,
  setPickupRangeKm: () => {},
  driverPos: null,
  setDriverPos: () => {},
});

export function useWorkerContext() {
  return useContext(WorkerContext);
}
