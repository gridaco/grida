//! Organize attached conversations independently of their execution.

use super::*;
use crate::acp::observation::Observation;
use crate::host::is_archived;
use agent_client_protocol::v1::schema::ListSessionsResponse;
use agent_kit_store_sqlite::catalog::CatalogRecord;
use std::path::PathBuf;

pub(super) const ORGANIZE: &str = "co.grida/session/organize";
pub(super) const ARCHIVE_CATALOG: &str = "co.grida/settings/archive-catalog";

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
    RequestRoutes::default()
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
                    get_host
                        .catalog_entry(request.session_id)
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
                        .map(super::super::catalog_anchor)
                        .transpose()?;
                    let catalog = host
                        .list_sessions(request.cwd, true, after)
                        .await
                        .map_err(host_error)?;
                    super::super::catalog_response(catalog)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
