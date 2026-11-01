'use client';
import { Suspense } from 'react';
import ActiveOrders from '../components/ActiveOrders';

export default function ActivoPage() {
  return (
    <Suspense fallback={null}>
      <ActiveOrders mode="scheduled" />
    </Suspense>
  );
}
