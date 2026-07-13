//! Version 4 durable authored-member and component-occurrence addresses.

use anchor_lab::grida_xml_source::{
    self, AddressLookupError, AuthoredMemberId, AuthoredOwner, SourceProvider, SourceSnapshot,
    SourceVersion,
};
use std::collections::BTreeMap;

fn snapshot(identity: &str, source: &str) -> SourceSnapshot {
    SourceSnapshot::new(identity, "memory:/", source)
}

#[derive(Default)]
struct MemoryProvider {
    sources: BTreeMap<(String, String), SourceSnapshot>,
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
        self.sources
            .get(&(containing.identity().to_owned(), location.to_owned()))
            .cloned()
            .ok_or_else(|| "not found".into())
    }
}

#[test]
fn two_component_uses_give_one_member_distinct_occurrence_addresses() {
    let source = r##"
<grida version="4">
  <component id="badge" width="20" height="12">
    <prop name="tone" type="color" default="#112233"/>
    <rect id="badge-body" width="8" height="6" fill="{tone}"/>
  </component>
  <container id="scene-root" width="100" height="80">
    <use id="first-badge" href="#badge" x="4"/>
    <use id="second-badge" href="#badge" x="40"/>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output = grida_xml_source::materialize(snapshot("entry", source), &mut provider).unwrap();
    assert_eq!(
        output.program.unit("entry").unwrap().version(),
        SourceVersion::Version4
    );
    assert_eq!(
        output.addresses().len(),
        output.document.len() - 1,
        "only the implicit document root is not authored"
    );

    let mut bodies = output
        .addresses()
        .filter(|(address, _)| address.member.id == AuthoredMemberId::Id("badge-body".into()))
        .map(|(address, node)| (address.clone(), node))
        .collect::<Vec<_>>();
    bodies.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(bodies.len(), 2);
    assert_ne!(bodies[0].0, bodies[1].0);
    assert_ne!(bodies[0].1.id(), bodies[1].1.id());
    assert_eq!(
        bodies
            .iter()
            .map(|(address, _)| address.use_path[0].id.as_str())
            .collect::<Vec<_>>(),
        ["first-badge", "second-badge"]
    );
    for (address, node) in bodies {
        assert_eq!(
            address.member.owner,
            AuthoredOwner::Component(grida_xml_source::ComponentIdentity {
                source: "entry".into(),
                id: "badge".into(),
            })
        );
        assert_eq!(output.node_for_address(&address).unwrap(), node);
        assert_eq!(output.address_for_node(node).unwrap(), &address);
    }
}

#[test]
fn authored_root_id_is_distinct_from_the_structural_component_root() {
    let source = r##"
<grida version="4">
  <component id="card" width="20" height="12">
    <rect id="root" width="8" height="6"/>
  </component>
  <container id="scene-root">
    <use id="card-use" href="#card"/>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output = grida_xml_source::materialize(snapshot("entry", source), &mut provider).unwrap();
    let owner = AuthoredOwner::Component(grida_xml_source::ComponentIdentity {
        source: "entry".into(),
        id: "card".into(),
    });
    let structural_root = output
        .addresses()
        .find(|(address, _)| {
            address.member.owner == owner && address.member.id == AuthoredMemberId::ComponentRoot
        })
        .unwrap();
    let authored_root = output
        .addresses()
        .find(|(address, _)| {
            address.member.owner == owner
                && address.member.id == AuthoredMemberId::Id("root".into())
        })
        .unwrap();

    assert_ne!(structural_root.0, authored_root.0);
    assert_ne!(structural_root.1, authored_root.1);
    assert_eq!(structural_root.0.use_path, authored_root.0.use_path);
    assert_eq!(
        authored_root
            .0
            .use_path
            .iter()
            .map(|occurrence| occurrence.id.as_str())
            .collect::<Vec<_>>(),
        ["card-use"]
    );
}

#[test]
fn nested_uses_and_slot_assignments_keep_path_order_and_authored_owner() {
    let source = r##"
<grida version="4">
  <component id="leaf" width="9" height="7">
    <ellipse id="leaf-mark" width="5" height="5"/>
  </component>
  <component id="shell" width="80" height="50">
    <container id="slot-frame" width="70" height="40"><slot name="body"/></container>
  </component>
  <container id="scene-root" width="200" height="120">
    <use id="shell-use" href="#shell">
      <rect id="caller-rect" slot="body" width="6" height="4"/>
      <use id="nested-leaf-use" slot="body" href="#leaf"/>
    </use>
  </container>
</grida>
"##;
    let mut provider = MemoryProvider::default();
    let output = grida_xml_source::materialize(snapshot("entry", source), &mut provider).unwrap();

    let caller_rect = output
        .addresses()
        .find(|(address, _)| address.member.id == AuthoredMemberId::Id("caller-rect".into()))
        .unwrap();
    assert_eq!(
        caller_rect.0.member.owner,
        AuthoredOwner::Scene {
            source: "entry".into()
        }
    );
    assert_eq!(
        caller_rect
            .0
            .use_path
            .iter()
            .map(|occurrence| occurrence.id.as_str())
            .collect::<Vec<_>>(),
        ["shell-use"]
    );

    let leaf_mark = output
        .addresses()
        .find(|(address, _)| address.member.id == AuthoredMemberId::Id("leaf-mark".into()))
        .unwrap();
    assert_eq!(
        leaf_mark.0.member.owner,
        AuthoredOwner::Component(grida_xml_source::ComponentIdentity {
            source: "entry".into(),
            id: "leaf".into(),
        })
    );
    assert_eq!(
        leaf_mark
            .0
            .use_path
            .iter()
            .map(|occurrence| occurrence.id.as_str())
            .collect::<Vec<_>>(),
        ["shell-use", "nested-leaf-use"]
    );
}

#[test]
fn version4_ids_are_required_well_formed_and_unique_per_lexical_owner() {
    let cases = [
        (
            r##"<grida version="4"><container/></grida>"##,
            "requires a durable",
            true,
        ),
        (
            r##"<grida version="4"><container id="root"><rect width="1" height="1"/></container></grida>"##,
            "requires a durable",
            true,
        ),
        (
            r##"<grida version="4"><container id="Bad"/></grida>"##,
            "lowercase kebab-case",
            true,
        ),
        (
            r##"<grida version="4"><component id="item"/><container id="root"><rect id="same" width="1" height="1"/><use id="same" href="#item"/></container></grida>"##,
            "duplicate Version 4 member/use id `same`",
            true,
        ),
        (
            r##"<grida version="4"><container id="root"><rect id="box" width="1" height="1"><fill id="paint"><solid color="#000"/></fill></rect></container></grida>"##,
            "unknown attribute `id`",
            false,
        ),
    ];
    for (source, expected, local_id_error) in cases {
        let error = grida_xml_source::parse_source(snapshot("bad", source)).unwrap_err();
        assert!(error.message.contains(expected), "{error}");
        if local_id_error {
            assert!(
                error.span.is_some(),
                "Version 4 id errors retain a local span"
            );
        }
    }

    let owner_local = r##"
<grida version="4">
  <component id="item"><rect id="same" width="1" height="1"/></component>
  <container id="same"><use id="item-use" href="#item"/></container>
</grida>
"##;
    grida_xml_source::parse_source(snapshot("ok", owner_local)).unwrap();
}

#[test]
fn versions_zero_through_three_keep_their_exact_id_posture() {
    for version in ["1", "2", "3"] {
        let source = format!(
            r##"<grida version="{version}"><container><rect width="1" height="1"/></container></grida>"##
        );
        grida_xml_source::parse_source(snapshot("old", &source)).unwrap();
    }

    let old_with_id = r##"<grida version="3"><container id="not-backported"/></grida>"##;
    let error = grida_xml_source::parse_source(snapshot("old", old_with_id)).unwrap_err();
    assert!(error.message.contains("unknown attribute `id`"), "{error}");
}

#[test]
fn version4_rejects_legacy_component_sources_before_materialization() {
    for target_version in ["1", "2", "3"] {
        let mut provider = MemoryProvider::default();
        provider.insert(
            "entry",
            "./library",
            snapshot(
                &format!("library-v{target_version}"),
                &format!(
                    r##"<grida version="{target_version}"><component id="item" width="8" height="6"><rect width="2" height="2"/></component></grida>"##
                ),
            ),
        );
        let entry = r##"
<grida version="4">
  <container id="scene-root"><use id="item-use" href="./library#item"/></container>
</grida>
"##;
        let error =
            grida_xml_source::materialize(snapshot("entry", entry), &mut provider).unwrap_err();
        assert_eq!(error.phase, grida_xml_source::ErrorPhase::Link);
        assert!(
            error.message.contains(&format!(
                "Version 4 source cannot link Version {target_version} component source"
            )),
            "{error}"
        );
    }
}

#[test]
fn version4_to_version4_slot_assignment_has_a_complete_address_closure() {
    let mut provider = MemoryProvider::default();
    provider.insert(
        "entry",
        "./library",
        snapshot(
            "library-v4",
            r##"
<grida version="4">
  <component id="host" width="40" height="30">
    <container id="slot-frame" width="30" height="20"><slot name="body"/></container>
  </component>
</grida>
"##,
        ),
    );
    let entry = r##"
<grida version="4">
  <container id="scene-root">
    <use id="host-use" href="./library#host">
      <rect id="assigned-rect" slot="body" width="4" height="3"/>
    </use>
  </container>
</grida>
"##;
    let output = grida_xml_source::materialize(snapshot("entry", entry), &mut provider).unwrap();
    assert_eq!(
        output.program.unit("library-v4").unwrap().version(),
        SourceVersion::Version4
    );
    assert_eq!(output.addresses().len() + 1, output.document.len());
    for (address, node) in output.addresses() {
        assert_eq!(output.node_for_address(address).unwrap(), node);
        assert_eq!(output.address_for_node(node).unwrap(), address);
    }

    let assigned = output
        .addresses()
        .find(|(address, _)| address.member.id == AuthoredMemberId::Id("assigned-rect".into()))
        .unwrap();
    assert_eq!(
        assigned
            .0
            .use_path
            .iter()
            .map(|occurrence| occurrence.id.as_str())
            .collect::<Vec<_>>(),
        ["host-use"]
    );
}

#[test]
fn older_nodes_are_unaddressed_and_removed_version4_nodes_fail_closed() {
    let old = r##"<grida version="3"><container/></grida>"##;
    let mut provider = MemoryProvider::default();
    let old = grida_xml_source::materialize(snapshot("old", old), &mut provider).unwrap();
    assert_eq!(old.addresses().len(), 0);
    let old_root = old.document.get(old.document.root).children[0];
    let old_key = old.document.key_of(old_root).unwrap();
    assert!(matches!(
        old.address_for_node(old_key),
        Err(AddressLookupError::NodeHasNoDurableAddress { .. })
    ));

    let source = r##"<grida version="4"><container id="scene-root"><rect id="member" width="2" height="2"/></container></grida>"##;
    let mut output = grida_xml_source::materialize(snapshot("new", source), &mut provider).unwrap();
    let (address, key) = output
        .addresses()
        .find(|(address, _)| address.member.id == AuthoredMemberId::Id("member".into()))
        .map(|(address, key)| (address.clone(), key))
        .unwrap();
    let live_before = output.addresses().len();
    output.document.remove_subtree(key.id());
    assert_eq!(output.addresses().len(), live_before - 1);
    assert!(output
        .addresses()
        .all(|(live_address, live_node)| live_address != &address && live_node != key));
    assert!(matches!(
        output.node_for_address(&address),
        Err(AddressLookupError::StaleAddress { .. })
    ));
    assert!(matches!(
        output.address_for_node(key),
        Err(AddressLookupError::UnknownNode { .. })
    ));
}
