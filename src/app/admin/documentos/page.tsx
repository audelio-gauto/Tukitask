'use client';
import DocListView from './_components/DocListView';

export default function DocumentosPage() {
  return (
    <DocListView
      pageTitle="📎 Verificación de Documentos"
      pageDescription="Revisá y aprobá los documentos de conductores y técnicos"
      showTabs
    />
  );
}
