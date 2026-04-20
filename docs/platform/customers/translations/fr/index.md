---
title: Customers
description: Comprendre l'objet client de Grida, le format d'import CSV, les champs metadata et le comportement des mises a jour.
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

# Customers

Cet objet represente un client de votre activite. Utilisez-le pour creer des facturations recurrentes, enregistrer les informations de paiement et de contact, et suivre les paiements rattaches a un meme client.

## Objet client

| Nom du champ | Description                              | Obligatoire | format | Exemple                                 | mise a jour | unique          |
| ------------ | ---------------------------------------- | ----------- | ------ | --------------------------------------- | ----------- | --------------- |
| uid          | identifiant client systeme               | Oui         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx    | Non         | Oui             |
| uuid         | votre identifiant unique du client       | Non         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx    | Oui         | Oui (si fourni) |
| name         | nom du client                            | Non         | -      | John Doe                                | Oui         | Non             |
| email        | email du client                          | Non         | email  | user+1@example.com                      | Oui         | Non             |
| phone        | numero de telephone du client            | Non         | E.164  | +14155552671                            | Oui         | Non             |
| description  | description du client                    | Non         | -      | A short description of the customer     | Oui         | Non             |
| tags         | liste des tags associes au client        | Non         | text[] | `["premium", "vip", "new-customer"]`    | Oui         | Non             |
| metadata     | metadata cle/valeur rattachees au client | Non         | json   | `{"my_custom_field_1" : "value", ... }` | Oui         | Non             |

### `uid`

`uid` est l'identifiant unique `uuidv4` genere par le systeme pour le client. Il ne peut pas etre modifie ni fourni par l'utilisateur.

### `uuid`

`uuid` est un identifiant unique du client au format `uuidv4`. Il peut etre fourni par l'utilisateur.
Cela est utile quand le client est cree dans un autre systeme et que vous voulez garder la synchronisation entre les deux systemes.

Utilisez-le pour garantir l'unicite du client dans votre CRM et les fonctionnalites associees.

Par exemple :

- un client issu de votre propre base de donnees
- un client issu de Salesforce

### `phone`

`phone` est le numero de telephone du client au format E.164. Si vous ne savez pas comment formater correctement le numero, vous pouvez utiliser
l'[outil Grida E.164](https://grida.co/tools/e164).

### `tags`

Liste des tags associes au client. Les tags sont geres par projet, peuvent avoir une description et servent a la categorisation, a la segmentation et au filtrage rapide.

Les tags sont crees automatiquement s'ils n'existent pas encore lorsqu'ils sont fournis lors d'une creation ou d'une mise a jour de client.

Exemple :

```json
{
  "tags": ["premium", "vip", "new-customer"]
}
```

- Les tags sont scopes au projet et identifies de maniere unique par leur nom.
- Renommer un tag met automatiquement a jour toutes les associations client-tag.
- Supprimer un tag supprime toutes les associations client-tag. (cela ne supprime pas le client)

> **Note CSV :** Lorsque vous fournissez `tags` dans un fichier CSV, utilisez une chaine separee par des virgules, par exemple `"tag1,tag2,tag3"`. La liste doit etre entouree de guillemets.

En savoir plus sur les [tags](../tags/index.md).

### `metadata`

Ensemble de paires cle-valeur que vous pouvez rattacher a un client. Cela peut servir a stocker des informations supplementaires sur l'objet dans un format structure.

> **Note CSV :** Lorsque vous fournissez `metadata.*` dans un fichier CSV, vous devez fournir l'objet JSON a plat.

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

> **IMPORTANT** : La mise a jour partielle de `metadata` n'est pas prise en charge. Dans toutes les operations, vous devez fournir l'ensemble complet des metadata, y compris les valeurs precedentes.

---

## Travailler avec CSV

Vous pouvez utiliser un fichier CSV pour inserer ou mettre a jour en masse des donnees dans l'objet client Grida.

> L'upsert via fichier CSV n'est pas pris en charge. Utilisez l'API si vous avez besoin d'upsert.

### Description du fichier CSV client

| Nom du champ | Description                            | Obligatoire | format | Exemple                              |
| ------------ | -------------------------------------- | ----------- | ------ | ------------------------------------ |
| uuid         | votre identifiant unique du client     | Non         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | nom du client                          | Non         | -      | John Doe                             |
| email        | email du client                        | Non         | email  | user+1@example.com                   |
| phone        | numero de telephone du client          | Non         | E.164  | +14155552671                         |
| description  | description du client                  | Non         | -      | A short description of the customer  |
| tags         | liste de tags separes par des virgules | Non         | -      | "tag1,tag2,tag3"                     |
| metadata.\*  | metadata du client                     | Non         | -      | value                                |

### Insertion

Lors d'une insertion, vous ne devez fournir que les champs ci-dessous.

| Nom du champ | Description                            | Obligatoire | format | Exemple                              |
| ------------ | -------------------------------------- | ----------- | ------ | ------------------------------------ |
| uuid         | votre identifiant unique du client     | Non         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | nom du client                          | Non         | -      | John Doe                             |
| email        | email du client                        | Non         | email  | user+1@example.com                   |
| phone        | numero de telephone du client          | Non         | E.164  | +14155552671                         |
| description  | description du client                  | Non         | -      | A short description of the customer  |
| tags         | liste de tags separes par des virgules | Non         | -      | "tag1,tag2,tag3"                     |
| metadata.\*  | metadata du client                     | Non         | -      | value                                |

Bien que `uuid` soit facultatif, vous devez le fournir si vous voulez pouvoir mettre a jour ce client plus tard.

- [En savoir plus sur `uuid`](#uuid)
- [En savoir plus sur `metadata`](#metadata)

### Mise a jour (instable)

Pour faire un upsert, vous devez fournir le champ `uid` ou `uuid` dans le fichier CSV.

| Nom du champ | Description           | Obligatoire | format | Exemple                              |
| ------------ | --------------------- | ----------- | ------ | ------------------------------------ |
| uid / uuid   | identifiant unique    | Oui         | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | nom du client         | Non         | -      | John Doe                             |
| email        | email du client       | Non         | email  | user+1@example.com                   |
| phone        | numero de telephone   | Non         | E.164  | +14155552671                         |
| description  | description du client | Non         | -      | A short description of the customer  |
| metadata.\*  | metadata du client    | Non         | -      | value                                |

Lors d'une mise a jour, les champs non fournis ne sont pas modifies.

**Important** : Pour [`metadata`](#metadata), des qu'une valeur est fournie, elle remplace l'ensemble des metadata existantes.

**Important** : Les tags ne peuvent pas etre mis a jour via un fichier CSV. [Contactez le support](https://grida.co/contact) pour plus d'informations.

- [En savoir plus sur `uuid`](#uuid)
- [En savoir plus sur `metadata`](#metadata)
