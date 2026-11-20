//! Stable ACP v1 over a supervised, bounded stdio connection.

pub mod catalog_service;
mod extensions;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub mod external;
mod live;
mod observation;
mod projection;
mod transport;
mod websocket;

pub use websocket::{ListenOptions, serve_websocket};

use crate::host::{
    AcceptedRun, CatalogListing, CatalogOrder, Host, PromptPart, PromptRequest, RunResult,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::v1::schema::{
    AgentCapabilities, CancelNotification, ContentBlock, EmbeddedResourceResource, Implementation,
    InitializeRequest, InitializeResponse, ListSessionsRequest, ListSessionsResponse,
    LoadSessionRequest, LoadSessionResponse, NewSessionRequest, NewSessionResponse,
    PromptCapabilities, PromptRequest as AcpPrompt, PromptResponse, SessionCapabilities,
    SessionInfo, SessionListCapabilities, StopReason,
};
use agent_client_protocol::{
    Agent, Channel, Error, Result, on_receive_notification, on_receive_request,
};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::{ChangeId, ErrorKind, SessionId, TurnId};
use observation::{Observation, SessionObservation};
use projection::Projection;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::broadcast::error::{RecvError, TryRecvError};
use transport::Delivery;

const MAX_ATTACHED_SESSIONS: usize = 128;

#[derive(Debug)]
pub enum ServeError {
    Protocol(Error),
    Shutdown(agent_kit_core::Error),
}

pub async fn serve_stdio(
    host: Arc<Host>,
    provider: Option<crate::SupervisedProvider>,
) -> std::result::Result<(), ServeError> {
    serve_stdio_with_side_chats(host, provider, Arc::default()).await
}

pub(crate) async fn serve_stdio_with_side_chats(
    host: Arc<Host>,
    provider: Option<crate::SupervisedProvider>,
    side_chats: Arc<crate::host::side_chats::SideChats>,
) -> std::result::Result<(), ServeError> {
    serve(
        host,
        tokio::io::stdin(),
        tokio::io::stdout(),
        provider,
        side_chats,
    )
    .await
}

async fn serve(
    host: Arc<Host>,
    input: impl AsyncRead + Unpin,
    output: impl AsyncWrite + Unpin,
    provider: Option<crate::SupervisedProvider>,
    side_chats: Arc<crate::host::side_chats::SideChats>,
) -> std::result::Result<(), ServeError> {
    // Side chats a previous process left behind are discarded before any
    // client can reach them.
    if host.sweep_side_chats().await.is_err() {
        eprintln!("grida-agent: side chat cleanup is pending");
    }
    let recovering = host.clone();
    let cleanup = tokio::spawn(async move { recovering.recover_retired_chat_data().await });
    let delivery = Arc::new(Delivery::new());
    let (sdk, wire) = Channel::duplex();
    let (incoming, outgoing) = wire.into_parts();
    let editor_surfaces = host.editor_surfaces.clone();
    let read = async {
        let result = transport::read(input, outgoing, delivery.clone()).await;
        editor_surfaces.detach();
        if let Some(generation) = host.image_connection() {
            generation.detach();
        }
        if let Some(provider) = &provider {
            provider.detach();
        }
        side_chats.close_scope().await;
        result
    };
    let result = tokio::try_join!(
        serve_connection(
            host.clone(),
            sdk,
            delivery.clone(),
            provider.clone(),
            Some(side_chats.clone())
        ),
        read,
        transport::write(output, incoming, delivery.clone()),
    );
    editor_surfaces.detach();
    if let Some(generation) = host.image_connection() {
        generation.detach();
    }
    if let Some(provider) = &provider {
        provider.detach();
    }
    side_chats.close_scope().await;
    host.shutdown_discarding_side_chats()
        .await
        .map_err(ServeError::Shutdown)?;
    let _ = cleanup.await;
    result.map(|_| ()).map_err(ServeError::Protocol)
}

#[derive(Default)]
struct ConnectionSessions {
    initialized: bool,
    attached: BTreeSet<SessionId>,
    active: BTreeMap<SessionId, TurnId>,
    observing: BTreeMap<SessionId, SessionObservation>,
    catalog_observers: usize,
    retiring: BTreeSet<SessionId>,
    negotiated: BTreeSet<&'static str>,
    live_started: bool,
}

impl ConnectionSessions {
    fn ensure_capacity(&self, known: Option<&SessionId>) -> Result<()> {
        if self.attached.len() >= MAX_ATTACHED_SESSIONS
            && !known.is_some_and(|id| self.attached.contains(id))
        {
            return Err(unavailable("attached_session_limit"));
        }
        Ok(())
    }

    fn ensure_attached(&self, id: &SessionId) -> Result<()> {
        self.ensure_observable(id)?;
        if !self.attached.contains(id) {
            return Err(unavailable("session_setup_required"));
        }
        Ok(())
    }

    fn ensure_observable(&self, id: &SessionId) -> Result<()> {
        if self.retiring.contains(id) {
            return Err(unavailable("session_deletion_in_progress"));
        }
        Ok(())
    }

    fn can_deliver(&self, id: &SessionId) -> bool {
        self.attached.contains(id) && !self.retiring.contains(id)
    }
}

async fn serve_connection(
    host: Arc<Host>,
    channel: Channel,
    delivery: Arc<Delivery>,
    provider: Option<crate::SupervisedProvider>,
    side_chats: Option<Arc<crate::host::side_chats::SideChats>>,
) -> Result<()> {
    let reviewer = side_chats.is_some();
    let sessions = Arc::new(Mutex::new(ConnectionSessions::default()));
    let initialized_sessions = sessions.clone();
    let initialized_host = host.clone();
    let initialized_delivery = delivery.clone();
    let new_host = host.clone();
    let new_sessions = sessions.clone();
    let new_delivery = delivery.clone();
    let load_host = host.clone();
    let load_sessions = sessions.clone();
    let load_delivery = delivery.clone();
    let list_host = host.clone();
    let list_sessions = sessions.clone();
    let prompt_host = host.clone();
    let prompt_sessions = sessions.clone();
    let image_intake = reviewer && host.accepts_images();
    let files = host.accepts_files();
    let embedded_context = reviewer && files;

    Agent
        .v1()
        .name("grida-agent")
        .with_handler(extensions::handlers(
            host.clone(),
            sessions.clone(),
            reviewer,
            side_chats,
        ))
        .on_receive_request(
            async move |request: InitializeRequest, responder, connection| {
                // Whether the client offered an extension at version 1.
                let offered = |key: &str| {
                    request
                        .client_capabilities
                        .meta
                        .as_ref()
                        .and_then(|meta| meta.get(key))
                        .and_then(serde_json::Value::as_u64)
                        == Some(1)
                };
                let subagents = initialized_host.subagents_available();
                let deletion = reviewer && initialized_host.deletion_available();
                let effort = initialized_host.sponsorship_available();
                let goal_effort = initialized_host.goal_sponsorship_available();
                let mut advertised =
                    extensions::advertised(reviewer, subagents, deletion, effort, goal_effort, files);
                let routed = reviewer && provider.is_some() && offered(crate::supervised_provider::ROUTES);
                let library_selection = reviewer && (routed || initialized_host.accepts_library_selection());
                let spending = reviewer && (routed || initialized_host.supports_goal_spending());
                let spending_negotiated = spending && offered(extensions::GOAL_SPENDING);
                if spending {
                    advertised.insert(extensions::GOAL_SPENDING.into(), 1.into());
                }
                let library_negotiated = library_selection
                    && extensions::library::CAPABILITIES.iter().all(|key| offered(key));
                if library_selection {
                    advertised.extend(extensions::library::CAPABILITIES.map(|key| (key.into(), 1.into())));
                }
                if reviewer {
                    advertised.insert(live::CAPABILITY.into(), 1.into());
                    advertised.insert(live::LIFECYCLE.into(), 1.into());
                }
                if let Some(provider) = &provider {
                    let capability = crate::supervised_provider::CAPABILITY;
                    if !offered(capability) {
                        return responder
                            .respond_with_error(unavailable("provider_supervisor_required"));
                    }
                    if let Err(error) = provider.attach(connection.clone()) {
                        return responder.respond_with_error(host_error(error));
                    }
                    advertised.insert(capability.into(), 1.into());
                    let routes = crate::supervised_provider::ROUTES;
                    if routed {
                        if let Err(error) = initialized_host.attach_routes(provider.clone()) {
                            return responder.respond_with_error(host_error(error));
                        }
                        advertised.insert(routes.into(), 1.into());
                    }
                    let billing = extensions::gateway_billing::CAPABILITY;
                    if reviewer
                        && (routed || initialized_host.supports_gateway_billing_status())
                        && offered(billing)
                    {
                        advertised.insert(billing.into(), 1.into());
                        let children = extensions::gateway_billing::CHILD_CAPABILITY;
                        if offered(children) {
                            advertised.insert(children.into(), 1.into());
                        }
                    }
                    let capability = crate::host::image_generation::CAPABILITY;
                    if reviewer
                        && let Some(generation) = initialized_host.image_connection()
                        && offered(capability)
                    {
                        let reference = crate::host::image_generation::REFERENCE_CAPABILITY;
                        let references = library_negotiated && offered(reference);
                        let placement = crate::host::image_generation::PLACE_CAPABILITY;
                        let place = offered(placement);
                        let attachment = crate::host::image_generation::ATTACHMENT_CAPABILITY;
                        let attachments = (routed || initialized_host.supports_attachment_reference())
                            && offered(attachment);
                        let workspace_reference = crate::host::image_generation::WORKSPACE_CAPABILITY;
                        let workspace_references = (routed || initialized_host.supports_workspace_image_reference())
                            && offered(workspace_reference);
                        generation.attach(connection.clone(), references, place, attachments, workspace_references);
                        advertised.insert(capability.into(), 1.into());
                        if references {
                            advertised.insert(reference.into(), 1.into());
                        }
                        if place {
                            advertised.insert(placement.into(), 1.into());
                        }
                        if attachments {
                            advertised.insert(attachment.into(), 1.into());
                        }
                        if workspace_references {
                            advertised.insert(workspace_reference.into(), 1.into());
                        }
                    }
                    let capability = crate::editor_surfaces::CAPABILITY;
                    if reviewer
                        && initialized_host.supports_editor_tools()
                        && offered(capability)
                    {
                        let open = crate::editor_surfaces::OPEN_CAPABILITY;
                        let svg_text = crate::editor_surfaces::SVG_TEXT_CAPABILITY;
                        let presentation = offered(open);
                        let svg = offered(svg_text);
                        let browser = crate::browser_tools::CAPABILITY;
                        let browser_offered = offered(browser);
                        let desktop_tools = crate::editor_surfaces::DESKTOP_TOOLS_CAPABILITY;
                        let desktop_tools_offered = offered(desktop_tools);
                        let browser_mcp = crate::editor_surfaces::mcp::BROWSER_CAPABILITY;
                        let browser_mcp_offered = desktop_tools_offered && browser_offered && offered(browser_mcp);
                        let tool_sources = crate::editor_surfaces::mcp::TOOL_SOURCES_CAPABILITY;
                        let tool_sources_offered = desktop_tools_offered && offered(tool_sources);
                        if let Err(error) = initialized_host.editor_surfaces.attach(
                            connection.clone(),
                            crate::editor_surfaces::DesktopCapabilities {
                                presentation,
                                svg_text: svg,
                                browser: browser_offered,
                                tools: desktop_tools_offered,
                                browser_mcp: browser_mcp_offered,
                                tool_sources: tool_sources_offered,
                            },
                        ) {
                            return responder.respond_with_error(host_error(error));
                        }
                        if desktop_tools_offered {
                            advertised.insert(desktop_tools.into(), 1.into());
                            let context = crate::editor_surfaces::mcp::TOOL_CONTEXT_CAPABILITY;
                            if offered(context) {
                                advertised.insert(context.into(), 1.into());
                            }
                        }
                        if browser_offered {
                            advertised.insert(browser.into(), 1.into());
                        }
                        if browser_mcp_offered {
                            advertised.insert(browser_mcp.into(), 1.into());
                        }
                        if tool_sources_offered {
                            advertised.insert(tool_sources.into(), 1.into());
                        }
                        advertised.insert(capability.into(), 1.into());
                        if presentation {
                            advertised.insert(open.into(), 1.into());
                        }
                        if svg {
                            advertised.insert(svg_text.into(), 1.into());
                        }
                    }
                }
                let updates = {
                    let mut sessions = initialized_sessions.lock().unwrap();
                    sessions.initialized = true;
                    let meta = request.client_capabilities.meta.as_ref();
                    sessions.negotiated =
                        extensions::negotiated(meta, reviewer, subagents, deletion, effort, goal_effort, files);
                    if spending_negotiated {
                        sessions.negotiated.insert(extensions::GOAL_SPENDING);
                    }
                    if library_negotiated {
                        sessions.negotiated.extend(extensions::library::CAPABILITIES);
                    }
                    sessions.negotiated.extend(
                        [
                            crate::editor_surfaces::CAPABILITY,
                            crate::editor_surfaces::OPEN_CAPABILITY,
                            crate::editor_surfaces::SVG_TEXT_CAPABILITY,
                            crate::editor_surfaces::DESKTOP_TOOLS_CAPABILITY,
                            crate::editor_surfaces::mcp::TOOL_CONTEXT_CAPABILITY,
                            crate::editor_surfaces::mcp::BROWSER_CAPABILITY,
                            crate::editor_surfaces::mcp::TOOL_SOURCES_CAPABILITY,
                            crate::browser_tools::CAPABILITY,
                            extensions::gateway_billing::CAPABILITY,
                            extensions::gateway_billing::CHILD_CAPABILITY,
                        ]
                        .into_iter()
                        .filter(|key| advertised.contains_key(*key)),
                    );
                    let text = reviewer && offered(live::CAPABILITY);
                    let lifecycle = reviewer && offered(live::LIFECYCLE);
                    let processes = sessions
                        .negotiated
                        .contains(extensions::PROCESSES)
                        .then(|| initialized_host.process_sessions());
                    if !sessions.live_started && (text || lifecycle || processes.is_some()) {
                        sessions.live_started = true;
                        Some((initialized_host.observe_live(), text, lifecycle, processes))
                    } else {
                        None
                    }
                };
                responder.respond(
                    InitializeResponse::new(ProtocolVersion::V1)
                        .agent_capabilities(
                            AgentCapabilities::new()
                                .load_session(true)
                                .session_capabilities(
                                    SessionCapabilities::new().list(SessionListCapabilities::new()),
                                )
                                .prompt_capabilities(
                                    PromptCapabilities::new()
                                        .image(image_intake)
                                        .embedded_context(embedded_context),
                                )
                                .meta(advertised),
                        )
                        .agent_info(Implementation::new(
                            "grida-agent",
                            env!("CARGO_PKG_VERSION"),
                        )),
                )?;
                if let Some((updates, text, lifecycle, processes)) = updates {
                    connection.spawn(live::forward(
                        connection.clone(),
                        initialized_delivery.clone(),
                        initialized_sessions.clone(),
                        updates,
                        text,
                        lifecycle,
                        processes,
                        initialized_host.activity_order.clone(),
                    ))?;
                }
                Ok(())
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ListSessionsRequest, responder, _| {
                let _observation = match Observation::begin(&list_sessions, None) {
                    Ok(guard) => guard,
                    Err(error) => return responder.respond_with_error(error),
                };
                let result = async {
                    if !list_sessions.lock().unwrap().initialized {
                        return Err(unavailable("initialize_required"));
                    }
                    let order = extensions::catalog_order(&list_sessions, &request)?;
                    list_chats(&list_host, request.cwd, order, request.cursor.as_deref())
                        .await.map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: NewSessionRequest, responder, connection| {
                let result = async {
                    validate_session_setup(&request.mcp_servers, &request.additional_directories)?;
                    new_sessions.lock().unwrap().ensure_capacity(None)?;
                    let id = new_host
                        .new_session(request.cwd)
                        .await
                        .map_err(host_error)?;
                    let response = NewSessionResponse::new(id.as_str().to_owned());
                    extensions::compaction::announce(
                        &new_sessions,
                        &id,
                        &connection,
                        &new_delivery,
                    )
                    .await?;
                    new_sessions.lock().unwrap().attached.insert(id);
                    Ok(response)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: LoadSessionRequest, responder, connection| {
                let id = match session_id(&request.session_id) {
                    Ok(id) => id,
                    Err(error) => return responder.respond_with_error(error),
                };
                let _observation = match Observation::begin_replay(&load_sessions, &id) {
                    Ok(guard) => guard,
                    Err(error) => return responder.respond_with_error(error),
                };
                let result = async {
                    validate_session_setup(&request.mcp_servers, &request.additional_directories)?;
                    let mode = request.meta.as_ref()
                        .and_then(|meta| meta.get(projection::TRANSCRIPT_WINDOW))
                        .cloned()
                        .map(serde_json::from_value::<projection::ReplayRequest>)
                        .transpose()
                        .map_err(|_| Error::invalid_params().data("invalid_transcript_window"))?;
                    // A side chat is reachable only on the connection that opened it.
                    if !load_sessions.lock().unwrap().attached.contains(&id)
                        && load_host.side_parent(&id).await.map_err(host_error)?.is_some()
                    {
                        return Err(unavailable("side_chat_unavailable"));
                    }
                    if mode.is_some() {
                        if !load_sessions.lock().unwrap().negotiated.contains(projection::TRANSCRIPT_WINDOW) {
                            return Err(unavailable("transcript_window_capability_required"));
                        }
                        load_host.validate_session_workspace(id.clone(), request.cwd).await.map_err(host_error)?;
                        if let Some(projection::ReplayRequest::Read { request_id, before }) = mode {
                            load_sessions.lock().unwrap().ensure_attached(&id)?;
                            let window = load_host.transcript_window(id.clone(), before, projection::visible_record_bytes).await.map_err(host_error)?;
                            let turn_ids = window.turns.iter().map(|turn| turn.id.clone()).collect::<Vec<_>>();
                            let mut input_facts = load_host
                                .transcript_input_facts(id, &turn_ids)
                                .await
                                .map_err(host_error)?;
                            if !load_sessions.lock().unwrap().negotiated.contains(crate::editor_surfaces::mcp::TOOL_CONTEXT_CAPABILITY) {
                                input_facts.editor_tool_contexts.clear();
                            }
                            let mut projection = Projection::new(request.session_id).with_tool_images(
                                { let state = load_sessions.lock().unwrap(); state.negotiated.contains(extensions::tool_images::CAPABILITY) }
                            ).with_activity_order(
                                load_sessions.lock().unwrap().negotiated.contains(projection::ACTIVITY_ORDER)
                                    .then(|| load_host.activity_order.clone()));
                            projection.correlate_replay(request_id.clone());
                            let message_context = load_sessions.lock().unwrap().negotiated.contains(extensions::MESSAGE_CONTEXT);
                            projection.replay_window(&connection, &load_delivery, window.records, &window.turns, &input_facts, message_context).await?;
                            let turns: Vec<_> = window
                                .turns
                                .iter()
                                .map(|turn| projection::turn_facts(turn, input_facts.goal_starts.contains(&turn.id)))
                                .collect();
                            return Ok(LoadSessionResponse::new().meta(serde_json::Map::from_iter([(
                                projection::TRANSCRIPT_WINDOW.into(),
                                serde_json::json!({"requestId": request_id, "view": window.view, "older": window.older, "turns": turns}),
                            )])));
                        }
                    } else {
                        let mut replay = load_host
                            .open_history_replay(id.clone(), request.cwd)
                            .await
                            .map_err(host_error)?;
                        let mut projection = Projection::new(request.session_id).with_tool_images(
                                { let state = load_sessions.lock().unwrap(); state.negotiated.contains(extensions::tool_images::CAPABILITY) }
                            ).with_activity_order(
                                load_sessions.lock().unwrap().negotiated.contains(projection::ACTIVITY_ORDER)
                                    .then(|| load_host.activity_order.clone()));
                        while let Some(records) = replay.next().await.map_err(host_error)? {
                            let messages = records
                                .into_iter()
                                .map(|HistoryRecord::Message(message)| message);
                            projection
                                .replay(&connection, &load_delivery, messages)
                                .await?;
                        }
                    }
                    extensions::compaction::announce(
                        &load_sessions,
                        &id,
                        &connection,
                        &load_delivery,
                    )
                    .await?;
                    load_sessions.lock().unwrap().attached.insert(id);
                    Ok(LoadSessionResponse::new())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: AcpPrompt, responder, connection| {
                let session = match session_id(&request.session_id) {
                    Ok(session) => session,
                    Err(error) => return responder.respond_with_error(error),
                };
                let observation = match Observation::begin(&prompt_sessions, Some(&session)) {
                    Ok(guard) => guard,
                    Err(error) => return responder.respond_with_error(error),
                };
                let attached = {
                    let sessions = prompt_sessions.lock().unwrap();
                    sessions.ensure_attached(&session).and_then(|()| {
                        if sessions.active.contains_key(&session) {
                            return Err(unavailable("session_prompt_in_progress"));
                        }
                        Ok(())
                    })
                };
                if let Err(error) = attached {
                    return responder.respond_with_error(error);
                }
                if let Some(command) =
                    extensions::compaction::command(&prompt_sessions, &request.prompt)
                {
                    let host = prompt_host.clone();
                    let sessions = prompt_sessions.clone();
                    return connection.spawn(async move {
                        let _observation = observation;
                        let result = extensions::compaction::invoke(
                            &host,
                            &sessions,
                            session,
                            command,
                            responder.cancellation(),
                        )
                        .await;
                        responder.respond_with_result(result)
                    });
                }
                let start = async {
                    let parts = prompt_parts(request.prompt, image_intake, embedded_context)?;
                    // ACP JSON-RPC IDs correlate requests on one connection. A
                    // distinct host-generated ID identifies each durable input.
                    let id = ChangeId::new(uuid::Uuid::new_v4().to_string()).map_err(host_error)?;
                    let initial_title = extensions::prompt_initial_title(
                        &prompt_sessions,
                        request.meta.as_ref(),
                    )?;
                    let prompt = PromptRequest {
                        id,
                        session,
                        parts,
                        questions: false,
                        operating_regime: None,
                        effort: None,
                        reasoning: Default::default(),
                    };
                    prompt_host
                        .start_prompt_with_initial_title(prompt, initial_title)
                        .await
                        .map_err(host_error)
                }
                .await;
                let run = match start {
                    Ok(run) => run,
                    Err(error) => return responder.respond_with_error(error),
                };
                prompt_sessions
                    .lock()
                    .unwrap()
                    .active
                    .insert(run.session.clone(), run.turn.clone());
                connection.spawn({
                    let connection = connection.clone();
                    let delivery = delivery.clone();
                    let host = prompt_host.clone();
                    let sessions = prompt_sessions.clone();
                    async move {
                        let _observation = observation;
                        let cancellation = responder.cancellation();
                        let session = run.session.clone();
                        let mut projection = Projection::new(request.session_id).with_tool_images(
                            { let state = sessions.lock().unwrap(); state.negotiated.contains(extensions::tool_images::CAPABILITY) }
                        ).with_activity_order(
                            sessions.lock().unwrap().negotiated.contains(projection::ACTIVITY_ORDER)
                                .then(|| host.activity_order.clone()));
                        let result = project_run(
                            &host,
                            &connection,
                            &delivery,
                            &mut projection,
                            cancellation,
                            run,
                        )
                        .await;
                        sessions.lock().unwrap().active.remove(&session);
                        responder.respond_with_result(result)
                    }
                })
            },
            on_receive_request!(),
        )
        .on_receive_notification(
            async move |request: CancelNotification, _| {
                if let Ok(id) = session_id(&request.session_id) {
                    let turn = sessions.lock().unwrap().active.get(&id).cloned();
                    if let Some(turn) = turn {
                        // Notifications have no response. Cancellation is
                        // scoped to the foreground turn this client observed.
                        if let Err(error) = host.cancel(id, turn).await {
                            eprintln!("ACP session cancellation failed: {}", error.code);
                        }
                    }
                }
                Ok(())
            },
            on_receive_notification!(),
        )
        .connect_to(channel)
        .await
}

async fn project_run(
    host: &Host,
    connection: &agent_client_protocol::v1::ConnectionTo<agent_client_protocol::Client>,
    delivery: &Delivery,
    projection: &mut Projection,
    cancellation: agent_client_protocol::RequestCancellation,
    run: AcceptedRun,
) -> Result<PromptResponse> {
    let AcceptedRun {
        session,
        turn,
        mut updates,
        mut completion,
        ..
    } = run;
    projection.set_turn(turn.clone());
    let mut cancelled = false;
    let mut stream_open = true;
    let result = loop {
        tokio::select! {
            _ = cancellation.cancelled(), if !cancelled => {
                cancelled = true;
                host.cancel(session.clone(), turn.clone()).await.map_err(host_error)?;
            }
            event = updates.recv(), if stream_open => match event {
                Ok(event) => projection.update(connection, delivery, event).await?,
                Err(RecvError::Lagged(_)) => return Err(unavailable("session_updates_lost")),
                Err(RecvError::Closed) => stream_open = false,
            },
            result = &mut completion => break result,
        }
    };
    // The host publishes completion only after the last update has entered this
    // bounded stream. Queue remaining updates before the terminal ACP response.
    loop {
        match updates.try_recv() {
            Ok(event) => projection.update(connection, delivery, event).await?,
            Err(TryRecvError::Empty | TryRecvError::Closed) => break,
            Err(TryRecvError::Lagged(_)) => return Err(unavailable("session_updates_lost")),
        }
    }
    let result = result
        .map_err(|_| unavailable("agent_run_disconnected"))?
        .map_err(host_error)?;
    match result {
        RunResult::Settled(outcome) => match outcome.status {
            OutcomeStatus::Succeeded => Ok(PromptResponse::new(StopReason::EndTurn)),
            OutcomeStatus::Cancelled => Ok(PromptResponse::new(StopReason::Cancelled)),
            OutcomeStatus::Failed => {
                let account = outcome
                    .account
                    .as_ref()
                    .map(grida_agent_master::read_account)
                    .transpose()
                    .map_err(host_error)?;
                match account.as_ref().and_then(|account| account.stop_reason) {
                    Some(grida_agent_master::StopReason::StepLimit) => {
                        Ok(PromptResponse::new(StopReason::MaxTurnRequests))
                    }
                    Some(grida_agent_master::StopReason::OutputLimit) => {
                        Ok(PromptResponse::new(StopReason::MaxTokens))
                    }
                    Some(grida_agent_master::StopReason::Refused) => {
                        Ok(PromptResponse::new(StopReason::Refusal))
                    }
                    None => Err(account
                        .and_then(|account| {
                            account.failure.map(host_error).or_else(|| {
                                account.inference_failure.map(|failure| {
                                    Error::internal_error().data(serde_json::json!({
                                        "kind": failure.kind,
                                        "code": failure.code,
                                        "retryAfterMs": failure.retry_after_ms,
                                    }))
                                })
                            })
                        })
                        .unwrap_or_else(|| unavailable("agent_turn_failed"))),
                }
            }
            OutcomeStatus::Uncertain => Err(unavailable("agent_turn_uncertain")),
        },
        RunResult::Suspended => Err(unavailable("agent_turn_suspended")),
        RunResult::InputRequired(_) => Err(unavailable("agent_turn_input_required")),
    }
}

fn session_id(id: &agent_client_protocol::v1::schema::SessionId) -> Result<SessionId> {
    SessionId::new(id.to_string()).map_err(host_error)
}

fn prompt_part(block: ContentBlock) -> Result<PromptPart> {
    match block {
        ContentBlock::Text(text) => Ok(PromptPart::Text { text: text.text }),
        ContentBlock::ResourceLink(link) => {
            if let Some(reference) =
                crate::skills::SkillReference::from_uri(&link.uri).map_err(host_error)?
            {
                return Ok(PromptPart::Skill { reference });
            }
            Ok(PromptPart::ResourceLink {
                name: link.name,
                uri: link.uri,
                mime_type: link.mime_type,
            })
        }
        _ => Err(Error::invalid_params().data("unsupported_prompt_content")),
    }
}

fn prompt_parts(
    blocks: Vec<ContentBlock>,
    image_intake: bool,
    embedded_context: bool,
) -> Result<Vec<PromptPart>> {
    if blocks.len() > crate::host::MAX_PROMPT_PARTS {
        return Err(Error::invalid_params().data("invalid_prompt_parts"));
    }
    let images = blocks
        .iter()
        .filter(|block| matches!(block, ContentBlock::Image(_)))
        .count();
    if images > 1 {
        return Err(Error::invalid_params().data("image_count_limit"));
    }
    let resources = blocks
        .iter()
        .filter(|block| matches!(block, ContentBlock::Resource(_)))
        .count();
    if resources != 0 {
        if !embedded_context {
            return Err(Error::invalid_params().data("embedded_context_unavailable"));
        }
        if resources + images > 1 {
            return Err(Error::invalid_params().data("file_attachment_count_limit"));
        }
        if !blocks
            .iter()
            .any(|block| matches!(block, ContentBlock::Text(text) if !text.text.trim().is_empty()))
        {
            return Err(Error::invalid_params().data("selected_file_requires_text"));
        }
    }
    blocks
        .into_iter()
        .map(|block| match block {
            ContentBlock::Image(image) => {
                if !image_intake {
                    return Err(Error::invalid_params().data("image_input_unavailable"));
                }
                if image.uri.is_some() {
                    return Err(Error::invalid_params().data("image_uri_unsupported"));
                }
                Ok(PromptPart::Image {
                    image: crate::host::ImageUpload::decode(&image.mime_type, &image.data)
                        .map_err(|error| Error::invalid_params().data(error.code))?,
                })
            }
            ContentBlock::Resource(embedded) => {
                let file = match embedded.resource {
                    EmbeddedResourceResource::TextResourceContents(text) => {
                        let name = embedded_resource_name(&text.uri)?;
                        crate::host::FileUpload::from_text(&name, text.text)
                    }
                    EmbeddedResourceResource::BlobResourceContents(blob) => {
                        let name = embedded_resource_name(&blob.uri)?;
                        crate::host::FileUpload::decode(&name, &blob.blob)
                    }
                    _ => return Err(Error::invalid_params().data("embedded_resource_unsupported")),
                };
                Ok(PromptPart::File {
                    file: file.map_err(host_error)?,
                })
            }
            other => prompt_part(other),
        })
        .collect()
}

fn embedded_resource_name(uri: &str) -> Result<String> {
    let invalid = || Error::invalid_params().data("embedded_resource_uri_invalid");
    if uri.len() > 4096 || uri.chars().any(char::is_control) {
        return Err(invalid());
    }
    // The URI only supplies a display name. The admitted bytes come from the
    // payload, even if a local file exists at the same URI.
    let uri = reqwest::Url::parse(uri).map_err(|_| invalid())?;
    Ok(uri
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|segment| !segment.is_empty())
        .unwrap_or("attachment")
        .to_owned())
}

fn validate_session_setup(
    servers: &[agent_client_protocol::v1::schema::McpServer],
    additional_directories: &[std::path::PathBuf],
) -> Result<()> {
    if !servers.is_empty() {
        return Err(Error::invalid_params().data("client_mcp_servers_unavailable"));
    }
    if !additional_directories.is_empty() {
        return Err(Error::invalid_params().data("additional_workspace_directories_unavailable"));
    }
    Ok(())
}

fn unavailable(code: &'static str) -> Error {
    Error::internal_error().data(code)
}

fn host_error(error: agent_kit_core::Error) -> Error {
    let wire_error = match error.kind {
        ErrorKind::InvalidInput | ErrorKind::Unsupported => Error::invalid_params(),
        _ => Error::internal_error(),
    };
    wire_error.data(error.code)
}

/// The native CLI and ACP project the same host-owned public catalog page.
pub async fn list_chats(
    host: &Host,
    cwd: Option<std::path::PathBuf>,
    order: CatalogOrder,
    cursor: Option<&str>,
) -> agent_kit_core::Result<ListSessionsResponse> {
    let page = host.discover_chats(cwd, order, cursor).await?;
    catalog_response(page, true)
}

fn catalog_response(
    mut catalog: CatalogListing,
    include_activity: bool,
) -> agent_kit_core::Result<ListSessionsResponse> {
    // Reserve room for titles, cursor and activity arrays, including when
    // different rows in an all-workspaces page have different path lengths.
    let mut bytes = 0;
    let mut count = 0;
    for row in &catalog.entries {
        bytes += serde_json::to_vec(&row.cwd)
            .map_err(|_| {
                agent_kit_core::Error::new(
                    ErrorKind::InvalidState,
                    "session_catalog_projection_failed",
                )
            })?
            .len()
            + 4096;
        if bytes > transport::MAX_FRAME_BYTES / 2 {
            break;
        }
        count += 1;
    }
    if count == 0 && !catalog.entries.is_empty() {
        return Err(agent_kit_core::Error::new(
            ErrorKind::InvalidInput,
            "session_catalog_workspace_too_large",
        ));
    }
    if count < catalog.entries.len() {
        catalog.entries.truncate(count);
        catalog.has_more = true;
    }
    let cursor = catalog
        .has_more
        .then(|| catalog.entries.last().map(|row| row.cursor.clone()))
        .flatten();
    let mut sessions = Vec::with_capacity(catalog.entries.len());
    let mut ids = BTreeSet::new();
    let mut running = Vec::new();
    let mut input_needed = Vec::new();
    for row in catalog.entries {
        let record = row.record;
        let entry = record.entry;
        let id = entry.session.as_str();
        let mut meta = serde_json::Map::new();
        if include_activity {
            let is_running = record.current_turn_disposition
                == Some(agent_kit_sessions::TurnDisposition::Running);
            let needs_input = crate::host::needs_user_input(&record.pending_request_schemas);
            meta.insert("co.grida/running".into(), is_running.into());
            meta.insert("co.grida/inputNeeded".into(), needs_input.into());
            if is_running {
                running.push(serde_json::Value::from(id));
            }
            if needs_input {
                input_needed.push(serde_json::Value::from(id));
            }
            ids.insert(entry.session.clone());
        }
        meta.insert(
            "co.grida/readState".into(),
            serde_json::json!(record.read_state),
        );
        if let Some(value) = record.latest_turn_activity_ms {
            meta.insert("co.grida/lastActivityAtMs".into(), value.into());
        }
        if let Some(value) = record.last_message_ms {
            meta.insert("co.grida/lastMessageAtMs".into(), value.into());
        }
        sessions.push(
            SessionInfo::new(id.to_owned(), row.cwd)
                .title(entry.label)
                .meta(meta),
        );
    }
    // Legacy arrays identify a session only by ID. A combined page can contain
    // independently stored chats with the same ID in different workspaces.
    let meta = (include_activity && ids.len() == sessions.len()).then(|| {
        serde_json::Map::from_iter([
            (
                "co.grida/runningSessionIds".to_owned(),
                serde_json::Value::Array(running),
            ),
            (
                "co.grida/inputNeededSessionIds".to_owned(),
                serde_json::Value::Array(input_needed),
            ),
        ])
    });
    Ok(ListSessionsResponse::new(sessions)
        .next_cursor(cursor)
        .meta(meta))
}

#[cfg(test)]
mod catalog_tests {
    use super::*;
    use crate::host::ListedSession;
    use agent_kit_store_sqlite::catalog::{CatalogEntry, CatalogRecord};

    #[test]
    fn equal_session_ids_in_different_workspaces_keep_their_own_activity() {
        let row = |cwd: &str, is_running: bool, needs_input: bool| ListedSession {
            cwd: cwd.into(),
            record: CatalogRecord {
                entry: CatalogEntry {
                    session: SessionId::new("same-id").unwrap(),
                    bucket: 0,
                    label: None,
                    revision: 0,
                },
                last_message_ms: None,
                read_state: Default::default(),
                latest_turn_activity_ms: None,
                current_turn_disposition: is_running
                    .then_some(agent_kit_sessions::TurnDisposition::Running),
                pending_request_schemas: needs_input
                    .then(|| {
                        agent_kit_core::SchemaId::new(grida_agent_master::questions::REQUEST_SCHEMA)
                            .unwrap()
                    })
                    .into_iter()
                    .collect(),
            },
            cursor: cwd.into(),
        };
        let page = catalog_response(
            CatalogListing {
                entries: vec![row("/first", true, false), row("/second", false, true)],
                has_more: false,
            },
            true,
        )
        .unwrap();
        assert!(
            page.meta.is_none(),
            "bare IDs would give both rows the same status"
        );
        let activity: Vec<_> = page
            .sessions
            .iter()
            .map(|row| {
                let meta = row.meta.as_ref().unwrap();
                (
                    row.cwd.to_str().unwrap(),
                    meta["co.grida/running"].as_bool().unwrap(),
                    meta["co.grida/inputNeeded"].as_bool().unwrap(),
                )
            })
            .collect();
        assert_eq!(
            activity,
            [("/first", true, false), ("/second", false, true)]
        );
    }
}
