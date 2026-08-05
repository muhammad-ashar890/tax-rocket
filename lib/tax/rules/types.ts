export type TaxSlab = {
  upperLimit: number | null;
  baseTax: number;
  rate: number;
  lowerLimit: number;
};

export type SalaryTaxRules = {
  taxYear: number;
  source: string;
  salarySlabs: TaxSlab[];
  surchargeAbove?: number;
  surchargeRate?: number;
};
