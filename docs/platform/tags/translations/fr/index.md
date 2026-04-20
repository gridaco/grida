---
title: Tags
description: Comprendre le fonctionnement des tags dans Grida pour la categorisation, la segmentation et le filtrage.
keywords:
  - grida
  - platform
  - tags
  - categorization
  - filtering
format: md
---

# Tags

Les tags sont des etiquettes utilisees pour categoriser, segmenter et filtrer les ressources de votre projet. Ils vous aident a organiser vos donnees de facon claire et flexible.

## Structure d'un tag

Un tag se compose de :

| Champ         | Description                               | Obligatoire | Format | Exemple                  |
| ------------- | ----------------------------------------- | ----------- | ------ | ------------------------ |
| `name`        | identifiant unique du tag                 | Oui         | text   | `"premium-user"`         |
| `color`       | indicateur visuel pour le tag             | Non         | hex    | `"#ff0000"`              |
| `description` | contexte ou details optionnels sur le tag | Non         | text   | `"High-value customers"` |

## Fonctionnalites

- **Scope projet :** les tags sont uniques dans le contexte d'un projet.
- **Creation automatique :** les tags sont crees automatiquement s'ils n'existent pas quand vous les associez a une ressource.
- **Gestion simple :** renommer un tag met automatiquement a jour toutes les references associees.

## Exemple d'utilisation

Lorsque vous associez des tags a une ressource, utilisez la structure suivante :

```json
{
  "tags": ["premium-user", "new-customer", "vip"]
}
```

## Bonnes pratiques

- Utilisez des noms clairs et descriptifs pour les identifier facilement.
- Utilisez les couleurs pour distinguer visuellement les categories de tags.
- Revoyez et nettoyez regulierement vos tags pour garder votre projet organise.

## Ressources prises en charge

Actuellement, les tags sont pris en charge pour les ressources suivantes :

- [**Customer**](../customers/index.md) : organisez, segmentez et gerez efficacement vos clients avec des tags.
