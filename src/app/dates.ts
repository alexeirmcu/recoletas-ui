const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
export function madridInput(date: Date): string { return formatter.format(date).replace(' ', 'T'); }
export function madridToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  // Madrid uses UTC+1 or UTC+2. During the autumn fold choose the earlier instant.
  for (const offset of [2, 1]) {
    const candidate = new Date(nominal - offset * 3600000);
    if (madridInput(candidate) === value) return candidate.toISOString();
  }
  return null;
}
const display = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' });
export function madridDate(value: string): string { return display.format(new Date(value)); }
