/** Masks a raw brokerage account number for display — everywhere in PMNTx that isn't this one function should only ever see the masked form. */
export function maskAccountNumber(rawAccountNumber: string): string {
  const digits = rawAccountNumber.trim();
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
