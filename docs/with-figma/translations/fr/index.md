---
title: Grida avec Figma
description: Apprenez comment Grida fonctionne avec Figma, y compris les docs Assistant, les workflows d'import et les guides pratiques de configuration.
keywords:
  - grida
  - figma
  - import
  - assistant
  - design workflow
format: md
doc_tasks:
  - update
---

# Grida avec Figma

Grida s'intègre naturellement à Figma, ce qui permet aux designers de transférer leur travail entre les deux outils sans friction.

> **⚠️ Important**
>
> L'intégration presse-papiers avec Figma repose sur le format interne de Figma, qui peut changer sans préavis. Si le collage depuis Figma cesse de fonctionner, veuillez [signaler un problème](https://github.com/gridaco/grida/issues/new).

## Fonctionnalités

### Assistant

La documentation Grida Assistant maintenue se trouve maintenant dans cette section :

- [Assistant](./assistant/01-intro.mdx)
- [Design Assistant](./assistant/design-assistant/index.mdx)

### Importer depuis Figma

Copiez des nœuds depuis Figma et collez-les directement dans Grida. L'éditeur détecte automatiquement le format du presse-papiers Figma et convertit les nœuds vers le format natif Grida, en préservant :

- la hiérarchie et la structure des nœuds
- les propriétés visuelles (fills, strokes, effects, transforms)
- les styles et contenus texte
- les données vectorielles et les paths
- les relations entre composants

**En savoir plus** : [Copy & Paste from Figma](../editor/features/copy-paste-figma.md)

### Types de nœuds pris en charge

Grida prend en charge l'import des types de nœuds Figma les plus courants :

- **Conteneurs** : Frames, Components, Component Instances, Sections, Groups
- **Formes** : Rectangles, Ellipses, Lines, Polygons, Stars
- **Vecteurs** : Vector paths, Boolean operations
- **Texte** : Text nodes avec préservation complète du style

### Compatibilité des propriétés

Le pipeline de conversion mappe les propriétés Figma vers leurs équivalents Grida :

- **Effects** : Drop shadows, inner shadows, layer blur, background blur
- **Strokes** : Weight, align, cap, join, dash patterns, miter limit
- **Fills** : Solid colors, gradients (linear, radial, angular, diamond), images
- **Corners** : Radius, smoothing, individual corner radii
- **Transforms** : Position, size, rotation (extraite de la matrice)

## Guides

- [Comment obtenir un token d'accès personnel Figma](./guides/how-to-get-personal-access-token.md)
- [Comment obtenir un lien partageable vers un design Figma](./guides/how-to-get-sharable-design-link.md)
- [Comment enregistrer une copie locale en `.fig`](./guides/how-to-get-fig-file.md)

## Détails techniques

Pour les détails d'implémentation et l'architecture du pipeline de conversion, voir :

- [Figma Import Technical Spec](../editor/features/copy-paste-figma.md)
- [Figma IO Package Documentation](https://grida.co/docs/reference/io-figma)
