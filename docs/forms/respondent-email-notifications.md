---
title: Respondent email notifications
description: Learn how to send a custom confirmation email to respondents after a form submission in Grida Forms (CIAM verified email required).
---

### Respondent email notifications

Respondent email notifications let you send a **custom confirmation email** to the person who submitted your form.

This is useful for signup and registration forms where you want to:

- confirm the submission
- share next steps
- include a reference like a submission ID

### Before you start (CIAM / verified email)

Grida sends respondent emails **only when CIAM is used** and the respondent has a **verified email**.

Practically, this means:

- your form should include a `challenge_email` field (CIAM email verification)
- the email is sent to the verified email associated with the submission (not to an arbitrary input field)

### How to enable respondent email notifications

1. Open your **Form** in the Grida editor.
2. In the left sidebar, click [**Connect**](https://grida.co/_/connect).
3. Click [**Channels**](https://grida.co/_/connect/channels).
4. Under **Email Notifications**, find **Respondent email notifications**.
5. Toggle **Enable** on.
6. Click **Save**.

### How to customize the email

1. Open [**Connect → Channels**](https://grida.co/_/connect/channels) → **Email Notifications** (same as above).
2. Configure the email fields:
   - **Reply-To** (optional): where replies should go (e.g. `support@yourdomain.com`)
   - **Subject**: the email subject template
   - **From name** (optional): the sender display name (e.g. `Acme Support`)
   - **Body (HTML)**: the email body template (HTML)
3. Use the built-in preview to check your subject/body.
4. Click **Save**.

### What gets sent (high level)

- **Recipient**: the respondent’s **verified email** (CIAM)
- **From email**: a fixed no-reply address (display name can be customized with **From name**)
- **When it sends**: after a successful form submission
  - if CIAM isn’t present or email isn’t verified, the email is skipped

### Templating (Handlebars variables)

Subject and Body support template variables.

#### Available variables

- `{{form_title}}`
- `{{response.idx}}` (formatted submission index)
- `{{fields.<field_name>}}` (submitted fields by field name)

#### Examples

Subject:

```txt
Thanks for registering for {{form_title}}
```

Body (HTML):

```html
<h1>Thanks, {{fields.first_name}}!</h1>
<p>We received your submission for {{form_title}}.</p>
<p>Your registration number: {{response.idx}}</p>
```

### Troubleshooting

If emails are not being sent:

- **CIAM not enabled**: ensure your form includes a `challenge_email` field
- **Email not verified**: respondent must complete verification; unverified emails are skipped
- **Missing body template**: sending is skipped if the body is empty
- **Delivery reliability**: sending is currently best-effort inline. Retries/queueing may be added later.
