'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface CartItem {
  id:         string;
  name:       string;
  price:      number;
  emoji:      string;
  image?:     string | null;
  vendorName: string;
  qty:        number;
}

interface CartCtx {
  items:      CartItem[];
  addItem:    (item: Omit<CartItem, 'qty'>) => void;
  removeItem: (id: string) => void;
  updateQty:  (id: string, qty: number) => void;
  count:      number;
  total:      number;
  clear:      () => void;
}

const CartContext = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  /* ── Persist ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tuki_cart');
      if (saved) setItems(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('tuki_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<CartItem, 'qty'>) => {
    setItems(prev => {
      const found = prev.find(i => i.id === item.id);
      if (found) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) { removeItem(id); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  };

  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const clear = () => setItems([]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, count, total, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
