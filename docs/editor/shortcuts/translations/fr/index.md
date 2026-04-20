---
title: Raccourcis de l'editeur Grida
description: Reference des raccourcis clavier disponibles dans l'editeur Grida pour les outils, la selection, l'edition, la mise en page et l'affichage.
keywords:
  - grida
  - editor
  - shortcuts
  - keyboard shortcuts
  - hotkeys
format: md
doc_tasks:
  - update
---

# Raccourcis de l'editeur Grida

Ce guide est la reference officielle des raccourcis clavier disponibles dans Grida Canvas Editor. Les raccourcis vous permettent d'agir rapidement sans utiliser la souris, ce qui accelere nettement le travail dans l'editeur.

Les principales operations sont organisees par categorie : changement d'outil, transformations, alignement, et gestion de l'affichage du canvas. Chaque raccourci est indique pour macOS et pour Windows/Linux.

> **Note:** Sur macOS, utilisez `Cmd` (⌘) pour `meta`. Sur Windows/Linux, utilisez `Ctrl` pour `ctrl`.

## Outils

| Action              | macOS          | Windows/Linux  | Description                                           |
| ------------------- | -------------- | -------------- | ----------------------------------------------------- |
| Curseur (selection) | `V`            | `V`            | Outil de selection                                    |
| Main                | `H` or `Space` | `H` or `Space` | Deplacer le canvas (`Space` reste un appui maintenu)  |
| Zoom                | `Z`            | `Z`            | Zoomer sur le canvas (activation temporaire)          |
| Mise a l'echelle    | `K`            | `K`            | Outil de mise a l'echelle parametrique                |
| Lasso               | `Q`            | `Q`            | Outil lasso (mode vectoriel uniquement)               |
| Rectangle           | `R`            | `R`            | Inserer un rectangle                                  |
| Ellipse             | `O`            | `O`            | Inserer une ellipse                                   |
| Polygone            | `Y`            | `Y`            | Inserer un polygone                                   |
| Texte               | `T`            | `T`            | Inserer du texte                                      |
| Ligne               | `L`            | `L`            | Dessiner une ligne                                    |
| Fleche              | `⇧ + L`        | `⇧ + L`        | Dessiner une fleche (ligne avec pointe)               |
| Conteneur           | `A` or `F`     | `A` or `F`     | Inserer un conteneur                                  |
| Tray                | `⇧ + F`        | `⇧ + F`        | Inserer un tray (section d'organisation)              |
| Path                | `P`            | `P`            | Dessiner un path (outil plume)                        |
| Crayon              | `⇧ + P`        | `⇧ + P`        | Dessiner au crayon                                    |
| Pinceau             | `B`            | `B`            | Outil pinceau                                         |
| Gomme               | `E`            | `E`            | Outil gomme                                           |
| Pot de peinture     | `G`            | `G`            | Outil de remplissage (mode bitmap uniquement)         |
| Largeur variable    | `⇧ + W`        | `⇧ + W`        | Outil de largeur variable (mode vectoriel uniquement) |
| Pipette             | `I` or `⌃ + C` | `I`            | Prelever une couleur a l'ecran                        |

## Selection et navigation

| Action                      | macOS               | Windows/Linux       | Description                                      |
| --------------------------- | ------------------- | ------------------- | ------------------------------------------------ |
| Selectionner tous les pairs | `⌘ + A`             | `Ctrl + A`          | Selectionner tous les elements du meme niveau    |
| Selectionner les enfants    | `Enter`             | `Enter`             | Selectionner tous les enfants de la selection    |
| Selectionner le parent      | `⇧ + Enter` or `\`  | `⇧ + Enter` or `\`  | Selectionner le parent de la selection courante  |
| Pair suivant                | `Tab`               | `Tab`               | Selectionner l'element suivant au meme niveau    |
| Pair precedent              | `⇧ + Tab`           | `⇧ + Tab`           | Selectionner l'element precedent au meme niveau  |
| Echap / Effacer             | `Escape` or `Clear` | `Escape` or `Clear` | Effacer la selection et quitter les modes actifs |

## Edition

| Action        | macOS                   | Windows/Linux               | Description                                |
| ------------- | ----------------------- | --------------------------- | ------------------------------------------ |
| Annuler       | `⌘ + Z`                 | `Ctrl + Z`                  | Annuler la derniere action                 |
| Retablir      | `⌘ + ⇧ + Z`             | `Ctrl + ⇧ + Z`              | Refaire la derniere action annulee         |
| Couper        | `⌘ + X`                 | `Ctrl + X`                  | Couper la selection                        |
| Copier        | `⌘ + C`                 | `Ctrl + C`                  | Copier la selection                        |
| Copier en PNG | `⌘ + ⇧ + C`             | `Ctrl + ⇧ + C`              | Copier la selection comme image PNG        |
| Coller        | `⌘ + V`                 | `Ctrl + V`                  | Coller depuis le presse-papiers            |
| Dupliquer     | `⌘ + D`                 | `Ctrl + D`                  | Dupliquer la selection                     |
| Supprimer     | `Delete` or `Backspace` | `Delete` or `Backspace`     | Supprimer la selection                     |
| Aplatir       | `⌘ + E` or `⌥ + ⇧ + F`  | `Ctrl + E` or `Alt + ⇧ + F` | Convertir la selection en paths vectoriels |

## Transformation

| Action                         | macOS              | Windows/Linux        | Description                                                          |
| ------------------------------ | ------------------ | -------------------- | -------------------------------------------------------------------- |
| Deplacement fin                | `Arrow Keys`       | `Arrow Keys`         | Deplacer la selection de 1 px                                        |
| Redimensionnement fin (droite) | `Ctrl + ⌥ + →`     | `Ctrl + Alt + →`     | Augmenter la largeur de 1 px                                         |
| Redim. fin (droite, 10 px)     | `Ctrl + ⌥ + ⇧ + →` | `Ctrl + Alt + ⇧ + →` | Augmenter la largeur de 10 px                                        |
| Redimensionnement fin (gauche) | `Ctrl + ⌥ + ←`     | `Ctrl + Alt + ←`     | Diminuer la largeur de 1 px                                          |
| Redim. fin (gauche, 10 px)     | `Ctrl + ⌥ + ⇧ + ←` | `Ctrl + Alt + ⇧ + ←` | Diminuer la largeur de 10 px                                         |
| Redimensionnement fin (haut)   | `Ctrl + ⌥ + ↑`     | `Ctrl + Alt + ↑`     | Diminuer la hauteur de 1 px                                          |
| Redim. fin (haut, 10 px)       | `Ctrl + ⌥ + ⇧ + ↑` | `Ctrl + Alt + ⇧ + ↑` | Diminuer la hauteur de 10 px                                         |
| Redimensionnement fin (bas)    | `Ctrl + ⌥ + ↓`     | `Ctrl + Alt + ↓`     | Augmenter la hauteur de 1 px                                         |
| Redim. fin (bas, 10 px)        | `Ctrl + ⌥ + ⇧ + ↓` | `Ctrl + Alt + ⇧ + ↓` | Augmenter la hauteur de 10 px                                        |
| Mettre au premier plan         | `]`                | `]`                  | Mettre devant (ou agrandir le pinceau si l'outil pinceau est actif)  |
| Mettre a l'arriere-plan        | `[`                | `[`                  | Mettre derriere (ou reduire le pinceau si l'outil pinceau est actif) |
| Avancer d'un calque            | `⌘ + ]`            | `Ctrl + ]`           | Avancer la selection d'un calque                                     |
| Reculer d'un calque            | `⌘ + [`            | `Ctrl + [`           | Reculer la selection d'un calque                                     |

## Alignement et distribution

| Action                     | macOS          | Windows/Linux    | Description                           |
| -------------------------- | -------------- | ---------------- | ------------------------------------- |
| Aligner a gauche           | `⌥ + A`        | `Alt + A`        | Aligner la selection a gauche         |
| Aligner a droite           | `⌥ + D`        | `Alt + D`        | Aligner la selection a droite         |
| Aligner en haut            | `⌥ + W`        | `Alt + W`        | Aligner la selection en haut          |
| Aligner en bas             | `⌥ + S`        | `Alt + S`        | Aligner la selection en bas           |
| Centrer horizontalement    | `⌥ + H`        | `Alt + H`        | Centrer horizontalement               |
| Centrer verticalement      | `⌥ + V`        | `Alt + V`        | Centrer verticalement                 |
| Distribuer horizontalement | `⌥ + Ctrl + V` | `Alt + Ctrl + V` | Repartir uniformement a l'horizontale |
| Distribuer verticalement   | `⌥ + Ctrl + H` | `Alt + Ctrl + H` | Repartir uniformement a la verticale  |

## Groupement et mise en page

| Action                 | macOS       | Windows/Linux    | Description                            |
| ---------------------- | ----------- | ---------------- | -------------------------------------- |
| Grouper                | `⌘ + G`     | `Ctrl + G`       | Grouper la selection                   |
| Degrouper              | `⌘ + ⇧ + G` | `Ctrl + ⇧ + G`   | Degrouper la selection                 |
| Grouper avec conteneur | `⌘ + ⌥ + G` | `Ctrl + Alt + G` | Grouper la selection avec un conteneur |
| Auto-layout            | `⇧ + A`     | `⇧ + A`          | Appliquer l'auto-layout a la selection |

## Mise en forme du texte

| Action                  | macOS       | Windows/Linux    | Description                           |
| ----------------------- | ----------- | ---------------- | ------------------------------------- |
| Basculer en gras        | `⌘ + B`     | `Ctrl + B`       | Activer ou desactiver le gras         |
| Basculer en italique    | `⌘ + I`     | `Ctrl + I`       | Activer ou desactiver l'italique      |
| Basculer le souligne    | `⌘ + U`     | `Ctrl + U`       | Activer ou desactiver le souligne     |
| Basculer le barre       | `⌘ + ⇧ + X` | `Ctrl + ⇧ + X`   | Activer ou desactiver le texte barre  |
| Alignement texte gauche | `⌘ + ⌥ + L` | `Ctrl + Alt + L` | Aligner le texte a gauche             |
| Alignement texte centre | `⌘ + ⌥ + T` | `Ctrl + Alt + T` | Centrer le texte                      |
| Alignement texte droite | `⌘ + ⌥ + R` | `Ctrl + Alt + R` | Aligner le texte a droite             |
| Justifier le texte      | `⌘ + ⌥ + J` | `Ctrl + Alt + J` | Justifier horizontalement le texte    |
| Augmenter la taille     | `⌘ + ⇧ + >` | `Ctrl + ⇧ + >`   | Augmenter la taille de police de 1 px |
| Reduire la taille       | `⌘ + ⇧ + <` | `Ctrl + ⇧ + <`   | Reduire la taille de police de 1 px   |
| Augmenter la graisse    | `⌘ + ⌥ + >` | `Ctrl + Alt + >` | Augmenter la graisse de police        |
| Reduire la graisse      | `⌘ + ⌥ + <` | `Ctrl + Alt + <` | Reduire la graisse de police          |
| Augmenter l'interligne  | `⌥ + ⇧ + >` | `Alt + ⇧ + >`    | Augmenter l'interligne                |
| Reduire l'interligne    | `⌥ + ⇧ + <` | `Alt + ⇧ + <`    | Reduire l'interligne                  |
| Augmenter l'approche    | `⌥ + >`     | `Alt + >`        | Augmenter l'espacement des lettres    |
| Reduire l'approche      | `⌥ + <`     | `Alt + <`        | Reduire l'espacement des lettres      |

## Proprietes des objets

| Action                   | macOS              | Windows/Linux      | Description                              |
| ------------------------ | ------------------ | ------------------ | ---------------------------------------- |
| Basculer l'etat actif    | `⌘ + ⇧ + H`        | `Ctrl + ⇧ + H`     | Basculer l'etat actif de la selection    |
| Basculer le verrouillage | `⌘ + ⇧ + L`        | `Ctrl + ⇧ + L`     | Basculer le verrouillage de la selection |
| Retirer le fill          | `⌥ + /`            | `Alt + /`          | Supprimer le fill de la selection        |
| Retirer le stroke        | `⇧ + /`            | `⇧ + /`            | Supprimer le stroke (largeur mise a 0)   |
| Echanger fill et stroke  | `⇧ + X`            | `⇧ + X`            | Echanger les paints de fill et de stroke |
| Opacite a 0 %            | `0` (double press) | `0` (double press) | Regler l'opacite a 0 %                   |
| Opacite a 10 %           | `1`                | `1`                | Regler l'opacite a 10 %                  |
| Opacite a 20 %           | `2`                | `2`                | Regler l'opacite a 20 %                  |
| Opacite a 30 %           | `3`                | `3`                | Regler l'opacite a 30 %                  |
| Opacite a 40 %           | `4`                | `4`                | Regler l'opacite a 40 %                  |
| Opacite a 50 %           | `5`                | `5`                | Regler l'opacite a 50 %                  |
| Opacite a 60 %           | `6`                | `6`                | Regler l'opacite a 60 %                  |
| Opacite a 70 %           | `7`                | `7`                | Regler l'opacite a 70 %                  |
| Opacite a 80 %           | `8`                | `8`                | Regler l'opacite a 80 %                  |
| Opacite a 90 %           | `9`                | `9`                | Regler l'opacite a 90 %                  |
| Opacite a 100 %          | `0` (single press) | `0` (single press) | Regler l'opacite a 100 %                 |

## Affichage et zoom

| Action                   | macOS                  | Windows/Linux                | Description                                        |
| ------------------------ | ---------------------- | ---------------------------- | -------------------------------------------------- |
| Zoom ajuster au contenu  | `⇧ + 1` or `⇧ + 9`     | `⇧ + 1` or `⇧ + 9`           | Ajuster le zoom a tout le contenu                  |
| Zoom sur la selection    | `⇧ + 2`                | `⇧ + 2`                      | Zoomer sur la selection courante                   |
| Zoom a 100 %             | `⇧ + 0`                | `⇧ + 0`                      | Afficher a 100 %                                   |
| Zoom avant               | `⌘ + =` or `⌘ + Plus`  | `Ctrl + =` or `Ctrl + Plus`  | Zoomer                                             |
| Zoom arriere             | `⌘ + -` or `⌘ + Minus` | `Ctrl + -` or `Ctrl + Minus` | Dezoomer                                           |
| Basculer la regle        | `⇧ + R`                | `⇧ + R`                      | Afficher ou masquer la regle                       |
| Basculer la grille pixel | `⇧ + '`                | `⇧ + '`                      | Afficher ou masquer la grille pixel                |
| Basculer l'apercu pixel  | `⌘ + ⇧ + ⌥ + P`        | `Ctrl + ⇧ + Alt + P`         | Basculer l'apercu pixel (Disabled ↔ dernier 1x/2x) |
| Basculer le mode contour | `⌘ + ⇧ + O` or `⌘ + Y` | `Ctrl + ⇧ + O` or `Ctrl + Y` | Basculer le mode contour (wireframe)               |
| Apercu                   | `⇧ + Space`            | `⇧ + Space`                  | Previsualiser la selection courante                |

## Outils pinceau

| Action              | macOS | Windows/Linux | Description                                            |
| ------------------- | ----- | ------------- | ------------------------------------------------------ |
| Augmenter la taille | `]`   | `]`           | Augmenter la taille du pinceau quand l'outil est actif |
| Reduire la taille   | `[`   | `[`           | Reduire la taille du pinceau quand l'outil est actif   |

## Touches modificatrices (pendant l'appui)

Ces touches modificatrices changent le comportement tant qu'elles restent enfoncees :

| Modificateur | macOS  | Windows/Linux | Effet                                                                                                                          |
| ------------ | ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Shift        | `⇧`    | `⇧`           | Verrouiller l'axe dominant pendant le deplacement, conserver les proportions pendant l'echelle, quantifier la rotation a 15deg |
| Alt/Option   | `⌥`    | `Alt`         | Deplacer avec clonage, transformer depuis le centre, activer l'outil de mesure, activer la symetrie de padding                 |
| Meta/Cmd     | `⌘`    | `Ctrl`        | Configurer le ciblage du raycast surface sur les objets les plus profonds                                                      |
| Control      | `Ctrl` | `Ctrl`        | Desactiver le snapping de force pendant le deplacement ou la mise a l'echelle                                                  |

## Planifie (reserve)

Les raccourcis suivants sont definis mais pas encore implementes :

- `⇧ + H` - Symetrie horizontale
- `⇧ + V` - Symetrie verticale
- `⌥ + ⌘ + K` / `Alt + Ctrl + K` - Creer un composant
- `⌥ + ⌘ + B` / `Alt + Ctrl + B` - Ejecter un composant
- `Tab` - Plage de texte : augmenter l'indentation
- `⇧ + Tab` - Plage de texte : diminuer l'indentation
