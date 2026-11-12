# Data processing terms for operators (draft, 12/11/2026)

**Status: draft template, not legal advice. No solicitor is used (owner decision).** Drafted from Article 28 of the UK GDPR (legislation.gov.uk, UK GDPR Art 28(3)). Every item below is a requirement the law sets for a controller and processor contract, and each one is covered. Before use, the owner must fill in the placeholders in square brackets and confirm the sub-processor list.

## 1. Who is who

- **Controller:** the operator (the business that takes the booking and owns the customer relationship).
- **Processor:** [Platform owner's legal name and trading name], which provides the booking, dispatch, invoicing and app platform the operator uses.
- Each operator is a controller in its own right. The platform only processes data on the operator's instructions.

## 2. Subject matter, duration, nature and purpose (Art 28(3)(a))

- **Subject matter:** providing the booking, dispatch, driver, invoicing and customer messaging service to the operator.
- **Duration:** for as long as the operator uses the platform, and for any retention the operator requires under its own legal duties after that.
- **Nature and purpose:** storing, organising, displaying, sending and deleting the operator's booking, customer, driver and invoice records, as the operator instructs through the platform.

## 3. Types of personal data and people (Art 28(3)(a))

- **People:** the operator's customers, the operator's staff and office users, the operator's drivers, and people who send enquiries or quote requests.
- **Data:** names; phone numbers; email addresses; pickup and drop-off addresses; travel dates and times; flight numbers; passenger and luggage counts; payment status and a payment reference (card details are never stored by the platform, they are taken by Stripe); invoices; driver names, contact details and vehicle details; account login details (encrypted).

## 4. The processor's obligations (Art 28(3)(a)–(h))

The processor will:

a. **Act only on documented instructions** from the operator, including about transfers outside the UK, unless the law requires otherwise (in which case it tells the operator first, unless the law forbids it).

b. **Keep people sworn to confidentiality.** Anyone who handles the data is bound by a duty of confidence.

c. **Keep the data secure (Art 32).** Encryption in transit; access limited to each business's own staff and drivers through role-based rules; per-business isolation in the database; regular security reviews; no data shared between businesses.

d. **Use sub-processors only as listed in section 6, or as the operator agrees.** The processor puts the same data protection terms on each sub-processor and stays responsible for them. The operator is told before a new sub-processor is added, and may object on reasonable grounds.

e. **Help the operator answer people's rights requests (Art 28(3)(e)).** Access, correction, erasure, restriction, portability and objection. The processor provides the tools, and responds to the operator's requests within [five] working days.

f. **Help with security, breach notification and impact assessments (Art 28(3)(f)).** The processor notifies the operator of a personal data breach without undue delay, and in any case within [24 hours] of becoming aware of it, with the information the operator needs to meet its own 72-hour duty to report to the ICO.

g. **Delete or return the data at the end (Art 28(3)(g)).** When the operator leaves, the processor returns the data in a standard format or deletes it, as the operator chooses, within [30] days. Records the operator must keep under its own legal duties (such as six years of invoices) are kept by the operator's export, or retained until the period ends, as the operator decides.

h. **Make information available and allow audits (Art 28(3)(h)).** The processor provides the information needed to show compliance and allows reasonable checks by the operator or its auditor, on [30] days' notice, no more than once a year unless a breach has occurred.

## 5. The operator's obligations

- Give lawful instructions and keep its own privacy notice accurate. The operator's privacy policy must name the platform as a processor, using the standard policy's section on who we share data with.
- Hold its own ICO registration if required, and pay the ICO fee where it applies.
- Make sure its own customers, staff and drivers are told how their data is used.
- Confirm in writing that it holds the insurance and DBS checks it states in its terms (see the Legal section in its Settings).

## 6. Sub-processors (the list the operator agrees to)

| Service | What it does | Where data is held | Transfer safeguard |
|---|---|---|---|
| Supabase | Database, sign-in and file storage | Frankfurt, Germany (EEA) | Within the EEA (UK adequacy) |
| Vercel | Website and app hosting | [Confirm current region and transfer basis] | UK–US data bridge or contract clauses |
| Resend | Sends emails | [Confirm] | UK–US data bridge or contract clauses |
| Google | Address search in the booking form (Maps); analytics only if the customer accepts | [Confirm] | UK–US data bridge or contract clauses |
| AeroDataBox | Flight times (flight number and date only); off by default | [Confirm] | [Confirm] |

Stripe is not a sub-processor of the platform: each operator connects its own Stripe account, so Stripe holds card payment data as the operator's own provider.

## 7. International transfers

Where data leaves the UK, it is protected by the UK–US data bridge or the UK's approved contract clauses (the International Data Transfer Agreement or Addendum). The processor keeps those in place for every sub-processor that needs them.

## 8. Liability and governing law

- Each party is responsible for its own part of the processing, as the UK GDPR sets out.
- This agreement is governed by the laws of England and Wales unless the operator is based in Scotland or Northern Ireland, in which case that jurisdiction applies.

## 9. Signing

- Operator: [legal name], by [name, role], signature, date (DD/MM/YYYY).
- Processor: [legal name], by [name, role], signature, date (DD/MM/YYYY).

## What the owner must fill in or check before use

1. The processor's legal name and trading name (section 1).
2. The breach notice period (24 hours is proposed) and the response times (five working days, 30 days) in sections 4e, 4g and 4h.
3. The sub-processor table: confirm the hosting regions and transfer basis for Vercel, Resend, Google and AeroDataBox (section 6).
4. A decision on whether card payments need anything extra here, since Stripe is the operator's own provider.
