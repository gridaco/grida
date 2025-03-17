# CSV Bulk insert / update operations for Grida Customer Object

You can use the CSV file to bulk insert or update data into the Grida customer object.

> We don't support upsert with csv file. you'll need to use api for upsertion.

## Customer Object

| Field Name  | Description                            | Required | format | Example                                 | update | unique            |
| ----------- | -------------------------------------- | -------- | ------ | --------------------------------------- | ------ | ----------------- |
| uid         | system customer id                     | Yes      | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx    | No     | Yes               |
| uuid        | Your Unique identifier of the customer | No       | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx    | Yes    | Yes (if provided) |
| name        | Name of the customer                   | No       | -      | John Doe                                | Yes    | No                |
| email       | Email of the customer                  | No       | email  | user+1@example.com                      | Yes    | No                |
| phone       | Phone of the customer                  | No       | E.164  | +14155552671                            | Yes    | No                |
| description | Description of the customer            | No       | -      | A shofrt description of the customer    | Yes    | No                |
| metadata    | K:V Metadata of the customer           | No       | json   | `{"my_custom_field_1" : "value", ... }` | Yes    | No                |

### UID

`uid` is the system generated `uuidv4` unique identifier of the customer. this cannot be modified or provided by the user.

### UUID

`uuid` is a `uuidv4` format unique identifier of the customer. this can be provided by the user.
this is useful when the customer is created in another system and you want to keep the sync between the two systems.

Use this to ensure "uniqueness" of the customer within the CRM and related features.

For example,

- customer from your database
- customer from salesforce

### Metadata

Set of key-value pairs that you can attach to a customer. This can be
useful for storing additional information about the object in a
structured format.

When providing the meatadata within the CSV file, you should provide the flat JSON object.

For example, you want to upload

```json
{
  "my_custom_field_1": "value 1",
  "my_custom_field_2": "value 2"
}
```

You should provide the following value in the CSV file.

```csv
metadata.my_custom_field_1,metadata.my_custom_field_2
value 1,value 2
```

> **IMPORTANT**: We do not support partial update of `metadata`. in all operations, you must provide the full metadata with the previous values included.

### Phone

`phone` is a phone number of the customer in E.164 format. If you don't know how to format the phone number properly, you can use the
[Grida E.164 tool](https://app.grida.co/tools/e164) to format the phone number.

## Inserting

When inserting data, you should not provide any other field than the ones mentioned below.

| Field Name  | Description                            | Required | format | Example                              |
| ----------- | -------------------------------------- | -------- | ------ | ------------------------------------ |
| uuid        | Your Unique identifier of the customer | No       | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name        | Name of the customer                   | No       | -      | John Doe                             |
| email       | Email of the customer                  | No       | email  | user+1@example.com                   |
| phone       | Phone of the customer                  | No       | E.164  | +14155552671                         |
| description | Description of the customer            | No       | -      | A shofrt description of the customer |
| metadata.\* | Metadata of the customer               | No       | -      | value                                |

While the `uuid` is optional, if you wish to update the customer later, you must provide it.

- [Learn more about `uuid`](#uuid)
- [Learn more about `metadata`](#metadata)

## Updating

To upsert data, you need to provide the `uid` or `uuid` field in the CSV file.

| Field Name  | Description                 | Required | format | Example                              |
| ----------- | --------------------------- | -------- | ------ | ------------------------------------ |
| uid / uuid  | Unique identifier           | Yes      | uuidv4 | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| name        | Name of the customer        | No       | -      | John Doe                             |
| email       | Email of the customer       | No       | email  | user+1@example.com                   |
| phone       | Phone of the customer       | No       | E.164  | +14155552671                         |
| description | Description of the customer | No       | -      | A shofrt description of the customer |
| metadata.\* | Metadata of the customer    | No       | -      | value                                |

When updating, the non-provided fields will not be updated.

**Important**: For [`metadata`](#metadata), once provided, it will be replaced with the new metadata.

- [Learn more about `uuid`](#uuid)
- [Learn more about `metadata`](#metadata)
