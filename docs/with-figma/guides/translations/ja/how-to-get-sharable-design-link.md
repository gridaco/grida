---
title: 共有可能な Figma デザインリンクを取得する方法
description: フレームまたはファイルへの Figma リンクをコピーして共有したり、Grida のワークフローで使ったりする方法です。
keywords:
  - figma
  - share link
  - design link
  - grida
format: md
doc_tasks:
  - update
---

# 共有可能な Figma デザインリンクを取得する方法

## フレームへのリンクをコピーする

1. Figma ファイルを開き、共有したいフレームへ移動します。
2. フレームを右クリックします。
3. **Copy/Paste as** を開きます。
4. **Copy link** を選びます。

これで、そのフレームに直接リンクする URL を取得できます。共同作業者に共有したり、Grida のワークフロー入力として使えます。

## ファイル全体へのリンクをコピーする

1. Figma ファイルを開きます。
2. 右上の **Share** をクリックします。
3. **Copy link** をクリックします。

コピーされた URL には、次のように `node-id` クエリパラメータが含まれる場合があります。

```txt
https://www.figma.com/file/XXXXXXX/example-file?node-id=0%3A1
```

特定ノードではなくファイル全体へのリンクが必要な場合は、`?node-id=...` 部分を削除して次のようにします。

```txt
https://www.figma.com/file/XXXXXXX/example-file
```
