# `@/theme/templates/enterprise`

This directory contains **enterprise-specific templates** shipped as React code in the editor bundle.

If you’re adding a reusable, broadly-applicable template, it probably belongs in `@/theme/templates` instead.

## What “enterprise” means in this repo

- **Enterprise**: templates that are **not dynamic** (“no dyn”).
- **Not dynamic**: the template is **highly customized**, but **not fully customizable by end users** (users do not have full control over the React/UI logic).

## How this differs from `@/theme/templates`

- **`@/theme/templates`**: standard templates that most users can agree on and reuse.
- **`@/theme/templates/enterprise`**: templates customized by maintainers for a **small set of enterprise customers**, usually with customer-specific UX and behavior.

## When to put code here

Put code in this directory only when:

- The implementation is **customer-specific** (not a general-purpose template).
- The implementation needs to ship quickly and safely as part of the existing bundle.
- The customization cannot be expressed via the current CMS/template configuration model.

If you’re unsure, prefer `@/theme/templates` and ask in review.

## Contribution guidelines

- **Keep the surface area small**: avoid creating new shared abstractions that become dependencies for standard templates.
- **Avoid copying standard templates** unless necessary; prefer small, isolated deltas.
- **Clearly mark customer-specific assumptions** (copy, flows, limits, integrations).
- **Be conservative with dependencies**: customer templates should not introduce heavy global deps unless justified.

## Why this directory is temporary

Shipping customer-specific React code in our bundle is intentionally treated as a **stopgap**:

- It increases maintenance cost and makes releases riskier.
- It does not scale as customers request divergent behavior.
- It mixes “product” templates with customer-specific implementation details.

The long-term plan is to replace this with **sandboxed, user-authored code** (or an equivalent approach) where we provide **hosting + sandboxing**, rather than hardcoding customer React into the service bundle.

Until that architecture is ready, this folder functions as a **rapid testbed**:

- **Ship first**, validate with customers, then **iterate/fix**.

This is an open source repository: please treat enterprise templates as **temporary compatibility code**, keep them easy to remove, and document intent in PRs.
