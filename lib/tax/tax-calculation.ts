// File: lib/tax/tax-calculation.ts

export type TaxCalculationResult = {
  status: "ESTIMATE" | "NEEDS_RULES";
  taxYear: number;
  taxableIncome: number;
  taxDue: number | null;
  taxPayable: number | null;
  refundDue: number | null;
  taxWithheld: number;
  note: string;
};

function calculateSalariedTaxYear2026(taxableIncome: number) {
  if (taxableIncome <= 600_000) return 0;
  if (taxableIncome <= 1_200_000) return (taxableIncome - 600_000) * 0.01;
  if (taxableIncome <= 2_200_000) {
    return 6_000 + (taxableIncome - 1_200_000) * 0.11;
  }
  if (taxableIncome <= 3_200_000) {
    return 116_000 + (taxableIncome - 2_200_000) * 0.23;
  }
  if (taxableIncome <= 4_100_000) {
    return 346_000 + (taxableIncome - 3_200_000) * 0.3;
  }

  return 616_000 + (taxableIncome - 4_100_000) * 0.35;
}

function calculateBankProfitTaxYear2026(bankProfitIncome: number) {
  return bankProfitIncome * 0.2;
}

export function calculateTaxEstimate(input: {
  taxYear: number;
  totalIncome: number;
  totalExpenses: number;
  bankProfitIncome?: number;
  taxWithheld?: number;
  isSalariedRoute: boolean;
  isBankProfitRoute: boolean;
}): TaxCalculationResult {
  const bankProfitIncome = Math.max(0, input.bankProfitIncome ?? 0);
  const taxableIncome = input.isBankProfitRoute
    ? bankProfitIncome
    : Math.max(0, input.totalIncome - input.totalExpenses);
  const taxWithheld = Math.max(0, input.taxWithheld ?? 0);

  if (
    input.taxYear !== 2026 ||
    (!input.isSalariedRoute && !input.isBankProfitRoute) ||
    (input.isBankProfitRoute && bankProfitIncome <= 0)
  ) {
    return {
      status: "NEEDS_RULES",
      taxYear: input.taxYear,
      taxableIncome,
      taxDue: null,
      taxPayable: null,
      refundDue: null,
      taxWithheld,
      note:
        input.isBankProfitRoute && bankProfitIncome <= 0
          ? "Add an income ledger entry categorized as BANK_PROFIT before calculating this route."
          : "A route-specific FBR tax rule set is required before calculating a final estimate.",
    };
  }

  const taxDue = Math.max(
    0,
    Math.round(
      input.isBankProfitRoute
        ? calculateBankProfitTaxYear2026(taxableIncome)
        : calculateSalariedTaxYear2026(taxableIncome),
    ),
  );
  const taxPayable = Math.max(0, taxDue - taxWithheld);
  const refundDue = Math.max(0, taxWithheld - taxDue);

  return {
    status: "ESTIMATE",
    taxYear: input.taxYear,
    taxableIncome,
    taxDue,
    taxPayable,
    refundDue,
    taxWithheld,
    note: input.isBankProfitRoute
      ? "Pilot estimate for Tax Year 2026 bank profit; withholding and final filing rules still require review."
      : "Pilot estimate for the Tax Year 2026 salaried route; final filing rules and credits still require review.",
  };
}
