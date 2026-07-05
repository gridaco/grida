//! Shell-side sync session — TCP role wiring around the pure
//! [`crate::sync`] machines (`--listen` = authority, `--join` =
//! client). The shell drains the session on its tick; everything the
//! session does to the document flows through the editor with `Remote`
//! origin (never recorded — ED-3), and local edits reach the session
//! through the editor's applied-batch tap.

use std::cell::RefCell;
use std::rc::Rc;

use crate::document::Mutation;
use crate::editor::Editor;
use crate::history::Origin;
use crate::io;
use crate::sync::{SyncAuthority, SyncClient};
use crate::sync_net::{Listener, PeerEvent, TcpTransport, Transport};
use crate::wire::{Envelope, Msg, Payload};

/// Local batches (with inverses) applied since the last drain, fed by
/// the editor's applied-batch tap.
type PendingLocal = Rc<RefCell<Vec<(Vec<Mutation>, Vec<Mutation>)>>>;

enum Role {
    Authority {
        authority: SyncAuthority,
        listener: Listener,
    },
    Client {
        client: SyncClient,
        transport: TcpTransport,
    },
}

/// A live two-instance editing session (shell side).
pub(crate) struct SyncSession {
    role: Role,
    pending_local: PendingLocal,
}

impl SyncSession {
    /// Become the authority: listen on a loopback port.
    pub(crate) fn listen(port: u16) -> std::io::Result<Self> {
        Ok(Self {
            role: Role::Authority {
                authority: SyncAuthority::new(format!("authority-{}", std::process::id())),
                listener: Listener::bind(port)?,
            },
            pending_local: PendingLocal::default(),
        })
    }

    /// Join an authority at `addr` (e.g. `127.0.0.1:7878`).
    pub(crate) fn join(addr: &str) -> std::io::Result<Self> {
        Ok(Self {
            role: Role::Client {
                client: SyncClient::new(format!("client-{}", std::process::id())),
                transport: TcpTransport::connect(addr)?,
            },
            pending_local: PendingLocal::default(),
        })
    }

    /// Install the applied-batch tap: every local content change (and
    /// only local — remote echoes are filtered by origin) queues for
    /// the next drain.
    pub(crate) fn install_tap(&self, editor: &mut Editor) {
        let pending = self.pending_local.clone();
        editor.set_applied_tap(Some(Box::new(move |batch, inverse, origin| {
            if origin == Origin::Local {
                pending
                    .borrow_mut()
                    .push((batch.to_vec(), inverse.to_vec()));
            }
        })));
    }

    /// Drain the session: flush queued local edits out, apply received
    /// messages. Returns whether the document changed (the shell
    /// re-flushes the renderer on `true`).
    pub(crate) fn drain(&mut self, editor: &mut Editor) -> bool {
        let locals: Vec<_> = self.pending_local.borrow_mut().drain(..).collect();
        let mut changed = false;

        match &mut self.role {
            Role::Authority {
                authority,
                listener,
            } => {
                // The authority's own edits are canonical on apply;
                // assign order and broadcast.
                for (batch, _inverse) in locals {
                    match authority.order_local(&batch) {
                        Ok(msg) => listener.broadcast(&Envelope::new(Payload::Sync { msg })),
                        Err(e) => eprintln!("grida_editor: sync: {e}"),
                    }
                }
                for event in listener.poll() {
                    match event {
                        PeerEvent::Connected(peer) => {
                            // Join = fetch canonical state (sync.md).
                            // Guides ride the message explicitly —
                            // the `.grida` bytes cannot carry them
                            // (ruler.md's persistence gap).
                            let msg = Msg::Welcome {
                                doc: io::encode_document(editor.document()),
                                global: authority.global(),
                                guides: editor.guides().iter().map(|g| (*g).into()).collect(),
                            };
                            listener.send_to(peer, &Envelope::new(Payload::Sync { msg }));
                        }
                        PeerEvent::Msg(_, envelope) => {
                            if let Payload::Sync {
                                msg: Msg::Submit { sender, seq, batch },
                            } = envelope.payload
                            {
                                for msg in authority.ingest(editor, sender, seq, batch) {
                                    changed = true;
                                    listener.broadcast(&Envelope::new(Payload::Sync { msg }));
                                }
                            }
                        }
                        PeerEvent::Disconnected(_) => {}
                    }
                }
            }
            Role::Client { client, transport } => {
                for (batch, inverse) in locals {
                    client.queue_local(batch, inverse);
                }
                loop {
                    match transport.try_recv() {
                        Ok(Some(envelope)) => {
                            let Payload::Sync { msg } = envelope.payload else {
                                continue;
                            };
                            match msg {
                                Msg::Welcome {
                                    doc,
                                    global,
                                    guides,
                                } => match client.on_welcome(editor, &doc, global, &guides) {
                                    Ok(()) => changed = true,
                                    Err(e) => eprintln!("grida_editor: sync: {e}"),
                                },
                                Msg::Commit {
                                    global,
                                    sender,
                                    seq,
                                    batch,
                                } => match client.on_commit(editor, global, sender, seq, batch) {
                                    Ok(c) => changed |= c,
                                    Err(e) => eprintln!("grida_editor: sync: {e}"),
                                },
                                Msg::Submit { .. } => {}
                            }
                        }
                        Ok(None) => break,
                        Err(_) => {
                            eprintln!("grida_editor: sync: connection lost");
                            break;
                        }
                    }
                }
                match client.take_outgoing() {
                    Ok(msgs) => {
                        for msg in msgs {
                            let _ = transport.send(&Envelope::new(Payload::Sync { msg }));
                        }
                    }
                    Err(e) => eprintln!("grida_editor: sync: {e}"),
                }
            }
        }
        changed
    }
}
