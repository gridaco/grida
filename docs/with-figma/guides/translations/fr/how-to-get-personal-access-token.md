---
title: Comment obtenir un token d'acces personnel Figma
description: Generez un token d'acces personnel Figma pour les workflows Grida qui necessitent un acces direct a l'API Figma.
keywords:
  - figma
  - personal access token
  - api token
  - grida
format: md
doc_tasks:
  - update
---

# Comment obtenir un token d'acces personnel Figma

Suivez ces etapes pour creer un token d'acces personnel dans Figma.

1. Connectez-vous a votre compte Figma.
2. Ouvrez [Figma developers: personal access tokens](https://www.figma.com/developers/api#access-tokens).
3. Cliquez sur **Get personal access token**.
4. Saisissez un libelle pour le token si Figma vous le demande.
5. Copiez la valeur du token et stockez-la dans un endroit sur.

## Quand vous pouvez avoir besoin de `personalAccessToken`

La plupart des produits Grida utilisent l'authentification Figma integree, mais certains workflows ont encore besoin d'un `personalAccessToken` explicite.

Cas frequents :

- workflows internes ou beta qui n'ont pas encore adopte le flux OAuth complet
- scripts ou outils qui accedent directement a l'API Figma
- workflows ou vous devez temporairement vous authentifier avec un autre compte Figma

## Note de securite

Traitez votre token d'acces personnel comme un mot de passe. Ne le collez pas dans des documents publics, des captures d'ecran ou des fils d'issues.
