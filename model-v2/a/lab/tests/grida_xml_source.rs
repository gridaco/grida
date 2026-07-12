//! Producer contract for retained Draft 1 Grida XML source programs.

use anchor_lab::grida_xml;
use anchor_lab::grida_xml_source::{
    self, ErrorPhase, SourceProvider, SourceSnapshot, SourceVersion,
};
use anchor_lab::model::{AxisBinding, Paint, Payload, ResourceRef};
use std::collections::BTreeMap;

fn snapshot(identity: &str, base: &str, source: &str) -> SourceSnapshot {
    SourceSnapshot::new(identity, base, source)
}

#[derive(Default)]
struct MemoryProvider {
    sources: BTreeMap<(String, String), SourceSnapshot>,
    requests: Vec<(String, String)>,
}

impl MemoryProvider {
    fn insert(&mut self, from: &str, location: &str, source: SourceSnapshot) {
        self.sources
            .insert((from.to_owned(), location.to_owned()), source);
    }
}

impl SourceProvider for MemoryProvider {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        self.requests
            .push((containing.identity().to_owned(), location.to_owned()));
        self.sources
            .get(&(containing.identity().to_owned(), location.to_owned()))
            .cloned()
            .ok_or_else(|| "not found".into())
    }
}

#[test]
fn immutable_snapshot_and_exact_versioned_source_unit_are_public_outcomes() {
    let source = r##"<?xml version="1.0" encoding="UTF-8"?>
<grida version="1">
  <component id="badge" width="16" height="16"/>
  <container width="100" height="80"/>
</grida>"##;
    let unit = grida_xml_source::parse_source(snapshot("entry", "memory:/", source)).unwrap();

    assert_eq!(unit.snapshot().identity(), "entry");
    assert_eq!(unit.snapshot().base(), "memory:/");
    assert_eq!(unit.snapshot().source(), source);
    assert_eq!(unit.version(), SourceVersion::Draft1);
    assert_eq!(unit.component_ids().collect::<Vec<_>>(), ["badge"]);
    assert!(unit.has_scene());

    let version2 = grida_xml_source::parse_source(snapshot(
        "future",
        "memory:/",
        r##"<grida version="2"><container/></grida>"##,
    ))
    .unwrap();
    assert_eq!(version2.version(), SourceVersion::Version2);
}

#[test]
fn draft1_source_grammar_is_strict_before_linking() {
    let cases = [
        (
            r##"<grida version="1"><container/><component id="late"/></grida>"##,
            "must precede the scene root",
        ),
        (
            r##"<grida version="1"><component id="same"/><component id="same"/></grida>"##,
            "duplicate component",
        ),
        (
            r##"<grida version="1"><component id="BadName"/></grida>"##,
            "lowercase kebab-case",
        ),
        (
            r##"<grida version="1"><component id="bad" x="0"/></grida>"##,
            "cannot declare x",
        ),
        (
            r##"<grida version="1"><container><use href="./library.grida.xml"/></container></grida>"##,
            "requires an ID fragment",
        ),
        (
            r##"<grida version="1"><container><use href="#item"><rect width="1" height="1"/></use></container></grida>"##,
            "cannot contain character data or child elements",
        ),
        (
            "<grida version=\"1\"><container><use href=\"#item\"> \n </use></container></grida>",
            "cannot contain character data",
        ),
        (
            r##"<grida version="1"><container><use href="#item" width="20"/></container></grida>"##,
            "unknown attribute `width` on <use>",
        ),
        (
            r##"<grida version="1"><component id="item"><prop name="x" type="number"/></component></grida>"##,
            "requires Grida XML Version 2",
        ),
    ];

    for (source, expected) in cases {
        let error =
            grida_xml_source::parse_source(snapshot("bad", "memory:/", source)).unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Parse, "{error}");
        assert!(error.to_string().contains(expected), "{error}");
    }
}

#[test]
fn local_uses_materialize_as_independent_boxed_subtrees_in_caller_order() {
    let source = r##"
<grida version="1">
  <component id="badge" name="Definition" width="16" height="12" fill="#112233">
    <rect name="inside" width="4" height="5" fill="#abcdef"/>
  </component>
  <container width="100" height="80">
    <use href="#badge" name="first" x="5" y="7"/>
    <use href="#badge" name="second" x="25" y="9" hidden="true"/>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", source), &mut provider)
            .unwrap();

    assert!(
        provider.requests.is_empty(),
        "local uses require no provider call"
    );
    let document_root = output.document.get(output.document.root);
    let scene = document_root.children[0];
    let instances = &output.document.get(scene).children;
    assert_eq!(instances.len(), 2);
    assert_ne!(instances[0], instances[1]);
    for &instance in instances {
        assert!(matches!(
            output.document.get(instance).payload,
            Payload::Frame { .. }
        ));
        assert_eq!(
            output.document.get(instance).header.name.as_deref(),
            Some("Definition")
        );
        assert_eq!(output.document.get(instance).children.len(), 1);
        assert_ne!(output.document.get(instance).children[0], instances[0]);
        assert_ne!(output.document.get(instance).children[0], instances[1]);
    }
    assert_eq!(
        output.document.get(instances[0]).header.x,
        AxisBinding::start(5.0)
    );
    assert_eq!(
        output.document.get(instances[1]).header.x,
        AxisBinding::start(25.0)
    );
    assert!(output.document.get(instances[0]).header.active);
    assert!(!output.document.get(instances[1]).header.active);

    let first = output.provenance.get(&instances[0]).unwrap();
    let second = output.provenance.get(&instances[1]).unwrap();
    assert_eq!(first.component.as_ref().unwrap().source, "entry");
    assert_eq!(first.component.as_ref().unwrap().id, "badge");
    assert_eq!(first.use_chain.len(), 1);
    assert_eq!(first.use_chain[0].name.as_deref(), Some("first"));
    assert_eq!(second.use_chain[0].name.as_deref(), Some("second"));
    assert_eq!(
        output
            .provenance
            .get(&output.document.get(instances[0]).children[0])
            .unwrap()
            .use_chain,
        first.use_chain
    );
}

#[test]
fn external_uses_load_one_retained_immutable_source_unit() {
    let entry = r##"
<grida version="1">
  <container width="80" height="60">
    <use href="./library.grida.xml#badge"/>
    <use href="./library.grida.xml#badge" x="20"/>
  </container>
</grida>
"##;
    let library = r##"
<grida version="1">
  <component id="badge" width="12" height="12">
    <ellipse width="12" height="12" fill="#22c55e"/>
  </component>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./library.grida.xml",
        snapshot("library", "memory:/library/", library),
    );

    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    assert_eq!(provider.requests.len(), 1, "one lexical edge is cached");
    assert_eq!(output.program.entry(), "entry");
    assert_eq!(output.program.units().len(), 2);
    assert_eq!(
        output.program.unit("library").unwrap().snapshot().source(),
        library
    );
    let scene = output.document.get(output.document.root).children[0];
    assert_eq!(output.document.get(scene).children.len(), 2);
}

#[test]
fn hidden_component_edges_still_participate_in_cycle_detection() {
    let source = r##"
<grida version="1">
  <component id="a" width="10" height="10"><use href="#b"/></component>
  <component id="b" width="10" height="10"><use href="#a" hidden="true"/></component>
  <container width="20" height="20"><use href="#a" hidden="true"/></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let error = grida_xml_source::materialize(snapshot("cycle", "memory:/", source), &mut provider)
        .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Link);
    assert!(
        error.message.contains("cycle#a -> cycle#b -> cycle#a"),
        "{error}"
    );
}

#[test]
fn equal_relative_image_strings_from_distinct_origins_get_distinct_runtime_rids() {
    let entry = r##"
<grida version="1">
  <container width="80" height="40">
    <use href="./a.grida.xml#card"/>
    <use href="./b.grida.xml#card" x="30"/>
  </container>
</grida>
"##;
    let component = |color: &str| {
        format!(
            r##"<grida version="1"><component id="card" width="20" height="20"><rect width="20" height="20"><fill><solid color="{color}"/><image src="./texture.png" opacity="0.5"/></fill></rect></component></grida>"##
        )
    };
    let a = component("#ff0000");
    let b = component("#0000ff");
    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./a.grida.xml",
        snapshot("a", "memory:/a/", a.as_str()),
    );
    provider.insert(
        "entry",
        "./b.grida.xml",
        snapshot("b", "memory:/b/", b.as_str()),
    );

    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    assert_eq!(output.resources.len(), 2);
    assert_eq!(output.resources[0].authored, "./texture.png");
    assert_eq!(output.resources[1].authored, "./texture.png");
    assert_eq!(output.resources[0].source, "a");
    assert_eq!(output.resources[1].source, "b");
    assert_eq!(output.resources[0].base, "memory:/a/");
    assert_eq!(output.resources[1].base, "memory:/b/");
    assert_ne!(
        output.resources[0].runtime_rid,
        output.resources[1].runtime_rid
    );

    let mut image_rids = vec![];
    for id in 0..output.document.capacity() as u32 {
        let Some(node) = output.document.get_opt(id) else {
            continue;
        };
        for paint in node.fills.iter() {
            if let Paint::Image(image) = paint {
                let ResourceRef::Rid(rid) = &image.image else {
                    panic!("source materialization emits runtime RIDs")
                };
                image_rids.push(rid.clone());
            }
        }
    }
    image_rids.sort();
    let mut manifest_rids = output
        .resources
        .iter()
        .map(|entry| entry.runtime_rid.clone())
        .collect::<Vec<_>>();
    manifest_rids.sort();
    assert_eq!(image_rids, manifest_rids);
}

#[test]
fn failures_keep_parse_resolution_and_link_phases_distinct() {
    let entry = r##"<grida version="1"><container><use href="./missing.grida.xml#x"/></container></grida>"##;
    let mut provider = MemoryProvider::default();
    let resolution =
        grida_xml_source::materialize(snapshot("entry", "memory:/", entry), &mut provider)
            .unwrap_err();
    assert_eq!(resolution.phase, ErrorPhase::Resolve);
    assert!(resolution.message.contains("./missing.grida.xml"));
    assert_eq!(
        resolution.authored_use.as_ref().unwrap().href,
        "./missing.grida.xml#x"
    );

    let unknown = r##"<grida version="1"><container><use href="#missing"/></container></grida>"##;
    let link = grida_xml_source::materialize(snapshot("entry", "memory:/", unknown), &mut provider)
        .unwrap_err();
    assert_eq!(link.phase, ErrorPhase::Link);
    assert!(link.message.contains("not defined"));

    let future = r##"<grida version="99"><component id="x"/></grida>"##;
    let direct =
        grida_xml_source::parse_source(snapshot("future", "memory:/", future)).unwrap_err();
    assert_eq!(direct.phase, ErrorPhase::Parse);

    let future_entry =
        r##"<grida version="1"><container><use href="./future.grida.xml#x"/></container></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./future.grida.xml",
        snapshot("future", "memory:/future/", future),
    );
    let dependency =
        grida_xml_source::materialize(snapshot("entry", "memory:/", future_entry), &mut provider)
            .unwrap_err();
    assert_eq!(dependency.phase, ErrorPhase::Resolve);
    assert_eq!(
        dependency.authored_use.as_ref().unwrap().href,
        "./future.grida.xml#x"
    );

    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./invalid.grida.xml",
        snapshot(
            "",
            "memory:/invalid/",
            r##"<grida version="1"><component id="x"/></grida>"##,
        ),
    );
    let invalid_snapshot = r##"<grida version="1"><container><use href="./invalid.grida.xml#x"/></container></grida>"##;
    let invalid = grida_xml_source::materialize(
        snapshot("entry", "memory:/", invalid_snapshot),
        &mut provider,
    )
    .unwrap_err();
    assert_eq!(invalid.phase, ErrorPhase::Resolve);
    assert!(invalid.message.contains("canonical source identity"));
}

#[test]
fn canonical_identity_aliases_share_one_unit_and_inconsistent_snapshots_fail() {
    let entry = r##"
<grida version="1"><container>
  <use href="./library.grida.xml#card"/>
  <use href="./alias.grida.xml#card" x="20"/>
</container></grida>
"##;
    let library = r##"<grida version="1"><component id="card" width="10" height="10"/></grida>"##;
    let mut provider = MemoryProvider::default();
    let canonical = snapshot("library", "memory:/library/", library);
    provider.insert("entry", "./library.grida.xml", canonical.clone());
    provider.insert("entry", "./alias.grida.xml", canonical);
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    assert_eq!(provider.requests.len(), 2);
    assert_eq!(output.program.units().len(), 2);
    let scene = output.document.get(output.document.root).children[0];
    assert_eq!(output.document.get(scene).children.len(), 2);

    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./library.grida.xml",
        snapshot("library", "memory:/library/", library),
    );
    provider.insert(
        "entry",
        "./alias.grida.xml",
        snapshot(
            "library",
            "memory:/different/",
            r##"<grida version="1"><component id="card" width="20" height="20"/></grida>"##,
        ),
    );
    let error =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Resolve);
    assert!(error.message.contains("inconsistent bytes or base"));
    assert_eq!(
        error.authored_use.as_ref().unwrap().href,
        "./alias.grida.xml#card"
    );
}

#[test]
fn image_manifest_covers_strokes_and_text_runs_and_dedupes_repeated_instances() {
    let source = r##"
<grida version="1">
  <component id="decorated" width="40" height="30">
    <rect width="20" height="20">
      <stroke width="2"><image src="./stroke.png"/></stroke>
    </rect>
    <text><tspan><fill><image src="./run.png"/></fill>run</tspan></text>
  </component>
  <container width="100" height="50">
    <use href="#decorated"/>
    <use href="#decorated" x="50"/>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", source), &mut provider)
            .unwrap();
    assert_eq!(
        output.resources.len(),
        2,
        "same origin+identifier dedupes across uses"
    );
    assert_eq!(
        output
            .resources
            .iter()
            .map(|resource| resource.authored.as_str())
            .collect::<Vec<_>>(),
        ["./stroke.png", "./run.png"]
    );

    let mut stroke_images = 0;
    let mut run_images = 0;
    for id in 0..output.document.capacity() as u32 {
        let Some(node) = output.document.get_opt(id) else {
            continue;
        };
        stroke_images += node
            .strokes
            .iter()
            .flat_map(|stroke| stroke.paints.iter())
            .filter(|paint| matches!(paint, Paint::Image(_)))
            .count();
        if let Payload::AttributedText {
            attributed_string, ..
        } = &node.payload
        {
            run_images += attributed_string
                .runs
                .iter()
                .filter_map(|run| run.fills.as_ref())
                .flat_map(|fills| fills.iter())
                .filter(|paint| matches!(paint, Paint::Image(_)))
                .count();
        }
    }
    assert_eq!(stroke_images, 2);
    assert_eq!(run_images, 2);
    assert_eq!(output.provenance.len() + 1, output.document.len());
    assert!(output
        .provenance
        .values()
        .all(|provenance| { provenance.use_chain.is_empty() || provenance.use_chain.len() == 1 }));
}

#[test]
fn use_relationship_context_is_validated_during_materialization() {
    let source = r##"
<grida version="1">
  <component id="item" width="10" height="10"/>
  <container><use href="#item" flow="in"/></container>
</grida>
"##;
    grida_xml_source::parse_source(snapshot("entry", "memory:/", source))
        .expect("source-local syntax is valid before the target relationship is materialized");
    let mut provider = MemoryProvider::default();
    let error = grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
        .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Materialize);
    assert!(error
        .to_string()
        .contains("flow is only valid on a child of a flex container"));
    assert_eq!(error.source, "entry");
    assert_eq!(error.component.as_deref(), Some("item"));
    assert_eq!(error.use_chain.len(), 1);
    assert_eq!(error.use_chain[0].href, "#item");
    assert_eq!(error.use_chain[0].target.source, "entry");
    assert_eq!(error.use_chain[0].target.id, "item");

    let valid = r##"
<grida version="1">
  <component id="item" width="10" height="10"/>
  <container width="100" height="20" layout="flex">
    <use href="#item" grow=" 1 " align="center"/>
  </container>
</grida>
"##;
    let output = grida_xml_source::materialize(
        snapshot("valid", "memory:/", valid),
        &mut MemoryProvider::default(),
    )
    .expect("omitted flow is the canonical in-flow default");
    let scene = output.document.get(output.document.root).children[0];
    let instance = output.document.get(scene).children[0];
    assert_eq!(output.document.get(instance).header.grow, 1.0);
}

#[test]
fn draft0_source_materialization_rekeys_images_without_changing_the_draft0_api() {
    let source = r##"<grida version="0"><container><rect width="10" height="10"><fill><image src="./image.png"/></fill></rect></container></grida>"##;
    let ordinary = grida_xml::parse(source).unwrap();
    let original_rect = ordinary
        .get(ordinary.get(ordinary.root).children[0])
        .children[0];
    let Paint::Image(original) = &ordinary.get(original_rect).fills[0] else {
        panic!("image")
    };
    assert_eq!(original.image, ResourceRef::Rid("./image.png".into()));

    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", source), &mut provider)
            .unwrap();
    let scene = output.document.get(output.document.root).children[0];
    let rect = output.document.get(scene).children[0];
    let Paint::Image(materialized) = &output.document.get(rect).fills[0] else {
        panic!("image")
    };
    assert_eq!(output.resources.len(), 1);
    assert_eq!(output.resources[0].authored, "./image.png");
    assert_eq!(
        materialized.image,
        ResourceRef::Rid(output.resources[0].runtime_rid.clone())
    );
    assert_eq!(grida_xml::VERSION, "0");
}

#[test]
fn draft0_parse_and_print_contract_remains_unchanged() {
    let source = r##"<grida version="0"><container width="20" height="10"><rect width="4" height="5" fill="#123456"/></container></grida>"##;
    let ordinary = grida_xml::parse(source).unwrap();
    let mut provider = MemoryProvider::default();
    let linked =
        grida_xml_source::materialize(snapshot("draft0", "memory:/", source), &mut provider)
            .unwrap();
    assert_eq!(ordinary, linked.document);
    assert_eq!(linked.program.units().len(), 1);
    assert_eq!(
        linked.program.unit("draft0").unwrap().version(),
        SourceVersion::Draft0
    );
    assert!(grida_xml::print(&ordinary)
        .unwrap()
        .starts_with("<grida version=\"0\">"));
}
