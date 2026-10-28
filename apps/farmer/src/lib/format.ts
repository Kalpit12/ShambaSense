/** "KES 1,200": comma thousands, no decimals, as on M-Pesa receipts. */
export function formatKes(amount: number) {
  return `KES ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "12.5" stays, "12.0" becomes "12". */
export function formatQty(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Reads "1,200" or "1200.5" typed with a phone keypad. Null when empty or not a positive number. */
export function parseAmount(input: string): number | null {
  const n = Number(input.replace(/[,\s]/g, ''));
  return input.trim() && Number.isFinite(n) && n > 0 ? n : null;
}
