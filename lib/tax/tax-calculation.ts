// File: lib/tax/tax-calculation.ts

import {
  TY2026_BANK_PROFIT_WITHHOLDING_RATE,
  TY2026_PENSION_RULES,
  TY2026_SALARY_RULES,
} from "./rules/ty2026";
import type { SalaryTaxRules } from "./rules/types";

export type TaxCalculationResult = {
  status: "ESTIMATE" | "NEEDS_RULES";
  taxYear: number;
  taxableIncome: number | null;
  taxDue: number | null;
  taxPayable: number | null;
  refundDue: number | null;
  taxWithheld: number;
  note: string;
};

function calculateSalaryTax(taxableIncome: number, rules: SalaryTaxRules) {
  if (taxableIncome <= rules.salarySlabs[0].upperLimit!) return 0;

  const slab = rules.salarySlabs.find(
    (candidate) =>
      taxableIncome > candidate.lowerLimit &&
      (candidate.upperLimit === null || taxableIncome <= candidate.upperLimit),
  );

  if (!slab) return 0;
  return slab.baseTax + (taxableIncome - slab.lowerLimit) * slab.rate;
}

function calculateBankProfitTax(bankProfitIncome: number) {
  return bankProfitIncome * TY2026_BANK_PROFIT_WITHHOLDING_RATE;
}

export function calculateTaxEstimate(input: {
  taxYear: number;
  totalIncome: number;
  totalExpenses: number;
  bankProfitIncome?: number;
  taxWithheld?: number;
  isSalariedRoute: boolean;
  isPensionRoute?: boolean;
  isBankProfitRoute: boolean;
}): TaxCalculationResult {
  const bankProfitIncome = Math.max(0, input.bankProfitIncome ?? 0);
  // Salary is not reduced by ordinary personal/bank-account expenses. Those
  // expenses belong in wealth reconciliation, not the salary tax base.
  const taxableIncome = input.isBankProfitRoute
    ? bankProfitIncome
    : Math.max(0, input.totalIncome);
  const taxWithheld = Math.max(0, input.taxWithheld ?? 0);
  const salaryRules =
    input.taxYear === TY2026_SALARY_RULES.taxYear ? TY2026_SALARY_RULES : null;
  const pensionRules =
    input.taxYear === TY2026_PENSION_RULES.taxYear
      ? TY2026_PENSION_RULES
      : null;

  if (
    input.isPensionRoute &&
    pensionRules &&
    taxableIncome <= pensionRules.exemptUpTo
  ) {
    return {
      status: "ESTIMATE",
      taxYear: input.taxYear,
      taxableIncome,
      taxDue: 0,
      taxPayable: 0,
      refundDue: taxWithheld,
      taxWithheld,
      note: "TY2026 pension income up to PKR 10,000,000 is treated as exempt. Pension above this threshold and surcharge require confirmed rules.",
    };
  }

  if (
    !salaryRules ||
    (!input.isSalariedRoute && !input.isBankProfitRoute) ||
    (input.isBankProfitRoute && bankProfitIncome <= 0)
  ) {
    return {
      status: "NEEDS_RULES",
      taxYear: input.taxYear,
      taxableIncome: null,
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
        ? calculateBankProfitTax(bankProfitIncome)
        : calculateSalaryTax(taxableIncome, salaryRules),
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
      : `Pilot estimate using TY2026 Section 149 salary slabs from the FBR WHT Rate Card; credits, perquisites and final-return surcharge still require review.`,
  };
}
