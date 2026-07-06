//! Sync conformance (`docs/wg/feat-crdt/sync.md`, `SYNC-*`) — headless,
//! in-process: one authority instance and two client instances over the
//! channel loopback transport, no network (SYNC-8).

use std::cell::RefCell;
use std::rc::Rc;

use grida::cg::prelude::*;
use grida::node::factory::NodeFactory;
use grida::node::schema::{Node, Size};
use math2::transform::AffineTransform;

use grida_editor::document::{Fragment, Mutation, PropPatch, WorkingCopy};
use grida_editor::editor::{Editor, Recording};
use grida_editor::history::Origin;
use grida_editor::sync::{SyncAuthority, SyncClient};
use grida_editor::sync_net::{ChannelTransport, Transport};
use grida_editor::wire::{Envelope, Msg, Payload};

// ── Fixture ──────────────────────────────────────────────────────────────

fn rect_fragment(id: &str, x: f32, y: f32) -> Fragment {
    let nf = NodeFactory::new();
    let mut rect = nf.create_rectangle_node();
    rect.transform = AffineTransform::new(x, y, 0.0);
    rect.size = Size {
        width: 80.0,
        height: 80.0,
    };
    rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
        100, 100, 100, 255,
    )))]);
    Fragment {
        id: id.to_string(),
        name: None,
        node: Node::Rectangle(rect),
        children: Vec::new(),
    }
}

/// The shared base document: rects `X` and `Y` (every instance opens
/// the same document — the "verify the local document matches" join).
fn base_editor() -> Editor {
    let mut editor = Editor::new(WorkingCopy::new_empty("sync"));
    editor
        .dispatch(
            vec![
                Mutation::Insert {
                    parent: None,
                    index: 0,
                    fragment: Box::new(rect_fragment("X", 10.0, 10.0)),
                },
                Mutation::Insert {
                    parent: None,
                    index: 1,
                    fragment: Box::new(rect_fragment("Y", 200.0, 10.0)),
                },
            ],
            Origin::Local,
            Recording::Silent,
        )
        .expect("base scene applies");
    editor
}

fn patch(id: &str, x: f32, y: f32) -> Vec<Mutation> {
    vec![Mutation::Patch {
        id: id.to_string(),
        set: Box::new(PropPatch {
            position: Some((x, y)),
            ..Default::default()
        }),
    }]
}

// ── Harness: authority + two clients over channel loopback ──────────────
//
// Local edits reach the sync layer through the editor's applied-batch
// tap — the same wiring the shell uses — so undo/redo and gesture
// aborts replicate as content batches too.

type Pending = Rc<RefCell<Vec<(Vec<Mutation>, Vec<Mutation>)>>>;

/// Install the local-batch tap (after the base scene is built, so the
/// fixture inserts don't replicate).
fn tapped(mut editor: Editor) -> (Editor, Pending) {
    let pending: Pending = Pending::default();
    let feed = pending.clone();
    editor.set_applied_tap(Some(Box::new(move |batch, inverse, origin| {
        if origin == Origin::Local {
            feed.borrow_mut().push((batch.to_vec(), inverse.to_vec()));
        }
    })));
    (editor, pending)
}

struct Hub {
    editor: Editor,
    pending: Pending,
    authority: SyncAuthority,
    /// Authority-side transport ends, index-aligned with the clients.
    ends: Vec<ChannelTransport>,
}

struct Client {
    editor: Editor,
    pending: Pending,
    client: SyncClient,
    transport: ChannelTransport,
}

fn session() -> (Hub, Client, Client) {
    let (auth_b, b_end) = ChannelTransport::pair();
    let (auth_c, c_end) = ChannelTransport::pair();
    let (hub_editor, hub_pending) = tapped(base_editor());
    let (b_editor, b_pending) = tapped(base_editor());
    let (c_editor, c_pending) = tapped(base_editor());
    (
        Hub {
            editor: hub_editor,
            pending: hub_pending,
            authority: SyncAuthority::new("authority"),
            ends: vec![auth_b, auth_c],
        },
        Client {
            editor: b_editor,
            pending: b_pending,
            client: SyncClient::new("B"),
            transport: b_end,
        },
        Client {
            editor: c_editor,
            pending: c_pending,
            client: SyncClient::new("C"),
            transport: c_end,
        },
    )
}

impl Hub {
    fn broadcast(&mut self, msg: Msg) {
        let envelope = Envelope::new(Payload::Sync { msg });
        for end in &mut self.ends {
            end.send(&envelope).expect("loopback send");
        }
    }

    /// A local edit at the authority instance: applied + recorded
    /// locally (it is canonical on apply); ordering + broadcast happen
    /// on the next pump (tap → pending).
    fn local_edit(&mut self, batch: Vec<Mutation>) {
        self.editor
            .dispatch(batch, Origin::Local, Recording::Record { label: None })
            .expect("authority local edit applies");
        self.pump();
    }

    /// Drain the tap (order + broadcast own edits) and the incoming
    /// submits (ingest + broadcast commits). Returns whether anything
    /// was processed.
    fn pump(&mut self) -> bool {
        let mut activity = false;
        let locals: Vec<_> = self.pending.borrow_mut().drain(..).collect();
        for (batch, _inverse) in locals {
            activity = true;
            let msg = self.authority.order_local(&batch).expect("wire subset");
            self.broadcast(msg);
        }
        let mut incoming = Vec::new();
        for end in &mut self.ends {
            while let Some(envelope) = end.try_recv().expect("loopback recv") {
                if let Payload::Sync { msg } = envelope.payload {
                    incoming.push(msg);
                }
            }
        }
        for msg in incoming {
            if let Msg::Submit { sender, seq, batch } = msg {
                activity = true;
                for commit in self.authority.ingest(&mut self.editor, sender, seq, batch) {
                    self.broadcast(commit);
                }
            }
        }
        activity
    }
}

impl Client {
    /// A local edit: optimistic apply (recorded — it is this
    /// instance's own edit); the tap queues it for submission.
    fn local_edit(&mut self, batch: Vec<Mutation>) {
        self.editor
            .dispatch(batch, Origin::Local, Recording::Record { label: None })
            .expect("local edit applies");
    }

    /// Drain the tap into the sync client and hand back the Submits.
    fn outgoing(&mut self) -> Vec<Msg> {
        let locals: Vec<_> = self.pending.borrow_mut().drain(..).collect();
        for (batch, inverse) in locals {
            self.client.queue_local(batch, inverse);
        }
        self.client.take_outgoing().expect("wire subset")
    }

    /// Send queued submits. Returns whether anything went out.
    fn flush_out(&mut self) -> bool {
        let msgs = self.outgoing();
        let sent = !msgs.is_empty();
        for msg in msgs {
            self.transport
                .send(&Envelope::new(Payload::Sync { msg }))
                .expect("loopback send");
        }
        sent
    }

    /// Apply received commits. Returns whether anything arrived.
    fn flush_in(&mut self) -> bool {
        let mut activity = false;
        while let Some(envelope) = self.transport.try_recv().expect("loopback recv") {
            if let Payload::Sync {
                msg:
                    Msg::Commit {
                        global,
                        sender,
                        seq,
                        batch,
                    },
            } = envelope.payload
            {
                activity = true;
                self.client
                    .on_commit(&mut self.editor, global, sender, seq, batch)
                    .expect("commit applies");
            }
        }
        activity
    }
}

/// Run the message loop to quiescence.
fn settle(hub: &mut Hub, clients: &mut [&mut Client]) {
    loop {
        let mut activity = false;
        for client in clients.iter_mut() {
            activity |= client.flush_out();
        }
        activity |= hub.pump();
        for client in clients.iter_mut() {
            activity |= client.flush_in();
        }
        if !activity {
            break;
        }
    }
}

fn assert_converged(hub: &Hub, clients: &[&Client]) {
    for (i, client) in clients.iter().enumerate() {
        assert_eq!(client.client.speculative_len(), 0, "client {i} drained");
        assert_eq!(client.client.unsent_len(), 0, "client {i} drained");
        assert!(
            hub.editor.document().structure_eq(client.editor.document()),
            "client {i} must equal canonical (SYNC-1)"
        );
    }
}

// ── Contracts ────────────────────────────────────────────────────────────

/// SYNC-1 — interleaved edits from the authority and both clients,
/// with staggered delivery, converge to identical documents.
#[test]
fn sync1_convergence_under_interleaving() {
    let (mut hub, mut b, mut c) = session();

    b.local_edit(patch("X", 50.0, 50.0));
    hub.local_edit(patch("Y", 300.0, 40.0));
    c.local_edit(vec![Mutation::Patch {
        id: "Y".to_string(),
        set: Box::new(PropPatch {
            fill_solid: Some(CGColor::from_rgba(1, 2, 3, 255)),
            ..Default::default()
        }),
    }]);
    // Partial delivery: B's edit reaches the authority before C even
    // submits; C receives the first commits mid-flight.
    b.flush_out();
    hub.pump();
    c.flush_in();
    b.local_edit(patch("X", 60.0, 70.0));

    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);

    // Both clients applied the same authority stream: byte-equal
    // structure between them, too.
    assert!(b.editor.document().structure_eq(c.editor.document()));
    assert_eq!(b.editor.node_position(&"X".to_string()), Some((60.0, 70.0)));
    assert_eq!(
        c.editor.node_fill_solid(&"Y".to_string()),
        Some(CGColor::from_rgba(1, 2, 3, 255))
    );
}

/// SYNC-2 — a local edit renders immediately, and the authority's
/// echo-ack causes no observable state change.
#[test]
fn sync2_optimistic_echo() {
    let (mut hub, mut b, mut c) = session();

    b.local_edit(patch("X", 99.0, 98.0));
    // Optimistic: applied before any acknowledgment.
    assert_eq!(b.editor.node_position(&"X".to_string()), Some((99.0, 98.0)));

    b.flush_out();
    hub.pump();
    let before_echo = b.editor.document().clone();
    assert!(b.flush_in(), "echo arrives");
    assert!(
        before_echo.structure_eq(b.editor.document()),
        "echo-ack must not change observable state (SYNC-2)"
    );
    assert_eq!(b.client.speculative_len(), 0, "echo acknowledged the batch");
    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);
}

/// SYNC-3 — concurrent disjoint edits (B on X, C on Y) both survive on
/// every instance.
#[test]
fn sync3_concurrent_disjoint_edits() {
    let (mut hub, mut b, mut c) = session();

    // Both edit before any exchange: truly concurrent.
    b.local_edit(patch("X", 41.0, 42.0));
    c.local_edit(patch("Y", 251.0, 252.0));

    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);
    for editor in [&hub.editor, &b.editor, &c.editor] {
        assert_eq!(editor.node_position(&"X".to_string()), Some((41.0, 42.0)));
        assert_eq!(editor.node_position(&"Y".to_string()), Some((251.0, 252.0)));
    }
}

/// SYNC-4 — B deletes X while C has an in-flight patch to X: C's patch
/// drops on rebase, C converges to the deletion, the session continues
/// without error.
#[test]
fn sync4_conflict_drop() {
    let (mut hub, mut b, mut c) = session();

    // C's patch is speculative (sent) but not yet at the authority.
    c.local_edit(patch("X", 77.0, 78.0));
    let pending: Vec<Msg> = c.outgoing();
    assert_eq!(pending.len(), 1);

    // B's delete wins the race to the authority.
    b.local_edit(vec![Mutation::Remove {
        id: "X".to_string(),
    }]);
    b.flush_out();
    hub.pump();
    c.flush_in(); // C rebases over the delete: patch drops (SYNC-4)
    assert!(!c.editor.document().contains(&"X".to_string()));

    // C's delayed submit now reaches the authority: rejected there,
    // consistently with C's local drop.
    for msg in pending {
        c.transport
            .send(&Envelope::new(Payload::Sync { msg }))
            .expect("send");
    }
    settle(&mut hub, &mut [&mut b, &mut c]);
    // The drop is silent: C's speculative layer is empty even though
    // no echo ever arrived for the dropped batch.
    assert_eq!(c.client.speculative_len(), 0);
    assert_converged(&hub, &[&b, &c]);
    for editor in [&hub.editor, &b.editor, &c.editor] {
        assert!(!editor.document().contains(&"X".to_string()));
    }

    // The session continues: C keeps editing.
    c.local_edit(patch("Y", 1.0, 2.0));
    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);
    assert_eq!(hub.editor.node_position(&"Y".to_string()), Some((1.0, 2.0)));
}

/// SYNC-5 — throughout SYNC-2..4-style traffic, each instance's undo
/// stack contains only its own local entries (HISB-5 end-to-end).
#[test]
fn sync5_history_isolation() {
    let (mut hub, mut b, mut c) = session();

    b.local_edit(patch("X", 30.0, 30.0));
    c.local_edit(patch("Y", 240.0, 20.0));
    hub.local_edit(patch("Y", 250.0, 25.0));
    settle(&mut hub, &mut [&mut b, &mut c]);
    b.local_edit(patch("X", 35.0, 30.0));
    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);

    assert_eq!(b.editor.history_len(), 2, "B recorded only B's edits");
    assert_eq!(c.editor.history_len(), 1, "C recorded only C's edits");
    assert_eq!(hub.editor.history_len(), 1, "authority likewise");

    // And undo stays local: B undoing its last edit does not disturb
    // the others' entries once replicated.
    assert!(b.editor.undo());
    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);
    assert_eq!(c.editor.history_len(), 1);
    assert_eq!(hub.editor.history_len(), 1);
}

/// SYNC-7 — duplicated and re-ordered delivery applies once, in
/// sequence order — at the client (by global id) and at the authority
/// (by per-sender seq).
#[test]
fn sync7_exactly_once() {
    let (mut hub, mut b, mut c) = session();

    // Two commits from B: an insert (non-idempotent — double apply
    // would be observable) and a patch on the inserted node
    // (order-dependent — applying #2 before #1 would fail).
    b.local_edit(vec![Mutation::Insert {
        parent: None,
        index: 2,
        fragment: Box::new(rect_fragment("Z", 400.0, 10.0)),
    }]);
    b.local_edit(patch("Z", 410.0, 20.0));
    let submits = b.outgoing();
    assert_eq!(submits.len(), 2);

    // Authority: duplicate submit delivery applies once.
    let mut commits = Vec::new();
    for msg in &submits {
        let Msg::Submit { sender, seq, batch } = msg.clone() else {
            panic!("submit expected")
        };
        commits.extend(hub.authority.ingest(&mut hub.editor, sender, seq, batch));
    }
    assert_eq!(commits.len(), 2);
    for msg in &submits {
        let Msg::Submit { sender, seq, batch } = msg.clone() else {
            panic!("submit expected")
        };
        assert!(
            hub.authority
                .ingest(&mut hub.editor, sender, seq, batch)
                .is_empty(),
            "duplicate submit must not re-commit (SYNC-7)"
        );
    }
    assert_eq!(
        hub.editor.children(None).len(),
        3,
        "Z inserted exactly once at the authority"
    );

    // Client C: deliver the commits re-ordered, then duplicated.
    deliver(&mut c, &commits[1]); // ahead of order: buffered
    assert!(
        !c.editor.document().contains(&"Z".to_string()),
        "out-of-order commit is buffered, not applied early"
    );
    deliver(&mut c, &commits[0]); // both apply now, in order
    deliver(&mut c, &commits[1]); // duplicate: ignored
    deliver(&mut c, &commits[0]); // duplicate: ignored

    assert_eq!(c.editor.children(None).len(), 3, "Z applied exactly once");
    assert_eq!(
        c.editor.node_position(&"Z".to_string()),
        Some((410.0, 20.0))
    );

    // B receives its own echoes (manually routed above, so the
    // broadcast never travelled the transports).
    deliver(&mut b, &commits[0]);
    deliver(&mut b, &commits[1]);
    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);
}

/// Deliver one Commit message straight into a client (bypassing the
/// transport) — the duplicate/re-order harness for SYNC-7.
fn deliver(client: &mut Client, msg: &Msg) {
    let Msg::Commit {
        global,
        sender,
        seq,
        batch,
    } = msg.clone()
    else {
        panic!("commit expected")
    };
    client
        .client
        .on_commit(&mut client.editor, global, sender, seq, batch)
        .expect("no error on duplicate/re-ordered delivery");
}

/// Join path: a fresh instance receives Welcome (canonical `.grida`
/// bytes + global position) and matches the authority byte-for-byte.
#[test]
fn welcome_loads_canonical_state() {
    let (mut hub, mut b, mut c) = session();
    hub.local_edit(patch("X", 123.0, 45.0));
    settle(&mut hub, &mut [&mut b, &mut c]);

    // A late joiner with an unrelated document.
    let mut late_editor = Editor::new(WorkingCopy::new_empty("late"));
    let mut late = SyncClient::new("D");
    late.on_welcome(
        &mut late_editor,
        &grida_editor::io::encode_document(hub.editor.document()),
        hub.authority.global(),
        &[],
    )
    .expect("welcome");
    assert!(hub.editor.document().structure_eq(late_editor.document()));
    assert_eq!(
        late_editor.node_position(&"X".to_string()),
        Some((123.0, 45.0))
    );
}

// ── Vector edit over the wire (vector-edit.md end-to-end) ────────────────

#[test]
fn vector_edit_replicates_full_networks() {
    use grida_editor::vector::mode::{VecMods, VectorMode, VectorTool};

    let (mut hub, mut b, mut c) = session();

    // B authors a vector, then edits it inside the mode: placements
    // and tangent shaping ride the wire as full networks (silent
    // previews included — the tap feeds sync everything applied).
    b.local_edit(vec![Mutation::Insert {
        parent: None,
        index: 2,
        fragment: Box::new(grida_editor::tool::vector_fragment(
            "V".to_string(),
            "Vector",
            [400.0, 10.0],
            grida_editor::document::polyline_network(&[(0.0, 0.0)]),
        )),
    }]);

    let mut mode = VectorMode::enter(&b.editor, "V".to_string()).expect("enter");
    mode.set_tool(VectorTool::Pen);
    let click = |mode: &mut VectorMode, editor: &mut Editor, at: [f32; 2]| {
        mode.pointer_down(editor, at, at, 1.0, 0, VecMods::default());
        mode.pointer_up(editor, at);
    };
    click(&mut mode, &mut b.editor, [400.0, 10.0]); // adopt
    // A placement with a drag: tangents appear on the wire.
    mode.pointer_down(
        &mut b.editor,
        [500.0, 10.0],
        [500.0, 10.0],
        1.0,
        0,
        VecMods::default(),
    );
    mode.pointer_move(
        &mut b.editor,
        [530.0, 50.0],
        [530.0, 50.0],
        1.0,
        VecMods::default(),
    );
    mode.pointer_up(&mut b.editor, [530.0, 50.0]);
    click(&mut mode, &mut b.editor, [600.0, 10.0]);
    let out = mode.exit(&mut b.editor);
    assert!(!out.deleted);

    settle(&mut hub, &mut [&mut b, &mut c]);
    assert_converged(&hub, &[&b, &c]);

    // The full tangent network arrived at the instance that never
    // touched it.
    let net_b = b.editor.node_vector_network(&"V".to_string()).unwrap();
    let net_c = c.editor.node_vector_network(&"V".to_string()).unwrap();
    assert!(grida_editor::vector::ops::network_eq(&net_b, &net_c));
    assert_eq!(net_c.segments.len(), 2);
    assert_ne!(
        net_c.segments[0].tb,
        (0.0, 0.0),
        "tangents survived the wire"
    );
}
