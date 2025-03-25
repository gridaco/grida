# Tags

Tags are labels used to categorize, segment, and filter resources within your project. They allow you to organize your data clearly and flexibly.

## Tag Structure

A tag consists of:

| Field         | Description                               | Required | Format | Example                  |
| ------------- | ----------------------------------------- | -------- | ------ | ------------------------ |
| `name`        | Unique identifier of the tag              | Yes      | text   | `"premium-user"`         |
| `color`       | Visual indicator for the tag              | No       | hex    | `"#ff0000"`              |
| `description` | Optional context or details about the tag | No       | text   | `"High-value customers"` |

## Features

- **Project-scoped:** Tags are unique per project context.
- **Automatic Creation:** Tags are automatically created if they don't exist when associating them with resources.
- **Easy Management:** Renaming a tag updates all associated references automatically.

## Usage Example

When associating tags with a resource, use the following structure:

```json
{
  "tags": ["premium-user", "new-customer", "vip"]
}
```

## Best Practices

- Use clear, descriptive names for easy identification.
- Leverage colors to visually differentiate tag categories.
- Regularly review and clean up tags to keep your project organized.

## Supported Resources

Currently, tags are supported for the following resources:

- [**Customer**](../customers/): Organize, segment, and manage your customers efficiently using tags.
