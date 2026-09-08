# CLI workflow prompts

Human-authored requests for a person or an external harness such as Codex to
carry out using Grida CLI. These are fixed inputs for manual exercises, not
deterministic output tests or Grida agent prompts. No harness consumes them
automatically. Generated media and run reports do not belong in fixtures.

Each file contains a copyable user request, the intended handoffs, and criteria
for judging the result. The prompts describe useful deliverables rather than
isolated model calls. Use current model descriptors to choose exact operations;
these briefs do not grant capabilities absent from the CLI.

| Prompt                                                                      | Workflow                                                                             | Current prerequisite                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Lunar courier asset kit](lunar-courier-asset-kit.md)                       | Image → image-to-3D; matching SFX; local asset index                                 | Configured image, fal 3D and ElevenLabs SFX access. Inline image handoff exists.                                                               |
| [Paper boat film](paper-boat-film.md)                                       | Image → image-to-video; SFX → local audio/video assembly                             | An explicitly authorized HTTPS image handoff. CLI video input requires HTTPS; the CLI has no upload command.                                   |
| [Midnight greenhouse listening card](midnight-greenhouse-listening-card.md) | Image → reference-based image variation; narration and music → local listening card  | Image references, an ElevenLabs voice, and GG music access. Music currently has no BYOK route.                                                 |
| [Two-language trail-camera launch](trail-camera-launch.md)                  | Image → reference-based campaign variation; two speech calls; local captioned videos | Image references, an ElevenLabs voice suitable for both languages, and local video assembly. This uses still-image editing, not a video model. |

These are unexecuted examples. An operation being discoverable does not establish
provider entitlement, output quality or a successful end-to-end workflow. SFX,
speech and 3D descriptors are currently staged despite having executable contracts.

## Run with a harness

The [CLI package](../../packages/grida-cli/README.md) owns installation and local
build instructions. This preview is not the legacy `grida` npm release. The
[media contract](https://grida.co/docs/wg/cli/media) owns command syntax and
availability semantics; do not duplicate those rules in these fixtures.

Before paid execution, present the selected brief, exact provider/model/input
variants, call counts and cost basis. Wait for the user's approval of that run.
Use only the approved credential home and providers. Missing providers are normal;
do not require every supported key or switch billing routes silently.

All generated image, video, audio and 3D outputs in these exercises come through
`grida generate`. The external harness owns sequencing, visual judgment, prompt
writing and local file work. A shell, JSON/base64 utility or local compositor can
connect artifacts; label that work separately from model generation. If a handoff
is unsupported, report it instead of bypassing the CLI with a raw provider SDK or
presenting a local animation as video-model output.

For each dependent stage, inspect the earlier result and use its actual artifact.
An image-conditioned operation must receive those image bytes or its authorized
URL. A music or SFX operation may instead receive a text direction written by the
harness after looking at the image; record that distinction. These are different
kinds of dependency, not interchangeable claims of multimodal model input.

## Evidence from a run

Use a fresh output directory outside this fixture tree. Keep the exact creative
inputs, CLI JSON requests, command recipes, captured descriptors and CLI receipts.
For a large inline input, retain the source artifact and deterministic encoding
recipe rather than duplicating base64 in the report. Never keep credentials,
authorization headers or signed provider URLs in a shareable report.

Write a short `report.md` beside the outputs with:

- The brief, CLI version/commit, selected operations, call counts and timings.
- An artifact map: which output became which later input, with local hashes.
- What completed, failed, was skipped, or remains unverified; keep partial outputs.
- A result for each fixture criterion, including visual/audio inspection and any
  unavailable inspection tool. A successful request is not proof of useful media.
- Local glue work, manual interventions, and CLI friction encountered.
- Actual charges only if observed; otherwise label estimates and provider credit
  units. Keep account identifiers and private billing responses out of the report.

Use one paid attempt per approved stage. A rejected or ambiguous submission does
not authorize a retry, alternate model or replacement provider. A later failure
does not invalidate an already useful earlier artifact. Publishing and promoting
selected findings into canonical documentation are separate from creating a local
run report; do not commit generated files by default.
