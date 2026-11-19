//! GRIDA-SEC-004 — negotiated metadata operations admit read positions by
//! workspace membership and organizer edits by the attached session and revision.

use super::*;
use crate::acp::observation::Observation;
use crate::host::is_archived;
use agent_client_protocol::v1::schema::ListSessionsResponse;
use agent_kit_store_sqlite::catalog::{CatalogRecord, ConversationReadState, ReadStateUpdate};
use std::path::PathBuf;

pub(super) const ORGANIZE: &str = "co.grida/session/organize";
pub(super) const ARCHIVE_CATALOG: &str = "co.grida/settings/archive-catalog";
pub(in crate::acp) const READ_STATE: &str = "co.grida/session/read-state";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/read-state", response = Value)]
#[serde(rename_all = "camelCase")]
pub(in crate::acp) struct SetReadState {
    pub(in crate::acp) cwd: PathBuf,
    pub(in crate::acp) session_id: SessionId,
    #[serde(flatten)]
    pub(in crate::acp) update: ReadStateUpdate,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/settings/archive-catalog", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArchiveCatalog {
    cwd: PathBuf,
    cursor: Option<SessionId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/settings/unarchive", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Unarchive {
    cwd: PathBuf,
    session_id: SessionId,
    revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/catalog-entry", response = Entry)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Get {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/organize", response = Entry)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Organize {
    session_id: SessionId,
    revision: u64,
    #[serde(deserialize_with = "Deserialize::deserialize")]
    title: Option<String>,
    archived: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Entry {
    session_id: SessionId,
    revision: u64,
    title: Option<String>,
    archived: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_activity_at_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    title_generation_pending: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    read_state: Option<ConversationReadState>,
}

impl From<CatalogRecord> for Entry {
    fn from(record: CatalogRecord) -> Self {
        let entry = record.entry;
        let archived = is_archived(&entry);
        Self {
            session_id: entry.session,
            revision: entry.revision,
            title: entry.label,
            archived,
            last_activity_at_ms: record.latest_turn_activity_ms,
            title_generation_pending: false,
            read_state: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/list-archived", response = ListSessionsResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListArchived {
    cwd: PathBuf,
    cursor: Option<String>,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let archive_host = host.clone();
    let archive_sessions = sessions.clone();
    let restore_host = host.clone();
    let restore_sessions = sessions.clone();
    let get_host = host.clone();
    let get_sessions = sessions.clone();
    let update_host = host.clone();
    let update_sessions = sessions.clone();
    let read_host = host.clone();
    let read_sessions = sessions.clone();
    RequestRoutes::default()
        .on_receive_request(
            async move |request: SetReadState, responder, _| {
                let result = async {
                    require(&read_sessions, READ_STATE, None)?;
                    let _observation = Observation::begin(&read_sessions, None)?;
                    let state = read_host
                        .update_conversation_read(request.cwd, request.session_id, request.update)
                        .await
                        .map_err(host_error)?;
                    serde_json::to_value(state).map_err(|_| Error::internal_error())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ArchiveCatalog, responder, _| {
                let result = async {
                    require(&archive_sessions, ARCHIVE_CATALOG, None)?;
                    let page = archive_host
                        .archive_catalog(request.cwd, request.cursor)
                        .await
                        .map_err(host_error)?;
                    serde_json::to_value(page).map_err(|_| Error::internal_error())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Unarchive, responder, _| {
                let result = async {
                    require(&restore_sessions, ARCHIVE_CATALOG, None)?;
                    restore_host
                        .unarchive_catalog(request.cwd, request.session_id, request.revision)
                        .await
                        .map_err(host_error)?;
                    Ok(Value::Null)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Get, responder, _| {
                let _observation =
                    match Observation::begin(&get_sessions, Some(&request.session_id)) {
                        Ok(guard) => guard,
                        Err(error) => return responder.respond_with_error(error),
                    };
                let result = async {
                    require(&get_sessions, ORGANIZE, Some(&request.session_id))?;
                    let (record, title_generation_pending) = get_host
                        .catalog_entry(request.session_id)
                        .await
                        .map_err(host_error)?;
                    Ok(Entry {
                        title_generation_pending,
                        read_state: Some(record.read_state.clone()),
                        ..record.into()
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Organize, responder, _| {
                let _observation =
                    match Observation::begin(&update_sessions, Some(&request.session_id)) {
                        Ok(guard) => guard,
                        Err(error) => return responder.respond_with_error(error),
                    };
                let result = async {
                    require(&update_sessions, ORGANIZE, Some(&request.session_id))?;
                    update_host
                        .organize_session(
                            request.session_id,
                            request.revision,
                            request.title,
                            request.archived,
                        )
                        .await
                        .map(Entry::from)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ListArchived, responder, _| {
                let _observation = match Observation::begin(&sessions, None) {
                    Ok(guard) => guard,
                    Err(error) => return responder.respond_with_error(error),
                };
                let result = async {
                    require(&sessions, ORGANIZE, None)?;
                    let after = request
                        .cursor
                        .as_deref()
                        .map(crate::host::SessionCatalog::anchor)
                        .transpose()
                        .map_err(host_error)?;
                    let catalog = host
                        .list_sessions(request.cwd, true, after)
                        .await
                        .map_err(host_error)?;
                    super::super::catalog_response(catalog.into(), false).map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
