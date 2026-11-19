//! GRIDA-SEC-004 — catalog authority comes from a trusted launcher’s registry.
//! Membership is reread on every operation. Clients may narrow it by cwd.

mod observation;

use super::*;
use agent_kit_core::{Error as HostError, Fingerprint, Result as HostResult};
use agent_kit_store_sqlite::catalog::{
    ConversationAnchor, ConversationOrder, ConversationReadState, ReadStateUpdate,
};
use agent_kit_store_sqlite::catalog_reader::CatalogReader;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::Read;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_WORKSPACES: usize = 256;
const MAX_CURSORS: usize = 256;
const REGISTRY_BYTES: u64 = 1 << 20;

#[derive(Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Workspace {
    cwd: PathBuf,
    state_dir: PathBuf,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    workspaces: Vec<Workspace>,
}

#[derive(Clone)]
pub struct Catalog {
    registry: Arc<Path>,
    cursors: Arc<Mutex<VecDeque<(String, Cursor)>>>,
}

#[derive(Clone)]
struct Cursor {
    query: Fingerprint,
    anchor: ConversationAnchor,
    cwd: PathBuf,
}

fn problem(code: &'static str) -> HostError {
    HostError::new(ErrorKind::Unavailable, code)
}

impl Catalog {
    pub fn open(registry: PathBuf) -> HostResult<Self> {
        if !registry.is_absolute() || registry.file_name().is_none() {
            return Err(problem("catalog_registry_invalid"));
        }
        let registry = registry
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .ok_or_else(|| problem("catalog_registry_unavailable"))?
            .join(registry.file_name().unwrap());
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let metadata = std::fs::metadata(registry.parent().unwrap())
                .map_err(|_| problem("catalog_registry_unavailable"))?;
            if metadata.mode() & 0o077 != 0 || metadata.uid() != rustix::process::geteuid().as_raw()
            {
                return Err(problem("catalog_registry_not_private"));
            }
        }
        let catalog = Self {
            registry: registry.into(),
            cursors: Default::default(),
        };
        catalog.workspaces()?;
        Ok(catalog)
    }

    fn workspaces(&self) -> HostResult<Vec<Workspace>> {
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let file = options
            .open(&self.registry)
            .map_err(|_| problem("catalog_registry_unavailable"))?;
        let metadata = file
            .metadata()
            .map_err(|_| problem("catalog_registry_unavailable"))?;
        if !metadata.is_file() || metadata.len() > REGISTRY_BYTES {
            return Err(problem("catalog_registry_invalid"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.mode() & 0o077 != 0
                || metadata.uid() != rustix::process::geteuid().as_raw()
                || metadata.nlink() != 1
            {
                return Err(problem("catalog_registry_not_private"));
            }
        }
        let mut bytes = Vec::new();
        file.take(REGISTRY_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| problem("catalog_registry_unavailable"))?;
        let Manifest { mut workspaces } =
            serde_json::from_slice(&bytes).map_err(|_| problem("catalog_registry_invalid"))?;
        if bytes.len() as u64 > REGISTRY_BYTES || workspaces.len() > MAX_WORKSPACES {
            return Err(problem("catalog_registry_invalid"));
        }
        workspaces.sort_unstable_by(|a, b| a.cwd.cmp(&b.cwd));
        let mut stores = BTreeSet::new();
        for (n, w) in workspaces.iter().enumerate() {
            if !normal_absolute(&w.cwd)
                || !normal_absolute(&w.state_dir)
                || !stores.insert(&w.state_dir)
                || n > 0 && w.cwd == workspaces[n - 1].cwd
            {
                return Err(problem("catalog_registry_invalid"));
            }
        }
        Ok(workspaces)
    }

    fn visible(&self, cwd: Option<&Path>) -> HostResult<Vec<Workspace>> {
        let mut visible = self.workspaces()?;
        if let Some(cwd) = cwd {
            visible.retain(|w| w.cwd == cwd);
            if visible.is_empty() {
                return Err(problem("session_catalog_scope_mismatch"));
            }
        }
        Ok(visible)
    }

    /// Merge bounded index seeks. A continuation carries the last emitted key,
    /// so arrivals ahead of that key never cause a rescan.
    fn list(
        &self,
        cwd: Option<PathBuf>,
        order: CatalogOrder,
        token: Option<String>,
        limit: usize,
    ) -> HostResult<ListSessionsResponse> {
        if !(1..=32).contains(&limit) {
            return Err(problem("invalid_catalog_limit"));
        }
        let visible = self.visible(cwd.as_deref())?;
        let query = Fingerprint::of(&(&visible, &cwd, order, limit))?;
        let after = token
            .map(|token| {
                self.cursors
                    .lock()
                    .unwrap()
                    .iter()
                    .find(|(id, c)| *id == token && c.query == query)
                    .map(|(_, c)| c.clone())
                    .ok_or_else(|| problem("invalid_session_cursor"))
            })
            .transpose()?;
        let mut rows = Vec::new();
        let mut more = false;
        for workspace in &visible {
            let Some(mut reader) = workspace.reader(false)? else {
                continue;
            };
            let order = match order {
                CatalogOrder::MessageActivity => ConversationOrder::Recent,
                CatalogOrder::Created => ConversationOrder::Created,
            };
            let page = reader.list(
                workspace
                    .cwd
                    .to_str()
                    .ok_or_else(|| problem("invalid_workspace_path"))?,
                order,
                after.as_ref().map(|c| &c.anchor),
                after.as_ref().is_some_and(|c| workspace.cwd > c.cwd),
                limit,
            )?;
            more |= page.next_after.is_some();
            rows.extend(
                page.entries
                    .into_iter()
                    .map(|row| (row, workspace.cwd.clone())),
            );
            rows.sort_unstable_by(|(a, ac), (b, bc)| {
                b.anchor
                    .value
                    .cmp(&a.anchor.value)
                    .then(a.anchor.session.cmp(&b.anchor.session))
                    .then(ac.cmp(bc))
            });
            more |= rows.len() > limit;
            rows.truncate(limit);
        }
        if visible != self.visible(cwd.as_deref())? {
            return Err(problem("catalog_scope_changed"));
        }
        let mut positions = Vec::new();
        let entries = rows
            .into_iter()
            .map(|(row, cwd)| {
                positions.push(Cursor {
                    query,
                    anchor: row.anchor,
                    cwd: cwd.clone(),
                });
                crate::host::ListedSession {
                    cwd,
                    record: row.record,
                    cursor: (positions.len() - 1).to_string(),
                }
            })
            .collect();
        let mut result = super::catalog_response(
            CatalogListing {
                entries,
                has_more: more,
            },
            true,
        )?;
        if let Some(key) = result.next_cursor.take() {
            let cursor =
                positions.swap_remove(key.parse().map_err(|_| problem("invalid_session_cursor"))?);
            let id = Uuid::new_v4().to_string();
            let mut cursors = self.cursors.lock().unwrap();
            if cursors.len() == MAX_CURSORS {
                cursors.pop_front();
            }
            cursors.push_back((id.clone(), cursor));
            result.next_cursor = Some(id);
        }
        Ok(result)
    }

    fn update(
        &self,
        cwd: PathBuf,
        session: SessionId,
        update: ReadStateUpdate,
    ) -> HostResult<ConversationReadState> {
        let scope = self.visible(Some(&cwd))?.pop().unwrap();
        let mut reader = scope
            .reader(true)?
            .ok_or_else(|| problem("session_catalog_entry_missing"))?;
        let result = reader.update_read_state(
            cwd.to_str()
                .ok_or_else(|| problem("invalid_workspace_path"))?,
            &session,
            &update,
        )?;
        if self.visible(Some(&cwd))?.first() != Some(&scope) {
            return Err(problem("catalog_scope_changed"));
        }
        Ok(result)
    }
}

fn normal_absolute(path: &Path) -> bool {
    path.is_absolute()
        && path.to_str().is_some_and(|s| s.len() <= 4096)
        && !path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
}

impl Workspace {
    fn reader(&self, writable: bool) -> HostResult<Option<CatalogReader>> {
        let database = self.state_dir.join(crate::host::DATABASE_FILE);
        match CatalogReader::open(&database, writable) {
            Err(err) if err.code.as_str() == "catalog_migration_required" => {
                // A closed legacy store may upgrade only through its normal owner.
                drop(crate::host::open_store(&database)?);
                CatalogReader::open(&database, writable)
            }
            result => result,
        }
    }
}

use super::extensions::catalog::{READ_STATE, SetReadState};
use agent_client_protocol::{JsonRpcNotification, JsonRpcRequest};
use serde_json::Value;

const WATCH: &str = "co.grida/catalog/watch";
const QUERY: &str = "co.grida/session/catalog-query";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method="_co.grida/catalog/subscribe",response=Value)]
#[serde(deny_unknown_fields)]
struct Subscribe {
    cwd: Option<PathBuf>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method="_co.grida/catalog/unsubscribe",response=Value)]
#[serde(deny_unknown_fields)]
struct Unsubscribe {}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcNotification)]
#[notification(method = "_co.grida/catalog/changed")]
struct Changed {
    #[serde(skip_serializing_if = "Option::is_none")]
    cwds: Option<Vec<PathBuf>>,
}

pub async fn serve(catalog: Catalog, listener: Option<ListenOptions>) -> HostResult<()> {
    if let Some(options) = listener {
        return super::websocket::listen(super::websocket::Service::Catalog(catalog), options)
            .await;
    }
    let delivery = Arc::new(Delivery::new());
    let (sdk, wire) = Channel::duplex();
    let (incoming, outgoing) = wire.into_parts();
    tokio::try_join!(
        connect(catalog, sdk, delivery.clone()),
        transport::read(tokio::io::stdin(), outgoing, delivery.clone()),
        transport::write(tokio::io::stdout(), incoming, delivery.clone())
    )
    .map(|_| ())
    .map_err(|_| problem("catalog_connection_failed"))
}

pub(super) async fn connect(
    catalog: Catalog,
    channel: Channel,
    delivery: Arc<Delivery>,
) -> Result<()> {
    let session = Arc::new(Mutex::new(ConnectionSessions::default()));
    let init = session.clone();
    let list = session.clone();
    let watch = session.clone();
    let read = session.clone();
    let list_service = catalog.clone();
    let watch_service = catalog.clone();
    let cancel = Arc::new(Mutex::new(None::<tokio::sync::oneshot::Sender<()>>));
    let replace = cancel.clone();

    Agent
        .v1()
        .name("grida-catalog")
        .on_receive_request(
            async move |request: InitializeRequest, responder, _| {
                let caps = [WATCH, QUERY, READ_STATE];
                let mut state = init.lock().unwrap();
                if state.initialized {
                    return responder
                        .respond_with_error(Error::invalid_params().data("already_initialized"));
                }
                state.negotiated = caps
                    .into_iter()
                    .filter(|k| {
                        request
                            .client_capabilities
                            .meta
                            .as_ref()
                            .and_then(|m| m.get(*k))
                            .and_then(Value::as_u64)
                            == Some(1)
                    })
                    .collect();
                state.initialized = true;
                responder.respond(
                    InitializeResponse::new(ProtocolVersion::V1)
                        .agent_info(Implementation::new(
                            "grida-catalog",
                            env!("CARGO_PKG_VERSION"),
                        ))
                        .agent_capabilities(
                            AgentCapabilities::new()
                                .session_capabilities(
                                    SessionCapabilities::new().list(SessionListCapabilities::new()),
                                )
                                .meta(
                                    caps.into_iter()
                                        .map(|k| (k.to_owned(), Value::from(1)))
                                        .collect::<serde_json::Map<_, _>>(),
                                ),
                        ),
                )
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ListSessionsRequest, responder, _| {
                let result = async {
                    if !list.lock().unwrap().initialized {
                        return Err(unavailable("initialize_required"));
                    }
                    let order = if request
                        .meta
                        .as_ref()
                        .is_some_and(|m| m.contains_key("co.grida/catalogOrder"))
                    {
                        extensions::catalog_order(&list, &request)?
                    } else {
                        CatalogOrder::MessageActivity
                    };
                    if order == CatalogOrder::Created && request.cwd.is_none() {
                        return Err(
                            Error::invalid_params().data("created_order_requires_workspace")
                        );
                    }
                    let limit = match request
                        .meta
                        .as_ref()
                        .and_then(|m| m.get("co.grida/catalogLimit"))
                    {
                        Some(value) => {
                            require(&list, QUERY)?;
                            value
                                .as_u64()
                                .and_then(|n| usize::try_from(n).ok())
                                .filter(|n| (1..=32).contains(n))
                                .ok_or_else(|| {
                                    Error::invalid_params().data("invalid_catalog_limit")
                                })?
                        }
                        None => 32,
                    };
                    let host = list_service.clone();
                    tokio::task::spawn_blocking(move || {
                        host.list(request.cwd, order, request.cursor, limit)
                    })
                    .await
                    .map_err(|_| unavailable("catalog_worker_unavailable"))?
                    .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Subscribe, responder, connection| {
                let result = async {
                    require(&watch, WATCH)?;
                    let mut observer =
                        observation::Observer::new(watch_service.clone(), request.cwd)
                            .map_err(host_error)?;
                    let (stop, stopped) = tokio::sync::oneshot::channel();
                    let _ = replace.lock().unwrap().replace(stop);
                    let output = connection.clone();
                    let delivery = delivery.clone();
                    connection.spawn(async move {
                        let run = async {
                            loop {
                                let cwds = observer.next().await.unwrap_or(None);
                                delivery
                                    .send_if(|| {
                                        output.send_notification(Changed {
                                            cwds: observer.current_notification(cwds),
                                        })?;
                                        Ok(true)
                                    })
                                    .await?;
                            }
                        };
                        tokio::select! { result=run=>result,_=stopped=>Ok(())}
                    })?;
                    Ok(serde_json::json!({}))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |_: Unsubscribe, responder, _| {
                let result = require(&session, WATCH).map(|()| {
                    cancel.lock().unwrap().take();
                    serde_json::json!({})
                });
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: SetReadState, responder, _| {
                let result = async {
                    require(&read, READ_STATE)?;
                    let service = catalog.clone();
                    let state = tokio::task::spawn_blocking(move || {
                        service.update(request.cwd, request.session_id, request.update)
                    })
                    .await
                    .map_err(|_| unavailable("catalog_worker_unavailable"))?
                    .map_err(host_error)?;
                    serde_json::to_value(state).map_err(|_| Error::internal_error())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .connect_to(channel)
        .await
}

fn require(connection: &Mutex<ConnectionSessions>, capability: &str) -> Result<()> {
    let state = connection.lock().unwrap();
    if !state.initialized || !state.negotiated.contains(capability) {
        return Err(unavailable("catalog_capability_unavailable"));
    }
    Ok(())
}
