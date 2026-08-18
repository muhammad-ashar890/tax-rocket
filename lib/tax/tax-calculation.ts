// File: lib/tax/tax-calculation.ts

import {
  TY2026_PENSION_RULES,
  TY2026_RENTAL_RULES,
  TY2026_SALARY_RULES,
  getTy2026RateCardRule,
} from "./rules/ty2026";
import type { SalaryTaxRules } from "./rules/types";
import type { TaxpayerListStatus } from "./tax-data-model";

export type TaxCalculationResult = {
  status: "ESTIMATE" | "NEEDS_RULES";
  taxYear: number;
  filerStatus: Extract<TaxpayerListStatus, "ATL" | "NON_ATL">;
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

function calculateRentalTax(rentalIncome: number) {
  if (rentalIncome <= TY2026_RENTAL_RULES.individualSlabs[0].upperLimit!) {
    return 0;
  }

  const slab = TY2026_RENTAL_RULES.individualSlabs.find(
    (candidate) =>
      rentalIncome > candidate.lowerLimit &&
      (candidate.upperLimit === null || rentalIncome <= candidate.upperLimit),
  );

  if (!slab) return 0;
  return slab.baseTax + (rentalIncome - slab.lowerLimit) * slab.rate;
}

function calculateBankProfitTax(
  bankProfitIncome: number,
  filerStatus: Extract<TaxpayerListStatus, "ATL" | "NON_ATL">,
) {
  const rule = getTy2026RateCardRule(
    "TY2026-151-BANK-OR-FINANCIAL-INSTITUTION-DEPOSIT",
  );
  const selectedRate = rule?.rates[filerStatus] ?? rule?.rates.DEFAULT;

  if (!selectedRate || selectedRate.kind !== "PERCENT") return null;
  return bankProfitIncome * (selectedRate.percent / 100);
}

export function calculateTaxEstimate(input: {
  taxYear: number;
  filerStatus: Extract<TaxpayerListStatus, "ATL" | "NON_ATL">;
  totalIncome: number;
  totalExpenses: number;
  bankProfitIncome?: number;
  taxWithheld?: number;
  isSalariedRoute: boolean;
  isPensionRoute?: boolean;
  isRentalRoute?: boolean;
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
      filerStatus: input.filerStatus,
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
    (!input.isSalariedRoute &&
      !input.isPensionRoute &&
      !input.isRentalRoute &&
      !input.isBankProfitRoute) ||
    (input.isBankProfitRoute && bankProfitIncome <= 0)
  ) {
    return {
      status: "NEEDS_RULES",
      taxYear: input.taxYear,
      filerStatus: input.filerStatus,
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

  const routeTax = input.isBankProfitRoute
    ? calculateBankProfitTax(bankProfitIncome, input.filerStatus)
    : input.isRentalRoute
      ? calculateRentalTax(taxableIncome)
      : calculateSalaryTax(taxableIncome, salaryRules);

  if (routeTax === null) {
    return {
      status: "NEEDS_RULES",
      taxYear: input.taxYear,
      filerStatus: input.filerStatus,
      taxableIncome: null,
      taxDue: null,
      taxPayable: null,
      refundDue: null,
      taxWithheld,
      note: `No ${input.filerStatus} rate is catalogued for this route.`,
    };
  }

  const taxDue = Math.max(0, Math.round(routeTax));
  const taxPayable = Math.max(0, taxDue - taxWithheld);
  const refundDue = Math.max(0, taxWithheld - taxDue);

  return {
    status: "ESTIMATE",
    taxYear: input.taxYear,
    filerStatus: input.filerStatus,
    taxableIncome,
    taxDue,
    taxPayable,
    refundDue,
    taxWithheld,
    note: input.isBankProfitRoute
      ? `Pilot ${input.filerStatus} estimate for Tax Year 2026 bank profit; withholding and final filing rules still require review.`
      : input.isRentalRoute
        ? "Pilot estimate using TY2026 Section 155 individual/AOP rental slabs; deductions and final-return rules still require review."
        : `Pilot estimate using TY2026 Section 149 salary slabs from the FBR WHT Rate Card; credits, perquisites and final-return surcharge still require review.`,
  };
}
