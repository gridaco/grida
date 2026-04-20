---
title: Comment enregistrer une copie locale .fig depuis Figma
description: Telechargez un fichier .fig local depuis Figma afin de pouvoir l'importer dans Grida.
keywords:
  - figma
  - fig file
  - import
  - grida
format: md
doc_tasks:
  - update
---

# Comment enregistrer une copie locale .fig depuis Figma

Ce guide explique comment telecharger un fichier .fig depuis Figma pour l'importer dans Grida.

> **Note:** Le format de fichier .fig est proprietaire et peut changer sans preavis. Si vous rencontrez des problemes lors de l'import de fichiers .fig, veuillez [nous les signaler](https://github.com/gridaco/grida/issues) ou contacter le support. Vos retours nous aident a maintenir les imports operationnels.

## Prerequis

- Vous devez avoir au moins l'acces **can view** au fichier
- Le proprietaire du fichier ne doit pas avoir restreint la copie et le partage
- Si vous ne voyez pas l'option **Save local copy**, contactez le proprietaire du fichier

## Dans Figma Desktop ou Web

1. Ouvrez votre fichier Figma
2. Cliquez sur **Main menu** (coin superieur gauche)
3. Allez dans **File -> Save local copy...**
4. Choisissez un emplacement sur votre ordinateur
5. Cliquez sur **Save**

Le fichier sera enregistre avec l'extension `.fig` (fichiers Figma Design).

## Emplacement du fichier selon le systeme d'exploitation

Apres l'enregistrement, vous trouverez vos fichiers .fig a l'emplacement que vous avez choisi :

**macOS**

- Dossier Telechargements par defaut : `~/Downloads/`
- Emplacements personnalises : partout ou vous avez choisi de l'enregistrer

**Windows**

- Dossier Telechargements par defaut : `C:\Users\YourUsername\Downloads\`
- Emplacements personnalises : partout ou vous avez choisi de l'enregistrer

**Linux**

- Dossier Telechargements par defaut : `~/Downloads/`
- Emplacements personnalises : partout ou vous avez choisi de l'enregistrer

## Que contient un fichier .fig ?

Un fichier .fig contient :

- toutes les pages (canvases) de votre document Figma
- la hierarchie complete des noeuds avec leurs proprietes
- les donnees vectorielles, fills, strokes et effects
- le contenu texte et sa mise en forme
- les definitions de composants et leurs instances

**Non inclus :**

- l'historique des versions
- les commentaires
- le lien avec le fichier d'origine (le fichier importe est traite comme un nouveau fichier)

## Importer dans Grida

Une fois que vous avez un fichier .fig :

1. Ouvrez Grida Canvas playground
2. Cliquez sur le menu du logo (en haut a gauche)
3. Selectionnez **Import Figma**
4. Dans l'onglet **.fig File**, cliquez sur **Select .fig File**
5. Choisissez votre fichier .fig telecharge
6. Verifiez les pages qui seront importees
7. Cliquez sur **Yes, Import**

Chaque page Figma deviendra une scene Grida.

> **Note:** Les composants du fichier importe deviennent de nouveaux composants principaux. Les instances se connecteront a ces nouveaux composants et ne recevront plus les mises a jour du fichier Figma d'origine.

## Depannage

**Impossible de trouver l'option "Save local copy"**

- Le proprietaire du fichier a peut-etre restreint la copie et le partage
- Vous n'avez peut-etre pas les autorisations suffisantes (au moins "can view" est requis)
- Contactez le proprietaire du fichier pour demander l'acces ou lui demander de telecharger le fichier pour vous

**"Failed to parse .fig file"**

- Verifiez qu'il s'agit bien d'un fichier .fig valide telecharge depuis Figma
- Essayez de telecharger le fichier a nouveau
- Verifiez que le fichier n'est pas corrompu (la taille doit sembler raisonnable)
- Le format .fig a peut-etre change (voir l'avertissement ci-dessus)

**"No pages found"**

- Le fichier .fig est peut-etre vide ou ne contient aucun noeud de canvas
- Ouvrez le fichier dans Figma pour verifier qu'il contient bien du contenu

## Ressources associees

- [Figma Help: Save a local copy of files](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files)
- [Figma Help: Download files from Figma](https://help.figma.com/hc/en-us/articles/360041003114-Download-files-from-Figma)
- [Copy & Paste from Figma](../../editor/features/copy-paste-figma.md) - methode alternative d'import via le presse-papiers
