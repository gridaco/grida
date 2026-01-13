# Database Seed Data

This document describes the seed data created by `seed.sql` for local development and testing.

## Users

The seed file creates three user personas for testing different scenarios:

| Email                | Role            | Persona        | Organization | Description                                                                                                                                   |
| -------------------- | --------------- | -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `insider@grida.co`   | `authenticated` | (you)          | `local`      | The main contributor user. Used for most development and testing scenarios. This is the "default" user flow.                                  |
| `alice@acme.com`     | `authenticated` | (other tenant) | `acme`       | A user from a different organization. Used to test multi-tenant isolation and verify that users cannot access data from other tenants.        |
| `random@example.com` | `authenticated` | (random user)  | `none`       | A user with no organization membership. Used to test access restrictions and verify that users without proper permissions cannot access data. |

All users have:

- **Password**: `password`
- **Role**: `authenticated` (Supabase auth's role system - all users are authenticated users)

## Organizations

| Name    | Owner              | Display Name | Description                                       |
| ------- | ------------------ | ------------ | ------------------------------------------------- |
| `local` | `insider@grida.co` | Local        | Local test organization for development purposes. |
| `acme`  | `alice@acme.com`   | ACME         | ACME test organization for multi-tenant testing.  |

## Projects

| Name           | Organization | Description                                     |
| -------------- | ------------ | ----------------------------------------------- |
| `dev`          | `local`      | Default project under the "local" organization. |
| `acme-project` | `acme`       | Default project under the "acme" organization.  |

## Testing Scenarios

### Insider (insider@grida.co)

- Has access to the `local` organization and `dev` project
- Should be able to access all data in their organization/project
- Used for testing normal user flows

### Alice (alice@acme.com)

- Has access to the `acme` organization and `acme-project` project
- Should NOT be able to access data from the `local` organization
- Used for testing multi-tenant isolation and cross-boundary access restrictions

### Random (random@example.com)

- Has NO organization membership
- Should NOT be able to access any organization/project data
- Used for testing access restrictions and RLS policies

## Usage

To apply the seed data:

```bash
supabase db reset --local
```

This will:

1. Drop and recreate the database
2. Apply all migrations
3. Run `seed.sql` to create the test users, organizations, and projects

**Warning**: Never run `seed.sql` on a production database!
