//! Explicit Base/Sample frame policy through resolve, query, damage, and pixels.

use anchor_engine::cache::SceneCache;
use anchor_engine::damage::diff_frame;
use anchor_engine::frame::{self, FrameRequest, FrameRequestError};
use anchor_engine::paint::{read_pixels, PaintCtx};
use anchor_engine::playback_clock::{HostTime, PlaybackClock, PlaybackRange, PlaybackRate};
use anchor_engine::replay::resolved_bits_eq;
use anchor_lab::animation::{AnimationProgram, SampleTime};
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeId};
use anchor_lab::resolve::ResolveOptions;
use anchor_lab::svg_animation::{RectSvgAnimationSource, SourceSnapshot};
use skia_safe::{surfaces, Color};

const W: i32 = 120;
const H: i32 = 72;

fn options() -> ResolveOptions {
    ResolveOptions {
        viewport: (W as f32, H as f32),
        ..Default::default()
    }
}

fn named(document: &Document, name: &str) -> NodeId {
    (0..document.capacity() as NodeId)
        .find(|id| {
            document
                .get_opt(*id)
                .and_then(|node| node.header.name.as_deref())
                == Some(name)
        })
        .expect("named SVG rectangle exists")
}

fn compile(source: &str) -> anchor_lab::svg_animation::CompiledRectSvgAnimation {
    RectSvgAnimationSource::parse(SourceSnapshot::new("frame-test.svg", source))
        .unwrap()
        .into_compiled_profile1()
        .unwrap()
}

fn pixel(bytes: &[u8], x: i32, y: i32) -> &[u8] {
    let offset = ((y * W + x) * 4) as usize;
    &bytes[offset..offset + 4]
}

#[test]
fn empty_sample_is_exactly_the_base_frame() {
    let compiled = compile(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect x="20" y="16" width="40" height="28" fill="#2563eb"/></svg>"##,
    );
    let empty = AnimationProgram::empty(compiled.document(), "empty-frame@0").unwrap();
    let context = PaintCtx::new(None);
    let base = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Base,
        &options(),
        &context,
    )
    .unwrap();
    let sampled = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: &empty,
            time: SampleTime::from_nanoseconds(i64::MAX),
        },
        &options(),
        &context,
    )
    .unwrap();

    assert!(resolved_bits_eq(base.resolved(), sampled.resolved()));
    assert_eq!(base.drawlist(), sampled.drawlist());
    assert!(diff_frame(&base, &sampled).is_empty());
    assert_eq!(
        base.raster_to_bytes(&Affine::IDENTITY, W, H, &context)
            .unwrap(),
        sampled
            .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
            .unwrap()
    );
    for point in [(0.0, 0.0), (30.0, 24.0), (80.0, 60.0)] {
        assert_eq!(
            base.query().hit_point(point.0, point.1),
            sampled.query().hit_point(point.0, point.1)
        );
    }

    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    assert!(cache
        .frame_request(
            surface.canvas(),
            compiled.document(),
            FrameRequest::Base,
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());
    assert!(
        !cache
            .frame_request(
                surface.canvas(),
                compiled.document(),
                FrameRequest::Sample {
                    program: &empty,
                    time: SampleTime::from_nanoseconds(i64::MAX),
                },
                &options(),
                &Affine::IDENTITY,
                &context,
                false,
            )
            .unwrap(),
        "empty Sample shares the Base cache key"
    );
}

#[test]
fn unsupported_dynamic_markup_still_has_an_explicit_base_frame() {
    let source = r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
  <rect id="base" x="20" y="16" width="40" height="28" fill="#2563eb"/>
  <set href="#base" attributeName="x" to="60" begin="0s"/>
</svg>
"##;
    let materialized =
        RectSvgAnimationSource::parse(SourceSnapshot::new("base-only.svg", source)).unwrap();
    assert!(materialized.has_animation_markup());
    assert!(materialized.compile_profile0().is_err());

    let context = PaintCtx::new(None);
    let base = frame::resolve_and_build_request(
        materialized.document(),
        FrameRequest::Base,
        &options(),
        &context,
    )
    .unwrap();
    let pixels = base
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_ne!(pixel(&pixels, 30, 24), &[255, 255, 255, 255]);
    assert_eq!(pixel(&pixels, 70, 24), &[255, 255, 255, 255]);
}

#[test]
fn geometry_sample_moves_query_damage_and_pixels_together() {
    let compiled = compile(
        r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
  <rect id="moving" x="10" y="20" width="24" height="24" fill="#7c3aed">
    <animate attributeName="x" from="50" to="90" dur="1s" fill="freeze"/>
  </rect>
</svg>
"##,
    );
    let moving = named(compiled.document(), "moving");
    let context = PaintCtx::new(None);
    let base = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Base,
        &options(),
        &context,
    )
    .unwrap();
    let sampled = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::ZERO,
        },
        &options(),
        &context,
    )
    .unwrap();

    assert!(!resolved_bits_eq(base.resolved(), sampled.resolved()));
    assert_eq!(base.query().hit_point(16.0, 28.0), Some(moving));
    assert_ne!(sampled.query().hit_point(16.0, 28.0), Some(moving));
    assert_eq!(sampled.query().hit_point(56.0, 28.0), Some(moving));
    let damage = diff_frame(&base, &sampled);
    assert_eq!(damage.changed, [moving]);
    assert!(damage.union_world.is_some());

    let base_pixels = base
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    let sampled_pixels = sampled
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_ne!(pixel(&base_pixels, 16, 28), &[255, 255, 255, 255]);
    assert_eq!(pixel(&sampled_pixels, 16, 28), &[255, 255, 255, 255]);
    assert_ne!(pixel(&sampled_pixels, 56, 28), &[255, 255, 255, 255]);
}

#[test]
fn keyframes_and_spline_easing_flow_through_the_complete_frame() {
    let compiled = compile(
        r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
  <rect id="bar" x="10" y="20" width="0" height="20" fill="#22d3ee">
    <animate
      attributeName="width"
      values="0;20;80"
      keyTimes="0;0.25;1"
      calcMode="spline"
      keySplines="0.5 0 0.5 1;0.5 0 0.5 1"
      dur="1s"
      fill="freeze"
    />
  </rect>
</svg>
"##,
    );
    let bar = named(compiled.document(), "bar");
    let context = PaintCtx::new(None);
    let base = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Base,
        &options(),
        &context,
    )
    .unwrap();
    let keyframe = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::from_nanoseconds(250_000_000),
        },
        &options(),
        &context,
    )
    .unwrap();
    let eased = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::from_nanoseconds(437_500_000),
        },
        &options(),
        &context,
    )
    .unwrap();

    assert_eq!(
        keyframe.resolved().box_of(bar).w.to_bits(),
        20.0_f32.to_bits()
    );
    let eased_width = eased.resolved().box_of(bar).w;
    assert!(
        (26.0..27.0).contains(&eased_width),
        "expected eased width near 26.35, found {eased_width}"
    );
    assert_eq!(keyframe.query().hit_point(29.0, 28.0), Some(bar));
    assert_ne!(keyframe.query().hit_point(31.0, 28.0), Some(bar));
    assert_eq!(eased.query().hit_point(35.0, 28.0), Some(bar));
    assert_ne!(eased.query().hit_point(40.0, 28.0), Some(bar));
    assert_eq!(diff_frame(&base, &keyframe).changed, [bar]);
    assert_eq!(diff_frame(&keyframe, &eased).changed, [bar]);

    let keyframe_pixels = keyframe
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    let eased_pixels = eased
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_ne!(pixel(&keyframe_pixels, 29, 28), &[255, 255, 255, 255]);
    assert_eq!(pixel(&keyframe_pixels, 35, 28), &[255, 255, 255, 255]);
    assert_ne!(pixel(&eased_pixels, 35, 28), &[255, 255, 255, 255]);
    assert_eq!(pixel(&eased_pixels, 40, 28), &[255, 255, 255, 255]);
}

#[test]
fn playback_clock_is_only_a_host_time_adapter_for_the_existing_frame_seam() {
    let compiled = compile(
        r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
  <rect id="moving" x="10" y="20" width="20" height="24" fill="#7c3aed">
    <animate attributeName="x" from="10" to="90" dur="1s" fill="freeze"/>
  </rect>
</svg>
"##,
    );
    let moving = named(compiled.document(), "moving");
    let context = PaintCtx::new(None);
    let range = PlaybackRange::new(
        SampleTime::ZERO,
        SampleTime::from_nanoseconds(1_000_000_000),
    )
    .unwrap();
    let mut playback = PlaybackClock::new(range, SampleTime::ZERO).unwrap();
    playback
        .set_rate(
            PlaybackRate::new(3, 2).unwrap(),
            HostTime::from_nanoseconds(100_000_000),
        )
        .unwrap();
    playback
        .play(HostTime::from_nanoseconds(100_000_000))
        .unwrap();

    let playback_time = playback
        .sample_time(HostTime::from_nanoseconds(350_000_000))
        .unwrap();
    assert_eq!(playback_time.nanoseconds(), 375_000_000);
    let through_playback = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: playback_time,
        },
        &options(),
        &context,
    )
    .unwrap();
    let direct = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::from_nanoseconds(375_000_000),
        },
        &options(),
        &context,
    )
    .unwrap();

    assert!(resolved_bits_eq(
        through_playback.resolved(),
        direct.resolved()
    ));
    assert_eq!(through_playback.drawlist(), direct.drawlist());
    assert!(diff_frame(&through_playback, &direct).is_empty());
    assert_eq!(through_playback.query().hit_point(45.0, 28.0), Some(moving));
    assert_eq!(
        through_playback
            .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
            .unwrap(),
        direct
            .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
            .unwrap()
    );

    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    assert!(cache
        .frame_request(
            surface.canvas(),
            compiled.document(),
            FrameRequest::Sample {
                program: compiled.animation(),
                time: playback_time,
            },
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());

    assert_eq!(
        playback
            .pause(HostTime::from_nanoseconds(350_000_000))
            .unwrap(),
        playback_time
    );
    let held_time = playback
        .sample_time(HostTime::from_nanoseconds(900_000_000))
        .unwrap();
    assert_eq!(held_time, playback_time);
    assert!(
        !cache
            .frame_request(
                surface.canvas(),
                compiled.document(),
                FrameRequest::Sample {
                    program: compiled.animation(),
                    time: held_time,
                },
                &options(),
                &Affine::IDENTITY,
                &context,
                false,
            )
            .unwrap(),
        "a paused host clock produces the same effective-value cache key"
    );

    let sought_time = playback
        .seek(
            SampleTime::from_nanoseconds(750_000_000),
            HostTime::from_nanoseconds(900_000_000),
        )
        .unwrap();
    assert!(cache
        .frame_request(
            surface.canvas(),
            compiled.document(),
            FrameRequest::Sample {
                program: compiled.animation(),
                time: sought_time,
            },
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());
    let sought = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: sought_time,
        },
        &options(),
        &context,
    )
    .unwrap();
    assert_eq!(sought.query().hit_point(75.0, 28.0), Some(moving));
    assert_eq!(diff_frame(&through_playback, &sought).changed, [moving]);
}

#[test]
fn opacity_sample_changes_appearance_without_resampling_geometry() {
    let compiled = compile(
        r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
  <rect id="fading" x="30" y="20" width="40" height="28" fill="#2563eb">
    <animate attributeName="opacity" from="1" to="0" dur="1s" fill="freeze"/>
  </rect>
</svg>
"##,
    );
    let fading = named(compiled.document(), "fading");
    let context = PaintCtx::new(None);
    let base = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Base,
        &options(),
        &context,
    )
    .unwrap();
    let sampled = frame::resolve_and_build_request(
        compiled.document(),
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::from_nanoseconds(500_000_000),
        },
        &options(),
        &context,
    )
    .unwrap();

    assert!(resolved_bits_eq(base.resolved(), sampled.resolved()));
    assert_eq!(base.query().hit_point(40.0, 30.0), Some(fading));
    assert_eq!(sampled.query().hit_point(40.0, 30.0), Some(fading));
    assert_ne!(base.drawlist(), sampled.drawlist());
    assert_eq!(diff_frame(&base, &sampled).changed, [fading]);

    let base_pixels = base
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    let sampled_pixels = sampled
        .raster_to_bytes(&Affine::IDENTITY, W, H, &context)
        .unwrap();
    assert_ne!(pixel(&base_pixels, 40, 30), pixel(&sampled_pixels, 40, 30));
}

#[test]
fn sample_failure_is_transactional_at_the_public_canvas_entry() {
    let compiled = compile(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect width="20" height="20"><animate attributeName="x" from="0" to="40" dur="1s"/></rect></svg>"##,
    );
    let other_document = compiled.document().clone();
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    surface.canvas().clear(Color::MAGENTA);
    let before = read_pixels(&mut surface, W, H);
    let error = frame::render_request(
        surface.canvas(),
        &other_document,
        FrameRequest::Sample {
            program: compiled.animation(),
            time: SampleTime::ZERO,
        },
        &options(),
        &Affine::IDENTITY,
        &PaintCtx::new(None),
    )
    .unwrap_err();
    assert!(matches!(error, FrameRequestError::Sample(_)));
    assert_eq!(before, read_pixels(&mut surface, W, H));
}

#[test]
fn sample_failure_preserves_the_warm_cache_and_destination() {
    let compiled = compile(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect x="20" y="16" width="40" height="28" fill="#2563eb"><animate attributeName="x" from="20" to="60" dur="1s"/></rect></svg>"##,
    );
    let other_document = compiled.document().clone();
    let context = PaintCtx::new(None);
    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    assert!(cache
        .frame_request(
            surface.canvas(),
            compiled.document(),
            FrameRequest::Base,
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap());
    let warm = read_pixels(&mut surface, W, H);

    surface.canvas().clear(Color::MAGENTA);
    let before_failure = read_pixels(&mut surface, W, H);
    let error = cache
        .frame_request(
            surface.canvas(),
            &other_document,
            FrameRequest::Sample {
                program: compiled.animation(),
                time: SampleTime::ZERO,
            },
            &options(),
            &Affine::IDENTITY,
            &context,
            false,
        )
        .unwrap_err();
    assert!(matches!(
        error,
        anchor_engine::cache::SceneCacheRequestError::Sample(_)
    ));
    assert_eq!(before_failure, read_pixels(&mut surface, W, H));

    assert!(
        !cache
            .frame_request(
                surface.canvas(),
                compiled.document(),
                FrameRequest::Base,
                &options(),
                &Affine::IDENTITY,
                &context,
                false,
            )
            .unwrap(),
        "the Base frame reuses the cache retained across failure"
    );
    assert_eq!(warm, read_pixels(&mut surface, W, H));
}

#[test]
fn cache_keys_sampled_values_instead_of_time() {
    let compiled = compile(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><rect x="10" y="20" width="20" height="20" fill="#7c3aed"><animate attributeName="x" from="10" to="70" dur="1s" fill="remove"/></rect></svg>"##,
    );
    let context = PaintCtx::new(None);
    let mut cache = SceneCache::new(W, H);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    let mut frame = |time_ns| {
        cache
            .frame_request(
                surface.canvas(),
                compiled.document(),
                FrameRequest::Sample {
                    program: compiled.animation(),
                    time: SampleTime::from_nanoseconds(time_ns),
                },
                &options(),
                &Affine::IDENTITY,
                &context,
                false,
            )
            .unwrap()
    };

    assert!(frame(0), "cold sample populates the cache");
    assert!(
        !frame(0),
        "same values reuse regardless of request identity"
    );
    assert!(frame(500_000_000), "changed sampled values invalidate");
    assert!(!frame(500_000_000), "same sample reuses");
    assert!(
        frame(1_000_000_000),
        "remove reveals the empty/base value set"
    );
    assert!(
        !frame(2_000_000_000),
        "two different times with the same empty values share one cache entry"
    );
}
