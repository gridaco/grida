---
title: Grida エディタのショートカット
description: ツール、選択、編集、レイアウト、表示操作まで、Grida エディタで使えるキーボードショートカットの一覧です。
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

# Grida エディタのショートカット

このガイドは、Grida Canvas Editor で使える公式キーボードショートカットのリファレンスです。ショートカットを使うと、マウスを使わずに操作できるため、作業をすばやく進めてエディタを効率よく操作できます。

道具の切り替え、変形、整列、キャンバス表示の管理まで、主要な操作をカテゴリ別に整理しています。各ショートカットには macOS と Windows/Linux の両方のキー表記を併記しています。

> **Note:** macOS では `Cmd` (⌘) を `meta`、Windows/Linux では `Ctrl` を `ctrl` として使います。

## Tools

| 操作            | macOS          | Windows/Linux  | 説明                                                   |
| --------------- | -------------- | -------------- | ------------------------------------------------------ |
| Cursor (Select) | `V`            | `V`            | 選択ツール                                             |
| Hand tool       | `H` or `Space` | `H` or `Space` | キャンバスをパンする（`Space` は押している間だけ有効） |
| Zoom tool       | `Z`            | `Z`            | キャンバスをズームする（押している間だけ有効）         |
| Scale tool      | `K`            | `K`            | パラメトリックスケールツール                           |
| Lasso tool      | `Q`            | `Q`            | ラッソツール（ベクターモード専用）                     |
| Rectangle tool  | `R`            | `R`            | 長方形を挿入                                           |
| Ellipse tool    | `O`            | `O`            | 楕円を挿入                                             |
| Polygon tool    | `Y`            | `Y`            | 多角形を挿入                                           |
| Text tool       | `T`            | `T`            | テキストを挿入                                         |
| Line tool       | `L`            | `L`            | 線を描く                                               |
| Arrow tool      | `⇧ + L`        | `⇧ + L`        | 矢印を描く（矢印付きの線）                             |
| Container tool  | `A` or `F`     | `A` or `F`     | コンテナを挿入                                         |
| Tray tool       | `⇧ + F`        | `⇧ + F`        | トレイを挿入（整理用セクション）                       |
| Path tool       | `P`            | `P`            | パスを描く（ペンツール）                               |
| Pencil tool     | `⇧ + P`        | `⇧ + P`        | 鉛筆で描く                                             |
| Brush tool      | `B`            | `B`            | ブラシツール                                           |
| Eraser tool     | `E`            | `E`            | 消しゴムツール                                         |
| Paint bucket    | `G`            | `G`            | 塗りつぶしツール（ビットマップモード専用）             |
| Variable width  | `⇧ + W`        | `⇧ + W`        | 可変幅ツール（ベクターモード専用）                     |
| Eye dropper     | `I` or `⌃ + C` | `I`            | 画面上の色を取得                                       |

## Selection & Navigation

| 操作                    | macOS               | Windows/Linux       | 説明                                   |
| ----------------------- | ------------------- | ------------------- | -------------------------------------- |
| Select all siblings     | `⌘ + A`             | `Ctrl + A`          | 現在の選択と同じ階層の要素をすべて選択 |
| Select children         | `Enter`             | `Enter`             | 現在の選択の子要素をすべて選択         |
| Select parent           | `⇧ + Enter` or `\`  | `⇧ + Enter` or `\`  | 現在の選択の親要素を選択               |
| Select next sibling     | `Tab`               | `Tab`               | 次の兄弟要素を選択                     |
| Select previous sibling | `⇧ + Tab`           | `⇧ + Tab`           | 前の兄弟要素を選択                     |
| Escape/Clear            | `Escape` or `Clear` | `Escape` or `Clear` | 選択を解除し、モードを終了             |

## Editing

| 操作        | macOS                   | Windows/Linux               | 説明                            |
| ----------- | ----------------------- | --------------------------- | ------------------------------- |
| Undo        | `⌘ + Z`                 | `Ctrl + Z`                  | 最後の操作を元に戻す            |
| Redo        | `⌘ + ⇧ + Z`             | `Ctrl + ⇧ + Z`              | 取り消した操作をやり直す        |
| Cut         | `⌘ + X`                 | `Ctrl + X`                  | 現在の選択を切り取る            |
| Copy        | `⌘ + C`                 | `Ctrl + C`                  | 現在の選択をコピーする          |
| Copy as PNG | `⌘ + ⇧ + C`             | `Ctrl + ⇧ + C`              | 選択を PNG 画像としてコピーする |
| Paste       | `⌘ + V`                 | `Ctrl + V`                  | クリップボードから貼り付ける    |
| Duplicate   | `⌘ + D`                 | `Ctrl + D`                  | 現在の選択を複製する            |
| Delete      | `Delete` or `Backspace` | `Delete` or `Backspace`     | 現在の選択を削除する            |
| Flatten     | `⌘ + E` or `⌥ + ⇧ + F`  | `Ctrl + E` or `Alt + ⇧ + F` | 選択をベクターパスへ変換する    |

## Transformation

| 操作                       | macOS              | Windows/Linux        | 説明                                               |
| -------------------------- | ------------------ | -------------------- | -------------------------------------------------- |
| Nudge                      | `Arrow Keys`       | `Arrow Keys`         | 選択を 1px 移動                                    |
| Nudge resize (right)       | `Ctrl + ⌥ + →`     | `Ctrl + Alt + →`     | 幅を 1px 増やす                                    |
| Nudge resize (right, 10px) | `Ctrl + ⌥ + ⇧ + →` | `Ctrl + Alt + ⇧ + →` | 幅を 10px 増やす                                   |
| Nudge resize (left)        | `Ctrl + ⌥ + ←`     | `Ctrl + Alt + ←`     | 幅を 1px 減らす                                    |
| Nudge resize (left, 10px)  | `Ctrl + ⌥ + ⇧ + ←` | `Ctrl + Alt + ⇧ + ←` | 幅を 10px 減らす                                   |
| Nudge resize (up)          | `Ctrl + ⌥ + ↑`     | `Ctrl + Alt + ↑`     | 高さを 1px 減らす                                  |
| Nudge resize (up, 10px)    | `Ctrl + ⌥ + ⇧ + ↑` | `Ctrl + Alt + ⇧ + ↑` | 高さを 10px 減らす                                 |
| Nudge resize (down)        | `Ctrl + ⌥ + ↓`     | `Ctrl + Alt + ↓`     | 高さを 1px 増やす                                  |
| Nudge resize (down, 10px)  | `Ctrl + ⌥ + ⇧ + ↓` | `Ctrl + Alt + ⇧ + ↓` | 高さを 10px 増やす                                 |
| Move to front              | `]`                | `]`                  | 最前面へ移動（ブラシ使用中はブラシサイズを増やす） |
| Move to back               | `[`                | `[`                  | 最背面へ移動（ブラシ使用中はブラシサイズを減らす） |
| Move forward               | `⌘ + ]`            | `Ctrl + ]`           | 1 レイヤー前へ移動                                 |
| Move backward              | `⌘ + [`            | `Ctrl + [`           | 1 レイヤー後ろへ移動                               |

## Alignment & Distribution

| 操作                    | macOS          | Windows/Linux    | 説明               |
| ----------------------- | -------------- | ---------------- | ------------------ |
| Align left              | `⌥ + A`        | `Alt + A`        | 左揃え             |
| Align right             | `⌥ + D`        | `Alt + D`        | 右揃え             |
| Align top               | `⌥ + W`        | `Alt + W`        | 上揃え             |
| Align bottom            | `⌥ + S`        | `Alt + S`        | 下揃え             |
| Align horizontal center | `⌥ + H`        | `Alt + H`        | 水平方向中央揃え   |
| Align vertical center   | `⌥ + V`        | `Alt + V`        | 垂直方向中央揃え   |
| Distribute horizontally | `⌥ + Ctrl + V` | `Alt + Ctrl + V` | 水平方向に均等配置 |
| Distribute vertically   | `⌥ + Ctrl + H` | `Alt + Ctrl + H` | 垂直方向に均等配置 |

## Grouping & Layout

| 操作                 | macOS       | Windows/Linux    | 説明                                   |
| -------------------- | ----------- | ---------------- | -------------------------------------- |
| Group                | `⌘ + G`     | `Ctrl + G`       | 現在の選択をグループ化                 |
| Ungroup              | `⌘ + ⇧ + G` | `Ctrl + ⇧ + G`   | 現在の選択をグループ解除               |
| Group with Container | `⌘ + ⌥ + G` | `Ctrl + Alt + G` | 現在の選択をコンテナと一緒にグループ化 |
| Auto-layout          | `⇧ + A`     | `⇧ + A`          | 現在の選択に auto-layout を適用        |

## Text Formatting

| 操作                    | macOS       | Windows/Linux    | 説明                        |
| ----------------------- | ----------- | ---------------- | --------------------------- |
| Toggle bold             | `⌘ + B`     | `Ctrl + B`       | 太字を切り替える            |
| Toggle italic           | `⌘ + I`     | `Ctrl + I`       | 斜体を切り替える            |
| Toggle underline        | `⌘ + U`     | `Ctrl + U`       | 下線を切り替える            |
| Toggle line-through     | `⌘ + ⇧ + X` | `Ctrl + ⇧ + X`   | 取り消し線を切り替える      |
| Text align left         | `⌘ + ⌥ + L` | `Ctrl + Alt + L` | テキストを左揃え            |
| Text align center       | `⌘ + ⌥ + T` | `Ctrl + Alt + T` | テキストを中央揃え          |
| Text align right        | `⌘ + ⌥ + R` | `Ctrl + Alt + R` | テキストを右揃え            |
| Text align justify      | `⌘ + ⌥ + J` | `Ctrl + Alt + J` | テキストを両端揃え          |
| Increase font size      | `⌘ + ⇧ + >` | `Ctrl + ⇧ + >`   | フォントサイズを 1px 増やす |
| Decrease font size      | `⌘ + ⇧ + <` | `Ctrl + ⇧ + <`   | フォントサイズを 1px 減らす |
| Increase font weight    | `⌘ + ⌥ + >` | `Ctrl + Alt + >` | フォントの太さを増やす      |
| Decrease font weight    | `⌘ + ⌥ + <` | `Ctrl + Alt + <` | フォントの太さを減らす      |
| Increase line height    | `⌥ + ⇧ + >` | `Alt + ⇧ + >`    | 行間を増やす                |
| Decrease line height    | `⌥ + ⇧ + <` | `Alt + ⇧ + <`    | 行間を減らす                |
| Increase letter spacing | `⌥ + >`     | `Alt + >`        | 文字間隔を増やす            |
| Decrease letter spacing | `⌥ + <`     | `Alt + <`        | 文字間隔を減らす            |

## Object Properties

| 操作                 | macOS        | Windows/Linux  | 説明                                    |
| -------------------- | ------------ | -------------- | --------------------------------------- |
| Toggle active        | `⌘ + ⇧ + H`  | `Ctrl + ⇧ + H` | 選択の active 状態を切り替える          |
| Toggle locked        | `⌘ + ⇧ + L`  | `Ctrl + ⇧ + L` | 選択の locked 状態を切り替える          |
| Remove fill          | `⌥ + /`      | `Alt + /`      | 選択から fill を削除                    |
| Remove stroke        | `⇧ + /`      | `⇧ + /`        | 選択から stroke を削除（幅を 0 に設定） |
| Swap fill and stroke | `⇧ + X`      | `⇧ + X`        | fill と stroke を入れ替える             |
| Set opacity to 0%    | `0` (double) | `0` (double)   | 不透明度を 0% にする                    |
| Set opacity to 10%   | `1`          | `1`            | 不透明度を 10% にする                   |
| Set opacity to 20%   | `2`          | `2`            | 不透明度を 20% にする                   |
| Set opacity to 30%   | `3`          | `3`            | 不透明度を 30% にする                   |
| Set opacity to 40%   | `4`          | `4`            | 不透明度を 40% にする                   |
| Set opacity to 50%   | `5`          | `5`            | 不透明度を 50% にする                   |
| Set opacity to 60%   | `6`          | `6`            | 不透明度を 60% にする                   |
| Set opacity to 70%   | `7`          | `7`            | 不透明度を 70% にする                   |
| Set opacity to 80%   | `8`          | `8`            | 不透明度を 80% にする                   |
| Set opacity to 90%   | `9`          | `9`            | 不透明度を 90% にする                   |
| Set opacity to 100%  | `0` (single) | `0` (single)   | 不透明度を 100% にする                  |

## View & Zoom

| 操作                 | macOS                  | Windows/Linux                | 説明                             |
| -------------------- | ---------------------- | ---------------------------- | -------------------------------- |
| Zoom to fit          | `⇧ + 1` or `⇧ + 9`     | `⇧ + 1` or `⇧ + 9`           | 全体が収まるようにズーム         |
| Zoom to selection    | `⇧ + 2`                | `⇧ + 2`                      | 現在の選択にズーム               |
| Zoom to 100%         | `⇧ + 0`                | `⇧ + 0`                      | 100% 表示                        |
| Zoom in              | `⌘ + =` or `⌘ + Plus`  | `Ctrl + =` or `Ctrl + Plus`  | ズームイン                       |
| Zoom out             | `⌘ + -` or `⌘ + Minus` | `Ctrl + -` or `Ctrl + Minus` | ズームアウト                     |
| Toggle ruler         | `⇧ + R`                | `⇧ + R`                      | ルーラー表示を切り替える         |
| Toggle pixel grid    | `⇧ + '`                | `⇧ + '`                      | ピクセルグリッド表示を切り替える |
| Toggle pixel preview | `⌘ + ⇧ + ⌥ + P`        | `Ctrl + ⇧ + Alt + P`         | ピクセルプレビューを切り替える   |
| Toggle outline mode  | `⌘ + ⇧ + O` or `⌘ + Y` | `Ctrl + ⇧ + O` or `Ctrl + Y` | アウトラインモードを切り替える   |
| Preview              | `⇧ + Space`            | `⇧ + Space`                  | 現在の選択をプレビュー           |

## Brush Tools

| 操作                | macOS | Windows/Linux | 説明                               |
| ------------------- | ----- | ------------- | ---------------------------------- |
| Increase brush size | `]`   | `]`           | ブラシ使用中にブラシサイズを増やす |
| Decrease brush size | `[`   | `[`           | ブラシ使用中にブラシサイズを減らす |

## Modifier Keys (While Pressed)

これらの修飾キーは、押している間だけ動作を変更します。

| 修飾キー   | macOS  | Windows/Linux | 効果                                                                 |
| ---------- | ------ | ------------- | -------------------------------------------------------------------- |
| Shift      | `⇧`    | `⇧`           | 移動時の主軸固定、拡縮時の比率維持、回転を 15° 単位に量子化          |
| Alt/Option | `⌥`    | `Alt`         | 複製しながらドラッグ、中心基準変形、計測ツール有効化、padding ミラー |
| Meta/Cmd   | `⌘`    | `Ctrl`        | 最も深いオブジェクトを対象に surface raycast targeting を構成        |
| Control    | `Ctrl` | `Ctrl`        | 移動や拡縮時のスナップを強制的に無効化                               |

## Planned (Reserved)

次のショートカットは定義されていますが、まだ実装されていません。

- `⇧ + H` - 左右反転
- `⇧ + V` - 上下反転
- `⌥ + ⌘ + K` / `Alt + Ctrl + K` - コンポーネント作成
- `⌥ + ⌘ + B` / `Alt + Ctrl + B` - コンポーネント解除
- `Tab` - テキスト範囲: インデントを増やす
- `⇧ + Tab` - テキスト範囲: インデントを減らす
