import TaxonomyManager from '../_components/TaxonomyManager';

export default function EtiquetasPage() {
  return (
    <TaxonomyManager
      type="tag"
      title="Etiquetas de Productos"
      subtitle="Crear y gestionar etiquetas para mejorar filtros y busquedas en tienda."
      breadcrumb="Etiquetas"
    />
  );
}
