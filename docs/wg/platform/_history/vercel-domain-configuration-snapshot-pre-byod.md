---
title: Vercel domain configuration snapshot (pre-BYOD)
status: historical
unlisted: true
---

This is a historical snapshot of **Grida-owned** domain configurations in Vercel **before** we introduced **Bring Your Own Domain (BYOD)** support.

- effective date: 2026-02-03
- reference: [PR 515: Grida - Multi-Tenant BYOD - Bring Your Own Domain](https://github.com/gridaco/grida/pull/515)

| Domain                 | Configuration          | Notes             |
| ---------------------- | ---------------------- | ----------------- |
| `grida.app`            | `308 → www.grida.app`  | Redirect          |
| `www.grida.app`        | Production             |                   |
| `*.grida.app`          | Production             | Wildcard          |
| `grida.site`           | `308 → www.grida.site` | Redirect          |
| `www.grida.site`       | Production             |                   |
| `*.grida.site`         | Production             | Wildcard          |
| `demo.grida.co`        | demo                   | Environment alias |
| `canary.grida.co`      | canary                 | Environment alias |
| `grida-app.vercel.app` | `307 → grida.co`       | Redirect          |
| `app.grida.co`         | `301 → grida.co`       | Redirect          |
| `forms.grida.co`       | `301 → grida.co`       | Redirect          |
| `accounts.grida.co`    | `307 → grida.co`       | Redirect          |
| `grida.co`             | Production             |                   |
| `www.grida.co`         | `308 → grida.co`       | Redirect          |
| `bridged.xyz`          | `301 → grida.co`       | Redirect          |
