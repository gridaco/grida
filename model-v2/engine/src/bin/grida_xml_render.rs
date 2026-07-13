//! Thin local-file host for the versioned `.grida.xml` proof.
//!
//! The source linker remains pure behind a host-supplied [`SourceProvider`].
//! This binary owns source and image path I/O, a platform typeface, the raster
//! surface, and PNG encoding; the materialized ordinary scene still runs
//! through the engine's one frame entry.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use anchor_engine::frame;
use anchor_engine::paint::PaintCtx;
use anchor_lab::grida_xml_source::{self, MaterializedProgram, SourceProvider, SourceSnapshot};
use anchor_lab::math::Affine;
use anchor_lab::model::{Document, NodeId, Paint, Payload, ResourceRef};
use anchor_lab::resolve::{Report, ResolveOptions, Resolved};
use skia_safe::{surfaces, Color, EncodedImageFormat, FontMgr, FontStyle};

const DEFAULT_WIDTH: i32 = 1280;
const DEFAULT_HEIGHT: i32 = 720;
const USAGE: &str = "usage: grida_xml_render <input.grida.xml> <output.png> [width height]";

struct LocalFileSourceProvider;

impl LocalFileSourceProvider {
    /// Freeze one filesystem source as the canonical immutable snapshot the
    /// linker requires. Canonical paths make aliases and symlinks share one
    /// source identity and base within the link operation.
    fn snapshot(path: &Path) -> Result<SourceSnapshot, String> {
        let canonical = std::fs::canonicalize(path)
            .map_err(|error| format!("resolve source {}: {error}", path.display()))?;
        let source = std::fs::read_to_string(&canonical)
            .map_err(|error| format!("read source {}: {error}", canonical.display()))?;
        let identity = canonical
            .to_str()
            .ok_or_else(|| format!("source path is not valid UTF-8: {}", canonical.display()))?
            .to_owned();
        let parent = canonical
            .parent()
            .ok_or_else(|| format!("source has no parent directory: {}", canonical.display()))?;
        let base = parent
            .to_str()
            .ok_or_else(|| format!("source base is not valid UTF-8: {}", parent.display()))?
            .to_owned();
        Ok(SourceSnapshot::new(identity, base, source))
    }
}

impl SourceProvider for LocalFileSourceProvider {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        if location.contains("://") || location.starts_with("data:") {
            return Err(format!(
                "non-file source location `{location}` is not supported by this file host"
            ));
        }
        let location = Path::new(location);
        let path = if location.is_absolute() {
            location.to_path_buf()
        } else {
            Path::new(containing.base()).join(location)
        };
        Self::snapshot(&path)
    }
}

fn materialize_file(path: &Path) -> Result<MaterializedProgram, String> {
    let entry = LocalFileSourceProvider::snapshot(path)?;
    grida_xml_source::materialize(entry, &mut LocalFileSourceProvider)
        .map_err(|error| error.to_string())
}

fn parse_extent(value: &str, label: &str) -> Result<i32, String> {
    let extent = value
        .parse::<i32>()
        .map_err(|_| format!("{label} must be a positive integer, got `{value}`"))?;
    if extent <= 0 {
        return Err(format!("{label} must be positive, got `{value}`"));
    }
    Ok(extent)
}

fn dimensions(args: &[String]) -> Result<(i32, i32), String> {
    match args {
        [] => Ok((DEFAULT_WIDTH, DEFAULT_HEIGHT)),
        [width, height] => Ok((
            parse_extent(width, "width")?,
            parse_extent(height, "height")?,
        )),
        _ => Err(USAGE.into()),
    }
}

fn node_label(doc: &Document, id: NodeId) -> String {
    doc.get(id)
        .header
        .name
        .as_deref()
        .map(|name| format!("`{name}`"))
        .unwrap_or_else(|| format!("node {id}"))
}

fn provenance_suffix(program: &MaterializedProgram, id: NodeId) -> String {
    let Some(provenance) = program.provenance.get(&id) else {
        return String::new();
    };
    let mut suffix = format!("; authored in {}", provenance.source);
    if let Some(component) = &provenance.component {
        suffix.push_str(&format!(" as {component}"));
    }
    for site in &provenance.use_chain {
        suffix.push_str(&format!(
            " via {}:{} -> {}",
            site.source, site.span.start, site.href
        ));
    }
    suffix
}

fn collect_visible_image_resources(
    doc: &Document,
    id: NodeId,
    out: &mut Vec<(NodeId, ResourceRef)>,
) {
    let node = doc.get(id);
    if !node.header.active {
        return;
    }
    for paint in node.fills.iter().filter(|paint| paint.visible()) {
        if let Paint::Image(image) = paint {
            out.push((id, image.image.clone()));
        }
    }
    if let Payload::AttributedText {
        attributed_string, ..
    } = &node.payload
    {
        for paint in attributed_string
            .runs
            .iter()
            .filter_map(|run| run.fills.as_ref())
            .flat_map(|fills| fills.iter())
            .filter(|paint| paint.visible())
        {
            if let Paint::Image(image) = paint {
                out.push((id, image.image.clone()));
            }
        }
    }
    for stroke in node
        .strokes
        .iter()
        .filter(|stroke| stroke.renderable_for(&node.payload, node.corner_smoothing))
    {
        for paint in stroke.paints.iter().filter(|paint| paint.visible()) {
            if let Paint::Image(image) = paint {
                out.push((id, image.image.clone()));
            }
        }
    }
    for &child in &node.children {
        collect_visible_image_resources(doc, child, out);
    }
}

fn local_resource_path(base: &Path, rid: &str) -> Result<PathBuf, String> {
    if rid.contains("://") || rid.starts_with("data:") {
        return Err(format!(
            "non-file image resource `{rid}` is not supported by this file host"
        ));
    }
    let path = Path::new(rid);
    Ok(if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    })
}

/// Resolve and decode every image that can contribute to the frame before any
/// paint command runs. Materialization has already replaced authored RIDs with
/// collision-free runtime keys; the manifest restores each key's lexical
/// source and canonical base for host I/O and diagnostics.
fn load_image_resources(
    program: &MaterializedProgram,
    paint_ctx: &mut PaintCtx,
) -> Result<(), String> {
    let doc = &program.document;
    let mut manifest = BTreeMap::new();
    for resource in &program.resources {
        if manifest
            .insert(resource.runtime_rid.as_str(), resource)
            .is_some()
        {
            return Err(format!(
                "duplicate runtime image resource `{}` in materialized manifest",
                resource.runtime_rid
            ));
        }
    }
    let mut refs = vec![];
    collect_visible_image_resources(doc, doc.root, &mut refs);
    let mut loaded = BTreeSet::new();
    for (node, resource) in refs {
        let runtime_rid = match resource {
            ResourceRef::Rid(rid) => rid,
            ResourceRef::Hash(hash) => {
                return Err(format!(
                    "{} content-hash image resource `{hash}` is not supported by this file host",
                    node_label(doc, node)
                ));
            }
        };
        let resource = manifest.get(runtime_rid.as_str()).ok_or_else(|| {
            format!(
                "{} image runtime resource `{runtime_rid}` is absent from the materialized manifest",
                node_label(doc, node)
            )
        })?;
        // Runtime keys are unique only within one materialized program. Load
        // each key once per call, but deliberately replace an older context
        // entry when a host reuses its PaintCtx across program reloads.
        if !loaded.insert(runtime_rid.clone()) {
            continue;
        }
        let authored = &resource.authored;
        let source = &resource.source;
        let resolved =
            local_resource_path(Path::new(&resource.base), authored).map_err(|error| {
                format!(
                    "{} image `{authored}` authored in {source}: {error}",
                    node_label(doc, node)
                )
            })?;
        let bytes = std::fs::read(&resolved).map_err(|error| {
            format!(
                "{} image `{authored}` authored in {source} resolved to {}: {error}",
                node_label(doc, node),
                resolved.display()
            )
        })?;
        paint_ctx
            .insert_encoded(runtime_rid.clone(), &bytes)
            .map_err(|error| {
                format!(
                    "{} image `{authored}` authored in {source} resolved to {}: {error}",
                    node_label(doc, node),
                    resolved.display()
                )
            })?;
    }
    Ok(())
}

/// A resolver report that says intent was ignored or underdetermined is a
/// failed file render, not a warning the CLI may discard. Ordinary min/max
/// and span clamps remain valid resolved output.
fn ensure_resolved_without_errors(
    program: &MaterializedProgram,
    resolved: &Resolved,
) -> Result<(), String> {
    let doc = &program.document;
    for report in &resolved.reports {
        let (node, field, rule) = match report {
            Report::IgnoredByRule { node, field, rule }
            | Report::ErrorByRule { node, field, rule } => (*node, *field, *rule),
            Report::Clamped { .. } => continue,
        };
        return Err(format!(
            "{} could not resolve `{field}`: {rule}{}",
            node_label(doc, node),
            provenance_suffix(program, node)
        ));
    }
    Ok(())
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [input, output, rest @ ..] = args.as_slice() else {
        return Err(USAGE.into());
    };
    let (width, height) = dimensions(rest)?;

    let program = materialize_file(Path::new(input))?;
    let doc = &program.document;

    let mut surface = surfaces::raster_n32_premul((width, height))
        .ok_or_else(|| format!("could not allocate {width}x{height} raster surface"))?;
    surface.canvas().clear(Color::WHITE);

    let options = ResolveOptions {
        viewport: (width as f32, height as f32),
        ..Default::default()
    };
    let font = FontMgr::new()
        .legacy_make_typeface(None, FontStyle::default())
        .ok_or_else(|| "no platform-default typeface is available".to_string())?;
    let mut paint_ctx = PaintCtx::new(Some(font));
    load_image_resources(&program, &mut paint_ctx)?;
    let (product, _) = frame::render(
        surface.canvas(),
        doc,
        &options,
        &Affine::IDENTITY,
        &paint_ctx,
    )
    .map_err(|error| format!("frame construction failed: {error}"))?;
    ensure_resolved_without_errors(&program, product.resolved())?;

    let image = surface.image_snapshot();
    let png = image
        .encode(None, EncodedImageFormat::PNG, None)
        .ok_or_else(|| "PNG encoding failed".to_string())?;
    std::fs::write(output, png.as_bytes())
        .map_err(|error| format!("write {}: {error}", Path::new(output).display()))?;

    println!(
        "rendered {} -> {} ({}x{})",
        Path::new(input).display(),
        Path::new(output).display(),
        width,
        height
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("grida_xml_render: {error}");
        std::process::exit(2);
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::{
        ensure_resolved_without_errors, load_image_resources, local_resource_path,
        materialize_file, LocalFileSourceProvider,
    };
    use anchor_engine::frame;
    use anchor_engine::paint::{read_pixels, PaintCtx};
    use anchor_lab::grida_xml_source::{self, MaterializedProgram, SourceSnapshot};
    use anchor_lab::math::Affine;
    use anchor_lab::resolve::{resolve, ResolveOptions};
    use skia_safe::{surfaces, Color};

    fn fixture_input() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("rig/fixtures/nested-rects.grida.xml")
    }

    fn image_fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/images")
            .join(name)
    }

    fn materialize_at_fixture(source: &str) -> MaterializedProgram {
        let input = std::fs::canonicalize(fixture_input()).unwrap();
        let identity = input.to_str().unwrap().to_owned();
        let base = input.parent().unwrap().to_str().unwrap().to_owned();
        grida_xml_source::materialize(
            SourceSnapshot::new(identity, base, source),
            &mut LocalFileSourceProvider,
        )
        .unwrap()
    }

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "grida-xml-render-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            if path.exists() {
                std::fs::remove_dir_all(&path).unwrap();
            }
            std::fs::create_dir(&path).unwrap();
            Self { path }
        }

        fn write(&self, relative: &str, bytes: &[u8]) -> PathBuf {
            let path = self.path.join(relative);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, bytes).unwrap();
            path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn probe_fixture_resolves_without_errors() {
        let program =
            materialize_at_fixture(include_str!("../../rig/fixtures/nested-rects.grida.xml"));
        let resolved = resolve(&program.document, &ResolveOptions::default());
        assert_eq!(ensure_resolved_without_errors(&program, &resolved), Ok(()));
    }

    #[test]
    fn resolution_guard_rejects_underdetermined_intent() {
        let program = materialize_at_fixture(
            r#"<grida version="0"><container width="auto" height="100"><rect name="centered" x="center" width="10" height="10"/></container></grida>"#,
        );
        let resolved = resolve(&program.document, &ResolveOptions::default());
        let error = ensure_resolved_without_errors(&program, &resolved).unwrap_err();
        assert!(
            error.contains("`centered` could not resolve `x`: End/Center pin underdetermined"),
            "{error}"
        );
        assert!(error.contains("authored in"), "{error}");
    }

    #[test]
    fn resolution_errors_inside_components_keep_definition_and_use_provenance() {
        let program = materialize_at_fixture(
            r##"<grida version="1"><component id="broken" width="auto" height="100"><rect name="centered" x="center" width="10" height="10"/></component><container width="100" height="100"><use href="#broken"/></container></grida>"##,
        );
        let resolved = resolve(&program.document, &ResolveOptions::default());
        let error = ensure_resolved_without_errors(&program, &resolved).unwrap_err();
        assert!(
            error.contains("`centered` could not resolve `x`: End/Center pin underdetermined"),
            "{error}"
        );
        assert!(error.contains("#broken"), "{error}");
        assert!(error.contains(" via "), "{error}");
        assert!(error.contains("-> #broken"), "{error}");
    }

    #[test]
    fn image_resources_resolve_from_the_document_directory() {
        let rid = "../../../../fixtures/images/border-diamonds.png";
        let source = format!(
            r#"<grida version="0"><container><rect name="image-card" width="90" height="90"><fill><image src="{rid}"/></fill></rect></container></grida>"#
        );
        let program = materialize_at_fixture(&source);
        assert_eq!(program.resources[0].authored, rid);
        let runtime_rid = program.resources[0].runtime_rid.clone();
        let mut ctx = PaintCtx::new(None);
        load_image_resources(&program, &mut ctx).unwrap();
        assert!(ctx.contains_image(&runtime_rid));
    }

    #[test]
    fn image_resources_are_discovered_in_authored_strokes() {
        let rid = "../../../../fixtures/images/border-diamonds.png";
        let source = format!(
            r#"<grida version="0"><container><rect width="90" height="90"><stroke width="8" align="inside"><image src="{rid}" fit="fill"/></stroke></rect></container></grida>"#
        );
        let program = materialize_at_fixture(&source);
        let runtime_rid = program.resources[0].runtime_rid.clone();
        let mut ctx = PaintCtx::new(None);
        load_image_resources(&program, &mut ctx).unwrap();
        assert!(ctx.contains_image(&runtime_rid));
    }

    #[test]
    fn image_resources_are_discovered_in_attributed_run_fills() {
        let rid = "../../../../fixtures/images/border-diamonds.png";
        let source = format!(
            r#"<grida version="0"><container><text width="32"><tspan><fill><image src="{rid}"/></fill>x</tspan></text></container></grida>"#
        );
        let program = materialize_at_fixture(&source);
        let runtime_rid = program.resources[0].runtime_rid.clone();
        let mut ctx = PaintCtx::new(None);
        load_image_resources(&program, &mut ctx).unwrap();
        assert!(ctx.contains_image(&runtime_rid));
    }

    #[test]
    fn missing_attributed_run_image_reports_its_authored_resource() {
        let source = r#"<grida version="0"><container><text width="32"><tspan><fill><image src="./missing-run-image.png"/></fill>x</tspan></text></container></grida>"#;
        let program = materialize_at_fixture(source);
        let error = load_image_resources(&program, &mut PaintCtx::new(None)).unwrap_err();
        assert!(error.contains("image `./missing-run-image.png`"), "{error}");
        assert!(error.contains("authored in"), "{error}");
        assert!(
            error.contains("rig/fixtures/./missing-run-image.png"),
            "{error}"
        );
    }

    #[test]
    fn image_resource_errors_name_authored_and_resolved_locations() {
        let missing = materialize_at_fixture(
            r#"<grida version="0"><container><rect name="missing" width="1" height="1"><fill><image src="./missing.png"/></fill></rect></container></grida>"#,
        );
        let mut ctx = PaintCtx::new(None);
        let error = load_image_resources(&missing, &mut ctx).unwrap_err();
        assert!(error.contains("`missing` image `./missing.png`"), "{error}");
        assert!(error.contains("authored in"), "{error}");
        assert!(error.contains("rig/fixtures/./missing.png"), "{error}");

        let corrupt = materialize_at_fixture(
            r#"<grida version="0"><container><rect name="corrupt" width="1" height="1"><fill><image src="./nested-rects.grida.xml"/></fill></rect></container></grida>"#,
        );
        let error = load_image_resources(&corrupt, &mut ctx).unwrap_err();
        assert!(
            error.contains("`corrupt` image `./nested-rects.grida.xml`"),
            "{error}"
        );
        assert!(error.contains("could not decode"), "{error}");
    }

    #[test]
    fn resource_id_shape_does_not_imply_a_hash_reference() {
        let base = Path::new("document");
        assert_eq!(
            local_resource_path(base, "hash:asset.png").unwrap(),
            base.join("hash:asset.png")
        );
    }

    #[test]
    fn external_component_sources_and_resources_resolve_from_their_own_canonical_base() {
        let temp = TestDir::new();
        let entry = temp.write(
            "entry.grida.xml",
            br#"<grida version="1"><container width="40" height="40"><use href="./components/card.grida.xml#card"/></container></grida>"#,
        );
        let component = temp.write(
            "components/card.grida.xml",
            br#"<grida version="1"><component id="card" width="20" height="20"><rect name="texture" width="20" height="20"><fill><image src="./texture.png"/></fill></rect></component></grida>"#,
        );
        temp.write(
            "components/texture.png",
            &std::fs::read(image_fixture("border-diamonds.png")).unwrap(),
        );

        let program = materialize_file(&entry).unwrap();
        assert_eq!(program.program.units().len(), 2);
        assert_eq!(program.resources.len(), 1);
        let canonical_component = std::fs::canonicalize(component).unwrap();
        let resource = &program.resources[0];
        assert_eq!(resource.source, canonical_component.to_str().unwrap());
        assert_eq!(
            resource.base,
            canonical_component.parent().unwrap().to_str().unwrap()
        );
        assert_eq!(resource.authored, "./texture.png");

        let mut ctx = PaintCtx::new(None);
        load_image_resources(&program, &mut ctx).unwrap();
        assert!(ctx.contains_image(&resource.runtime_rid));
    }

    #[test]
    fn equal_relative_resources_from_two_sources_load_under_distinct_runtime_keys() {
        let temp = TestDir::new();
        let entry = temp.write(
            "entry.grida.xml",
            br#"<grida version="1"><container width="50" height="20"><use href="./a/card.grida.xml#card"/><use href="./b/card.grida.xml#card" x="25"/></container></grida>"#,
        );
        let component = br#"<grida version="1"><component id="card" width="20" height="20"><rect width="20" height="20"><fill><image src="./texture.png"/></fill></rect></component></grida>"#;
        temp.write("a/card.grida.xml", component);
        temp.write("b/card.grida.xml", component);
        let a_image = temp.write(
            "a/texture.png",
            &std::fs::read(image_fixture("border-diamonds.png")).unwrap(),
        );
        let b_image = temp.write(
            "b/texture.png",
            &std::fs::read(image_fixture("stripes.png")).unwrap(),
        );
        assert_ne!(
            std::fs::read(a_image).unwrap(),
            std::fs::read(b_image).unwrap()
        );

        let program = materialize_file(&entry).unwrap();
        assert_eq!(program.resources.len(), 2);
        assert_eq!(program.resources[0].authored, "./texture.png");
        assert_eq!(program.resources[1].authored, "./texture.png");
        assert_ne!(
            program.resources[0].runtime_rid,
            program.resources[1].runtime_rid
        );
        assert_ne!(program.resources[0].source, program.resources[1].source);

        let mut ctx = PaintCtx::new(None);
        load_image_resources(&program, &mut ctx).unwrap();
        for resource in &program.resources {
            assert!(ctx.contains_image(&resource.runtime_rid));
        }

        let mut surface = surfaces::raster_n32_premul((50, 20)).unwrap();
        surface.canvas().clear(Color::BLACK);
        frame::render(
            surface.canvas(),
            &program.document,
            &ResolveOptions {
                viewport: (50.0, 20.0),
                ..Default::default()
            },
            &Affine::IDENTITY,
            &ctx,
        )
        .expect("valid multi-source image frame");
        let pixels = read_pixels(&mut surface, 50, 20);
        let region = |x: usize| {
            (0..20)
                .flat_map(|y| {
                    let start = (y * 50 + x) * 4;
                    pixels[start..start + 20 * 4].iter().copied()
                })
                .collect::<Vec<_>>()
        };
        assert_ne!(
            region(0),
            region(25),
            "each origin-aware runtime key must decode bytes from its own source base"
        );
    }

    #[test]
    fn version2_resource_argument_keeps_the_callers_file_base() {
        let temp = TestDir::new();
        let entry = temp.write(
            "entry.grida.xml",
            br##"<grida version="2"><container width="20" height="20"><use href="./components/card.grida.xml#card"><arg name="texture" value="./texture.png"/></use></container></grida>"##,
        );
        temp.write(
            "components/card.grida.xml",
            br##"<grida version="2"><component id="card" width="20" height="20"><prop name="texture" type="resource"/><rect width="20" height="20"><fill><image src="{texture}"/></fill></rect></component></grida>"##,
        );
        temp.write(
            "texture.png",
            &std::fs::read(image_fixture("checker.png")).unwrap(),
        );

        let program = materialize_file(&entry).unwrap();
        assert_eq!(program.resources.len(), 1);
        let entry = std::fs::canonicalize(entry).unwrap();
        let resource = &program.resources[0];
        assert_eq!(resource.source, entry.to_str().unwrap());
        assert_eq!(resource.base, entry.parent().unwrap().to_str().unwrap());

        let mut ctx = PaintCtx::new(None);
        load_image_resources(&program, &mut ctx).unwrap();
        assert!(ctx.contains_image(&resource.runtime_rid));
    }
}
