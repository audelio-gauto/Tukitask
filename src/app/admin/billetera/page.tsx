'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function BilleteraPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/billetera/historial'); }, [router]);
  return null;
}
