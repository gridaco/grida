---
title: Tags
description: Comprendre le fonctionnement des tags dans Grida pour la catégorisation, la segmentation et le filtrage.
keywords:
  - grida
  - platform
  - tags
  - categorization
  - filtering
format: md
---

# Tags

Les tags sont des étiquettes utilisées pour catégoriser, segmenter et filtrer les ressources de votre projet. Ils vous aident à organiser vos données de façon claire et flexible.

## Structure d'un tag

Un tag se compose de :

| Champ         | Description                               | Obligatoire | Format | Exemple                  |
| ------------- | ----------------------------------------- | ----------- | ------ | ------------------------ |
| `name`        | identifiant unique du tag                 | Oui         | text   | `"premium-user"`         |
| `color`       | indicateur visuel pour le tag             | Non         | hex    | `"#ff0000"`              |
| `description` | contexte ou détails optionnels sur le tag | Non         | text   | `"High-value customers"` |

## Fonctionnalités

- **Scope projet :** les tags sont uniques dans le contexte d'un projet.
- **Création automatique :** les tags sont créés automatiquement s'ils n'existent pas quand vous les associez à une ressource.
- **Gestion simple :** renommer un tag met automatiquement à jour toutes les références associées.

## Exemple d'utilisation

Lorsque vous associez des tags à une ressource, utilisez la structure suivante :

```json
{
  "tags": ["premium-user", "new-customer", "vip"]
}
```

## Bonnes pratiques

- Utilisez des noms clairs et descriptifs pour les identifier facilement.
- Utilisez les couleurs pour distinguer visuellement les catégories de tags.
- Revoyez et nettoyez régulièrement vos tags pour garder votre projet organisé.

## Ressources prises en charge

Actuellement, les tags sont pris en charge pour les ressources suivantes :

- [**Clients**](../customers/index.md) : organisez, segmentez et gérez efficacement vos clients avec des tags.
