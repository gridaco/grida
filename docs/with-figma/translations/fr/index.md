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

Grida s'integre naturellement a Figma, ce qui permet aux designers de transferer leur travail entre les deux outils sans friction.

> **⚠️ Important Notice**
>
> L'integration presse-papiers avec Figma repose sur le format interne de Figma, qui peut changer sans preavis. Si le collage depuis Figma cesse de fonctionner, veuillez [signaler un probleme](https://github.com/gridaco/grida/issues/new).

## Fonctionnalites

### Assistant

La documentation Grida Assistant maintenue se trouve maintenant dans cette section :

- [Assistant](./assistant/01-intro.mdx)
- [Design Assistant](./assistant/design-assistant/index.mdx)

### Importer depuis Figma

Copiez des noeuds depuis Figma et collez-les directement dans Grida. L'editeur detecte automatiquement le format du presse-papiers Figma et convertit les noeuds vers le format natif Grida, en preservant :

- la hierarchie et la structure des noeuds
- les proprietes visuelles (fills, strokes, effects, transforms)
- les styles et contenus texte
- les donnees vectorielles et les paths
- les relations entre composants

**En savoir plus** : [Copy & Paste from Figma](../editor/features/copy-paste-figma.md)

### Types de noeuds pris en charge

Grida prend en charge l'import des types de noeuds Figma les plus courants :

- **Conteneurs** : Frames, Components, Component Instances, Sections, Groups
- **Formes** : Rectangles, Ellipses, Lines, Polygons, Stars
- **Vecteurs** : Vector paths, Boolean operations
- **Texte** : Text nodes avec preservation complete du style

### Compatibilite des proprietes

Le pipeline de conversion mappe les proprietes Figma vers leurs equivalents Grida :

- **Effects** : Drop shadows, inner shadows, layer blur, background blur
- **Strokes** : Weight, align, cap, join, dash patterns, miter limit
- **Fills** : Solid colors, gradients (linear, radial, angular, diamond), images
- **Corners** : Radius, smoothing, individual corner radii
- **Transforms** : Position, size, rotation (extraite de la matrice)

## Guides

- [Comment obtenir un token d'acces personnel Figma](./guides/how-to-get-personal-access-token.md)
- [Comment obtenir un lien partageable vers un design Figma](./guides/how-to-get-sharable-design-link.md)
- [Comment enregistrer une copie locale en .fig](./guides/how-to-get-fig-file.md)

## Details techniques

Pour les details d'implementation et l'architecture du pipeline de conversion, voir :

- [Figma Import Technical Spec](../editor/features/copy-paste-figma.md)
- [Figma IO Package Documentation](https://grida.co/docs/reference/io-figma)
