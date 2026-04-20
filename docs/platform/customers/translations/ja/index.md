---
title: Customers
description: Grida の customer object、CSV インポート形式、metadata フィールド、更新動作について説明します。
keywords:
  - grida
  - platform
  - customers
  - csv import
  - metadata
format: md
doc_tasks:
  - enhance
---

# Customers

このオブジェクトは、あなたのビジネスにおける顧客を表します。定期請求の作成、支払い情報や連絡先情報の保存、同じ顧客に属する支払いの追跡に利用できます。

## Customer Object

| フィールド名 | 説明                         | 必須   | 形式   | 例                                   | 更新 | 一意性         |
| ------------ | ---------------------------- | ------ | ------ | ------------------------------------ | ---- | -------------- |
| uid          | システム顧客 ID              | はい   | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | 不可 | はい           |
| uuid         | 顧客の外部一意識別子         | いいえ | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | 可   | はい（指定時） |
| name         | 顧客名                       | いいえ | -      | John Doe                             | 可   | いいえ         |
| email        | 顧客メールアドレス           | いいえ | email  | user+1@example.com                   | 可   | いいえ         |
| phone        | 顧客電話番号                 | いいえ | E.164  | +14155552671                         | 可   | いいえ         |
| description  | 顧客の説明                   | いいえ | -      | A short description of the customer  | 可   | いいえ         |
| tags         | 顧客に関連付けられたタグ一覧 | いいえ | text[] | `["premium", "vip", "new-customer"]` | 可   | いいえ         |
| metadata     | 顧客に付与する K:V metadata  | いいえ | json   | `{"my_custom_field_1":"value"}`      | 可   | いいえ         |

### `uid`

`uid` はシステムが生成する `uuidv4` 形式の一意識別子です。ユーザーが指定したり変更したりすることはできません。

### `uuid`

`uuid` は顧客の `uuidv4` 形式の外部識別子です。ユーザーが指定できます。

この値は、別のシステムで作成された顧客レコードと同期したい場合に便利です。

また、CRM および関連機能の中で顧客の一意性を保証するためにも利用できます。

例:

- 自社データベース上の顧客
- Salesforce 上の顧客

### `phone`

`phone` は E.164 形式の顧客電話番号です。正しい形式が分からない場合は、[Grida E.164 tool](https://grida.co/tools/e164) を使って整形できます。

### `tags`

顧客に関連付けるタグの一覧です。タグはプロジェクト単位で管理され、説明を持つことができ、分類、セグメント化、素早いフィルタリングに役立ちます。

顧客の作成または更新時に渡したタグがまだ存在しない場合は、自動的に作成されます。

例:

```json
{
  "tags": ["premium", "vip", "new-customer"]
}
```

- タグはプロジェクト単位で名前により一意です。
- タグ名を変更すると、すべての customer-tag 関連付けが自動的に更新されます。
- タグを削除すると、customer-tag 関連付けのみが削除されます（customer 自体は削除されません）。

> **CSV Note:** CSV ファイルで `tags` を渡すときは、`"tag1,tag2,tag3"` のようにカンマ区切りの文字列を二重引用符で囲んで指定してください。

[tags](../tags/index.md) も参照してください。

### `metadata`

顧客オブジェクトに付与できるキーと値の metadata です。追加情報を構造化して保存するのに便利です。

> **CSV Note:** CSV で `metadata.*` を渡す場合は、フラット化されたキー名で指定してください。

たとえば次の JSON をアップロードしたい場合:

```json
{
  "my_custom_field_1": "value 1",
  "my_custom_field_2": "value 2"
}
```

CSV では次のように指定します。

```csv
metadata.my_custom_field_1,metadata.my_custom_field_2
value 1,value 2
```

> **IMPORTANT**: `metadata` の部分更新はサポートしていません。metadata を更新する場合は、以前の値も含めた完全な metadata 一式を再度渡す必要があります。

---

## CSV の利用

CSV ファイルを使うと、Grida の customer object に対してデータを一括挿入または更新できます。

> CSV ファイル単体での upsert はサポートしていません。upsert が必要な場合は API を利用してください。

### Customer CSV file の説明

| フィールド名 | 説明                                   | 必須   | 形式   | 例                                   |
| ------------ | -------------------------------------- | ------ | ------ | ------------------------------------ |
| uuid         | 顧客の外部一意識別子                   | いいえ | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | 顧客名                                 | いいえ | -      | John Doe                             |
| email        | 顧客メールアドレス                     | いいえ | email  | user+1@example.com                   |
| phone        | 顧客電話番号                           | いいえ | E.164  | +14155552671                         |
| description  | 顧客の説明                             | いいえ | -      | A short description of the customer  |
| tags         | 顧客に付与するタグのカンマ区切り文字列 | いいえ | -      | `"tag1,tag2,tag3"`                   |
| metadata.\*  | 顧客 metadata                          | いいえ | -      | value                                |

### 挿入

挿入時には、以下のフィールドのみを指定してください。

| フィールド名 | 説明                                   | 必須   | 形式   | 例                                   |
| ------------ | -------------------------------------- | ------ | ------ | ------------------------------------ |
| uuid         | 顧客の外部一意識別子                   | いいえ | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | 顧客名                                 | いいえ | -      | John Doe                             |
| email        | 顧客メールアドレス                     | いいえ | email  | user+1@example.com                   |
| phone        | 顧客電話番号                           | いいえ | E.164  | +14155552671                         |
| description  | 顧客の説明                             | いいえ | -      | A short description of the customer  |
| tags         | 顧客に付与するタグのカンマ区切り文字列 | いいえ | -      | `"tag1,tag2,tag3"`                   |
| metadata.\*  | 顧客 metadata                          | いいえ | -      | value                                |

`uuid` は任意ですが、後で顧客を更新したい場合は指定することを勧めます。

- [`uuid` の詳細](#uuid)
- [`metadata` の詳細](#metadata)

### 更新（Unstable）

更新するには、CSV ファイルに `uid` または `uuid` フィールドを指定する必要があります。

| フィールド名 | 説明          | 必須   | 形式   | 例                                   |
| ------------ | ------------- | ------ | ------ | ------------------------------------ |
| uid / uuid   | 一意識別子    | はい   | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name         | 顧客名        | いいえ | -      | John Doe                             |
| email        | 顧客メール    | いいえ | email  | user+1@example.com                   |
| phone        | 顧客電話番号  | いいえ | E.164  | +14155552671                         |
| description  | 顧客説明      | いいえ | -      | A short description of the customer  |
| metadata.\*  | 顧客 metadata | いいえ | -      | value                                |

更新時には、指定しなかったフィールドは更新されません。

**Important**: [`metadata`](#metadata) は、一度指定すると新しい metadata 全体で置き換えられます。

**Important**: タグは CSV ファイルでは更新できません。詳細は [support](https://grida.co/contact) に問い合わせてください。

- [`uuid` の詳細](#uuid)
- [`metadata` の詳細](#metadata)
