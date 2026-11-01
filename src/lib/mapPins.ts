// Pines de ruta (A/B) compartidos por los mapas del cliente y del driver.
// Punta del pin en el centro inferior: usar anchor 'bottom' (Mapbox) o iconAnchor [W/2, H] (Leaflet).

export const PIN_A_COLOR = '#22c55e';
export const PIN_B_COLOR = '#ef4444';
export const PIN_W = 36;
export const PIN_H = 48;

export function routePinHtml(label: string, color: string): string {
  return `<div style="position:relative;width:${PIN_W}px;height:${PIN_H}px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.45));">
    <div style="position:absolute;left:12px;top:28px;width:12px;height:12px;background:${color};transform:rotate(45deg);border-radius:2px;"></div>
    <div style="position:absolute;left:0;top:0;width:${PIN_W}px;height:${PIN_W}px;border-radius:50%;background:${color};border:3px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#fff;font:900 15px/1 system-ui,-apple-system,sans-serif;">${label}</div>
    <div style="position:absolute;left:15px;top:43px;width:6px;height:6px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(1px);"></div>
  </div>`;
}

export function routePinElement(label: string, color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = `position:relative;width:${PIN_W}px;height:${PIN_H}px;cursor:default;`;
  el.innerHTML = routePinHtml(label, color);
  return el;
}
