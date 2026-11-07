'use client';

import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';
import styles from './AccountSections.module.css';

export const SUPPORT_WHATSAPP_URL = 'https://wa.me/595961188628';

type AccountItem = {
  label: string;
  description: string;
  icon: IconName;
} & (
  | { section: string; onActivate?: () => void; href?: never }
  | { href: string; section?: never; onActivate?: never }
);

export default function AccountSections({ items, selected, onSelect }: {
  items: AccountItem[];
  selected: string | null;
  onSelect: (section: string | null) => void;
}) {
  if (selected) {
    const item = items.find(entry => entry.section === selected);
    return (
      <div className={styles.detailHeader}>
        <button type="button" className={styles.back} onClick={() => onSelect(null)}>
          ← Mi cuenta
        </button>
        <h2 className={styles.detailTitle}>{item?.label ?? 'Mi cuenta'}</h2>
      </div>
    );
  }
  return (
    <nav className={styles.nav} aria-label="Secciones de mi cuenta">
      <div className={styles.heading}>Mi cuenta</div>
      <p className={styles.intro}>Elegí una sección. Recordá guardar tus cambios antes de salir.</p>
      <div className={styles.list}>
        {items.map(item => {
          const content = (
            <>
              <span className={styles.icon}><Icon name={item.icon} size={19} /></span>
              <span className={styles.text}>
                <span className={styles.label}>{item.label}</span>
                <span className={styles.description}>{item.description}</span>
              </span>
              <span className={styles.arrow} aria-hidden="true">›</span>
            </>
          );
          return item.href !== undefined ? (
            <Link key={item.label} className={styles.item} href={item.href}>{content}</Link>
          ) : (
            <button key={item.label} type="button" className={styles.item} onClick={() => {
              item.onActivate?.();
              const section = item.section;
              if (section) {
                onSelect(section);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}>
              {content}
            </button>
          );
        })}
        <a className={styles.item} href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
          <span className={styles.icon}><Icon name="chat" size={19} /></span>
          <span className={styles.text}>
            <span className={styles.label}>Contactar con soporte</span>
            <span className={styles.description}>Abrir WhatsApp</span>
          </span>
          <span className={styles.arrow} aria-hidden="true">↗</span>
        </a>
      </div>
    </nav>
  );
}
