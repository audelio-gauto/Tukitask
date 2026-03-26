'use client';
// La billetera del técnico es idéntica a la del driver: mismo API /api/wallet,
// mismo contexto DriverContext (el layout de técnico lo provee).
// Re-exportar evita duplicar 200 líneas de UI.
export { default } from '@/app/driver/billetera/page';
