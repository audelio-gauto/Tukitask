import TaxonomyManager from '../_components/TaxonomyManager';

export default function AtributosPage() {
  return (
    <TaxonomyManager
      type="attribute"
      title="Atributos de Productos"
      subtitle="Crear y gestionar atributos para fichas de productos de vendedores."
      breadcrumb="Atributos"
    />
  );
}
