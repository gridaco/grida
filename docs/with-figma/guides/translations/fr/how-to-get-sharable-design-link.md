---
title: Comment obtenir un lien partageable vers un design Figma
description: Copiez un lien Figma vers une frame ou un fichier pour le partager ou l'utiliser dans des workflows Grida.
keywords:
  - figma
  - share link
  - design link
  - grida
format: md
doc_tasks:
  - update
---

# Comment obtenir un lien partageable vers un design Figma

## Copier un lien vers une frame

1. Ouvrez le fichier Figma et allez a la frame que vous voulez partager.
2. Faites un clic droit sur la frame.
3. Ouvrez **Copy/Paste as**.
4. Selectionnez **Copy link**.

Vous avez maintenant un lien direct vers cette frame. Vous pouvez le partager avec vos collaborateurs ou l'utiliser comme entree dans des workflows Grida.

## Copier un lien vers tout le fichier

1. Ouvrez le fichier Figma.
2. Cliquez sur **Share** en haut a droite.
3. Cliquez sur **Copy link**.

L'URL copiee peut inclure un parametre de requete `node-id`, par exemple :

```txt
https://www.figma.com/file/XXXXXXX/example-file?node-id=0%3A1
```

Si vous voulez un lien vers tout le fichier plutot que vers un noeud specifique, supprimez la partie `?node-id=...` afin que l'URL ressemble a ceci :

```txt
https://www.figma.com/file/XXXXXXX/example-file
```
