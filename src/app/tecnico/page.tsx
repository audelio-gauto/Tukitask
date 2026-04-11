'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TecnicoRoot() {
  const router = useRouter();
  useEffect(() => { router.replace('/tecnico/ofertas'); }, [router]);
  return null;
}
