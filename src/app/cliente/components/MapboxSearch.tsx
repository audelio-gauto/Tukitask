'use client';
import { SearchBox } from '@mapbox/search-js-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface Props {
  onSelect: (name: string, lat: number, lng: number) => void;
  placeholder?: string;
  value?: string;
}

export default function MapboxSearch({ onSelect, placeholder, value }: Props) {
  return (
    <SearchBox
      accessToken={MAPBOX_TOKEN}
      options={{
        country: 'PY',
        language: 'es',
        limit: 6,
      }}
      value={value || ''}
      onRetrieve={(res: any) => {
        const feature = res?.features?.[0];
        if (feature) {
          const [lng, lat] = feature.geometry.coordinates;
          const name =
            feature.properties?.full_address ||
            feature.properties?.name_preferred ||
            feature.properties?.name ||
            '';
          onSelect(name, lat, lng);
        }
      }}
      placeholder={placeholder || 'Buscar dirección...'}
      theme={{
        variables: {
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          borderRadius: '12px',
          boxShadow: 'none',
          border: '1.5px solid #e5e7eb',
          padding: '0.6em 1em',
          colorPrimary: '#10b981',
        },
      }}
    />
  );
}
