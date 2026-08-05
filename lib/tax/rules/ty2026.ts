import type { SalaryTaxRules } from "./types";

/**
 * TY2026 salary slab pilot.
 * Source: FBR Withholding Income Tax Rate Card, updated up to 30 June 2025
 * under Finance Act 2025, Section 149.
 *
 * This is intentionally kept separate from final-return credits, exemptions,
 * perquisites and surcharge logic until those rules are confirmed.
 */
export const TY2026_SALARY_RULES: SalaryTaxRules = {
  taxYear: 2026,
  source:
    "FBR WHT Rate Card updated up to 30 June 2025, Finance Act 2025, Section 149",
  salarySlabs: [
    { lowerLimit: 0, upperLimit: 600_000, baseTax: 0, rate: 0 },
    { lowerLimit: 600_000, upperLimit: 1_200_000, baseTax: 0, rate: 0.01 },
    {
      lowerLimit: 1_200_000,
      upperLimit: 2_200_000,
      baseTax: 6_000,
      rate: 0.11,
    },
    {
      lowerLimit: 2_200_000,
      upperLimit: 3_200_000,
      baseTax: 116_000,
      rate: 0.23,
    },
    {
      lowerLimit: 3_200_000,
      upperLimit: 4_100_000,
      baseTax: 346_000,
      rate: 0.3,
    },
    { lowerLimit: 4_100_000, upperLimit: null, baseTax: 616_000, rate: 0.35 },
  ],
  // Surcharge/credits are not silently applied from the WHT card alone;
  // they remain pending final-return rule confirmation.
};

export const TY2026_BANK_PROFIT_WITHHOLDING_RATE = 0.2;
