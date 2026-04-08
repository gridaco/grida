---
name: tweet
description: Draft high-signal social posts from real work — auto-researches the current PR, recent commits, or working tree to capture the essence, then writes concise, human, builder-first posts for X/Twitter (and optionally Reddit).
---

# Tweet Skill

Turn real engineering work into short, grounded social posts.

## Research-first workflow

Before writing anything, **gather facts from the actual work**. Never draft from vibes alone.

### Step 1 — Gather context automatically

Run these in parallel to understand what was actually done:

```sh
# current working tree changes
git diff --stat
git diff          # scan for what changed

# recent commits on this branch
git log --oneline -20

# full diff against base branch (for PR-scope posts)
git log --oneline main..HEAD
git diff main...HEAD --stat

# if on a PR branch, get PR metadata
gh pr view --json title,body,url,additions,deletions,files 2>/dev/null
```

Read any relevant files (README, AGENTS.md, changelogs, specs) that the diff touches to understand the feature in context.

### Step 2 — Extract the essence

From the gathered material, identify:

1. **what was built or changed** — the concrete artifact
2. **what is now possible** that wasn't before
3. **why it was hard or notable** — implementation detail worth sharing
4. **scope** — complete feature, WIP, experiment, or fix
5. **one memorable framing** — the angle that makes someone stop scrolling

Prioritize: unusual capability > difficult engineering > UX improvement > surprising detail > compatibility > practical implication.

### Step 3 — Ask about visuals

Before drafting, **always ask the user if they have visual content** to go with the post — image, screenshot, video, or screen recording. Most high-performing posts include visuals. Use the Question tool:

- "Do you have a screenshot, image, or video to attach?"
- Options: screenshot, screen recording / video, no visual this time

If the user provides an image, use the vision skill to understand it and write the post to complement (not repeat) the visual. If no visual, suggest what would make a good one (e.g. "a 5-second screen recording of X would work well here").

### Step 4 — Draft the post

Compress the essence into a social-ready version. Do not invent details. Do not paraphrase git commit messages verbatim — synthesize.

## Voice & style

Default voice: human, builder-first, slightly understated, concise, technically literate.

Prefer: clear > clever, specific > broad, tangible > abstract, confident > flashy, short > overloaded.

A good post has: (1) what was built, (2) why it matters, (3) a tiny bit of personality, (4) optionally a link.

Sound like someone who actually built the thing. Not a company social media manager.

## Tone modes

Adjust based on user request:

| Mode              | Trigger phrases                                 | Feel                                                    |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------- |
| **Builder diary** | "more human", "personal", "quieter"             | Log from someone building every day. Mild emotion okay. |
| **Product/PR**    | "announcement", "you can now", "launch"         | Benefits-first, clean, direct. Good with screenshots.   |
| **Technical**     | "more technical", "dev audience", "engineering" | Mentions architecture, formats, specs. Still readable.  |
| **Aggressive**    | "more punch", "stronger", "traction"            | Sharper framing, stronger verbs. Still professional.    |
| **WIP/demo**      | "WIP", "demo", "early", "experiment"            | Exploratory, honest, avoids overclaiming.               |

## Output

By default, provide 3–5 options with distinct tones:

- Option A — recommended
- Option B — more personal
- Option C — more technical
- Option D — shorter / punchier

When the user already has a draft, rewrite it — don't replace with unrelated ideas.

Also supports: tweet threads, Reddit posts, tweet+Reddit pairs, one-liners, changelog-style.

### "Day N" pattern

`Day 317, Grida Canvas.` followed by what changed, why it matters, or a small note.

### Reddit style

More explicit, include implementation scope, acknowledge limitations, sound like an engineer sharing work. Structure: problem → what you built → tricky parts → limitations → link → invite discussion.

## Anti-patterns

Never sound like: Apple keynote, VC launch thread, generic SaaS marketing, AI-generated hype.

Avoid: "super excited", "game changer", "next level", "redefining", "seamless", "unlocking", "delighted to announce", "thrilled to share", excessive exclamation marks, buzzword stacking, fake humility.

No emojis or hashtags unless the user requests them.

## Rewrite examples

| Before                                            | After                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| "Background removal is built in with our canvas." | "I kept needing to clean up images while designing. So I added background removal and upscaling directly into the canvas." |
| "Export now has settings."                        | "Export now has settings. PNG, JPEG, WebP, PDF, SVG — plus scale / fit and quality."                                       |
| "A revolutionary renderer for Figma files."       | "A headless Figma renderer. Reads `.fig` and REST JSON, runs in Node or the browser."                                      |
| "Added arrow markers."                            | "Lines can finally end properly → arrows, dots, diamonds."                                                                 |

## Validation

After drafting, **always validate length** using the bundled script:

```sh
python3 .agents/skills/tweet/scripts/validate.py "Your draft text here"
python3 .agents/skills/tweet/scripts/validate.py draft.txt
```

The script reports char/word/line counts and checks against platform limits:

| Platform     | Limit        |
| ------------ | ------------ |
| Tweet        | 280 chars    |
| Reddit title | 300 chars    |
| Reddit body  | 40,000 chars |

If a draft exceeds the tweet limit, tighten it before presenting to the user. Present the final char count alongside each option so the user can see headroom at a glance (e.g. `(247/280)`).

## Constraints

- Always research the real work before drafting — never fabricate implementation details
- Always validate post length before presenting drafts
- Always ask about visuals before drafting
- Keep posts short unless thread/Reddit requested
- Do not overclaim completeness for WIP work
- Do not ask for clarification if enough signal already exists
- Result should be concise, grounded, tonally controlled, and distinct from marketing copy
