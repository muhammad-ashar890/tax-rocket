# TaxRocket — New Filing Wizard UX Simplification Prompt (Part 1 of N)

> **Status:** This is Part 1 of a multi-part prompt. More requirements
> (covering other pages/flows) will be appended in follow-up messages.
> Treat this document as authoritative context for everything related to
> the **New Filing Wizard** until superseded or extended.

---

## 0. Scope of this prompt

This prompt covers **only the New Filing Wizard** (`filing-wizard.tsx`).
It does **not** ask for changes to the Dashboard, Workflow Shell,
Progress bar, or any other page — those were addressed separately and
are not to be re-touched under this prompt unless explicitly restated
here.

This is a **pure UX/presentation simplification task**. It is **not**:
- a request to add new questions,
- a request to remove or auto-guess existing questions,
- a request to change any backend contract, type, or data field,
- a request to change what happens after submission at the data/logic
  level.

If any instruction below seems to conflict with "don't change the
options/questions," the "don't change options/questions" rule always
wins. When unsure, preserve the original question and its original
answer options exactly, and only change how many appear on screen at
once.

---

## 1. Non-negotiable ground rules

1. **Do not invent new questions.** The wizard must ask **exactly** the
   questions that exist in the current production `filing-wizard.tsx` —
   no more, no fewer. (A previous iteration mistakenly added a fake "Are
   you on the Active Taxpayer List (ATL)?" question that does not exist
   in the original file — **this was a mistake and must not happen
   again.** Do not add anything not already present in the current
   backend-facing wizard.)

2. **Do not change any answer option.** Every choice's label, value, and
   meaning (e.g. `"yes" | "no" | "unsure"`, `"single" | "multiple" |
   "unsure"`, `"original" | "revised" | "unsure"`, the income source
   list, the readiness checklist items, business structure options,
   etc.) must remain byte-for-byte identical to what the backend
   currently expects. Zero renames, zero merges, zero removals, zero
   "smart auto-detection" replacing a question the user was previously
   asked directly.

3. **One question (one atomic decision) per screen.** This is the core
   UX fix. Currently several original screens bundle multiple unrelated
   questions together (e.g. one screen asks about employer count,
   services income, foreign income, AOP/company link, profit-on-debt,
   AND filing intent all at once; another screen asks tax year,
   residency, readiness checklist, and shows the document list all
   together). Each of these must be split so that **each screen shows
   exactly one question or one self-contained decision**, with its own
   heading and its own "Next" action.

4. **It is fine — expected — for the total number of steps to increase**
   as a direct result of rule #3. More, smaller, easier steps are the
   goal. Do not try to keep the step count low by cramming questions
   back together.

5. **Add a final "Review your answers" summary screen** immediately
   before the final submit action (the existing "Create Filing"
   button). This screen must:
   - Recap every answer the user gave, in plain readable form,
   - Allow the user to see the filing route/complexity preview (already
     computed live throughout the wizard) one more time,
   - Not introduce any new field — it's a read-only recap of existing
     state,
   - Sit as the very last screen before submission; the "Create Filing"
     button lives here, not on an earlier screen.

6. **Do not change what happens right after "Create Filing" is
   submitted.** A previous iteration incorrectly hard-coded the
   post-submit navigation to skip straight from wizard-completion to
   the Upload step, bypassing whatever the existing Setup
   confirmation/step normally shows. **This must not happen.** The
   wizard component's only job is to call the existing `createAction`
   (or equivalent server action) with the same `FormData` shape as
   before; where the app navigates to next is entirely the receiving
   action's responsibility and must not be forced or assumed inside the
   wizard component. Do not build in any automatic "jump to Upload"
   shortcut — leave post-submit routing exactly as the current
   production behavior defines it.

---

## 2. What "simplify the UX" actually means here

The goal is **only** to make the wizard feel calmer and less
overwhelming to a first-time, non-technical user — nothing about its
underlying behavior, data, or outcomes should change. Concretely:

- Replace dense multi-question forms with **big, single-focus screens**
  — one clear heading, one decision, generous spacing, large tap
  targets.
- Keep a visible, lightweight progress indicator ("Step 4 of 14") so
  the user always knows how far along they are and that the questions
  are short even though there are several.
- Keep the existing live "Your filing route" sidebar/preview so users
  always see the payoff of their answers (unchanged from current
  behavior — do not remove or gate it).
- Use encouraging, plain-language copy (English, with light Roman Urdu
  touches where natural) — but never change the underlying option
  values sent to the backend, only the on-screen label styling/wording
  around them if needed for clarity (and only if it doesn't rename the
  actual value/meaning).
- Animate step transitions subtly (fade/slide) so moving between the
  now-more-numerous small steps feels quick and light, not tedious.

---

## 3. Reference style

Use these two products purely as **visual/UX tone references** — not as
feature sources:

- **EasyTaxOnline.pk** — "Step X of Y" wizard pattern: one clean card per
  screen, simple language, obvious single next action.
- **Expatfile.tax** — minimal, trustworthy, "questionnaire" feel; never
  more than one thing to think about per screen.

The reference is about **pacing and visual calm**, not about copying
any specific question set — TaxRocket's actual questions, options, and
domain language (Amanah, Mizan, Daftar, FBR/Iris terms) must stay
exactly as they are.

---

## 4. Explicit list of questions that must all still exist (unchanged)

For clarity, here is the full current question inventory the wizard
must preserve — this list is descriptive of what already exists, not a
request to add anything new:

1. Who is filing? (Myself / My Business)
2. Choose your business structure (Sole Proprietor / AOP / Company / Tax
   Practitioner) — only shown when "My Business" is chosen
3. What describes your income? (multi-select income sources)
4. Is salary more than 50% of your income? — only shown when salary +
   at least one other income source is selected
5. Do you have a single employer or multiple employers? (Single /
   Multiple / Not sure)
6. Do you have income from professional or freelance services? (Yes /
   No / Not sure)
7. Do you have foreign income or foreign assets? (Yes / No / Not sure)
8. Are you linked to an AOP or company (partner, member, director)?
   (Yes / No / Not sure)
9. Is your profit-on-debt (bank profit) above the high threshold? (Yes /
   No / Not sure)
10. Is this an original or revised return? (Original / Revised / Not
    sure)
11. Tax year (number input)
12. Were you in Pakistan for 183 days or more? (Yes / No / Not sure)
13. Readiness checklist (5 checkbox items — CNIC/NTN, Iris credentials,
    mobile/email, previous return, core documents)
14. Required documents preview (read-only, not a question)

Plus the **new** addition from rule #5 above:

15. Review your answers (read-only summary + the existing "Create
    Filing" submit action)

No item should be added to or removed from this list without an
explicit follow-up instruction.

---

## 5. What NOT to do (explicit anti-patterns from past mistakes)

- ❌ Do not invent new fields/questions not in the list above (e.g. ATL
  status was wrongly added once — never again).
- ❌ Do not silently auto-derive answers to questions the user should
  actually be asked (e.g. don't guess "employer count" or
  "profit-on-debt" from other answers instead of asking).
- ❌ Do not bundle multiple questions back onto one screen to save
  steps — more steps is the accepted tradeoff for simplicity.
- ❌ Do not hard-code any post-submit redirect/skip logic inside the
  wizard component itself.
- ❌ Do not rename, relabel-as-different-value, or restructure any
  FormData field name or option value sent to `createAction`.

---

## 6. Backend contract (must remain identical)

- Component signature: `FilingWizard({ createAction }: { createAction:
  (formData: FormData) => Promise<void> })` — unchanged.
- Every `FormData` key/value written by the wizard (`taxYear`,
  `taxpayerType`, `residencyDaysInPakistan`, `filerType`,
  `businessStructure`, `salaryPercentage`, `employerCount`,
  `hasServicesIncome`, `hasForeignIncomeOrAssets`, `hasAopCompanyLink`,
  `highProfitOnDebt`, `filingIntent`, `incomeSources[]`,
  `readinessCompleted[]`) — unchanged.
- All backend type imports (`TaxIncomeSource`, `TaxReadinessItem`,
  `TaxDraftMetadata`, `evaluateSimplifiedReturnEligibility`,
  `buildTaxDocumentSlotsPreview`,
  `getRequiredTaxDocumentTypesForCurrentFlow`) — used exactly as before,
  no shape changes.

---

## 7. Open items — to be provided in a follow-up message

The user will provide additional requirements in a later message to
extend this prompt. Do not assume or pre-build anything for those areas
yet; wait for explicit instructions.
