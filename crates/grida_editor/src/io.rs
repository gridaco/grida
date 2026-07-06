//! IO — clipboard fragments and document open/save (`IO-*`).
//!
//! Reference implementation of `docs/wg/canvas/io.md`.
//!
//! ## Clipboard (IO-3..6)
//!
//! [`copy`] encodes the selection as whole subtrees in document order
//! into a [`crate::wire::Envelope`] JSON string — self-describing and
//! versioned, never process-local pointers, so cross-instance paste
//! (IO-5) works through the system clipboard. [`paste`] decodes an
//! envelope, mints **new** stable ids for every pasted node (IO-3),
//! offsets top-level fragments by `(+10, +10)` so repeat pastes are
//! visible, and inserts everything as **one** recorded batch (IO-6);
//! the returned ids are for the caller to select.
//!
//! Fragment fidelity is the wire subset (see [`crate::wire`] module
//! docs) — copying a node kind outside that subset is an error, not a
//! silent lossy pass.
//!
//! ## Document open/save (IO-1)
//!
//! Save uses the real `.grida` encoder
//! ([`grida::io::io_grida_fbs::encode`]) — full fidelity, not the wire
//! subset. The working copy wraps scene roots under a synthetic root
//! (see [`crate::document`] module docs), so [`encode_document`]
//! rebuilds an unwrapped scene from captured fragments before
//! encoding; stable ids persist as the file's string ids and child
//! order persists via generated fractional positions. [`open`] is the
//! decode half the shell already used ([`decode_with_id_map`]).
//!
//! [`decode_with_id_map`]: grida::io::io_grida_file::decode_with_id_map

use std::collections::{HashMap, HashSet};
use std::path::Path;

use grida::cg::types::ResourceRef;
use grida::node::factory::NodeFactory;
use grida::node::scene_graph::{Parent, SceneGraph};
use grida::node::schema::{Node, NodeId, Scene, Size};

use crate::document::{self, Fragment, Id, Mutation, MutationError, WorkingCopy};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::wire::{self, Envelope, Payload, WireError};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Why an IO operation failed.
#[derive(Debug)]
pub enum IoError {
    /// Wire encode/decode failure (format, version, unsupported kind).
    Wire(WireError),
    /// The envelope payload is not a fragment set.
    NotFragments,
    /// The paste batch was rejected by the document.
    Mutation(MutationError),
    /// File read/write failure.
    File(std::io::Error),
    /// The file bytes could not be decoded as `.grida`.
    Decode(grida::io::io_grida_file::DecodeError),
    /// The decoded document contains no scenes.
    NoScenes,
}

impl std::fmt::Display for IoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IoError::Wire(e) => write!(f, "{e}"),
            IoError::NotFragments => write!(f, "envelope does not carry clipboard fragments"),
            IoError::Mutation(e) => write!(f, "paste rejected: {e}"),
            IoError::File(e) => write!(f, "file error: {e}"),
            IoError::Decode(e) => write!(f, "failed to decode .grida document: {e}"),
            IoError::NoScenes => write!(f, "document contains no scenes"),
        }
    }
}

impl std::error::Error for IoError {}

impl From<WireError> for IoError {
    fn from(e: WireError) -> Self {
        IoError::Wire(e)
    }
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/// Encode a selection as a clipboard envelope (JSON).
///
/// Whole subtrees in document order: ids that are descendants of other
/// listed ids fold into their ancestor's subtree (copying a parent
/// carries its children once), and the top-level fragments are ordered
/// by document pre-order regardless of the selection's order. Unknown
/// ids are skipped.
pub fn copy(editor: &Editor, ids: &[Id]) -> Result<String, IoError> {
    let doc = editor.document();
    let wanted: HashSet<&Id> = ids.iter().collect();
    let mut roots: Vec<Id> = Vec::new();
    collect_top_level(doc, None, &wanted, &mut roots);

    let fragments = roots
        .iter()
        .filter_map(|id| doc.capture(id))
        .map(|fragment| wire::encode_fragment(&fragment))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Envelope::new(Payload::Fragments { fragments }).to_json())
}

/// Pre-order walk collecting the top-most selected ids (document
/// order); does not descend into a collected subtree. The shell's
/// delete path shares it (removing a parent removes its subtree; a
/// selected descendant must not produce a second `Remove`).
pub(crate) fn collect_top_level(
    doc: &WorkingCopy,
    parent: Option<&Id>,
    wanted: &HashSet<&Id>,
    out: &mut Vec<Id>,
) {
    for child in doc.children(parent) {
        if wanted.contains(&child) {
            out.push(child);
        } else {
            collect_top_level(doc, Some(&child), wanted, out);
        }
    }
}

/// Paste a clipboard envelope under `target_parent` (`None` = scene
/// root level), appended after the existing children.
///
/// New stable ids are minted for every pasted node (IO-3 — pasting the
/// same envelope twice yields disjoint id sets), top-level fragments
/// are offset by `(+10, +10)`, and the whole paste is dispatched as
/// one recorded batch (IO-6 — one undo step). Returns the new
/// **top-level** ids in document order; the caller selects them.
pub fn paste(
    editor: &mut Editor,
    envelope: &str,
    target_parent: Option<&Id>,
) -> Result<Vec<Id>, IoError> {
    let envelope = Envelope::from_json(envelope)?;
    let Payload::Fragments { fragments } = envelope.payload else {
        return Err(IoError::NotFragments);
    };

    let mut minted: HashSet<Id> = HashSet::new();
    let mut counter: u64 = 0;
    let mut new_ids: Vec<Id> = Vec::new();
    let mut batch: Vec<Mutation> = Vec::new();
    let base_index = editor.children(target_parent).len();

    for (offset, wire_node) in fragments.iter().enumerate() {
        let mut fragment = wire::decode_fragment(wire_node);
        remint(editor.document(), &mut fragment, &mut counter, &mut minted);
        new_ids.push(fragment.id.clone());
        // Offset the pasted subtree so repeat pastes are visible.
        if let Some((x, y)) = document::node_position(&fragment.node) {
            document::set_position(&mut fragment.node, x + 10.0, y + 10.0);
        }
        batch.push(Mutation::Insert {
            parent: target_parent.cloned(),
            index: base_index + offset,
            fragment: Box::new(fragment),
        });
    }

    editor
        .dispatch(batch, Origin::Local, Recording::Record { label: None })
        .map_err(IoError::Mutation)?;
    Ok(new_ids)
}

/// Insert a pasted raster as an image node — paste sniffing row 4
/// (`docs/wg/canvas/io-external.md`; the paste half of `IOX-7`).
///
/// The raster must already be registered with the host's image store
/// under `rid`; the document carries the reference
/// ([`ResourceRef::RID`]), never the bytes. A document-side resource
/// store (bytes packed into save files and the wire) is a named gap:
/// image nodes are outside the wire subset — copying or syncing one
/// is a loud `UnsupportedKind` — and `.grida` save falls back to an
/// unknown-node slot (see `TODO.md`).
///
/// The node is placed at its natural `size`, centered on `center`
/// (canvas space), appended at the scene-root level as **one**
/// recorded entry with a fresh id (IO-3); the returned id is for the
/// caller to select.
pub fn insert_image(
    editor: &mut Editor,
    rid: &str,
    size: (f32, f32),
    center: (f32, f32),
) -> Result<Id, IoError> {
    let mut rec = NodeFactory::new().create_image_node();
    rec.size = Size {
        width: size.0,
        height: size.1,
    };
    // The node-level ref and the fill's ref name the same resource;
    // the painter reads the fill.
    rec.image = ResourceRef::RID(rid.to_string());
    rec.fill.image = ResourceRef::RID(rid.to_string());
    rec.transform
        .set_translation(center.0 - size.0 * 0.5, center.1 - size.1 * 0.5);

    let mut fragment = Fragment {
        id: String::new(),
        name: Some("image".into()),
        node: Node::Image(rec),
        children: Vec::new(),
    };
    let mut counter = 0u64;
    let mut minted = HashSet::new();
    remint(editor.document(), &mut fragment, &mut counter, &mut minted);
    let id = fragment.id.clone();
    let index = editor.children(None).len();
    editor
        .dispatch(
            vec![Mutation::Insert {
                parent: None,
                index,
                fragment: Box::new(fragment),
            }],
            Origin::Local,
            Recording::Record {
                label: Some("paste image".into()),
            },
        )
        .map_err(IoError::Mutation)?;
    Ok(id)
}

/// Deep-clone a node as its own **immediate next sibling** with fresh
/// ids — the shared placement of clone-on-translate and the duplicate
/// command (`docs/wg/canvas/translate.md`, `TRL-2`). Returns the
/// insert mutation and the clone's root id; `None` when the id is
/// unknown. `counter`/`minted` thread across calls so one cohort mints
/// disjoint ids.
pub(crate) fn clone_next_sibling(
    doc: &WorkingCopy,
    id: &Id,
    counter: &mut u64,
    minted: &mut HashSet<Id>,
) -> Option<(Mutation, Id)> {
    let mut fragment = doc.capture(id)?;
    remint(doc, &mut fragment, counter, minted);
    let clone_id = fragment.id.clone();
    let parent = doc.node_parent(id)?;
    let index = doc.children(parent.as_ref()).iter().position(|c| c == id)? + 1;
    Some((
        Mutation::Insert {
            parent,
            index,
            fragment: Box::new(fragment),
        },
        clone_id,
    ))
}

/// Mint fresh stable ids for a decoded fragment subtree (pre-order).
fn remint(doc: &WorkingCopy, fragment: &mut Fragment, counter: &mut u64, minted: &mut HashSet<Id>) {
    loop {
        *counter += 1;
        let candidate = format!("n{counter}");
        if !doc.contains(&candidate) && minted.insert(candidate.clone()) {
            fragment.id = candidate;
            break;
        }
    }
    for child in &mut fragment.children {
        remint(doc, child, counter, minted);
    }
}

// ---------------------------------------------------------------------------
// Document open/save
// ---------------------------------------------------------------------------

/// Encode the working copy as `.grida` bytes (the native format —
/// IO-1 round-trip partner of [`open`]).
pub fn encode_document(doc: &WorkingCopy) -> Vec<u8> {
    // The exported scene includes the synthetic root wrapper (which has
    // no stable id and must not reach the file); rebuild an unwrapped
    // scene from captured fragments.
    let exported = doc.export_scene();
    let mut graph = SceneGraph::new();
    let mut id_map: HashMap<NodeId, String> = HashMap::new();
    for root in doc.children(None) {
        if let Some(fragment) = doc.capture(&root) {
            build_subtree(&mut graph, Parent::Root, &fragment, &mut id_map);
        }
    }
    let scene = Scene {
        name: exported.name,
        background_color: exported.background_color,
        graph,
    };
    // Empty position map: the encoder generates fractional positions
    // from document order, which the decoder sorts by — order persists.
    grida::io::io_grida_fbs::encode(&scene, "scene", &id_map, &HashMap::new())
}

fn build_subtree(
    graph: &mut SceneGraph,
    parent: Parent,
    fragment: &Fragment,
    id_map: &mut HashMap<NodeId, String>,
) {
    let iid = graph.append_child(fragment.node.clone(), parent);
    if let Some(name) = &fragment.name {
        graph.set_name(iid, name.clone());
    }
    id_map.insert(iid, fragment.id.clone());
    for child in &fragment.children {
        build_subtree(graph, Parent::NodeId(iid), child, id_map);
    }
}

/// Save the editor's committed working copy to a `.grida` file.
///
/// Exports the committed document state — the shell must not call this
/// mid-gesture (IO-7 is about render export; for document save the
/// shell commits or aborts the open gesture first).
pub fn save(editor: &Editor, path: &Path) -> Result<(), IoError> {
    std::fs::write(path, encode_document(editor.document())).map_err(IoError::File)
}

/// Open a `.grida` file: the first scene plus the internal→stable id
/// map the working copy needs (stable ids persist in files).
pub fn open(path: &Path) -> Result<(Scene, HashMap<NodeId, Id>), IoError> {
    let bytes = std::fs::read(path).map_err(IoError::File)?;
    decode_document(&bytes)
}

/// Decode `.grida` bytes ([`open`] without the file read — the sync
/// Welcome message reuses it).
pub fn decode_document(bytes: &[u8]) -> Result<(Scene, HashMap<NodeId, Id>), IoError> {
    let decoded = grida::io::io_grida_file::decode_with_id_map(bytes).map_err(IoError::Decode)?;
    let scene = decoded.scenes.into_iter().next().ok_or(IoError::NoScenes)?;
    Ok((scene, decoded.id_map))
}
