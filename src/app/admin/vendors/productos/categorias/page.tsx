import TaxonomyManager from '../_components/TaxonomyManager';

export default function CategoriasPage() {
  return (
    <TaxonomyManager
      type="category"
      title="Categorias de Productos"
      subtitle="Crear y gestionar categorias visibles para el catalogo de vendedores."
      breadcrumb="Categorias"
    />
  );
}
