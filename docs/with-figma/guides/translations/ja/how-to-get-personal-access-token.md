---
title: Figma personal access token を取得する方法
description: Grida のワークフローで Figma API へ直接アクセスする必要がある場合に使う personal access token の作成方法です。
keywords:
  - figma
  - personal access token
  - api token
  - grida
format: md
doc_tasks:
  - update
---

# Figma personal access token を取得する方法

Figma で personal access token を作成する手順は次のとおりです。

1. Figma アカウントにサインインします。
2. [Figma developers: personal access tokens](https://www.figma.com/developers/api#access-tokens) を開きます。
3. **Get personal access token** をクリックします。
4. Figma が求める場合は、トークンのラベルを入力します。
5. 生成されたトークン値をコピーし、安全な場所に保管します。

## `personalAccessToken` が必要になる場合

ほとんどの Grida 製品では組み込みの Figma 認証を使いますが、一部のワークフローでは明示的な `personalAccessToken` が必要です。

代表的なケース:

- まだ完全な OAuth フローへ移行していない内部向けまたはベータ機能
- Figma API に直接アクセスするスクリプトやツール
- 一時的に別の Figma アカウントで認証する必要があるワークフロー

## Security note

personal access token はパスワードと同じように扱ってください。公開ドキュメント、スクリーンショット、issue スレッドに貼り付けないでください。
