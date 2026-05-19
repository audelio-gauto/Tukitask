/* ── TukiMarket — shared mock data ────────────────────────── */

export const VENDORS = [
  { id: 'techpy',      name: 'TechPY Store',    category: 'Electrónica', emoji: '💻', rating: 4.8, products: 12, open: true,  grad: 'linear-gradient(135deg,#1e3a5f,#0d2035)' },
  { id: 'modaexpress', name: 'Moda Express',    category: 'Ropa',        emoji: '👗', rating: 4.5, products: 38, open: true,  grad: 'linear-gradient(135deg,#3b1f5e,#1e0f35)' },
  { id: 'sabores',     name: 'Sabores del Sur', category: 'Gastronomía', emoji: '🍽️', rating: 4.9, products:  8, open: false, grad: 'linear-gradient(135deg,#5e2a0d,#351508)' },
  { id: 'hogarfeliz',  name: 'Hogar Feliz',     category: 'Hogar',       emoji: '🏠', rating: 4.3, products: 21, open: true,  grad: 'linear-gradient(135deg,#1a4a2a,#0d2515)' },
  { id: 'librosmundo', name: 'LibrosMundo',     category: 'Libros',      emoji: '📚', rating: 4.7, products: 55, open: true,  grad: 'linear-gradient(135deg,#4a1a1a,#250d0d)' },
];

export const PRODUCTS = [
  { id: 'p1', vendorId: 'techpy',      vendorName: 'TechPY Store',    name: 'iPhone 15 128GB',           category: 'Electrónica', emoji: '📱', price: 5000000, floorPrice: 4200000, stock: 3  },
  { id: 'p2', vendorId: 'techpy',      vendorName: 'TechPY Store',    name: 'Auriculares Bluetooth Pro', category: 'Electrónica', emoji: '🎧', price:  350000, floorPrice:  280000, stock: 15 },
  { id: 'p3', vendorId: 'techpy',      vendorName: 'TechPY Store',    name: 'Laptop Gaming 16"',         category: 'Electrónica', emoji: '💻', price: 8500000, floorPrice: 7500000, stock: 2  },
  { id: 'p4', vendorId: 'modaexpress', vendorName: 'Moda Express',    name: 'Vestido Floral Verano',     category: 'Ropa',        emoji: '👗', price:  180000, floorPrice:  140000, stock: 8  },
  { id: 'p5', vendorId: 'modaexpress', vendorName: 'Moda Express',    name: 'Zapatillas Running',        category: 'Ropa',        emoji: '👟', price:  420000, floorPrice:  340000, stock: 5  },
  { id: 'p6', vendorId: 'sabores',     vendorName: 'Sabores del Sur', name: 'Empanadas x12 unidades',    category: 'Gastronomía', emoji: '🥟', price:   60000, floorPrice:   50000, stock: 20 },
  { id: 'p7', vendorId: 'hogarfeliz',  vendorName: 'Hogar Feliz',     name: 'Mesa de Madera Maciza',     category: 'Hogar',       emoji: '🪑', price:  800000, floorPrice:  650000, stock: 1  },
  { id: 'p8', vendorId: 'librosmundo', vendorName: 'LibrosMundo',     name: 'Set Paulo Coelho x5',       category: 'Libros',      emoji: '📚', price:  250000, floorPrice:  200000, stock: 10 },
];

export const CATEGORIES = ['Todos', 'Electrónica', 'Ropa', 'Gastronomía', 'Hogar', 'Libros'];

export type Product = typeof PRODUCTS[0];
export type Vendor  = typeof VENDORS[0];

export const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;
