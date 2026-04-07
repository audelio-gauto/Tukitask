'use client';
import DocListView from '../_components/DocListView';

export default function DocumentosRechazadosPage() {
  return (
    <DocListView
      pageTitle="❌ Documentos Rechazados"
      pageDescription="Documentos rechazados — revisá el motivo y permitile al usuario resubir"
      fixedStatus="rejected"
    />
  );
}
