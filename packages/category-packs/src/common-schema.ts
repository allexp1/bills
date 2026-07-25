import { z } from "zod";

/**
 * Fields extracted from every bill regardless of category.
 * Every leaf is nullable: the model must return null for anything not
 * visible on the bill — never a guess.
 */

export const LineItemSchema = z.object({
  label: z.string(),
  /** Decimal string exactly as printed, e.g. "89,10" — parsed downstream. */
  amount: z.string().nullable(),
  page: z.number().int().nullable(),
  /** Model's plain reading of what this charge is, in the bill's own language. */
  rawNote: z.string().nullable(),
});

/** A discount printed on the bill — applied this cycle, or merely advertised. */
export const PrintedDiscountSchema = z.object({
  label: z.string(),
  /** Decimal string exactly as printed, if an amount is shown. */
  amount: z.string().nullable(),
  /** The condition that unlocks it, as printed (e-billing, direct debit, online sign-up). */
  condition: z.string().nullable(),
  /** true = shown as applied this cycle; false = only advertised; null = unclear. */
  applied: z.boolean().nullable(),
});

export const CommonFieldsSchema = z.object({
  providerName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  customerRefName: z.string().nullable(),
  billingPeriodStart: z.string().nullable(), // ISO date
  billingPeriodEnd: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totalAmount: z.string().nullable(), // decimal string as printed
  pastDueAmount: z.string().nullable(),
  currency: z.string().nullable(), // ISO-4217
  country: z.string().nullable(), // ISO-3166 alpha-2
  paymentMethod: z.string().nullable(),
  /** Instructions literally printed on the bill ("tariff ends 31/03", "to cancel visit …"). */
  printedNextSteps: z.array(z.string()),
  /** Discounts printed anywhere on the bill, applied or merely offered. */
  printedDiscounts: z.array(PrintedDiscountSchema),
  lineItems: z.array(LineItemSchema),
  /** Language the bill itself is written in (BCP-47 base tag). */
  billLanguage: z.string().nullable(),
});

export type CommonFields = z.infer<typeof CommonFieldsSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type PrintedDiscount = z.infer<typeof PrintedDiscountSchema>;
