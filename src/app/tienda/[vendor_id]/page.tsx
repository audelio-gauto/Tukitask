'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/* ── Mock data (shared structure) ──────────────────────────── */
const VENDORS: Record<string, {
  id: string; name: string; category: string; emoji: string;
  rating: number; products: number; open: boolean;
  grad: string; desc: string; address: string; hours: string; phone: string;
}> = {
  techpy: {
    id: 'techpy', name: 'TechPY Store', category: 'Electrónica', emoji: '💻',
    rating: 4.8, products: 12, open: true,
    grad: 'linear-gradient(135deg,#1e3a5f,#0d2035)',
    desc: 'Los mejores productos electrónicos en Paraguay. Importamos directamente y te ofrecemos garantía en todos nuestros productos. Stock limitado y precios negociables.',
    address: 'Asunción, Shopping del Sol', hours: '08:00 – 18:00', phone: '0981123456',
  },
  modaexpress: {
    id: 'modaexpress', name: 'Moda Express', category: 'Ropa', emoji: '👗',
    rating: 4.5, products: 38, open: true,
    grad: 'linear-gradient(135deg,#3b1f5e,#1e0f35)',
    desc: 'Moda actual a precios accesibles. Ropa importada de Brasil y Argentina para toda la familia. Nuevas colecciones cada semana.',
    address: 'Luque, Av. Mcal. López', hours: '09:00 – 19:00', phone: '0991234567',
  },
  sabores: {
    id: 'sabores', name: 'Sabores del Sur', category: 'Gastronomía', emoji: '🍽️',
    rating: 4.9, products: 8, open: false,
    grad: 'linear-gradient(135deg,#5e2a0d,#351508)',
    desc: 'Comida casera preparada con ingredientes frescos. Empanadas, pasteles y especialidades del sur. Pedidos con entrega a domicilio.',
    address: 'San Lorenzo, Barrio San Blas', hours: '11:00 – 21:00', phone: '0972345678',
  },
  hogarfeliz: {
    id: 'hogarfeliz', name: 'Hogar Feliz', category: 'Hogar', emoji: '🏠',
    rating: 4.3, products: 21, open: true,
    grad: 'linear-gradient(135deg,#1a4a2a,#0d2515)',
    desc: 'Muebles y artículos de decoración de alta calidad. Fabricación propia con madera maciza y materiales importados. Diseños únicos y personalizables.',
    address: 'Fernando de la Mora', hours: '08:00 – 17:00', phone: '0981456789',
  },
  librosmundo: {
    id: 'librosmundo', name: 'LibrosMundo', category: 'Libros', emoji: '📚',
    rating: 4.7, products: 55, open: true,
    grad: 'linear-gradient(135deg,#4a1a1a,#250d0d)',
    desc: 'La librería más completa de Paraguay. Libros importados, nacionales, usados y sets especiales. Más de 3000 títulos disponibles.',
    address: 'Asunción, Centro', hours: '08:30 – 18:30', phone: '0961567890',
  },
};

const ALL_PRODUCTS = [
  { id: 'p1', vendorId: 'techpy',      name: 'iPhone 15 128GB',          category: 'Electrónica', emoji: '📱', price: 5000000, floorPrice: 4200000, stock: 3  },
  { id: 'p2', vendorId: 'techpy',      name: 'Auriculares Bluetooth Pro', category: 'Electrónica', emoji: '🎧', price:  350000, floorPrice:  280000, stock: 15 },
  { id: 'p3', vendorId: 'techpy',      name: 'Laptop Gaming 16"',         category: 'Electrónica', emoji: '💻', price: 8500000, floorPrice: 7500000, stock: 2  },
  { id: 'p4', vendorId: 'modaexpress', name: 'Vestido Floral Verano',     category: 'Ropa',        emoji: '👗', price:  180000, floorPrice:  140000, stock: 8  },
  { id: 'p5', vendorId: 'modaexpress', name: 'Zapatillas Running',        category: 'Ropa',        emoji: '👟', price:  420000, floorPrice:  340000, stock: 5  },
  { id: 'p6', vendorId: 'sabores',     name: 'Empanadas x12 unidades',    category: 'Gastronomía', emoji: '🥟', price:   60000, floorPrice:   50000, stock: 20 },
  { id: 'p7', vendorId: 'hogarfeliz',  name: 'Mesa de Madera Maciza',     category: 'Hogar',       emoji: '🪑', price:  800000, floorPrice:  650000, stock: 1  },
  { id: 'p8', vendorId: 'librosmundo', name: 'Set Paulo Coelho x5',       category: 'Libros',      emoji: '📚', price:  250000, floorPrice:  200000, stock: 10 },
];

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

/* ── Stock chip ── */
function StockChip({ stock }: { stock: number }) {
  if (stock === 0) return <span className="tnd-chip tnd-chip-out">Sin stock</span>;
  if (stock <= 3)  return <span className="tnd-chip tnd-chip-low">⚠️ {stock} disponibles</span>;
  return <span className="tnd-chip tnd-chip-stock">✓ En stock</span>;
}

/* ── Component ─────────────────────────────────────────────── */
export default function VendorProfilePage() {
  const params   = useParams();
  const vendorId = params.vendor_id as string;
  const vendor   = VENDORS[vendorId];
  const products = ALL_PRODUCTS.filter(p => p.vendorId === vendorId);

  if (!vendor) {
    return (
      <div className="tnd-page">
        <div className="tnd-not-found">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
          <h2 style={{ color: 'var(--tnd-text-primary)', marginBottom: 8 }}>Tienda no encontrada</h2>
          <p style={{ color: 'var(--tnd-text-muted)', marginBottom: 24 }}>Esta tienda no existe o fue removida.</p>
          <Link href="/tienda" className="tnd-back">← Volver al catálogo</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tnd-page">
      {/* Back */}
      <Link href="/tienda" className="tnd-back">← Volver al catálogo</Link>

      {/* ── Store header ── */}
      <div className="tnd-store-header">
        <div className="tnd-store-header-banner" style={{ background: vendor.grad }} />
        <div className="tnd-store-header-info">
          <div className="tnd-store-header-logo-wrap">
            <div className="tnd-store-header-logo">{vendor.emoji}</div>
          </div>
          <h1 className="tnd-store-header-name">{vendor.name}</h1>
          <div className="tnd-store-header-meta">
            <span className="tnd-store-header-chip">🏷️ {vendor.category}</span>
            <span className="tnd-store-header-chip">⭐ {vendor.rating} calificación</span>
            <span className="tnd-store-header-chip">📦 {vendor.products} productos</span>
            <span className="tnd-store-header-chip">📍 {vendor.address}</span>
            <span className="tnd-store-header-chip">⏰ {vendor.hours}</span>
            {vendor.open
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: 'var(--tnd-success)' }}>
                  <span className="tnd-store-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block', animation: 'tnd-pulse 1.8s infinite' }} />
                  Abierto ahora
                </span>
              : <span style={{ fontSize: '0.8rem', color: 'var(--tnd-text-muted)' }}>Cerrado</span>
            }
          </div>
          <p className="tnd-store-header-desc">{vendor.desc}</p>
          <div className="tnd-store-header-actions">
            <a
              href={`https://wa.me/595${vendor.phone.replace(/^0/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tnd-whatsapp-btn"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.17 1.542 5.953L.057 23.887a.5.5 0 0 0 .615.615l5.95-1.48A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.948 0-3.808-.524-5.408-1.449l-.388-.222-4.01.996.999-3.935-.244-.401A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* ── Products ── */}
      <div className="tnd-section-head">
        <h2 className="tnd-section-title">Productos de la tienda ({products.length})</h2>
      </div>

      {products.length === 0 ? (
        <div className="tnd-empty">
          <div className="tnd-empty-icon">📦</div>
          <div className="tnd-empty-title">Sin productos publicados</div>
          <div className="tnd-empty-sub">Esta tienda todavía no cargó productos.</div>
        </div>
      ) : (
        <div className="tnd-products-grid">
          {products.map(p => (
            <Link key={p.id} href={`/tienda/producto/${p.id}`} className="tnd-product-card">
              <div
                className="tnd-product-img"
                style={{ background: `linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))` }}
              >
                {p.emoji}
                {p.floorPrice < p.price * 0.92 && (
                  <span className="tnd-negoable-badge">🤝 Negociable</span>
                )}
              </div>
              <div className="tnd-product-body">
                <div className="tnd-product-name">{p.name}</div>
                <div className="tnd-product-price">{gs(p.price)}</div>
                <div className="tnd-product-floor">Ofertá desde {gs(p.floorPrice)}</div>
                <div style={{ marginBottom: 10 }}>
                  <StockChip stock={p.stock} />
                </div>
                <span className="tnd-product-action">Ver y ofertar</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
