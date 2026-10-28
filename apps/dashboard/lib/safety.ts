// Agronomist replies are checked for product names and dose patterns. A match flags the reply for a
// second look; it does not block it, since agronomists may need to discuss inputs (architecture.md §6.4).
// The product list here is a placeholder until the PCPB-registered list is loaded.

const DOSE = /\b\d+(?:[.,]\d+)?\s*(?:ml|g|kg|l|litres?|liters?|cc)\s*(?:\/|per)\s*\d*\s*(?:l|litres?|liters?|ha|hectares?|acres?|knapsacks?|pumps?|debe)\b/i;
const PRODUCTS = ['mancozeb', 'metalaxyl', 'ridomil', 'chlorothalonil', 'copper oxychloride', 'cypermethrin', 'lambda-cyhalothrin', 'chlorpyrifos', 'emamectin', 'abamectin', 'imidacloprid', 'duduthrin'];

export function safetyFlags(text: string): string[] {
  const found: string[] = [];
  const dose = text.match(DOSE);
  if (dose) found.push(`dose “${dose[0]}”`);
  const lower = text.toLowerCase();
  for (const p of PRODUCTS) if (lower.includes(p)) found.push(`product “${p}”`);
  return found;
}
