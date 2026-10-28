// Kenyan mobile numbers: +254 followed by 9 digits starting with 7 or 1 (Safaricom, Airtel, Telkom).
// Accepts what people actually type: 0712345678, 712345678, 254712345678, +254 712 345 678.
export function toE164Kenya(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('254')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[17]\d{8}$/.test(digits) ? `+254${digits}` : null;
}

// "+254712345678" -> "+254 712 345 678"
export function formatKenya(e164: string): string {
  const local = e164.replace(/^\+254/, '');
  // No-break spaces keep the number on one line.
  return `+254\u00A0${local.slice(0, 3)}\u00A0${local.slice(3, 6)}\u00A0${local.slice(6)}`;
}

// Groups the local part as the farmer types: "712345678" -> "712 345 678"
export function groupLocal(input: string): string {
  const digits = input.replace(/\D/g, '').replace(/^0/, '').slice(0, 9);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ');
}
