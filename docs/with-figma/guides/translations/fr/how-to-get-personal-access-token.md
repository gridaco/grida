---
title: Comment obtenir un token d'accès personnel Figma
description: Générez un token d'accès personnel Figma pour les workflows Grida qui nécessitent un accès direct à l'API Figma.
keywords:
  - figma
  - personal access token
  - api token
  - grida
format: md
doc_tasks:
  - update
---

# Comment obtenir un token d'accès personnel Figma

Suivez ces étapes pour créer un token d'accès personnel dans Figma.

1. Connectez-vous à votre compte Figma.
2. Ouvrez [Figma developers: personal access tokens](https://www.figma.com/developers/api#access-tokens).
3. Cliquez sur **Get personal access token**.
4. Saisissez un libellé pour le token si Figma vous le demande.
5. Copiez la valeur du token et stockez-la dans un endroit sûr.

## Quand vous pouvez avoir besoin de `personalAccessToken`

La plupart des produits Grida utilisent l'authentification Figma intégrée, mais certains workflows ont encore besoin d'un `personalAccessToken` explicite.

Cas fréquents :

- workflows internes ou bêta qui n'ont pas encore adopté le flux OAuth complet
- scripts ou outils qui accèdent directement à l'API Figma
- workflows où vous devez temporairement vous authentifier avec un autre compte Figma

## Note de sécurité

Traitez votre token d'accès personnel comme un mot de passe. Ne le collez pas dans des documents publics, des captures d'écran ou des fils d'issues.
