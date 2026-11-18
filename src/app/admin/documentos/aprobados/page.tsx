import { redirect } from 'next/navigation';

export default function DocumentosAprobadosPage() {
  redirect('/admin/documentos?tab=aprobados');
}
