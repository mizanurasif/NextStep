import dayjs from "dayjs";

const CURRENCY_SYMBOLS: Record<string, string> = {
    BDT: "৳",
    USD: "$",
    EUR: "€",
    GBP: "£",
    INR: "₹",
};

// Groups the integer part the South Asian way: 1234567 -> 12,34,567
const groupLakh = (integer: string) => {
    if (integer.length <= 3) return integer;
    const lastThree = integer.slice(-3);
    const rest = integer.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return `${rest},${lastThree}`;
};

/**
 * Formats a number as currency, defaulting to Bangladeshi Taka.
 * formatCurrency(1234567.5) -> "৳12,34,567.50"
 */
export const formatCurrency = (value: number, currency: string = "BDT"): string => {
    const amount = Number.isFinite(value) ? value : 0;
    const code = currency.toUpperCase();

    try {
        // en-IN gives the lakh/crore grouping used in Bangladesh
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: code,
            currencyDisplay: "narrowSymbol",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        // Fallback when Intl or the currency code is unsupported
        const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `;
        const [integer, decimals] = Math.abs(amount).toFixed(2).split(".");
        const sign = amount < 0 ? "-" : "";
        return `${sign}${symbol}${groupLakh(integer)}.${decimals}`;
    }
};


export const formatSubscriptionDateTime = (value?: string): string => {
  if (!value) return "Not provided";
  const parsedDate = dayjs(value);
  return parsedDate.isValid() ? parsedDate.format("MM/DD/YYYY") : "Not provided";
};

export const formatStatusLabel = (value?: string): string => {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// Realtime Database refuses undefined values, so drop those keys before writing
export const withoutUndefined = <T extends object>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
