//! Version 2 typed scalar specialization contract.

use anchor_lab::grida_xml_source::{
    self, BindingTargetKind, ErrorPhase, ScalarType, SourceProvider, SourceSnapshot, SourceVersion,
    ValueSelection,
};
use anchor_lab::model::{BoxFit, ImagePaintFit, Paint, Payload, ResourceRef, SizeIntent};
use std::collections::BTreeMap;

fn snapshot(identity: &str, base: &str, source: &str) -> SourceSnapshot {
    SourceSnapshot::new(identity, base, source)
}

#[derive(Default)]
struct MemoryProvider(BTreeMap<(String, String), SourceSnapshot>);

impl MemoryProvider {
    fn insert(&mut self, from: &str, location: &str, source: SourceSnapshot) {
        self.0
            .insert((from.to_owned(), location.to_owned()), source);
    }
}

impl SourceProvider for MemoryProvider {
    fn resolve(
        &mut self,
        containing: &SourceSnapshot,
        location: &str,
    ) -> Result<SourceSnapshot, String> {
        self.0
            .get(&(containing.identity().to_owned(), location.to_owned()))
            .cloned()
            .ok_or_else(|| "not found".into())
    }
}

fn authored_scene(output: &grida_xml_source::MaterializedProgram) -> u32 {
    output.document.get(output.document.root).children[0]
}

#[test]
fn all_six_scalar_types_specialize_into_the_existing_ordinary_model() {
    let source = r##"
<grida version="2">
  <component id="card" name="{title}" width="{card-width}" height="40" hidden="{muted}" fill="{accent}">
    <prop name="title" type="string"/>
    <prop name="muted" type="boolean"/>
    <prop name="card-width" type="number"/>
    <prop name="accent" type="color"/>
    <prop name="image-fit" type="enum" values="contain cover"/>
    <prop name="texture" type="resource"/>
    <rect width="20" height="20">
      <fill><image src="{texture}" fit="{image-fit}"/></fill>
    </rect>
    <text>{title}</text>
  </component>
  <container width="200" height="100">
    <use href="#card">
      <arg name="title" value="Feature"/>
      <arg name="muted" value="true"/>
      <arg name="card-width" value="120"/>
      <arg name="accent" value="#123456"/>
      <arg name="image-fit" value="contain"/>
      <arg name="texture" value="./noise.png"/>
    </use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", source), &mut provider)
            .unwrap();

    assert_eq!(
        output.program.unit("entry").unwrap().version(),
        SourceVersion::Version2
    );
    let scene = authored_scene(&output);
    let card = output.document.get(scene).children[0];
    let card_node = output.document.get(card);
    assert_eq!(card_node.header.name.as_deref(), Some("Feature"));
    assert_eq!(card_node.header.width, SizeIntent::Fixed(120.0));
    assert!(!card_node.header.active);
    let Paint::Solid(background) = &card_node.fills[0] else {
        panic!("color prop materializes through ordinary compact fill")
    };
    assert_eq!(background.color.0, 0xFF12_3456);

    let rect = card_node.children[0];
    let Paint::Image(image) = &output.document.get(rect).fills[0] else {
        panic!("resource prop materializes as image paint")
    };
    assert_eq!(image.fit, ImagePaintFit::Fit(BoxFit::Contain));
    let ResourceRef::Rid(runtime_rid) = &image.image else {
        panic!("source materialization uses runtime RID")
    };
    assert_eq!(runtime_rid, &output.resources[0].runtime_rid);
    assert_eq!(output.resources[0].source, "entry");
    assert_eq!(output.resources[0].authored, "./noise.png");

    let text = card_node.children[1];
    let Payload::Text { content, .. } = &output.document.get(text).payload else {
        panic!("string prop materializes into ordinary text")
    };
    assert_eq!(content, "Feature");

    let specialization = &output.specializations[0];
    assert_eq!(specialization.component.id, "card");
    assert_eq!(
        specialization
            .props
            .iter()
            .map(|prop| prop.scalar_type)
            .collect::<Vec<_>>(),
        [
            ScalarType::String,
            ScalarType::Boolean,
            ScalarType::Number,
            ScalarType::Color,
            ScalarType::Enum,
            ScalarType::Resource,
        ]
    );
    assert!(specialization
        .props
        .iter()
        .all(|prop| matches!(prop.selection, ValueSelection::Supplied { .. })));
    let title = specialization
        .props
        .iter()
        .find(|prop| prop.name == "title")
        .unwrap();
    assert_eq!(title.binding_targets.len(), 2);
    assert_eq!(title.materialized_occurrences.len(), 2);
    assert!(title.binding_targets.iter().any(
        |target| matches!(&target.kind, BindingTargetKind::Attribute { name } if name == "name")
    ));
    assert!(title
        .binding_targets
        .iter()
        .any(|target| matches!(target.kind, BindingTargetKind::Text { .. })));
    let texture = specialization
        .props
        .iter()
        .find(|prop| prop.name == "texture")
        .unwrap();
    assert_eq!(texture.binding_targets.len(), 1);
    assert_eq!(texture.materialized_occurrences.len(), 1);
    assert_eq!(texture.materialized_occurrences[0].node, rect);
}

#[test]
fn defaults_and_explicit_values_that_equal_defaults_keep_distinct_selection() {
    let source = r##"
<grida version="2">
  <component id="badge" width="60" height="20" fill="{accent}">
    <prop name="label" type="string"/>
    <prop name="accent" type="color" default="#7c3aed"/>
    <text>{label}</text>
  </component>
  <container width="140" height="30">
    <use href="#badge"><arg name="label" value="Default"/></use>
    <use href="#badge" x="70">
      <arg name="label" value="Pinned"/>
      <arg name="accent" value="#7c3aed"/>
    </use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
            .unwrap();
    assert_eq!(output.specializations.len(), 2);
    let first = output.specializations[0]
        .props
        .iter()
        .find(|prop| prop.name == "accent")
        .unwrap();
    let second = output.specializations[1]
        .props
        .iter()
        .find(|prop| prop.name == "accent")
        .unwrap();
    assert_eq!(first.value, second.value);
    assert_eq!(first.selection, ValueSelection::CalleeDefault);
    assert!(matches!(second.selection, ValueSelection::Supplied { .. }));
    assert_eq!(first.ultimate_origin.source, "entry");
    assert_eq!(second.ultimate_origin.source, "entry");
}

#[test]
fn empty_string_presence_distinguishes_defaults_from_supplied_arguments() {
    let source = r##"
<grida version="2">
  <component id="copy" width="10" height="10">
    <prop name="value" type="string" default=""/>
    <text>{value}</text>
  </component>
  <container width="20" height="10">
    <use href="#copy"/>
    <use href="#copy" x="10"><arg name="value" value=""/></use>
  </container>
</grida>
"##;
    let output = grida_xml_source::materialize(
        snapshot("entry", "memory:/", source),
        &mut MemoryProvider::default(),
    )
    .expect("empty strings are present values, not null or omission");
    assert_eq!(output.specializations.len(), 2);
    let defaulted = &output.specializations[0].props[0];
    let supplied = &output.specializations[1].props[0];
    assert_eq!(defaulted.value, "");
    assert_eq!(supplied.value, "");
    assert_eq!(defaulted.selection, ValueSelection::CalleeDefault);
    assert!(matches!(
        supplied.selection,
        ValueSelection::Supplied { .. }
    ));
}

#[test]
fn nested_forwarding_preserves_the_ultimate_resource_literal_origin() {
    let entry = r##"
<grida version="2">
  <container width="100" height="80">
    <use href="./library.grida.xml#wrapper">
      <arg name="asset" value="./caller.png"/>
    </use>
    <use href="./library.grida.xml#wrapper" x="40"/>
  </container>
</grida>
"##;
    let library = r##"
<grida version="2">
  <component id="leaf" width="20" height="20">
    <prop name="texture" type="resource"/>
    <rect width="20" height="20"><fill><image src="{texture}"/></fill></rect>
  </component>
  <component id="wrapper" width="20" height="20">
    <prop name="asset" type="resource" default="./default.png"/>
    <use href="#leaf"><arg name="texture" value="{asset}"/></use>
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

    assert_eq!(output.resources.len(), 2);
    assert_eq!(output.resources[0].source, "entry");
    assert_eq!(output.resources[0].authored, "./caller.png");
    assert_eq!(output.resources[1].source, "library");
    assert_eq!(output.resources[1].authored, "./default.png");

    let leafs = output
        .specializations
        .iter()
        .filter(|specialization| specialization.component.id == "leaf")
        .collect::<Vec<_>>();
    assert_eq!(leafs.len(), 2);
    assert_eq!(leafs[0].props[0].ultimate_origin.source, "entry");
    assert_eq!(leafs[1].props[0].ultimate_origin.source, "library");
    for leaf in leafs {
        assert!(matches!(
            leaf.props[0].selection,
            ValueSelection::Supplied { .. }
        ));
        assert_eq!(leaf.props[0].forwarding.len(), 1);
        assert_eq!(leaf.props[0].forwarding[0].source, "library");
        assert_eq!(leaf.props[0].forwarding[0].name, "texture");
    }

    let wrappers = output
        .specializations
        .iter()
        .filter(|specialization| specialization.component.id == "wrapper")
        .collect::<Vec<_>>();
    assert_eq!(wrappers.len(), 2);
    for wrapper in wrappers {
        let asset = &wrapper.props[0];
        assert_eq!(asset.name, "asset");
        assert_eq!(asset.binding_targets.len(), 1);
        assert!(asset.materialized_occurrences.is_empty());
        let target = &asset.binding_targets[0];
        assert_eq!(target.source, "library");
        assert_eq!(target.element, "arg");
        assert!(target.span.end > target.span.start);
        assert!(matches!(
            &target.kind,
            BindingTargetKind::Argument { use_href, argument }
                if use_href == "#leaf" && argument == "texture"
        ));
    }
}

#[test]
fn brace_scanning_is_source_local_and_substituted_strings_are_single_pass() {
    let source = r##"
<grida version="2">
  <component id="message" name="{{literal}}" width="200" height="30">
    <prop name="label" type="string"/>
    <text>literal {{label}}; value {label}</text>
  </component>
  <container width="220" height="40">
    <use href="#message"><arg name="label" value="{{other}}"/></use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
            .unwrap();
    let scene = authored_scene(&output);
    let message = output.document.get(scene).children[0];
    assert_eq!(
        output.document.get(message).header.name.as_deref(),
        Some("{literal}")
    );
    let text = output.document.get(message).children[0];
    let Payload::Text { content, .. } = &output.document.get(text).payload else {
        panic!("text")
    };
    assert_eq!(content, "literal {label}; value {other}");
}

#[test]
fn version2_accepts_version1_static_components_without_reinterpreting_braces() {
    let entry = r##"<grida version="2"><container><use href="./v1.grida.xml#literal"/></container></grida>"##;
    let v1 = r##"<grida version="1"><component id="literal" width="100" height="20"><text>{price} {{price}}</text></component></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert("entry", "./v1.grida.xml", snapshot("v1", "memory:/v1/", v1));
    let output =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap();
    let scene = authored_scene(&output);
    let instance = output.document.get(scene).children[0];
    let text = output.document.get(instance).children[0];
    let Payload::Text { content, .. } = &output.document.get(text).payload else {
        panic!("text")
    };
    assert_eq!(content, "{price} {{price}}");
    assert!(output.specializations.is_empty());

    let v1_entry =
        r##"<grida version="1"><container><use href="./v2.grida.xml#item"/></container></grida>"##;
    let v2 = r##"<grida version="2"><component id="item" width="10" height="10"/></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert(
        "v1-entry",
        "./v2.grida.xml",
        snapshot("v2", "memory:/v2/", v2),
    );
    let error = grida_xml_source::materialize(
        snapshot("v1-entry", "memory:/entry/", v1_entry),
        &mut provider,
    )
    .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Link);
    assert!(error.authored_use.is_some());
}

#[test]
fn declaration_and_binding_failures_are_source_errors() {
    let cases = [
        (
            r##"<grida version="2"><component id="x"><prop name="x" type="number"/><rect width="1" height="1"/></component></grida>"##,
            "reserved",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="tone" type="color"/><prop name="tone" type="color"/><rect width="1" height="1" fill="{tone}"/></component></grida>"##,
            "duplicate prop",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="tone" type="color"/><rect width="1" height="1"/></component></grida>"##,
            "has no binding or forwarding site",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="n" type="number"/><text>{n}</text></component></grida>"##,
            "cannot bind to text content",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="label" type="string"/><text>{missing}</text></component></grida>"##,
            "is not declared",
        ),
        (
            r##"<grida version="2"><component id="x" width="prefix-{n}"><prop name="n" type="number"/><rect width="1" height="1"/></component></grida>"##,
            "interpolation is invalid",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="label" type="string"/><text>{label</text></component></grida>"##,
            "unescaped `{`",
        ),
        (
            r##"<grida version="2"><component id="x"><rect width="1" height="1"/><prop name="tone" type="color" default="#fff"/></component></grida>"##,
            "must precede fill, stroke, and render children",
        ),
        (
            r##"<grida version="2"><component id="x" fill="{tone}"><prop name="tone" type="color" default="purple"/></component></grida>"##,
            "not a valid color",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="fit" type="enum" values="contain stretch"/><rect width="1" height="1"><fill><image src="x" fit="{fit}"/></fill></rect></component></grida>"##,
            "member `stretch` is not accepted",
        ),
        (
            r##"<grida version="2"><component id="x" opacity="{alpha}"><prop name="alpha" type="number" default="1.4"/></component></grida>"##,
            "opacity must be between 0 and 1",
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
fn specialization_rejects_missing_unknown_and_mistyped_arguments() {
    let cases = [
        (
            r##"<grida version="2"><component id="x" hidden="{v}"><prop name="v" type="boolean"/></component><container><use href="#x"/></container></grida>"##,
            "is required",
        ),
        (
            r##"<grida version="2"><component id="x" hidden="{v}"><prop name="v" type="boolean" default="false"/></component><container><use href="#x"><arg name="other" value="true"/></use></container></grida>"##,
            "unknown argument",
        ),
        (
            r##"<grida version="2"><component id="x" hidden="{v}"><prop name="v" type="boolean"/></component><container><use href="#x"><arg name="v" value="yes"/></use></container></grida>"##,
            "must be exactly",
        ),
        (
            r##"<grida version="2"><component id="x" opacity="{v}"><prop name="v" type="number"/></component><container><use href="#x"><arg name="v" value="NaN"/></use></container></grida>"##,
            "must be finite",
        ),
        (
            r##"<grida version="2"><component id="x" fill="{v}"><prop name="v" type="color"/></component><container><use href="#x"><arg name="v" value="purple"/></use></container></grida>"##,
            "not a valid color",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="v" type="enum" values="contain cover"/><rect width="1" height="1"><fill><image src="x" fit="{v}"/></fill></rect></component><container><use href="#x"><arg name="v" value="fill"/></use></container></grida>"##,
            "not a member",
        ),
        (
            r##"<grida version="2"><component id="x"><prop name="v" type="resource"/><rect width="1" height="1"><fill><image src="{v}"/></fill></rect></component><container><use href="#x"><arg name="v" value=""/></use></container></grida>"##,
            "non-empty",
        ),
    ];
    for (source, expected) in cases {
        let mut provider = MemoryProvider::default();
        let error =
            grida_xml_source::materialize(snapshot("bad", "memory:/", source), &mut provider)
                .unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Specialize, "{error}");
        assert!(error.to_string().contains(expected), "{error}");
    }
}

#[test]
fn forwarding_requires_exact_types_and_enum_subset_compatibility() {
    let cases = [
        (
            r##"
<grida version="2">
  <component id="leaf" hidden="{flag}"><prop name="flag" type="boolean"/></component>
  <component id="wrapper"><prop name="value" type="string"/><use href="#leaf"><arg name="flag" value="{value}"/></use></component>
  <container><use href="#wrapper"><arg name="value" value="true"/></use></container>
</grida>"##,
            "cannot forward",
        ),
        (
            r##"
<grida version="2">
  <component id="leaf"><prop name="fit" type="enum" values="contain cover"/><rect width="1" height="1"><fill><image src="x" fit="{fit}"/></fill></rect></component>
  <component id="wrapper"><prop name="outer-fit" type="enum" values="contain cover fill"/><use href="#leaf"><arg name="fit" value="{outer-fit}"/></use></component>
  <container><use href="#wrapper"><arg name="outer-fit" value="contain"/></use></container>
</grida>"##,
            "source member `fill` is not accepted",
        ),
    ];
    for (source, expected) in cases {
        let mut provider = MemoryProvider::default();
        let error = grida_xml_source::materialize(
            snapshot("bad-forward", "memory:/", source),
            &mut provider,
        )
        .unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Specialize, "{error}");
        assert!(error.to_string().contains(expected), "{error}");
    }
}

#[test]
fn specialized_values_run_the_existing_target_specific_validation() {
    let source = r##"
<grida version="2">
  <component id="surface" width="10" height="10" opacity="{alpha}">
    <prop name="alpha" type="number"/>
  </component>
  <container><use href="#surface"><arg name="alpha" value="1.4"/></use></container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let error = grida_xml_source::materialize(
        snapshot("target-invalid", "memory:/", source),
        &mut provider,
    )
    .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Specialize);
    assert!(error
        .to_string()
        .contains("opacity must be between 0 and 1"));
    assert_eq!(error.use_chain.len(), 1);
    assert_eq!(error.component.as_deref(), Some("surface"));
    assert_eq!(error.specialization_sites.len(), 1);
    let site = &error.specialization_sites[0];
    assert_eq!(site.prop, "alpha");
    assert!(matches!(
        &site.selection,
        ValueSelection::Supplied { argument } if argument.source == "target-invalid"
    ));
    assert!(matches!(
        &site.binding.kind,
        BindingTargetKind::Attribute { name } if name == "opacity"
    ));
    assert_eq!(site.binding.source, "target-invalid");
    assert!(error.to_string().contains("prop `alpha` from argument"));
    assert!(error.to_string().contains("bound at target-invalid"));
}

#[test]
fn version2_use_cannot_send_arguments_to_a_version1_component() {
    let entry = r##"
<grida version="2"><container><use href="./v1.grida.xml#item"><arg name="label" value="x"/></use></container></grida>
"##;
    let v1 = r##"<grida version="1"><component id="item" width="10" height="10"/></grida>"##;
    let mut provider = MemoryProvider::default();
    provider.insert("entry", "./v1.grida.xml", snapshot("v1", "memory:/v1/", v1));
    let error =
        grida_xml_source::materialize(snapshot("entry", "memory:/entry/", entry), &mut provider)
            .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Specialize);
    assert!(error.to_string().contains("empty interface"));
}

#[test]
fn duplicate_args_and_top_level_forwarding_are_rejected_during_source_parse() {
    let cases = [
        (
            r##"<grida version="2"><component id="x" name="{label}"><prop name="label" type="string"/></component><container><use href="#x"><arg name="label" value="a"/><arg name="label" value="b"/></use></container></grida>"##,
            "duplicate argument",
        ),
        (
            r##"<grida version="2"><component id="x" name="{label}"><prop name="label" type="string"/></component><container><use href="#x"><arg name="label" value="{outer}"/></use></container></grida>"##,
            "cannot forward without an enclosing component scope",
        ),
    ];
    for (source, expected) in cases {
        let error =
            grida_xml_source::parse_source(snapshot("bad", "memory:/", source)).unwrap_err();
        assert_eq!(error.phase, ErrorPhase::Parse);
        assert!(error.to_string().contains(expected), "{error}");
    }
}

#[test]
fn required_props_do_not_acquire_invented_values_during_source_validation() {
    let free_layout = r##"
<grida version="2">
  <component id="free" width="20" height="20" layout="{mode}">
    <prop name="mode" type="enum" values="none"/>
    <rect x="1" y="1" width="4" height="4" fill="#112233"/>
  </component>
  <container width="20" height="20"><use href="#free"><arg name="mode" value="none"/></use></container>
</grida>
"##;
    grida_xml_source::parse_source(snapshot("free", "memory:/", free_layout))
        .expect("source validation must select a witness from the declared enum domain");
    grida_xml_source::materialize(
        snapshot("free", "memory:/", free_layout),
        &mut MemoryProvider::default(),
    )
    .expect("the caller-supplied free-layout branch is valid");

    for (layout_values, flow_values) in [("none flex", "in absolute"), ("flex none", "absolute in")]
    {
        let source = format!(
            r##"
<grida version="2">
  <component id="positioned" width="20" height="20" layout="{{layout-mode}}">
    <prop name="layout-mode" type="enum" values="{layout_values}"/>
    <prop name="item-flow" type="enum" values="{flow_values}"/>
    <rect x="1" y="1" width="4" height="4" flow="{{item-flow}}" fill="#112233"/>
  </component>
  <container width="20" height="20">
    <use href="#positioned">
      <arg name="layout-mode" value="flex"/>
      <arg name="item-flow" value="absolute"/>
    </use>
  </container>
</grida>
"##
        );
        grida_xml_source::parse_source(snapshot("positioned", "memory:/", &source))
            .expect("source validation searches declared enum combinations independent of order");
        grida_xml_source::materialize(
            snapshot("positioned", "memory:/", &source),
            &mut MemoryProvider::default(),
        )
        .expect("the supplied flex/absolute combination is valid");
    }

    let auto_axis = r##"
<grida version="2">
  <component id="tile" width="20" height="20">
    <prop name="size" type="enum" values="auto"/>
    <rect width="{size}" height="10" aspect-ratio="1:1" fill="#112233"/>
  </component>
  <container width="20" height="20"><use href="#tile"><arg name="size" value="auto"/></use></container>
</grida>
"##;
    grida_xml_source::parse_source(snapshot("auto", "memory:/", auto_axis))
        .expect("enum witnesses must preserve the declared auto sizing branch");
    grida_xml_source::materialize(
        snapshot("auto", "memory:/", auto_axis),
        &mut MemoryProvider::default(),
    )
    .expect("auto plus aspect ratio supplies exactly one primitive axis");

    let bounded_stop = r##"
<grida version="2">
  <component id="wash" width="20" height="20">
    <prop name="mid" type="number"/>
    <rect width="20" height="20">
      <fill>
        <gradient kind="linear">
          <stop offset="0.4" color="#000000"/>
          <stop offset="{mid}" color="#888888"/>
          <stop offset="0.6" color="#FFFFFF"/>
        </gradient>
      </fill>
    </rect>
  </component>
  <container width="20" height="20"><use href="#wash"><arg name="mid" value="0.5"/></use></container>
</grida>
"##;
    grida_xml_source::parse_source(snapshot("gradient", "memory:/", bounded_stop))
        .expect("numeric source validation derives witnesses from authored bounds");
    grida_xml_source::materialize(
        snapshot("gradient", "memory:/", bounded_stop),
        &mut MemoryProvider::default(),
    )
    .expect("the supplied stop remains between its authored neighbors");

    for values in ["none flex", "flex none"] {
        let source = format!(
            r##"<grida version="2">
  <component id="stack" width="20" height="20" layout="{{mode}}" direction="row">
    <prop name="mode" type="enum" values="{values}"/>
  </component>
  <container><use href="#stack"><arg name="mode" value="flex"/></use></container>
</grida>"##
        );
        grida_xml_source::parse_source(snapshot("entry", "memory:/", &source))
            .expect("required enum member order must not create a source-time effective value");
        let mut provider = MemoryProvider::default();
        grida_xml_source::materialize(snapshot("entry", "memory:/", &source), &mut provider)
            .expect("the caller-supplied flex value satisfies the complete ordinary state");
    }

    let source = r##"<grida version="2">
  <component id="card" width="20" height="20" corner-radius="8 / 4" corner-smoothing="{smoothing}">
    <prop name="smoothing" type="number"/>
  </component>
  <container><use href="#card"><arg name="smoothing" value="0"/></use></container>
</grida>"##;
    grida_xml_source::parse_source(snapshot("entry", "memory:/", source))
        .expect("required number props remain deferred during source validation");
    let mut provider = MemoryProvider::default();
    grida_xml_source::materialize(snapshot("entry", "memory:/", source), &mut provider)
        .expect("zero smoothing is compatible with elliptical corners");

    let incompatible = source.replace("value=\"0\"", "value=\"1\"");
    let mut provider = MemoryProvider::default();
    let error =
        grida_xml_source::materialize(snapshot("entry", "memory:/", &incompatible), &mut provider)
            .unwrap_err();
    assert_eq!(error.phase, ErrorPhase::Specialize);
    assert!(error
        .message
        .contains("nonzero corner-smoothing requires circular corner radii"));
    assert_eq!(error.specialization_sites.len(), 1);
    assert_eq!(error.specialization_sites[0].prop, "smoothing");
}
