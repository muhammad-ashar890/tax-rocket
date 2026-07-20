export function getTaxYearStatementRange(taxYear: number) {
  return {
    start: new Date(Date.UTC(taxYear - 1, 6, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(taxYear, 5, 30, 23, 59, 59, 999)),
  };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function validateTaxYearStatement(input: {
  taxYear: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  currency?: string | null;
}) {
  const currency = (input.currency ?? "").trim().toUpperCase();
  if (currency !== "PKR") {
    return {
      valid: false as const,
      error: "Statement currency must be PKR",
    };
  }

  if (!input.periodStart || !input.periodEnd) {
    return {
      valid: false as const,
      error: `Statement dates are required for Tax Year ${input.taxYear}`,
    };
  }

  if (input.periodStart > input.periodEnd) {
    return {
      valid: false as const,
      error: "Statement start date cannot be after the end date",
    };
  }

  const range = getTaxYearStatementRange(input.taxYear);
  if (input.periodStart < range.start || input.periodEnd > range.end) {
    return {
      valid: false as const,
      error: `Statement period must fall within Tax Year ${input.taxYear}: ${formatDate(range.start)} to ${formatDate(range.end)}`,
    };
  }

  return { valid: true as const };
}
