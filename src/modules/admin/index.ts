// Funciones administrativas (panel de control, gestión de usuarios, etc.)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Obtiene datos reales de Supabase para el dashboard admin
export async function getAdminDashboardData() {
  // Ejemplo: obtener usuarios y pedidos de Supabase
  const { data: users, error: usersError } = await supabase.from('users').select('*');
  const { data: orders, error: ordersError } = await supabase.from('orders').select('*');

  return {
    users: users || [],
    usersError,
    orders: orders || [],
    ordersError,
    lastLogin: new Date().toLocaleString(),
  };
}
