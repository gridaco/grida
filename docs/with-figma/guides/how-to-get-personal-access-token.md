---
title: How to get a Figma personal access token
description: Generate a Figma personal access token for Grida workflows that require direct Figma API access.
keywords:
  - figma
  - personal access token
  - api token
  - grida
format: md
doc_tasks:
  - update
---

# How to get a Figma personal access token

Follow these steps to create a personal access token in Figma.

1. Sign in to your Figma account.
2. Open [Figma developers: personal access tokens](https://www.figma.com/developers/api#access-tokens).
3. Click **Get personal access token**.
4. Enter a label for the token if Figma prompts you.
5. Copy the token value and store it somewhere secure.

## When you may need `personalAccessToken`

Most Grida products use built-in Figma authentication, but some workflows still need an explicit `personalAccessToken`.

Common cases:

- internal or beta workflows that have not yet adopted the full OAuth flow
- scripts or tools that access the Figma API directly
- workflows where you temporarily need to authenticate against a different Figma account

## Security note

Treat your personal access token like a password. Do not paste it into public documents, screenshots, or issue threads.
