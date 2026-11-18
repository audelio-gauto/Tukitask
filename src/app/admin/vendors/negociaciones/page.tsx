import { redirect } from 'next/navigation';

// La vista de "ofertas activas en vivo" no estaba conectada a datos.
// El workspace arranca en el historial real de negociaciones.
export default function NegociacionesPage() {
  redirect('/admin/vendors/negociaciones/historial');
}
