import { redirect } from 'next/navigation';

export default function DocumentosRechazadosPage() {
  redirect('/admin/documentos?tab=rechazados');
}
