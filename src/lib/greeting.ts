export function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
