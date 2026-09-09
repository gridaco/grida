---
title: Grida CLI account and credits
description: Inspect your Grida account, organization memberships, and cached AI credit balance from the CLI.
keywords: [grida, cli, account, organizations, credits]
sidebar_label: Account
sidebar_position: 3
tags: [cli]
format: md
---

# Grida CLI account and credits

Account commands require a [Grida CLI session](./auth.md) and a connection.
They use your Grida account independently of Desktop. The local auth fixture
is an explicit development option, not the default account configuration.

## View your account

```sh
grida account view
grida account view --json
```

View returns your identity and organization memberships, including an empty
membership list. It never starts login itself. Reads use your existing account
permissions.

## Check credits

```sh
grida account credits --org studio
grida account credits --org studio --json
```

Replace `studio` with an organization slug from `account view`. Select a numeric
ID with `--org-id` instead. The selectors are mutually exclusive; a numeric slug
supplied through `--org` remains a slug.

Omit the selector only when you belong to exactly one organization. Otherwise
the error lists your choices. Desktop's selected organization is not used.

Credits are a cached estimate, reported in USD cents with cache metadata and
cached eligibility. Unknown balance, missing billing account, and zero remain
distinct. The timestamp may include estimated usage deductions; it is not proof
of a recent provider reconciliation. Generation checks current access separately.

This command never provisions billing, purchases credits, or manages
subscriptions, invoices, or payment methods. BYOK is billed by its provider and
is not represented by this Grida credit balance.
