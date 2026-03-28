'use client';
import { createContext, useContext } from 'react';

/** Maps the vehicle_type stored in orders → driver filter key */
export const VEHICLE_TO_FILTER: Record<string, string> = {
  moto: 'moto_envios',
  auto: 'auto_envios',
  motocarro: 'moto_carro_fletes',
  camion2t: 'camion_fletes',
};

export type ServiceFilters = Record<string, boolean>;

export const DEFAULT_FILTERS: ServiceFilters = {
  moto_envios: true,
  auto_envios: true,
  moto_carro_fletes: true,
  camion_fletes: true,
};

interface DriverCtx {
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
  deliveryRangeKm: number;
  setDeliveryRangeKm: (v: number) => void;
}

export const DriverContext = createContext<DriverCtx>({
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
  deliveryRangeKm: 20,
  setDeliveryRangeKm: () => {},
});

export function useDriverContext() {
  return useContext(DriverContext);
}
