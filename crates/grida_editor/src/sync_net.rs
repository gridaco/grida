//! Sync transports — how [`crate::wire::Envelope`]s move between
//! instances. Transport is a host concern (`docs/wg/feat-crdt/sync.md`);
//! the replication logic in [`crate::sync`] never touches a socket.
//!
//! Two implementations of the same [`Transport`] shape:
//!
//! - [`ChannelTransport`] — in-process loopback over `std::sync::mpsc`
//!   pairs. The full `SYNC-*` contract suite runs over this with no
//!   network (SYNC-8).
//! - [`TcpTransport`] / [`Listener`] — `std::net` TCP loopback for the
//!   shell: newline-delimited JSON envelopes, one blocking reader
//!   thread per connection feeding an mpsc channel the shell's event
//!   loop drains. No async runtime.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::mpsc::{Receiver, Sender, TryRecvError, channel};

use crate::wire::Envelope;

/// Transport failure: the other side is gone.
#[derive(Debug, PartialEq, Eq)]
pub struct Disconnected;

impl std::fmt::Display for Disconnected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sync transport disconnected")
    }
}

impl std::error::Error for Disconnected {}

/// A bidirectional, ordered envelope pipe (one peer's view).
pub trait Transport {
    /// Send an envelope to the peer.
    fn send(&mut self, envelope: &Envelope) -> Result<(), Disconnected>;
    /// Receive the next pending envelope, if any (non-blocking).
    fn try_recv(&mut self) -> Result<Option<Envelope>, Disconnected>;
}

// ---------------------------------------------------------------------------
// In-process loopback (SYNC-8)
// ---------------------------------------------------------------------------

/// In-process loopback transport: one end of a cross-wired mpsc pair.
pub struct ChannelTransport {
    tx: Sender<Envelope>,
    rx: Receiver<Envelope>,
}

impl ChannelTransport {
    /// A connected pair of loopback ends.
    pub fn pair() -> (ChannelTransport, ChannelTransport) {
        let (a_tx, b_rx) = channel();
        let (b_tx, a_rx) = channel();
        (
            ChannelTransport { tx: a_tx, rx: a_rx },
            ChannelTransport { tx: b_tx, rx: b_rx },
        )
    }
}

impl Transport for ChannelTransport {
    fn send(&mut self, envelope: &Envelope) -> Result<(), Disconnected> {
        self.tx.send(envelope.clone()).map_err(|_| Disconnected)
    }

    fn try_recv(&mut self) -> Result<Option<Envelope>, Disconnected> {
        match self.rx.try_recv() {
            Ok(envelope) => Ok(Some(envelope)),
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => Err(Disconnected),
        }
    }
}

// ---------------------------------------------------------------------------
// TCP loopback (shell)
// ---------------------------------------------------------------------------

/// Spawn a blocking reader thread over a stream, feeding parsed
/// envelopes (newline-delimited JSON) into a channel. Unparseable
/// lines are skipped; EOF/IO errors end the thread (channel closes).
fn spawn_reader(stream: TcpStream, tx: Sender<Envelope>) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            if let Ok(envelope) = Envelope::from_json(&line)
                && tx.send(envelope).is_err()
            {
                break;
            }
        }
    });
}

fn write_line(stream: &mut TcpStream, envelope: &Envelope) -> Result<(), Disconnected> {
    let mut line = envelope.to_json();
    line.push('\n');
    stream
        .write_all(line.as_bytes())
        .and_then(|_| stream.flush())
        .map_err(|_| Disconnected)
}

/// One TCP connection (the joining instance's side of a session).
pub struct TcpTransport {
    stream: TcpStream,
    rx: Receiver<Envelope>,
}

impl TcpTransport {
    /// Wrap an established stream (spawns the reader thread).
    pub fn new(stream: TcpStream) -> std::io::Result<TcpTransport> {
        let (tx, rx) = channel();
        spawn_reader(stream.try_clone()?, tx);
        Ok(TcpTransport { stream, rx })
    }

    /// Connect to a listening authority (`--join <addr>`).
    pub fn connect(addr: impl ToSocketAddrs) -> std::io::Result<TcpTransport> {
        Self::new(TcpStream::connect(addr)?)
    }
}

impl Transport for TcpTransport {
    fn send(&mut self, envelope: &Envelope) -> Result<(), Disconnected> {
        write_line(&mut self.stream, envelope)
    }

    fn try_recv(&mut self) -> Result<Option<Envelope>, Disconnected> {
        match self.rx.try_recv() {
            Ok(envelope) => Ok(Some(envelope)),
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => Err(Disconnected),
        }
    }
}

/// A network event drained from a [`Listener`].
pub enum PeerEvent {
    /// A new peer connected (the authority sends its Welcome now).
    Connected(u64),
    /// A peer sent an envelope.
    Msg(u64, Envelope),
    /// A peer disconnected (already removed from the peer set).
    Disconnected(u64),
}

enum ListenerInbox {
    Connected(u64, TcpStream),
    Msg(u64, Envelope),
    Disconnected(u64),
}

/// The authority's listening end (`--listen <port>`): accepts peers,
/// reads each on its own thread, writes from the caller's thread.
pub struct Listener {
    rx: Receiver<ListenerInbox>,
    peers: HashMap<u64, TcpStream>,
}

impl Listener {
    /// Bind the loopback listener and start the accept thread.
    pub fn bind(port: u16) -> std::io::Result<Listener> {
        let listener = TcpListener::bind(("127.0.0.1", port))?;
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let mut next_id: u64 = 0;
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                next_id += 1;
                let id = next_id;
                let Ok(writer) = stream.try_clone() else {
                    continue;
                };
                if tx.send(ListenerInbox::Connected(id, writer)).is_err() {
                    return;
                }
                let tx = tx.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stream);
                    for line in reader.lines() {
                        let Ok(line) = line else { break };
                        if let Ok(envelope) = Envelope::from_json(&line)
                            && tx.send(ListenerInbox::Msg(id, envelope)).is_err()
                        {
                            return;
                        }
                    }
                    let _ = tx.send(ListenerInbox::Disconnected(id));
                });
            }
        });
        Ok(Listener {
            rx,
            peers: HashMap::new(),
        })
    }

    /// Drain pending network events (non-blocking). Maintains the peer
    /// set; `Connected`/`Disconnected` are surfaced so the authority
    /// can welcome and forget peers.
    pub fn poll(&mut self) -> Vec<PeerEvent> {
        let mut events = Vec::new();
        while let Ok(inbox) = self.rx.try_recv() {
            match inbox {
                ListenerInbox::Connected(id, writer) => {
                    self.peers.insert(id, writer);
                    events.push(PeerEvent::Connected(id));
                }
                ListenerInbox::Msg(id, envelope) => events.push(PeerEvent::Msg(id, envelope)),
                ListenerInbox::Disconnected(id) => {
                    self.peers.remove(&id);
                    events.push(PeerEvent::Disconnected(id));
                }
            }
        }
        events
    }

    /// Send to one peer (dead peers are dropped silently; the
    /// disconnect surfaces on the next [`Listener::poll`]).
    pub fn send_to(&mut self, peer: u64, envelope: &Envelope) {
        if let Some(stream) = self.peers.get_mut(&peer)
            && write_line(stream, envelope).is_err()
        {
            self.peers.remove(&peer);
        }
    }

    /// Broadcast to every connected peer.
    pub fn broadcast(&mut self, envelope: &Envelope) {
        let ids: Vec<u64> = self.peers.keys().copied().collect();
        for id in ids {
            self.send_to(id, envelope);
        }
    }

    /// Number of connected peers.
    pub fn peer_count(&self) -> usize {
        self.peers.len()
    }
}
