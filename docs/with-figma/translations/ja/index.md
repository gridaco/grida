---
title: Grida と Figma
description: Assistant 文書、インポートワークフロー、実務向けセットアップガイドを含む Grida と Figma の連携文書です。
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

# Grida と Figma

Grida は Figma と自然に連携し、デザイナーがツール間を行き来しながら作業できるようにします。

> **⚠️ Important Notice**
>
> Figma のクリップボード連携は Figma の内部フォーマットに依存しているため、予告なく変更される場合があります。Figma からの貼り付けが突然動かなくなった場合は、[issue を報告してください](https://github.com/gridaco/grida/issues/new)。

## Features

### Assistant

現在保守されている Grida Assistant の文書は、このセクションにあります。

- [Assistant](./assistant/01-intro.mdx)
- [Design Assistant](./assistant/design-assistant/index.mdx)

### Figma からインポート

Figma でノードをコピーし、そのまま Grida に貼り付けられます。エディタは Figma のクリップボード形式を自動検出し、Grida のネイティブ形式へ変換します。変換時には次の情報をできるだけ保持します。

- ノード階層と構造
- 視覚プロパティ（fills、strokes、effects、transforms）
- テキストスタイルと内容
- ベクターデータとパス
- コンポーネント関係

**詳細**: [Copy & Paste from Figma](../editor/features/copy-paste-figma.md)

### 対応ノードタイプ

Grida は一般的な Figma ノードタイプをインポートできます。

- **コンテナ**: Frames, Components, Component Instances, Sections, Groups
- **シェイプ**: Rectangles, Ellipses, Lines, Polygons, Stars
- **ベクター**: Vector paths, Boolean operations
- **テキスト**: スタイルを保持した Text nodes

### プロパティ互換性

変換パイプラインは、次の Figma プロパティを Grida の対応表現へマッピングします。

- **Effects**: Drop shadows, inner shadows, layer blur, background blur
- **Strokes**: Weight, align, cap, join, dash patterns, miter limit
- **Fills**: Solid colors, gradients (linear, radial, angular, diamond), images
- **Corners**: Radius, smoothing, individual corner radii
- **Transforms**: Position, size, rotation (matrix から抽出)

## Guides

- [Figma personal access token を取得する方法](./guides/how-to-get-personal-access-token.md)
- [共有可能な Figma デザインリンクを取得する方法](./guides/how-to-get-sharable-design-link.md)
- [ローカル `.fig` コピーを保存する方法](./guides/how-to-get-fig-file.md)

## Technical Details

実装詳細と変換パイプラインのアーキテクチャについては、次を参照してください。

- [Figma Import Technical Spec](../editor/features/copy-paste-figma.md)
- [Figma IO Package Documentation](https://grida.co/docs/reference/io-figma)
