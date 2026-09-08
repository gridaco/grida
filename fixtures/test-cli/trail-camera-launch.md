# Two-language trail-camera launch

## Prompt

> I'm launching a fictional compact trail camera called Fern. Use Grida CLI to
> create one clear product image: a moss-green, rounded rectangular camera with
> a black lens, one amber indicator and a short fabric wrist loop, on a pale
> stone surface. No text inside the generated image. Then use that image as a
> reference to place the same camera beside a damp fern on a forest trail.
>
> Make two twelve-second launch clips from those same stills, one in English and
> one in Korean. Use these lines exactly: "Meet Fern. A small camera for the
> paths you take slowly. Keep the moments. Leave only footprints." and
> "펀을 만나보세요. 천천히 걷는 길을 위한 작은 카메라. 순간은 간직하고, 발자국만 남기세요."
> Choose an available voice that supports both languages. Keep the product
> design, pacing and typography consistent, but fit each language naturally.
>
> Generate the images and speech with the CLI, then use simple local cuts and
> gentle still-image movement to assemble the clips. These are edited stills,
> not video-model generations. Add readable captions and a final Fern title
> locally. Do not rush or truncate speech to force the duration: report if the
> requested timing cannot be met with the available controls.
>
> Deliver both MP4s, the stills, separate narration tracks, captions, requests
> and receipts. Include a short comparison of pronunciation, caption timing,
> product consistency and manual work. Propose a first pass of two image calls
> and two speech calls before spending; no extra variants or silent retries.

## Handoffs

Product image → image-reference variation. Two text scripts → separate speech
operations. Saved stills, speech and captions → local video assembly. A compositor
and a font covering both writing systems are host tools, not CLI model capabilities.
Forced alignment and speech recognition are not current CLI commands; caption
timing and pronunciation review must identify the tools or human judgment used.

## Judge the result

- Both images depict the same lens, indicator, wrist loop and overall object.
- The two voice tracks preserve the supplied words; Korean is readable and does
  not render as missing glyphs in captions.
- Captions follow the spoken lines, remain legible and do not cover the product.
- Both outputs share composition and branding without clipped or unnaturally
  accelerated narration; any duration miss is explicit.
- The report identifies genuine reference-image use and distinguishes the two
  speech generations from local editing.
