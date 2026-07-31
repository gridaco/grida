---
id: TC-BILLING-OFFER-003
title: Custom organization stays outside self-service subscription lifecycle
module: billing
area: offer
tags: [custom, stripe, checkout, organization]
status: untested
severity: high
date: 2026-07-31
updated: 2026-07-31
automatable: partial
covered_by: []
---

## Behavior

An organization classified as Custom presents its agreement-defined plan and
keeps invoice and payment-method history readable. It does not expose a
self-service Pro checkout or cancellation path because price, interval, and
lifecycle are managed by the agreement. A forged standard checkout request
must fail before Stripe is mutated.

## Steps

1. In the test-only environment, set `organization.is_enterprise=true` for an
   organization that has a linked Stripe customer.
2. Open the organization's billing settings.
3. Expected: the plan is **Custom**, its price is **Agreement-defined**, and
   the primary action is **Contact Grida**. Existing invoices and the linked
   Stripe customer's payment-method update remain available; standard
   subscription cancel and resume actions are absent.
4. Open the organization's `/settings/billing/upgrade` URL directly.
5. Expected: the route sends the user to Contact rather than presenting Pro
   checkout.
6. Submit a Pro-monthly subscribe action for the Custom organization through
   the test harness.
7. Expected: it fails with `custom_managed`; no Checkout Session,
   subscription, or local billing mutation is created.
8. Submit cancel and resume actions for the Custom organization through the
   test harness.
9. Expected: both fail with `custom_managed` before Stripe is mutated.

## Notes

`organization.is_enterprise` is the existing operational flag presented as
Custom. Custom commercial terms remain outside the standard plan catalogue.
