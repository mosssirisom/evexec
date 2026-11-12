# Operator responsibilities (version 1, 12/11/2026)

This is the single statement of who is responsible for what when a business ("the operator") uses the EV Exec booking website, Operator app and Driver App ("the platform"). The operator contract, the operator data terms and the confirmation in the Operator app (Settings → Legal) all use this wording. Change it here first, then bump the version.

Drafted from official UK sources (listed at the end), not by a solicitor. Not legal advice and not a guarantee. What was and was not checked is stated honestly in the last section.

## 1. What the platform is, and is not

1.1 The platform is **software only**: a booking website, an Operator app (dispatch, invoicing, settings) and a Driver App, with the hosting and connections they need.

1.2 The platform provider is **not** a private hire operator, taxi or transport provider. It does not accept, make or fulfil bookings for the operator, is **not a party** to any booking between the operator and its customers, does not provide vehicles or drivers, and does not employ, engage, supervise, train, vet or pay the operator's drivers.

1.3 The platform does not hold, and does not provide, any licence, insurance cover or driver check on the operator's behalf.

1.4 The platform does not check, verify or monitor anything in section 2. Tick boxes, checklists, "gaps" lists and generated documents in the platform only **record what the operator says** or help the operator write it down. They are not a check, a certificate or advice, and the platform provider is not responsible for their accuracy or for anything the operator publishes.

## 2. The operator is solely responsible for

2.1 **Licensing.** Holding every operator, driver and vehicle licence the law of the place it operates requires, keeping them current, and following the conditions of the licensing authority that issued them. Examples of the law that applies (each operator must find out which applies to it):
- England and Wales outside London: Local Government (Miscellaneous Provisions) Act 1976, s.46 (no operating, driving or using a private hire vehicle without the matching licence) and s.55 (operator licence).
- London: Private Hire Vehicles (London) Act 1998 (operator licence s.2, vehicle licence s.6, driver licence s.12).
- Northern Ireland: Taxis Act (Northern Ireland) 2008.
- Scotland: the Civic Government (Scotland) Act 1982 (not verified in the review; the operator must check).

2.2 **Using only licensed drivers and vehicles.** Dispatching a booking only to a driver and vehicle licensed by the licensing authority the law requires. The Department for Transport's statutory standards say the operator fulfilling a booking must use vehicles and drivers licensed by the same authority. The operator must not use the platform to send a booking to anyone who does not hold the right licences.

2.3 **Insurance.** Making sure every vehicle used for its bookings has the insurance the law and its licence require, including cover for hire or reward, and holding public liability and any employer's liability cover it needs. It is an offence to use, or to cause or permit another to use, a motor vehicle on a road without the required insurance (Road Traffic Act 1988, s.143).

2.4 **Drivers.** Choosing, checking and supervising its drivers: identity, right to work, driving licence, criminal-record checks at the level its licensing authority requires, fitness, training, working time, and keeping the checks up to date. Driver details held in the platform are the operator's own records.

2.5 **Vehicles.** Safety, roadworthiness, testing, plates and presentation of every vehicle it uses.

2.6 **Records and conditions.** Keeping the booking and staff records its licensing authority requires, for as long as it requires. The DfT standards expect operators to keep booking records for at least six months; the council's own conditions decide.

2.7 **Customers and bookings.** Its own terms, prices, cancellation charges, refunds, complaints, claims, accessibility and equality duties (including assistance dogs), and compliance with consumer law. The platform's terms and cancellation templates are a starting point the operator adopts and answers for.

2.8 **Data protection.** Being the controller of its customers' and drivers' personal data: lawful basis, a correct privacy notice, rights requests, security of its own staff's access, and paying the ICO data protection fee unless exempt. The platform acts as its processor under the operator data terms.

2.9 **Payments and tax.** Its own Stripe account, receipts, VAT, accounts and tax. Payments go to the operator's own account; the platform provider is not responsible for chargebacks, refunds or disputes.

2.10 **What it says.** Everything it publishes or sends to its customers through the platform (statements such as "fully insured" or "DBS checked", prices, licence numbers) must be true.

## 3. Confirmation and consequences

3.1 The operator confirms section 2 in the Operator app (Settings → Legal). The confirmation, its version and time are recorded. Customer-facing statements about insurance and driver checks are only generated after the operator has confirmed them.

3.2 The platform provider may suspend an operator that appears to be dispatching unlicensed drivers or vehicles, or to be uninsured, and is not liable for doing so.

3.3 The operator is responsible for all claims, fines, losses and costs arising from its own breach of section 2, and must reimburse the platform provider for any it suffers because of that breach, to the extent the law allows. (A business-to-business term like this must be reasonable under the Unfair Contract Terms Act 1977, which was **not** read in the review; see below.)

## 4. Where this wording is used

- Operator Settings → Legal: a confirmation of section 2 (field `brand.legal.responsibilities_confirmed`, with `_at` and `_version`).
- Customer terms template: when the booking system provider is named, a final section states that the provider is not a party to the booking and the operator is responsible for the service.
- Operator data terms (`operator-data-terms.md`): "Roles".
- The operator contract (still to be drafted): this document is its schedule.

## 5. Sources and honest limits

Read in full or in part from legislation.gov.uk and gov.uk on 12/11/2026:
- Local Government (Miscellaneous Provisions) Act 1976 s.46 and s.55 (loaded; the operator-licence duty and the prohibition on operating, using or driving without licences; operators must not use unlicensed vehicles or drivers).
- Private Hire Vehicles (London) Act 1998: table of contents only (sections 2, 6 and 12 identified).
- Taxis Act (Northern Ireland) 2008: table of contents only (it uses "taxi" terms).
- Road Traffic Act 1988 s.143 (insurance).
- DfT statutory taxi and private hire vehicle standards (the "same authority" sentence and the 3-year and 5-year licence lengths were read as text; the DBS and record-keeping points come from a summary of the later sections and must be read in full before being relied on).

Not verified, so not stated as fact above: the gov.uk DBS eligibility page (not found), the Scottish licensing sections (page would not load), the Unfair Contract Terms Act 1977, and what any particular council requires. Each operator must read its own licensing authority's conditions.
