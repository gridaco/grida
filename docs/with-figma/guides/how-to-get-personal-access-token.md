---
title: "How to get Figma Personal Access Token"
version: 0.1.0
revision: 1
---

# Getting Personal Access Token from Figma

Follow the steps below to get a personal access token.

1. Sign in to your Figma account.
2. Visit https://www.figma.com/developers/api#access-tokens
3. Click `"+ Get personal access token"
4. Copy the value when present.

## Why will I need explicit `personalAccessToken`?

Most of the Grida products have figma authentication flow in-the-box, but if you are a insider, or beta products user, or want to dynamically use other's account to access the design, you'll need to use `personalAccessToken` to authenticate.
