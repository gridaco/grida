//! Deterministic frame-sequence host for the latest supported SVG animation
//! profile.
//!
//! The engine emits exact-time PNG samples. Video/GIF assembly remains host
//! tooling (for example ffmpeg), not a semantic engine dependency.

use anchor_engine::frame::{self, FrameRequest};
use anchor_engine::paint::PaintCtx;
use anchor_lab::animation::SampleTime;
use anchor_lab::math::Affine;
use anchor_lab::resolve::{Report, ResolveOptions};
use anchor_lab::svg_animation::{RectSvgAnimationSource, SourceSnapshot};
use serde_json::json;
use sha2::{Digest, Sha256};
use skia_safe::{surfaces, Color, EncodedImageFormat};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_FPS: u64 = 50;
const DEFAULT_DURATION_MS: u64 = 4_000;
const MAX_FRAME_COUNT: u64 = 100_000;
const MAX_FRAME_PIXELS: u64 = 16_777_216;
const MAX_TOTAL_PIXELS: u64 = 500_000_000;
const REPORT_OWNER_ID: &str = "grida-svg-animation-frame-report@1";
const OWNERSHIP_MARKER: &str = ".grida-svg-animation-frame-report-owned";
const USAGE: &str =
    "usage: svg_animation_render <input.svg> <output-directory> [fps] [duration-ms]";

fn parse_positive(source: &str, label: &str) -> Result<u64, String> {
    let value = source
        .parse::<u64>()
        .map_err(|_| format!("{label} must be a positive integer, found `{source}`"))?;
    if value == 0 {
        return Err(format!("{label} must be greater than zero"));
    }
    Ok(value)
}

/// One exact, bounded host export cadence.
///
/// This is deliberately an offline-host concern: it enumerates explicit
/// `SampleTime` inputs but knows nothing about animation programs or semantic
/// sampling. The end is exclusive, so a four-second 50 fps plan contains 200
/// samples from 0 through 3.98 seconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RenderPlan {
    fps: u64,
    duration_ms: u64,
    frame_step_ns: u64,
    end_exclusive_ns: u64,
    frame_count: u64,
    last_sample_ns: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PlannedFrame {
    index: u64,
    time_ns: i64,
}

impl RenderPlan {
    const FIRST_SAMPLE_NS: i64 = 0;

    fn new(fps: u64, duration_ms: u64) -> Result<Self, String> {
        if fps == 0 {
            return Err("fps must be greater than zero".into());
        }
        if duration_ms == 0 {
            return Err("duration-ms must be greater than zero".into());
        }
        if 1_000_000_000 % fps != 0 {
            return Err(format!(
                "fps must divide 1,000,000,000 exactly so every sample is an integer nanosecond; found {fps}"
            ));
        }

        let frame_step_ns = 1_000_000_000 / fps;
        let end_exclusive_ns = duration_ms
            .checked_mul(1_000_000)
            .ok_or_else(|| "duration overflows nanoseconds".to_string())?;
        if end_exclusive_ns % frame_step_ns != 0 {
            return Err(format!(
                "duration {duration_ms}ms is not an exact whole number of {fps}fps frames"
            ));
        }

        let frame_count = end_exclusive_ns / frame_step_ns;
        if frame_count == 0 {
            return Err("render plan must contain at least one frame".into());
        }
        if frame_count > MAX_FRAME_COUNT {
            return Err(format!(
                "refusing to render {frame_count} frames; maximum is {MAX_FRAME_COUNT}"
            ));
        }

        let last_sample_ns = (frame_count - 1)
            .checked_mul(frame_step_ns)
            .and_then(|value| i64::try_from(value).ok())
            .ok_or_else(|| "final frame exceeds signed sample time".to_string())?;

        Ok(Self {
            fps,
            duration_ms,
            frame_step_ns,
            end_exclusive_ns,
            frame_count,
            last_sample_ns,
        })
    }

    fn frames(self) -> impl Iterator<Item = PlannedFrame> {
        (0..self.frame_count).map(move |index| {
            let time_ns = index
                .checked_mul(self.frame_step_ns)
                .and_then(|value| i64::try_from(value).ok())
                .expect("RenderPlan validates every enumerated sample");
            PlannedFrame { index, time_ns }
        })
    }
}

fn raster_extent(value: f32, label: &str) -> Result<i32, String> {
    if !value.is_finite() || value <= 0.0 || value.fract() != 0.0 || value >= 2_147_483_648.0_f32 {
        return Err(format!(
            "{label} must be a positive integral signed 32-bit raster extent, found {value}"
        ));
    }
    i32::try_from(value as i64)
        .map_err(|_| format!("{label} must fit a signed 32-bit raster extent, found {value}"))
}

fn checked_render_work(width: i32, height: i32, frame_count: u64) -> Result<(), String> {
    let pixels = u64::try_from(width)
        .ok()
        .and_then(|width| {
            u64::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "raster pixel count overflows".to_string())?;
    if pixels > MAX_FRAME_PIXELS {
        return Err(format!(
            "refusing {width}x{height} ({pixels} pixels); maximum per frame is {MAX_FRAME_PIXELS}"
        ));
    }
    let total = pixels
        .checked_mul(frame_count)
        .ok_or_else(|| "total sampled pixel count overflows".to_string())?;
    if total > MAX_TOTAL_PIXELS {
        return Err(format!(
            "refusing {frame_count} frames totaling {total} sampled pixels; maximum is {MAX_TOTAL_PIXELS}"
        ));
    }
    Ok(())
}

fn ensure_resolved_without_errors(reports: &[Report]) -> Result<(), String> {
    for report in reports {
        match report {
            Report::Clamped { .. } => {}
            Report::IgnoredByRule { node, field, rule }
            | Report::ErrorByRule { node, field, rule } => {
                return Err(format!(
                    "node {node} could not resolve `{field}` while rendering animation: {rule}"
                ));
            }
        }
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut output, "{byte:02x}").expect("writing to String cannot fail");
    }
    output
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{nanos}", std::process::id())
}

/// A report is assembled privately. Ordinary errors before or during publish
/// preserve or restore the prior report; Drop removes incomplete work. The
/// two-rename replacement is deliberately not claimed to be crash-atomic.
struct StagingDirectory {
    path: PathBuf,
    published: bool,
}

impl StagingDirectory {
    fn create(output: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(output)
            .map_err(|error| format!("create {}: {error}", output.display()))?;
        let path = output.join(format!(".frames-staging-{}", unique_suffix()));
        std::fs::create_dir(&path)
            .map_err(|error| format!("create {}: {error}", path.display()))?;
        Ok(Self {
            path,
            published: false,
        })
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn publish(mut self, final_path: &Path) -> Result<(), String> {
        let staged_owner = std::fs::read_to_string(self.path.join(OWNERSHIP_MARKER))
            .map_err(|error| format!("staged report has no ownership marker: {error}"))?;
        if staged_owner != format!("{REPORT_OWNER_ID}\n") {
            return Err("staged report has an incompatible ownership marker".into());
        }
        let parent = final_path
            .parent()
            .ok_or_else(|| format!("{} has no parent directory", final_path.display()))?;
        let backup = parent.join(format!(".frames-backup-{}", unique_suffix()));

        if final_path.exists() {
            let metadata = std::fs::symlink_metadata(final_path)
                .map_err(|error| format!("inspect {}: {error}", final_path.display()))?;
            if !metadata.file_type().is_dir() {
                return Err(format!(
                    "refusing to replace non-directory {}",
                    final_path.display()
                ));
            }
            let marker = final_path.join(OWNERSHIP_MARKER);
            let owner = std::fs::read_to_string(&marker).map_err(|_| {
                format!(
                    "refusing to replace unowned {}; expected {}",
                    final_path.display(),
                    marker.display()
                )
            })?;
            if owner != format!("{REPORT_OWNER_ID}\n") {
                return Err(format!(
                    "refusing to replace {} owned by an incompatible renderer",
                    final_path.display()
                ));
            }
            std::fs::rename(final_path, &backup).map_err(|error| {
                format!(
                    "move prior report {} to {}: {error}",
                    final_path.display(),
                    backup.display()
                )
            })?;
        }

        if let Err(error) = std::fs::rename(&self.path, final_path) {
            let restore = if backup.exists() {
                std::fs::rename(&backup, final_path).map_err(|restore_error| {
                    format!(
                        "; restoring {} also failed: {restore_error}",
                        final_path.display()
                    )
                })
            } else {
                Ok(())
            };
            return Err(format!(
                "publish {}: {error}{}",
                final_path.display(),
                restore.err().unwrap_or_default()
            ));
        }
        self.published = true;

        if backup.exists() {
            if let Err(error) = std::fs::remove_dir_all(&backup) {
                eprintln!(
                    "svg_animation_render: warning: report published, but could not remove backup {}: {error}",
                    backup.display()
                );
            }
        }
        Ok(())
    }
}

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        if !self.published && self.path.exists() {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

fn run() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [input, output, rest @ ..] = args.as_slice() else {
        return Err(USAGE.into());
    };
    let (fps, duration_ms) = match rest {
        [] => (DEFAULT_FPS, DEFAULT_DURATION_MS),
        [fps] => (parse_positive(fps, "fps")?, DEFAULT_DURATION_MS),
        [fps, duration_ms] => (
            parse_positive(fps, "fps")?,
            parse_positive(duration_ms, "duration-ms")?,
        ),
        _ => return Err(USAGE.into()),
    };
    let plan = RenderPlan::new(fps, duration_ms)?;

    let input_path = Path::new(input);
    let source = std::fs::read_to_string(input_path)
        .map_err(|error| format!("read {}: {error}", input_path.display()))?;
    let materialized = RectSvgAnimationSource::parse(SourceSnapshot::new(
        input_path.display().to_string(),
        source,
    ))
    .map_err(|error| error.to_string())?;
    let compiled = materialized
        .into_compiled_profile1()
        .map_err(|error| error.to_string())?;
    let (viewport_width, viewport_height) = compiled.viewport();
    let width = raster_extent(viewport_width, "SVG width")?;
    let height = raster_extent(viewport_height, "SVG height")?;
    checked_render_work(width, height, plan.frame_count)?;

    let output = Path::new(output);
    let staging = StagingDirectory::create(output)?;
    let options = ResolveOptions {
        viewport: (viewport_width, viewport_height),
        ..Default::default()
    };
    let paint_ctx = PaintCtx::default();
    let mut csv = String::from("frame,time_ns,file,sha256,bytes\n");
    let mut frame_records = Vec::with_capacity(plan.frame_count as usize);

    for PlannedFrame { index, time_ns } in plan.frames() {
        let product = frame::resolve_and_build_request(
            compiled.document(),
            FrameRequest::Sample {
                program: compiled.animation(),
                time: SampleTime::from_nanoseconds(time_ns),
            },
            &options,
            &paint_ctx,
        )
        .map_err(|error| format!("frame {index} at {time_ns}ns failed: {error}"))?;
        ensure_resolved_without_errors(&product.resolved().reports)
            .map_err(|error| format!("frame {index} at {time_ns}ns failed: {error}"))?;

        let mut surface = surfaces::raster_n32_premul((width, height))
            .ok_or_else(|| format!("could not allocate {width}x{height} raster surface"))?;
        surface.canvas().clear(Color::TRANSPARENT);
        product
            .execute(surface.canvas(), &Affine::IDENTITY, &paint_ctx)
            .map_err(|error| format!("frame {index} at {time_ns}ns failed: {error}"))?;

        let file_name = format!("frame-{index:04}.png");
        let file = staging.path().join(&file_name);
        let png = surface
            .image_snapshot()
            .encode(None, EncodedImageFormat::PNG, None)
            .ok_or_else(|| format!("PNG encoding failed for frame {index}"))?;
        let bytes = png.as_bytes();
        let hash = sha256_hex(bytes);
        std::fs::write(&file, bytes)
            .map_err(|error| format!("write {}: {error}", file.display()))?;
        writeln!(csv, "{index},{time_ns},{file_name},{hash},{}", bytes.len())
            .expect("writing to String cannot fail");
        frame_records.push(json!({
            "index": index,
            "time_ns": time_ns,
            "file": file_name,
            "sha256": hash,
            "bytes": bytes.len(),
        }));
    }

    let manifest = json!({
        "format": "grida-svg-animation-frame-report",
        "version": 1,
        "compiler_id": compiled.animation().compiler_id(),
        "source": {
            "identity": compiled.snapshot().identity(),
            "bytes": compiled.snapshot().source().len(),
            "sha256": sha256_hex(compiled.snapshot().source().as_bytes()),
        },
        "viewport": { "width": width, "height": height },
        "cadence": {
            "fps": plan.fps,
            "frame_step_ns": plan.frame_step_ns,
            "duration_ms": plan.duration_ms,
            "frame_count": plan.frame_count,
            "first_sample_ns": RenderPlan::FIRST_SAMPLE_NS,
            "last_sample_ns": plan.last_sample_ns,
            "end_exclusive_ns": plan.end_exclusive_ns,
        },
        "frames": frame_records,
    });
    let manifest = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("serialize frame manifest: {error}"))?
        + "\n";
    std::fs::write(staging.path().join("manifest.json"), manifest)
        .map_err(|error| format!("write frame manifest: {error}"))?;
    std::fs::write(staging.path().join("frames.csv"), csv)
        .map_err(|error| format!("write frame index: {error}"))?;
    std::fs::write(
        staging.path().join(OWNERSHIP_MARKER),
        format!("{REPORT_OWNER_ID}\n"),
    )
    .map_err(|error| format!("write report ownership marker: {error}"))?;

    let frames = output.join("frames");
    staging.publish(&frames)?;
    println!(
        "rendered {} independent samples from {} to {} ({width}x{height}, {}fps, {}ms)",
        plan.frame_count,
        input_path.display(),
        frames.display(),
        plan.fps,
        plan.duration_ms,
    );
    println!("frame manifest: {}", frames.join("manifest.json").display());
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("svg_animation_render: {error}");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("grida-svg-animation-{label}-{}", unique_suffix()))
    }

    #[test]
    fn raster_extents_reject_the_f32_value_above_i32_max() {
        assert_eq!(raster_extent(960.0, "width"), Ok(960));
        assert!(raster_extent(0.0, "width").is_err());
        assert!(raster_extent(1.5, "width").is_err());
        assert!(raster_extent(2_147_483_648.0_f32, "width").is_err());
    }

    #[test]
    fn render_plan_enumerates_an_exact_end_exclusive_cadence() {
        let plan = RenderPlan::new(50, 4_000).unwrap();
        assert_eq!(plan.frame_step_ns, 20_000_000);
        assert_eq!(plan.frame_count, 200);
        assert_eq!(plan.end_exclusive_ns, 4_000_000_000);
        assert_eq!(plan.last_sample_ns, 3_980_000_000);

        let frames = plan.frames().collect::<Vec<_>>();
        assert_eq!(frames.len(), 200);
        assert_eq!(
            frames.first(),
            Some(&PlannedFrame {
                index: 0,
                time_ns: RenderPlan::FIRST_SAMPLE_NS,
            })
        );
        assert_eq!(
            frames.last(),
            Some(&PlannedFrame {
                index: 199,
                time_ns: 3_980_000_000,
            })
        );
        assert!(frames
            .windows(2)
            .all(|pair| pair[1].time_ns - pair[0].time_ns == plan.frame_step_ns as i64));
    }

    #[test]
    fn render_plan_rejects_inexact_or_empty_cadence() {
        assert_eq!(
            RenderPlan::new(0, 1_000).unwrap_err(),
            "fps must be greater than zero"
        );
        assert_eq!(
            RenderPlan::new(50, 0).unwrap_err(),
            "duration-ms must be greater than zero"
        );
        assert!(RenderPlan::new(60, 1_000)
            .unwrap_err()
            .contains("fps must divide"));
        assert!(RenderPlan::new(125, 10)
            .unwrap_err()
            .contains("not an exact whole number"));
    }

    #[test]
    fn render_plan_enforces_duration_and_frame_count_bounds() {
        assert_eq!(
            RenderPlan::new(1_000, 100_000).unwrap().frame_count,
            MAX_FRAME_COUNT
        );
        assert!(RenderPlan::new(1_000, 100_001)
            .unwrap_err()
            .contains("maximum is 100000"));
        assert_eq!(
            RenderPlan::new(1, u64::MAX).unwrap_err(),
            "duration overflows nanoseconds"
        );
    }

    #[test]
    fn work_limits_cover_each_frame_and_the_complete_sequence() {
        assert!(checked_render_work(960, 540, 200).is_ok());
        assert!(checked_render_work(4097, 4097, 1).is_err());
        assert!(checked_render_work(4096, 4096, 30).is_err());
    }

    #[test]
    fn publishing_refuses_to_replace_an_unowned_directory() {
        let output = test_directory("unowned");
        let final_path = output.join("frames");
        std::fs::create_dir_all(&final_path).unwrap();
        std::fs::write(final_path.join("keep.txt"), "prior report").unwrap();
        let staging = StagingDirectory::create(&output).unwrap();
        std::fs::write(
            staging.path().join(OWNERSHIP_MARKER),
            format!("{REPORT_OWNER_ID}\n"),
        )
        .unwrap();
        std::fs::write(staging.path().join("new.txt"), "new report").unwrap();

        let error = staging.publish(&final_path).unwrap_err();
        assert!(error.contains("refusing to replace unowned"), "{error}");
        assert_eq!(
            std::fs::read_to_string(final_path.join("keep.txt")).unwrap(),
            "prior report"
        );
        std::fs::remove_dir_all(output).unwrap();
    }

    #[test]
    fn publishing_replaces_an_owned_report_only_after_staging() {
        let output = test_directory("owned");
        let final_path = output.join("frames");
        std::fs::create_dir_all(&final_path).unwrap();
        std::fs::write(
            final_path.join(OWNERSHIP_MARKER),
            format!("{REPORT_OWNER_ID}\n"),
        )
        .unwrap();
        std::fs::write(final_path.join("old.txt"), "old report").unwrap();
        let staging = StagingDirectory::create(&output).unwrap();
        std::fs::write(
            staging.path().join(OWNERSHIP_MARKER),
            format!("{REPORT_OWNER_ID}\n"),
        )
        .unwrap();
        std::fs::write(staging.path().join("new.txt"), "new report").unwrap();

        staging.publish(&final_path).unwrap();
        assert!(!final_path.join("old.txt").exists());
        assert_eq!(
            std::fs::read_to_string(final_path.join("new.txt")).unwrap(),
            "new report"
        );
        std::fs::remove_dir_all(output).unwrap();
    }
}
