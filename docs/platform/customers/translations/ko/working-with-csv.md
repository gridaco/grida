# Grida 고객 객체를 위한 CSV 파일 일괄 삽입/업데이트 작업

CSV 파일을 사용하여 Grida 고객 객체에 데이터를 대량으로 삽입하거나 업데이트할 수 있습니다.

> CSV 파일을 통한 upsert(삽입+업데이트)는 지원하지 않습니다. upsert 작업을 하려면 API를 사용해야 합니다.

## 고객 객체(Customer Object)

| 필드 이름   | 설명                                  | 필수 여부 | 형식   | 예시                                 |
| ----------- | ------------------------------------- | --------- | ------ | ------------------------------------ |
| uid         | Grida에서 생성된 고객의 고유 식별자   | 예        | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| uuid        | 고객의 고유 식별자 (외부 시스템 제공) | 아니오    | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name        | 고객의 이름                           | 아니오    | -      | 홍길동                               |
| phone       | 고객의 전화번호                       | 아니오    | E.164  | +821055512345                        |
| email       | 고객의 이메일                         | 아니오    | email  | user+1@example.com                   |
| description | 고객에 대한 설명                      | 아니오    | -      | 고객에 대한 간략한 설명              |
| metadata    | 고객과 관련된 K:V 형식의 추가 데이터  | 아니오    | json   | `{"my_custom_field_1":"value",...}`  |

### `uid`

`uid`는 Grida에서 자동 생성된 고객의 고유 식별자이며, 수정할 수 없습니다.

### `uuid`

`uuid`는 외부 시스템에서 생성된 고객의 고유 식별자를 보관할 때 사용됩니다.  
이는 외부 시스템과 고객 정보를 동기화할 때 유용합니다.

예시로는 다음과 같습니다.

- 자체 데이터베이스의 고객 정보
- Salesforce에서 관리하는 고객 정보

### `metadata`

고객에 대한 추가적인 키-값 형태의 정보를 저장할 수 있습니다. CSV 파일에 메타데이터를 입력할 때는 다음 형식으로 입력합니다.

예:

```json
{
  "my_custom_field_1": "value 1",
  "my_custom_field_2": "value 2"
}
```

CSV 파일에서는 다음과 같이 작성합니다.

```csv
metadata.my_custom_field_1,metadata.my_custom_field_2
value 1,value 2
```

> **중요:** 메타데이터는 반드시 위와 같이 평면화된 형식으로 제공해야 합니다.

### 전화번호 형식(phone)

전화번호를 E.164 형식으로 변환하려면 [Grida E.164 변환 도구](https://grida.co/tools/e164)를 이용하면 됩니다.

## 삽입(Inserting)

데이터를 삽입할 때는 아래 필드만 제공해야 합니다.

| 필드 이름   | 설명                                 | 필수 여부 | 형식   | 예시                                 |
| ----------- | ------------------------------------ | --------- | ------ | ------------------------------------ |
| uuid        | 외부 시스템에서 제공된 고객의 식별자 | 아니오    | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name        | 고객의 이름                          | 아니오    | -      | 홍길동                               |
| phone       | 고객의 전화번호                      | 아니오    | E.164  | +821055512345                        |
| email       | 고객의 이메일                        | 아니오    | email  | user+1@example.com                   |
| description | 고객에 대한 설명                     | 아니오    | -      | 고객에 대한 간략한 설명              |
| metadata.\* | 고객과 관련된 메타데이터             | 아니오    | json   | {"my_custom_field_1":"value",...}    |

`uuid`는 선택 사항이지만, 나중에 고객 정보를 업데이트하려면 반드시 제공해야 합니다.

- [`uuid` 에 대해 더 알아보기](#uuid)
- [`metadata` 에 대해 더 알아보기](#metadata)

## 업데이트(Updating)

데이터를 업데이트하려면 CSV 파일에 `uid` 또는 `uuid` 필드를 반드시 제공해야 합니다.

| 필드 이름   | 설명                     | 필수 여부 | 형식   | 예시                                 |
| ----------- | ------------------------ | --------- | ------ | ------------------------------------ |
| uid / uuid  | 고객 식별자              | 예        | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name        | 고객의 이름              | 아니오    | -      | 홍길동                               |
| phone       | 고객의 전화번호          | 아니오    | E.164  | +821055512345                        |
| email       | 고객의 이메일            | 아니오    | email  | user+1@example.com                   |
| description | 고객 설명                | 아니오    | -      | 고객에 대한 간략한 설명              |
| metadata.\* | 고객과 관련된 메타데이터 | 아니오    | json   | {"my_custom_field_1":"value",...}    |

업데이트 시, 제공하지 않은 필드는 변경되지 않습니다.

**중요**: [`metadata`](#metadata)는 한 번 제공되면 새로 제공한 메타데이터로 완전히 교체됩니다.

- [`uuid` 에 대해 더 알아보기](#uuid)
- [`metadata` 에 대해 더 알아보기](#metadata)
