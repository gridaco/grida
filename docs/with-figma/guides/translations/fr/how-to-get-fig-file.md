---
title: Comment enregistrer une copie locale `.fig` depuis Figma
description: Téléchargez un fichier `.fig` local depuis Figma afin de pouvoir l'importer dans Grida.
keywords:
  - figma
  - fig file
  - import
  - grida
format: md
doc_tasks:
  - update
---

# Comment enregistrer une copie locale `.fig` depuis Figma

Ce guide explique comment télécharger un fichier `.fig` depuis Figma pour l'importer dans Grida.

> **Note:** Le format de fichier `.fig` est propriétaire et peut changer sans préavis. Si vous rencontrez des problèmes lors de l'import de fichiers `.fig`, veuillez [nous les signaler](https://github.com/gridaco/grida/issues) ou contacter le support. Vos retours nous aident à maintenir les imports opérationnels.

## Prérequis

- Vous devez avoir au moins l'accès **can view** au fichier
- Le propriétaire du fichier ne doit pas avoir restreint la copie et le partage
- Si vous ne voyez pas l'option **Save local copy**, contactez le propriétaire du fichier

## Dans Figma Desktop ou Web

1. Ouvrez votre fichier Figma
2. Cliquez sur **Main menu** (coin supérieur gauche)
3. Allez dans **File -> Save local copy...**
4. Choisissez un emplacement sur votre ordinateur
5. Cliquez sur **Save**

Le fichier sera enregistré avec l'extension `.fig` (fichiers Figma Design).

## Emplacement du fichier selon le système d'exploitation

Après l'enregistrement, vous trouverez vos fichiers `.fig` à l'emplacement que vous avez choisi :

**macOS**

- Dossier Téléchargements par défaut : `~/Downloads/`
- Emplacements personnalisés : partout où vous avez choisi de l'enregistrer

**Windows**

- Dossier Téléchargements par défaut : `C:\Users\YourUsername\Downloads\`
- Emplacements personnalisés : partout où vous avez choisi de l'enregistrer

**Linux**

- Dossier Téléchargements par défaut : `~/Downloads/`
- Emplacements personnalisés : partout où vous avez choisi de l'enregistrer

## Que contient un fichier `.fig` ?

Un fichier `.fig` contient :

- toutes les pages (canvases) de votre document Figma
- la hiérarchie complète des nœuds avec leurs propriétés
- les données vectorielles, fills, strokes et effects
- le contenu texte et sa mise en forme
- les définitions de composants et leurs instances

**Non inclus :**

- l'historique des versions
- les commentaires
- le lien avec le fichier d'origine (le fichier importé est traité comme un nouveau fichier)

## Importer dans Grida

Une fois que vous avez un fichier `.fig` :

1. Ouvrez Grida Canvas playground
2. Cliquez sur le menu du logo (en haut à gauche)
3. Sélectionnez **Import Figma**
4. Dans l'onglet **.fig File**, cliquez sur **Select .fig File**
5. Choisissez votre fichier `.fig` téléchargé
6. Vérifiez les pages qui seront importées
7. Cliquez sur **Yes, Import**

Chaque page Figma deviendra une scène Grida.

> **Note:** Les composants du fichier importé deviennent de nouveaux composants principaux. Les instances se connecteront à ces nouveaux composants et ne recevront plus les mises à jour du fichier Figma d'origine.

## Dépannage

**Impossible de trouver l'option "Save local copy"**

- Le propriétaire du fichier a peut-être restreint la copie et le partage
- Vous n'avez peut-être pas les autorisations suffisantes (au moins "can view" est requis)
- Contactez le propriétaire du fichier pour demander l'accès ou lui demander de télécharger le fichier pour vous

**"Failed to parse .fig file"**

- Vérifiez qu'il s'agit bien d'un fichier `.fig` valide téléchargé depuis Figma
- Essayez de télécharger le fichier à nouveau
- Vérifiez que le fichier n'est pas corrompu (la taille doit sembler raisonnable)
- Le format `.fig` a peut-être changé (voir l'avertissement ci-dessus)

**"No pages found"**

- Le fichier `.fig` est peut-être vide ou ne contient aucun nœud de canvas
- Ouvrez le fichier dans Figma pour vérifier qu'il contient bien du contenu

## Ressources associées

- [Figma Help: Save a local copy of files](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files)
- [Figma Help: Download files from Figma](https://help.figma.com/hc/en-us/articles/360041003114-Download-files-from-Figma)
- [Copy & Paste from Figma](../../editor/features/copy-paste-figma.md) - méthode alternative d'import via le presse-papiers
