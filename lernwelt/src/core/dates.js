/** Local calendar day as "YYYY-MM-DD" (not UTC – "today" means today for the child). */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function minutes(seconds) {
  return Math.round(seconds / 60);
}
