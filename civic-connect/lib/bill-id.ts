const VALID_BILL_TYPES = new Set([
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
]);

const CURRENT_CONGRESS = "119";
const MIN_VALID_CONGRESS = 100;
const MAX_VALID_CONGRESS = 119;

export function canonicalize(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseBillId(input: string): string[] {
  if (!input) return [];

  const clean = canonicalize(input);
  const match = clean.match(/^([A-Z]+)(\d+)$/);
  if (!match) return [];

  const [, typeUpper, digits] = match;
  const type = typeUpper.toLowerCase();
  if (!VALID_BILL_TYPES.has(type)) return [];

  const candidates: string[] = [];

  if (digits.length >= 4) {
    const trailing = digits.slice(-3);
    const congressNum = Number(trailing);
    if (congressNum >= MIN_VALID_CONGRESS && congressNum <= MAX_VALID_CONGRESS) {
      const number = digits.slice(0, -3).replace(/^0+/, "");
      if (number) {
        candidates.push(`${type}-${number}-${trailing}`);
      }
    }
  }

  const defaultNumber = digits.replace(/^0+/, "");
  if (defaultNumber) {
    candidates.push(`${type}-${defaultNumber}-${CURRENT_CONGRESS}`);
  }

  return Array.from(new Set(candidates));
}
