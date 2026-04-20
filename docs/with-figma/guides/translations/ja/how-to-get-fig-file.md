---
title: Figma からローカル .fig コピーを保存する方法
description: Grida にインポートするために Figma からローカル `.fig` ファイルをダウンロードする方法です。
keywords:
  - figma
  - fig file
  - import
  - grida
format: md
doc_tasks:
  - update
---

# Figma からローカル .fig コピーを保存する方法

このガイドでは、Grida にインポートするために Figma から `.fig` ファイルをダウンロードする方法を説明します。

> **Note:** `.fig` ファイル形式は Figma 独自のものであり、予告なく変更される可能性があります。`.fig` ファイルのインポートで問題が起きた場合は、[issue を報告する](https://github.com/gridaco/grida/issues) かサポートへ連絡してください。

## Requirements

- ファイルに対して少なくとも **can view** 権限が必要です
- ファイルオーナーがコピーや共有を制限していない必要があります
- **Save local copy** オプションが見えない場合は、ファイルオーナーに確認してください

## Figma Desktop または Web の場合

1. Figma ファイルを開きます
2. **Main menu**（左上）をクリックします
3. **File → Save local copy...** を開きます
4. 保存先を選びます
5. **Save** をクリックします

ファイルは `.fig` 拡張子で保存されます（Figma Design files）。

## OS ごとの保存場所

保存後、`.fig` ファイルは選択した場所で見つけられます。

**macOS**

- デフォルトの Downloads フォルダ: `~/Downloads/`
- カスタム保存先: 保存時に選んだ場所

**Windows**

- デフォルトの Downloads フォルダ: `C:\Users\YourUsername\Downloads\`
- カスタム保存先: 保存時に選んだ場所

**Linux**

- デフォルトの Downloads フォルダ: `~/Downloads/`
- カスタム保存先: 保存時に選んだ場所

## `.fig` ファイルに含まれるもの

`.fig` ファイルには次の内容が含まれます。

- Figma ドキュメント内のすべてのページ（キャンバス）
- プロパティを含む完全なノード階層
- ベクターデータ、fills、strokes、effects
- テキスト内容とスタイル
- コンポーネント定義とインスタンス

**含まれないもの:**

- バージョン履歴
- コメント
- 元のファイルとの接続（インポート後は新しいファイルとして扱われます）

## Grida へインポートする

`.fig` ファイルを用意したら:

1. Grida Canvas playground を開きます
2. 左上のロゴメニューをクリックします
3. **Import Figma** を選びます
4. **.fig File** タブで **Select .fig File** をクリックします
5. ダウンロードした `.fig` ファイルを選びます
6. インポートされるページを確認します
7. **Yes, Import** をクリックします

各 Figma ページは Grida scene に変換されます。

> **Note:** インポートされたファイル内のコンポーネントは新しい main component になります。インスタンスはその新しいコンポーネントに接続され、元の Figma ファイルから更新を受け取り続けることはありません。

## Troubleshooting

**"Save local copy" オプションが見つからない**

- ファイルオーナーがコピーや共有を制限している可能性があります
- 権限が不足している可能性があります（少なくとも `"can view"` が必要です）
- ファイルオーナーにアクセスを依頼するか、代わりにダウンロードしてもらってください

**".fig file" の解析に失敗する**

- Figma からダウンロードした有効な `.fig` ファイルであることを確認してください
- もう一度ダウンロードしてみてください
- ファイルが破損していないか確認してください
- `.fig` 形式が変更された可能性があります

**"No pages found"**

- `.fig` ファイルが空か、キャンバスノードを含んでいない可能性があります
- Figma で開いて実際に内容があるか確認してください

## Related Resources

- [Figma Help: Save a local copy of files](https://help.figma.com/hc/en-us/articles/8403626871063-Save-a-local-copy-of-files)
- [Figma Help: Download files from Figma](https://help.figma.com/hc/en-us/articles/360041003114-Download-files-from-Figma)
- [Copy & Paste from Figma](../../editor/features/copy-paste-figma.md) - クリップボードを使う代替インポート方法
