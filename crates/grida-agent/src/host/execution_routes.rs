//! Resolve the private supervisor's provider for one submission or retained turn.
//! The store, scheduler and controls remain shared across these Host clones.
use super::*;
use crate::supervised_provider::{ProviderRoute, RoutePurpose, SupervisedProvider};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Selection {
    connection_id: Option<String>,
    model: ModelId,
}

impl From<&ChatSelection> for Selection {
    fn from(choice: &ChatSelection) -> Self {
        Self {
            connection_id: choice.connection_id.clone(),
            model: choice.model.clone(),
        }
    }
}

pub(super) struct Routes {
    supervisor: SupervisedProvider,
    input_routes: bool,
    prediction_route: bool,
    launch: Arc<Execution>,
    tools: Option<Arc<host_tools::HostTools>>,
    image_generation: Option<image_generation::DesktopImageGeneration>,
    media: image_generation::ImageConnection,
}

fn route_changed() -> Error {
    problem(ErrorKind::Conflict, "chat_selection_route_changed")
}

impl Host {
    pub(crate) fn attach_routes(
        &self,
        supervisor: SupervisedProvider,
        input_routes: bool,
        prediction_route: bool,
    ) -> Result<()> {
        self.routes
            .set(Routes {
                supervisor,
                input_routes,
                prediction_route,
                launch: self.execution.clone().ok_or_else(route_changed)?,
                tools: self.host_tools.clone(),
                image_generation: self.desktop_image_generation.clone(),
                media: self
                    .desktop_image_generation
                    .as_ref()
                    .map(|owner| owner.connection.clone())
                    .unwrap_or_default(),
            })
            .map_err(|_| problem(ErrorKind::Conflict, "provider_supervisor_attached"))
    }

    pub(crate) fn image_connection(&self) -> Option<image_generation::ImageConnection> {
        self.routes
            .get()
            .filter(|routes| routes.input_routes)
            .map(|routes| routes.media.clone())
            .or_else(|| {
                self.desktop_image_generation
                    .as_ref()
                    .map(|owner| owner.connection.clone())
            })
    }

    pub(crate) fn supervised_route_id(&self) -> Option<uuid::Uuid> {
        self.route_id
    }

    pub(crate) fn has_routes(&self) -> bool {
        self.routes.get().is_some_and(|routes| routes.input_routes)
    }

    pub(super) async fn for_selection(
        &self,
        session: &SessionId,
        revision: Option<u64>,
    ) -> Result<Self> {
        if !self.has_routes() {
            return Ok(self.clone());
        }
        let view = self.store.inspect(session.clone()).await?;
        if let Some(revision) = revision {
            let selection = self.selected_provider(&view, revision)?;
            self.resolve_route(Some((&selection).into())).await
        } else {
            self.resolve_route(session_configuration(&view)?.inherited_route)
                .await
        }
    }

    /// Choose a route for a new derived session before taking admission. The
    /// caller rechecks the selection revision under admission before creation.
    pub(super) async fn for_derived_session(
        &self,
        parent: &SessionId,
    ) -> Result<(Self, Option<u64>)> {
        if !self.has_routes() {
            return Ok((self.clone(), None));
        }
        let view = self.store.inspect(parent.clone()).await?;
        let configuration = session_configuration(&view)?;
        if configuration.side.is_some() || configuration.subagent.is_some() {
            // These sessions have a frozen route and no editable selection ledger.
            let host = self.resolve_route(configuration.inherited_route).await?;
            return Ok((host, None));
        }
        let snapshot = self
            .chat_selection(configuration.cwd, parent.clone())
            .await?;
        let host = self
            .resolve_route(snapshot.selection.as_ref().map(Selection::from))
            .await?;
        Ok((host, Some(snapshot.revision)))
    }

    async fn resolve_route(&self, selection: Option<Selection>) -> Result<Self> {
        if !self.has_routes() {
            return Ok(self.clone());
        }
        self.resolve_for(selection, None).await
    }

    /// An optional model request inherits the completed turn's credential
    /// owner. A loopback endpoint can serve its own model directly. A hosted
    /// request needs explicit same-owner resolution of the product's economy model.
    pub(super) async fn for_prediction(&self) -> Result<Self> {
        let source = self.execution()?;
        if matches!(&source.authorization.credential, Credential::Http(http) if http.is_loopback() && http.is_direct())
        {
            return Ok(self.clone());
        }
        if !self
            .routes
            .get()
            .is_some_and(|routes| routes.prediction_route)
        {
            return Err(route_changed());
        }
        let selection = self.selected_route.clone().unwrap_or_else(|| Selection {
            connection_id: None,
            model: source.config.model.clone(),
        });
        let local = matches!(&source.authorization.credential, Credential::Http(http) if http.is_loopback());
        let target = grida_agent_master::prediction::model(&selection.model, local)?;
        self.resolve_for(Some(selection), Some(target)).await
    }

    async fn resolve_for(
        &self,
        selection: Option<Selection>,
        prediction_model: Option<ModelId>,
    ) -> Result<Self> {
        let routes = self.routes.get().ok_or_else(route_changed)?;
        let mut host = self.clone();
        host.execution = Some(routes.launch.clone());
        host.host_tools = routes.tools.clone();
        host.desktop_image_generation = routes.image_generation.clone();
        host.selected_route = selection.clone();
        host.route_id = None;
        let Some(selection) = selection else {
            return Ok(host);
        };
        let purpose = prediction_model
            .as_ref()
            .map(|_| RoutePurpose::ComposerPrediction {
                source_route_id: self.route_id,
            });
        let expected_model = prediction_model.unwrap_or_else(|| selection.model.clone());
        let descriptor = routes
            .supervisor
            .resolve(selection.connection_id, selection.model, purpose)
            .await?;
        let retained = routes.launch.retained_inputs.clone();
        let limit = |value: Option<u64>| -> Result<u64> {
            let value = value.unwrap_or(4096);
            if (1..=65_536).contains(&value) {
                Ok(value)
            } else {
                Err(problem(
                    ErrorKind::InvalidInput,
                    "invalid_output_token_limit",
                ))
            }
        };
        let (id, mut execution) = match descriptor {
            ProviderRoute::Launch { model, .. }
                if model == expected_model && model == routes.launch.config.model =>
            {
                return Ok(host);
            }
            ProviderRoute::Http {
                route_id,
                model,
                endpoint,
                protocol,
                max_output_tokens,
                credential_home,
                configured_endpoint_key,
                compatible_output_limit_field,
                llama_cpp_input_count,
                reasoning,
                image_generation_binding,
            } if model == expected_model => {
                let supervisor = routes
                    .supervisor
                    .routed(route_id, configured_endpoint_key.as_deref())?;
                let image_endpoint = protocol == ProviderProtocol::OpenAiCompatible
                    && matches!(
                        endpoint.as_str(),
                        "https://openrouter.ai/api/v1" | "https://ai-gateway.vercel.sh/v1"
                    );
                let execution = Execution::new(
                    self.state_dir.as_deref().ok_or_else(route_changed)?,
                    ProviderOptions {
                        model,
                        endpoint,
                        protocol,
                        max_output_tokens: limit(max_output_tokens)?,
                        credential_env: None,
                        credential_home,
                        compatible_output_limit_field,
                        llama_cpp_input_count,
                        reasoning,
                    },
                    Some(supervisor),
                    retained.clone(),
                )?;
                host.desktop_image_generation = match (
                    image_generation_binding,
                    &execution.authorization.credential,
                ) {
                    (Some(binding), Credential::Http(transport)) if image_endpoint => {
                        Some(image_generation::DesktopImageGeneration::new(
                            &binding,
                            Some(route_id),
                            transport.clone(),
                            routes.media.clone(),
                        )?)
                    }
                    _ => None,
                };
                (route_id, execution)
            }
            ProviderRoute::Gateway {
                route_id,
                model,
                endpoint,
                scope,
                max_output_tokens,
                gateway_billing,
            } if model == expected_model => {
                let connection = Arc::new(crate::gg::SupervisedGg::new(
                    &endpoint,
                    &scope,
                    routes.supervisor.routed(route_id, None)?,
                )?);
                host.desktop_image_generation = None;
                let mut execution = Execution::new_gg(
                    GgOptions {
                        model,
                        max_output_tokens: limit(max_output_tokens)?,
                    },
                    connection.scope,
                    connection.binding.clone(),
                    connection.clone(),
                    Credential::SupervisedGg(connection),
                    retained.clone(),
                )?;
                execution.gateway_billing = gateway_billing;
                (route_id, execution)
            }
            ProviderRoute::Chatgpt {
                route_id,
                model,
                endpoint,
                scope,
            } if model == expected_model => {
                let connection = Arc::new(crate::chatgpt_subscription::SupervisedChatGpt::new(
                    &endpoint,
                    &model,
                    &scope,
                    routes.supervisor.routed(route_id, None)?,
                )?);
                host.desktop_image_generation = None;
                (
                    route_id,
                    Execution::new_chatgpt(model, connection, retained.clone())?,
                )
            }
            _ => return Err(route_changed()),
        };
        // Supervised MCP tools are explicitly bound to the launch Gateway;
        // the headless surface has no provider credential.
        if host
            .host_tools
            .as_ref()
            .is_some_and(|tools| tools.has_mcp())
            && !matches!((&routes.launch.authorization.credential, &execution.authorization.credential),
                (Credential::SupervisedGg(a), Credential::SupervisedGg(b)) if a.scope == b.scope)
        {
            host.host_tools = None;
        }
        host.route_id = Some(id);
        execution.retained_inputs = retained;
        host.execution = Some(Arc::new(execution));
        Ok(host)
    }

    pub(super) async fn for_retained_input(
        &self,
        input: &Submission,
        mismatch: &'static str,
    ) -> Result<Self> {
        if !self.has_routes() {
            return Ok(self.clone());
        }
        #[derive(Deserialize)]
        struct Capture {
            selection: Option<SelectionSnapshot>,
            inherited_route: Option<Selection>,
        }
        let capture: Capture = decode_input(input)?;
        let selection = capture
            .selection
            .and_then(|s| s.selection.as_ref().map(Selection::from))
            .or(capture.inherited_route);
        let host = self.resolve_route(selection).await?;
        // New selections always carry an explicit model and authority. Verify
        // them here as well as at admission for consumers such as queue edits
        // and historical billing which do not run a new turn.
        if host.selected_route.is_some() {
            let execution = host.execution()?;
            if !CapturedRoute::admits(input, execution, execution.configuration) {
                return Err(problem(ErrorKind::Conflict, mismatch));
            }
        }
        Ok(host)
    }

    pub(crate) async fn for_turn(&self, session: &SessionId, turn: &TurnId) -> Result<Self> {
        if !self.has_routes() {
            return Ok(self.clone());
        }
        let inputs = self
            .store
            .turn_submissions(session.clone(), turn.clone())
            .await?;
        if let Some(input) = inputs
            .iter()
            .rev()
            .find(|input| !subagents::is_message(input))
        {
            return self
                .for_retained_input(input, "session_active_route_changed")
                .await;
        }
        let plan = self.compaction_plan(session.clone(), turn.clone()).await?;
        self.resolve_route(plan.and_then(|plan| plan.route)).await
    }

    /// Recheck the queue revision under admission after the supervisor replies.
    pub(super) async fn for_launch(
        &self,
        session: &SessionId,
        turn: &TurnId,
        launch: &Launch,
    ) -> Result<(Self, Option<SessionRevision>)> {
        if !self.has_routes() {
            return Ok((self.clone(), None));
        }
        match launch {
            Launch::Queued(..) => {
                let view = self.store.inspect(session.clone()).await?;
                let host = if let Some(input) = subagents::queued_work(&view) {
                    self.for_retained_input(input, "session_queued_route_changed")
                        .await?
                } else if let Some(input) = self.goal_continuation(&view).await? {
                    self.for_retained_input(&input, "session_goal_route_changed")
                        .await?
                } else {
                    self.clone()
                };
                Ok((host, Some(view.revision)))
            }

            Launch::Resume(_)
            | Launch::ResumeAnswered(_)
            | Launch::ResumeSponsored(_)
            | Launch::RecoverCompaction(_) => Ok((self.for_turn(session, turn).await?, None)),
            _ => Ok((self.clone(), None)),
        }
    }

    pub(super) async fn check_new_submission(&self, view: &SessionView) -> Result<()> {
        if self.has_routes()
            && self.selected_route.is_some()
            && session_configuration(view)?.subagent.is_none()
        {
            return Ok(());
        }
        self.check_execution(view).await
    }
}
