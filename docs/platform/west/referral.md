# 🤠 Welcome to the Wild WEST - Grida WEST for Referral Campaigns

Your fun, flexible, and powerful referral engine.

**Grida WEST** is a next-gen referral campaign platform designed to help marketers launch campaigns that grow fast and reward better — without depending on devs. But don’t worry, developers get a fully structured and secure backend to plug into, too.

---

## ✨ What You Can Build

### 🪜 The Milestone Referral

_Example: "Invite 5 friends, get $5 credit. Invite 10, get $15 credit."_

Create campaigns with increasing rewards. Participants feel progress, and the excitement builds as they reach the next goal. Think gamified referral ladders.

### 🚀 The Startup Prelaunch Waitlist

_Example: "Refer friends to move up the list."_

Perfect for launches. You get early buzz and viral sharing. Invitees jump the queue by bringing in friends.

### 📬 The Newsletter Referral

_Example: "Refer 3 friends and unlock our Pro Series."_

Reward readers with content, coupons, or swag when they share your newsletter. Integrates well with Mailchimp, Beehiiv, etc.

### 🎁 The Viral Giveaway

_Example: "Enter the giveaway. Get more chances by inviting friends."_

Amplify your giveaway reach. Track who referred whom, and boost chances dynamically. Rewards can be lucky draws, digital items, or just bragging rights.

### 🛍️ Shopify Campaigns

_Example: "Refer a friend. You both get 10% off."_

Install WEST on your store and launch a 2-sided referral program that tracks to checkout. Works well with custom logic and rewards (e.g. points, credits, coupons).

### 🤝 The 2-Sided Classic

_Example: "Refer your friend, you get $10, they get $5."_

Invite codes can be public or private. WEST supports both self-invite and referrer-invite flows. You choose who sees what.

---

## 🧰 How It All Works

At the heart of every WEST campaign:

### 🎟️ Referrer

- A customer or user who shares a referral code.
- Has a unique code tied to the campaign.
- Can be limited to X invites.

### 📩 Invitation

- A trackable link/code that the invitee uses.
- Can be refreshed (securely) before it’s claimed.
- Once claimed, invitee becomes part of the campaign.

### 🪙 Rewards

- **Milestone rewards**: when a referrer hits X invites.
- **Onboarding rewards**: given to the invitee after completing a quest.
- All rewards are issued as _exchange tokens_, which are claimable later.

### 🧩 Challenges / Quests

- Define the required actions to complete an onboarding.
- Examples: "Sign up", "Make a purchase", "Verify email", etc.
- You can chain these with dependencies.

### 📊 Analytics

- Real-time logs of every tracked event.
- Visual breakdowns of event frequency, campaign growth, and referral chains.

### 🌐 Built-In Pages

- Landing pages for sharing
- Customer dashboard to track progress
- Optional public leaderboards

---

## 🙋 FAQ

### Q: Can anyone start a campaign?

Yes, as long as you’re a project owner. You can create, enable/disable, and manage all campaigns tied to your project.

### Q: Can I hide the invitee's or referrer’s info?

Yes. You control if their name or avatar is exposed. By default, we hide them unless explicitly allowed.

### Q: Can a user invite themselves?

Yes — if you want. In self-invite mode, they use a public code to generate their own invitation.

### Q: What if I want the referrer to create invitations?

You can do that too. That’s the referrer-invite mode. They create the invite and share it directly.

### Q: Can I refresh or regenerate invite links?

Yes. Unclaimed invitations can be refreshed with a new code — old codes become invalid.

### Q: Is this secure?

Yes. All campaign logic is enforced at the database level with Row-Level Security (RLS). Codes are always tied to a campaign context.

---

## 🧠 Advanced Capabilities

WEST is built on PostgreSQL with Supabase, and provides a secure, extensible data model for devs.

### 🛡️ Full RLS Enforcement

Every table has RLS enabled. Access is scoped per campaign/project. Safe for multitenant and public usage.

### 🔗 Unique Code Handling

All codes (referrer or invitee) are guaranteed to be unique within a campaign. They are stored in a dedicated `code` registry table with triggers.

### 📬 Event Hooks via `track()`

Track any user activity by calling the `track()` function. Logs are recorded in `event_log`, a hypertable that supports time-based analytics.

### 📈 Built-in Analysis API

Use `analyze()` to get time-bucketed stats by event name. Great for dashboards and funnel visualization.

### 🧪 Rewards as Exchange Tokens

Reward definitions are decoupled from actual redemption. Think of them as "earned" but not yet "delivered" — useful for managing inventory or prizes.

### 🧱 Invite Flow Functions

All key flows are handled via SQL functions:

- `invite()` – create a new invitation
- `refresh()` – regenerate invitation code
- `claim()` – mark an invitation as claimed
- `flag()` – log progress on quests/challenges

---

## 💼 For Developers / Integration

- Use the SQL functions directly from Supabase or REST/RPC endpoints.
- Schema: `grida_west_referral`
- Tables: `campaign`, `referrer`, `invitation`, `onboarding`, `event_log`, etc.
- Views for public use: `referrer_public_secure`, `invitation_public_secure`, `campaign_public`
- Docs coming soon on webhook integrations and Zapier-compatible flows.

---

## 🔚 Final Thoughts

Grida WEST gives you the flexibility of a headless referral engine, the safety of a battle-tested schema, and the joy of setting up campaigns without drowning in code.

**Launch your first campaign today.**  
Track it. Share it. Reward your champions.

The WEST is wild — but now it’s yours.

🧨 Let’s ride.
