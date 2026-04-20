---
title: Clients
description: Comprendre l'objet client de Grida, le format d'import CSV, les champs metadata et le comportement des mises à jour.
keywords:
  - grida
  - platform
  - customers
  - csv import
  - metadata
doc_tasks:
  - enhance
format: md
---

# Clients

Cet objet représente un client de votre activité. Utilisez-le pour créer des facturations récurrentes, enregistrer les informations de paiement et de contact, et suivre les paiements rattachés à un même client.

## Objet client

| Nom du champ | Description                              | Obligatoire | format | Exemple                                 | mise à jour | unique          |
| ------------ | ---------------------------------------- | ----------- | ------ | --------------------------------------- | ----------- | --------------- |
| uid          | identifiant client système               | Oui         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx    | Non         | Oui             |
| uuid         | votre identifiant unique du client       | Non         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx    | Oui         | Oui (si fourni) |
| name         | nom du client                            | Non         | -      | John Doe                                | Oui         | Non             |
| email        | email du client                          | Non         | email  | user+1@example.com                      | Oui         | Non             |
| phone        | numéro de téléphone du client            | Non         | E.164  | +14155552671                            | Oui         | Non             |
| description  | description du client                    | Non         | -      | A short description of the customer     | Oui         | Non             |
| tags         | liste des tags associés au client        | Non         | text[] | `["premium", "vip", "new-customer"]`    | Oui         | Non             |
| metadata     | metadata clé/valeur rattachées au client | Non         | json   | `{"my_custom_field_1" : "value", ... }` | Oui         | Non             |

### `uid`

`uid` est l'identifiant unique `uuidv4` généré par le système pour le client. Il ne peut pas être modifié ni fourni par l'utilisateur.

### `uuid`

`uuid` est un identifiant unique du client au format `uuidv4`. Il peut être fourni par l'utilisateur.
Cela est utile quand le client est créé dans un autre système et que vous voulez garder la synchronisation entre les deux systèmes.

Utilisez-le pour garantir l'unicité du client dans votre CRM et les fonctionnalités associées.

Par exemple :

- un client issu de votre propre base de données
- un client issu de Salesforce

### `phone`

`phone` est le numéro de téléphone du client au format E.164. Si vous ne savez pas comment formater correctement le numéro, vous pouvez utiliser
l'[outil Grida E.164](https://grida.co/tools/e164).

### `tags`

Liste des tags associés au client. Les tags sont gérés par projet, peuvent avoir une description et servent à la catégorisation, à la segmentation et au filtrage rapide.

Les tags sont créés automatiquement s'ils n'existent pas encore lorsqu'ils sont fournis lors d'une création ou d'une mise à jour de client.

Exemple :

```json
{
  "tags": ["premium", "vip", "new-customer"]
}
```

- Les tags sont scoped au projet et identifiés de manière unique par leur nom.
- Renommer un tag met automatiquement à jour toutes les associations client-tag.
- Supprimer un tag supprime toutes les associations client-tag. (cela ne supprime pas le client)

> **Note CSV :** Lorsque vous fournissez `tags` dans un fichier CSV, utilisez une chaîne séparée par des virgules, par exemple `"tag1,tag2,tag3"`. La liste doit être entourée de guillemets.

En savoir plus sur les [tags](../tags/index.md).

### `metadata`

Ensemble de paires clé-valeur que vous pouvez rattacher à un client. Cela peut servir à stocker des informations supplémentaires sur l'objet dans un format structuré.

> **Note CSV :** Lorsque vous fournissez `metadata.*` dans un fichier CSV, vous devez fournir l'objet JSON à plat.

Par exemple, si vous voulez importer :

```json
{
  "my_custom_field_1": "value 1",
  "my_custom_field_2": "value 2"
}
```

Vous devez fournir les valeurs suivantes dans le CSV.

```csv
metadata.my_custom_field_1,metadata.my_custom_field_2
value 1,value 2
```

> **IMPORTANT** : La mise à jour partielle de `metadata` n'est pas prise en charge. Dans toutes les opérations, vous devez fournir l'ensemble complet des metadata, y compris les valeurs précédentes.

---

## Travailler avec CSV

Vous pouvez utiliser un fichier CSV pour insérer ou mettre à jour en masse des données dans l'objet client Grida.

> L'upsert via fichier CSV n'est pas pris en charge. Utilisez l'API si vous avez besoin d'upsert.

### Description du fichier CSV client

| Nom du champ | Description                            | Obligatoire | format | Exemple                              |
| ------------ | -------------------------------------- | ----------- | ------ | ------------------------------------ |
| uuid         | votre identifiant unique du client     | Non         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | nom du client                          | Non         | -      | John Doe                             |
| email        | email du client                        | Non         | email  | user+1@example.com                   |
| phone        | numéro de téléphone du client          | Non         | E.164  | +14155552671                         |
| description  | description du client                  | Non         | -      | A short description of the customer  |
| tags         | liste de tags séparés par des virgules | Non         | -      | "tag1,tag2,tag3"                     |
| metadata.\*  | metadata du client                     | Non         | -      | value                                |

### Insertion

Lors d'une insertion, vous ne devez fournir que les champs ci-dessous.

| Nom du champ | Description                            | Obligatoire | format | Exemple                              |
| ------------ | -------------------------------------- | ----------- | ------ | ------------------------------------ |
| uuid         | votre identifiant unique du client     | Non         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | nom du client                          | Non         | -      | John Doe                             |
| email        | email du client                        | Non         | email  | user+1@example.com                   |
| phone        | numéro de téléphone du client          | Non         | E.164  | +14155552671                         |
| description  | description du client                  | Non         | -      | A short description of the customer  |
| tags         | liste de tags séparés par des virgules | Non         | -      | "tag1,tag2,tag3"                     |
| metadata.\*  | metadata du client                     | Non         | -      | value                                |

Bien que `uuid` soit facultatif, vous devez le fournir si vous voulez pouvoir mettre à jour ce client plus tard.

- [En savoir plus sur `uuid`](#uuid)
- [En savoir plus sur `metadata`](#metadata)

### Mise à jour (instable)

Pour faire un upsert, vous devez fournir le champ `uid` ou `uuid` dans le fichier CSV.

| Nom du champ | Description           | Obligatoire | format | Exemple                              |
| ------------ | --------------------- | ----------- | ------ | ------------------------------------ |
| uid / uuid   | identifiant unique    | Oui         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | nom du client         | Non         | -      | John Doe                             |
| email        | email du client       | Non         | email  | user+1@example.com                   |
| phone        | numéro de téléphone   | Non         | E.164  | +14155552671                         |
| description  | description du client | Non         | -      | A short description of the customer  |
| metadata.\*  | metadata du client    | Non         | -      | value                                |

Lors d'une mise à jour, les champs non fournis ne sont pas modifiés.

**Important** : Pour [`metadata`](#metadata), dès qu'une valeur est fournie, elle remplace l'ensemble des metadata existantes.

**Important** : Les tags ne peuvent pas être mis à jour via un fichier CSV. [Contactez le support](https://grida.co/contact) pour plus d'informations.

- [En savoir plus sur `uuid`](#uuid)
- [En savoir plus sur `metadata`](#metadata)
