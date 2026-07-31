---
title: Billing plans
description: The commercial offer and legacy-compatibility contract for Grida billing.
tags:
  - internal
  - wg
  - platform
  - billing
status: approved
format: md
---

# Billing plans

This document defines Grida's commercial plan model. It separates what a new
customer can buy from historical billing states that the service must continue
to understand.

## Vocabulary

- A **public plan** is an offer shown to a prospective customer.
- A **standard subscription** is a self-service recurring purchase with common
  terms for every customer.
- A **Custom agreement** is fulfilled through sales and may use bespoke
  commercial terms.
- A **legacy billing state** is no longer sold but remains readable for
  invoices, cancellation, support, and historical events.

These concepts are intentionally separate. Removing an offer from sale must not
make an existing billing state unreadable.

## Current commercial contract

| Plan   |   Price | Billing interval  | Billing subject | Fulfillment               |
| ------ | ------: | ----------------- | --------------- | ------------------------- |
| Free   |      $0 | None              | Organization    | Self-service              |
| Pro    | $20 USD | Monthly           | Organization    | Self-service subscription |
| Custom | Bespoke | Agreement-defined | Organization    | Sales-led                 |

The following invariants apply:

1. Pro monthly is the only standard recurring subscription available for new
   purchase.
2. A Pro subscription covers one organization. Membership changes do not alter
   its quantity or base price.
3. Team and annual subscriptions are not offered for new purchase.
4. Custom is not a self-service plan selector. Its price, billing schedule,
   deployment, support, and other terms are defined by an agreement.
5. No public plan includes a recurring AI-credit grant unless a future contract
   explicitly introduces one.

## AI credit

AI credit is purchased separately from the standard plan price.

- An organization may manually purchase between $10 and $500 of credit in one
  checkout.
- Checkout shows the credit amount and the additional processing charge before
  payment.
- Automatic reload is available only while the organization has an active paid
  subscription.
- A plan name must not be used as a proxy for an AI-credit balance.

Custom agreements may define different AI-credit terms.

## Subscription lifecycle

Pro renews monthly until canceled. Cancellation takes effect at the end of the
current paid period. Custom lifecycle terms come from the applicable agreement.

Standard subscription mutations enter Stripe through owner-authorized,
intent-scoped Portal sessions created by the app. Stripe's shareable Portal
login page remains disabled so it cannot bypass the Custom lifecycle guard.

## Legacy compatibility

Team and annual identifiers remain valid legacy billing states. Systems that
display subscriptions, process historical events, provide invoices, or support
cancellation must continue to read them accurately.

Legacy compatibility does not make an offer saleable. New purchase and
plan-change actions must accept only Pro monthly.

## Conformance

A customer-facing surface conforms to this contract when it:

- presents exactly Free, Pro, and Custom;
- quotes Pro as $20 per organization per month;
- offers no Team or annual purchase path;
- routes Custom to sales rather than standard checkout; and
- makes no recurring AI-credit promise.
