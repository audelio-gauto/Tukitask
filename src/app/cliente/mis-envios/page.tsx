'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MisEnviosRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/cliente'); }, [router]);
  return null;
}
