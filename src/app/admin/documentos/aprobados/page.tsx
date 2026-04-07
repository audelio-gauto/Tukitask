'use client';
import DocListView from '../_components/DocListView';

export default function DocumentosAprobadosPage() {
  return (
    <DocListView
      pageTitle="✅ Documentos Aprobados"
      pageDescription="Todos los documentos verificados y aprobados"
      fixedStatus="approved"
    />
  );
}
