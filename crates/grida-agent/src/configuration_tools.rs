//! Bounded model access to the host's reviewed configuration operations.

use crate::configuration::ConfigurationSnapshot;
use crate::host::Host;
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::inference::{InputFormat, RequestControl};
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, Invocation, InvocationContext, InvocationRecovery, RecoveryKind,
    Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::OperationInput;
use agent_kit_core::{
    BindingId, BoxFuture, Error, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId,
    ToolId,
};
use agent_kit_runtime::TurnOperations;
use grida_agent_master::configuration::{CONTEXT_MAX_INPUT_TOKENS, SettingChange};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;

/// Host-selected configuration authority captured with an accepted input.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigurationPermission {
    #[default]
    Disabled,
    Inspect,
    Change,
}

impl ConfigurationPermission {
    pub(crate) fn for_regime(self, regime: crate::OperatingRegime) -> Self {
        if regime == crate::OperatingRegime::Plan && self == Self::Change {
            Self::Inspect
        } else {
            self
        }
    }
}

pub(crate) struct ConfigurationAccess {
    read: GrantSelection,
    change: GrantSelection,
}

impl ConfigurationAccess {
    pub(crate) fn new() -> Result<Self> {
        let authority = AuthorityBinding {
            principal: PrincipalId::new("grida-local")?,
            binding: BindingId::new("grida-configuration-v1")?,
            scope: ScopeId::new("user-defaults")?,
        };
        Ok(Self {
            read: GrantSelection {
                authority: authority.clone(),
                grants: vec![GrantId::new("configuration-read")?],
            },
            change: GrantSelection {
                authority,
                grants: vec![GrantId::new("configuration-change")?],
            },
        })
    }

    pub(crate) fn accepts(&self, selection: &GrantSelection) -> bool {
        selection == &self.read || selection == &self.change
    }

    pub(crate) fn permits(&self, invocation: &Invocation, selection: &GrantSelection) -> bool {
        match invocation.definition().id.as_str() {
            "config_inspect" => selection == &self.read,
            "config_update" | "config_reload" => selection == &self.change,
            _ => false,
        }
    }

    pub(crate) fn insert(
        &self,
        host: Host,
        captured: ConfigurationSnapshot,
        permission: ConfigurationPermission,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        for action in [Action::Inspect, Action::Update, Action::Reload] {
            if permission == ConfigurationPermission::Disabled
                || (permission == ConfigurationPermission::Inspect
                    && !matches!(action, Action::Inspect))
            {
                continue;
            }
            let tool = ConfigurationTool::new(host.clone(), captured.clone(), action)?;
            let selection = match action {
                Action::Inspect => &self.read,
                _ => &self.change,
            };
            grants.insert(tool.definition.id.clone(), selection.clone());
            inventory.insert(Arc::new(tool))?;
        }
        Ok(())
    }
    pub(crate) async fn reconcile(
        &self,
        operations: &TurnOperations,
        inventory: &InventorySnapshot,
    ) -> Result<()> {
        let view = operations.view();
        if !view.state.controls().admits_work() {
            return Ok(());
        }
        for operation in view.state.operations().values() {
            let OperationInput::Tool(invocation) = &operation.record.input else {
                continue;
            };
            if !(operation.is_running() || operation.is_uncertain())
                || !self.accepts(&operation.record.grants)
                || !self.permits(invocation, &operation.record.grants)
                || inventory.restore(invocation.clone()).is_err()
            {
                continue;
            }
            if let Err(error) = operations
                .reconcile_tool(operation.record.id.clone(), inventory.clone())
                .await
            {
                if !operations.view().state.controls().admits_work() {
                    return Ok(());
                }
                return Err(error);
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
enum Action {
    Inspect,
    Update,
    Reload,
}

struct ConfigurationTool {
    host: Host,
    captured: ConfigurationSnapshot,
    action: Action,
    definition: ToolDefinition,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Update {
    expected_file_revision: Option<Fingerprint>,
    change: SettingChange,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reload {
    expected_file_revision: Option<Fingerprint>,
}

impl ConfigurationTool {
    fn new(host: Host, captured: ConfigurationSnapshot, action: Action) -> Result<Self> {
        let revision = json!({"type":["array","null"], "minItems":32, "maxItems":32,
            "items":{"type":"integer", "minimum":0, "maximum":255}});
        let (name, description, schema) = match action {
            Action::Inspect => (
                "config_inspect",
                "Read supported setting descriptions, current file and active defaults, and this task's captured defaults. Inspection changes nothing. User defaults affect later accepted tasks. Current work keeps its captured settings.",
                json!({"type":"object", "properties":{}, "additionalProperties":false}),
            ),
            Action::Update => (
                "config_update",
                "Set or reset a reviewed user default when the user explicitly asks for a persistent change. Inspect first and copy expected_file_revision exactly, including null for an absent file. Only context.max_input_tokens is supported. A task-only request must use task controls. Credentials, permissions, sandbox rules, and spending limits cannot be changed here. Success establishes the requested default for later accepted tasks.",
                json!({"type":"object", "properties":{
                    "expected_file_revision":revision,
                    "change":{"oneOf":[
                        {"type":"object", "properties":{"operation":{"const":"set_context_max_input_tokens"},
                            "value":{"type":"integer", "minimum":CONTEXT_MAX_INPUT_TOKENS.minimum, "maximum":CONTEXT_MAX_INPUT_TOKENS.maximum}},
                            "required":["operation","value"], "additionalProperties":false},
                        {"type":"object", "properties":{"operation":{"const":"reset_context_max_input_tokens"}},
                            "required":["operation"], "additionalProperties":false}
                    ]}}, "required":["expected_file_revision","change"], "additionalProperties":false}),
            ),
            Action::Reload => (
                "config_reload",
                "Activate a manual edit to the supported configuration file when the user asks. Inspect first and copy the exact expected_file_revision. Invalid edits leave the last valid defaults active. Activation affects later accepted tasks.",
                json!({"type":"object", "properties":{"expected_file_revision":revision},
                    "required":["expected_file_revision"], "additionalProperties":false}),
            ),
        };
        Ok(Self {
            host,
            captured,
            action,
            definition: ToolDefinition {
                id: ToolId::new(name)?,
                version: 1,
                description: description.into(),
                input: InputFormat::Json(schema),
                max_input_bytes: 4096,
                max_output_bytes: 16 * 1024,
                recovery: RecoveryKind::Reconcile,
            },
        })
    }

    fn arguments<'a>(&self, arguments: &'a ToolArguments) -> Result<&'a Value> {
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid());
        };
        match self.action {
            Action::Inspect if value.as_object().is_some_and(|object| object.is_empty()) => {}
            Action::Inspect => return Err(invalid()),
            Action::Update => {
                let update: Update =
                    serde_json::from_value(value.clone()).map_err(|_| invalid())?;
                if matches!(update.change, SettingChange::SetContextMaxInputTokens { value } if value.get() > CONTEXT_MAX_INPUT_TOKENS.maximum)
                {
                    return Err(invalid());
                }
            }
            Action::Reload => {
                let _: Reload = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
            }
        }
        if !matches!(self.action, Action::Inspect) && value.get("expected_file_revision").is_none()
        {
            return Err(invalid());
        }
        Ok(value)
    }

    async fn result(
        &self,
        invocation: &Invocation,
        context: InvocationContext,
        recovery: bool,
    ) -> Result<ToolOutcome> {
        if invocation.definition() != &self.definition {
            return Err(Error::new(
                ErrorKind::Conflict,
                "configuration_tool_changed",
            ));
        }
        let value = self.arguments(invocation.arguments())?;
        let control = RequestControl {
            cancellation: context.cancellation,
            deadline: context.deadline,
        };
        crate::host::check_configuration_control(&control)?;
        if recovery && !matches!(self.action, Action::Inspect) {
            let inspection = self.host.configuration_inspect().await?;
            let active_file = inspection.file_diagnostic.is_none()
                && inspection.file_revision == inspection.active.source_revision;
            let matches = match self.action {
                Action::Update => {
                    let change: Update =
                        serde_json::from_value(value.clone()).map_err(|_| invalid())?;
                    let expected = match change.change {
                        SettingChange::SetContextMaxInputTokens { value } => Some(value),
                        SettingChange::ResetContextMaxInputTokens => None,
                    };
                    inspection.active.defaults.context.max_input_tokens == expected
                }
                Action::Reload => {
                    let reload: Reload =
                        serde_json::from_value(value.clone()).map_err(|_| invalid())?;
                    inspection.active.source_revision == reload.expected_file_revision
                }
                Action::Inspect => unreachable!(),
            };
            return if active_file && matches {
                self.output(
                    json!({"disposition":"observed_after_recovery", "configuration":inspection}),
                )
            } else {
                Ok(ToolOutcome::uncertain())
            };
        }
        let observed = match self.action {
            Action::Inspect => {
                json!({"disposition":"observed", "configuration":self.host.configuration_inspect().await?})
            }
            Action::Update => {
                let update: Update =
                    serde_json::from_value(value.clone()).map_err(|_| invalid())?;
                let applied = self
                    .host
                    .configuration_update_controlled(
                        update.expected_file_revision,
                        update.change,
                        Some(control),
                    )
                    .await?;
                json!({"disposition":"applied", "active":applied})
            }
            Action::Reload => {
                let reload: Reload =
                    serde_json::from_value(value.clone()).map_err(|_| invalid())?;
                let applied = self
                    .host
                    .configuration_reload_controlled(reload.expected_file_revision, Some(control))
                    .await?;
                json!({"disposition":"applied", "active":applied})
            }
        };
        self.output(observed)
    }

    fn output(&self, mut structured: Value) -> Result<ToolOutcome> {
        structured["task_defaults"] =
            serde_json::to_value(&self.captured).map_err(|_| invalid())?;
        let text = serde_json::to_string(&structured).map_err(|_| invalid())?;
        Ok(ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text(text)],
            structured: Some(structured),
            receipt: None,
            truncated: false,
        })
    }
}

impl Tool for ConfigurationTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.arguments(arguments).map(|_| ())
    }
    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(&invocation, context, false)
                .await
                .unwrap_or_else(|error| {
                    if error.kind == ErrorKind::Uncertain {
                        ToolOutcome::uncertain()
                    } else {
                        ToolOutcome::failed(&error.code)
                    }
                })
        })
    }
    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(&recovery.invocation, context, true)
                .await
                .unwrap_or_else(|_| ToolOutcome::uncertain())
        })
    }
}

fn invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "configuration_arguments_invalid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ProviderOptions, ProviderProtocol};
    use agent_kit_core::tools::PreparedInvocation;
    use agent_kit_core::{AttemptId, CancellationToken, ModelId, OperationId};
    use std::num::NonZeroU64;

    fn private_directory() -> tempfile::TempDir {
        let directory = tempfile::tempdir().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700))
                .unwrap();
        }
        directory
    }

    fn host() -> (tempfile::TempDir, Host, ConfigurationSnapshot) {
        let directory = private_directory();
        let host = Host::open(
            directory.path(),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:1/v1".into(),
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                max_output_tokens: 128,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap();
        let configuration = crate::configuration::Configuration::open(directory.path()).unwrap();
        (directory, host, configuration.snapshot().unwrap())
    }

    fn context() -> InvocationContext {
        InvocationContext {
            attempt: AttemptId::new("fixture").unwrap(),
            cancellation: CancellationToken::new(),
            deadline: Some(std::time::Instant::now() + std::time::Duration::from_secs(10)),
            max_output_bytes: 16 * 1024,
        }
    }

    fn prepare(
        host: &Host,
        captured: &ConfigurationSnapshot,
        action: Action,
        arguments: Value,
    ) -> PreparedInvocation {
        let tool = ConfigurationTool::new(host.clone(), captured.clone(), action).unwrap();
        let id = tool.definition.id.clone();
        let mut inventory = Inventory::new();
        inventory.insert(Arc::new(tool)).unwrap();
        inventory
            .snapshot(std::slice::from_ref(&id))
            .unwrap()
            .prepare(
                OperationId::new("configuration-fixture").unwrap(),
                &id,
                ToolArguments::Json(arguments),
            )
            .unwrap()
    }

    fn update(value: u64) -> Value {
        json!({"expected_file_revision":null,"change":{"operation":"set_context_max_input_tokens","value":value}})
    }

    #[test]
    fn inspection_capability_cannot_offer_or_authorize_mutation() {
        let (_directory, host, captured) = host();
        let access = ConfigurationAccess::new().unwrap();
        let mut inventory = Inventory::new();
        let mut grants = BTreeMap::new();
        access
            .insert(
                host.clone(),
                captured.clone(),
                ConfigurationPermission::Inspect,
                &mut inventory,
                &mut grants,
            )
            .unwrap();
        assert_eq!(grants.len(), 1);
        let tools = inventory
            .snapshot(&grants.keys().cloned().collect::<Vec<_>>())
            .unwrap();
        assert_eq!(tools.offers().unwrap()[0].id.as_str(), "config_inspect");
        let change = prepare(&host, &captured, Action::Update, update(64));
        assert!(!access.permits(change.invocation(), &access.read));
        assert!(access.permits(change.invocation(), &access.change));
    }

    #[tokio::test]
    async fn mutation_reports_its_exact_snapshot_and_preserves_task_defaults() {
        let (directory, host, captured) = host();
        let outcome = prepare(&host, &captured, Action::Update, update(64000))
            .invoke(context())
            .await;
        assert_eq!(outcome.status, OutcomeStatus::Succeeded);
        let result = outcome.structured.unwrap();
        assert_eq!(result["disposition"], "applied");
        assert_eq!(
            result["active"]["defaults"]["context"]["max_input_tokens"],
            64000
        );
        assert!(result["task_defaults"]["defaults"]["context"]["max_input_tokens"].is_null());
        assert_eq!(
            crate::configuration::Configuration::open(directory.path())
                .unwrap()
                .snapshot()
                .unwrap()
                .defaults
                .context
                .max_input_tokens
                .unwrap()
                .get(),
            64000
        );
        let stale = prepare(&host, &captured, Action::Update, update(32000))
            .invoke(context())
            .await;
        assert_eq!(stale.status, OutcomeStatus::Failed);
        assert_eq!(
            stale.content,
            vec![ResultContent::Text("config_revision_changed".into())]
        );
        let active = host.configuration_inspect().await.unwrap().active;
        let reset = prepare(&host, &captured, Action::Update, json!({
            "expected_file_revision":active.source_revision,"change":{"operation":"reset_context_max_input_tokens"}
        })).invoke(context()).await;
        assert_eq!(reset.status, OutcomeStatus::Succeeded);
        assert!(
            reset.structured.unwrap()["active"]["defaults"]["context"]["max_input_tokens"]
                .is_null()
        );
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn recovery_observes_desired_state_without_repeating_a_write() {
        let (_directory, host, captured) = host();
        let prepared = prepare(&host, &captured, Action::Update, update(64));
        let invocation = prepared.invocation().clone();
        assert_eq!(
            prepared.invoke(context()).await.status,
            OutcomeStatus::Succeeded
        );
        let recover = || InvocationRecovery {
            invocation: invocation.clone(),
            checkpoint: None,
            receipts: vec![],
        };
        let observed = prepare(&host, &captured, Action::Update, update(64))
            .recover(recover(), context())
            .await;
        assert_eq!(observed.status, OutcomeStatus::Succeeded);
        assert_eq!(
            observed.structured.unwrap()["disposition"],
            "observed_after_recovery"
        );
        let current = host.configuration_inspect().await.unwrap().active;
        host.configuration_update(
            current.source_revision,
            SettingChange::SetContextMaxInputTokens {
                value: NonZeroU64::new(128).unwrap(),
            },
        )
        .await
        .unwrap();
        let uncertain = prepare(&host, &captured, Action::Update, update(64))
            .recover(recover(), context())
            .await;
        assert_eq!(uncertain.status, OutcomeStatus::Uncertain);
        assert_eq!(
            host.configuration_inspect()
                .await
                .unwrap()
                .active
                .defaults
                .context
                .max_input_tokens
                .unwrap()
                .get(),
            128
        );
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn missing_revision_unreviewed_fields_and_oversized_values_are_rejected() {
        let (_directory, host, captured) = host();
        let tool = ConfigurationTool::new(host.clone(), captured, Action::Update).unwrap();
        for value in [
            json!({"change":{"operation":"reset_context_max_input_tokens"}}),
            json!({"expected_file_revision":null,"change":{"operation":"set_permissions","value":"all"}}),
            update(CONTEXT_MAX_INPUT_TOKENS.maximum + 1),
            update(0),
        ] {
            assert!(tool.validate(&ToolArguments::Json(value)).is_err());
        }
        assert!(
            host.configuration_inspect()
                .await
                .unwrap()
                .active
                .source_revision
                .is_none()
        );
        host.shutdown().await.unwrap();
    }

    #[test]
    fn manual_changes_during_staging_reject_the_managed_replacement() {
        let directory = private_directory();
        let configuration = crate::configuration::Configuration::open(directory.path()).unwrap();
        let before = configuration
            .update(
                None,
                SettingChange::SetContextMaxInputTokens {
                    value: NonZeroU64::new(64).unwrap(),
                },
            )
            .unwrap();
        let result = configuration.update_guarded(
            before.source_revision,
            SettingChange::SetContextMaxInputTokens {
                value: NonZeroU64::new(128).unwrap(),
            },
            || {
                std::fs::write(
                    directory.path().join("config.toml"),
                    "schema_version = 1\n[context]\nmax_input_tokens = 256\n",
                )
                .unwrap();
                Ok(())
            },
        );
        assert_eq!(result.unwrap_err().code, "config_revision_changed");
        let inspection = configuration.inspect().unwrap();
        assert_eq!(inspection.active, before);
        assert_ne!(inspection.file_revision, before.source_revision);
        let reloaded = configuration.reload(inspection.file_revision).unwrap();
        assert_eq!(
            reloaded.defaults.context.max_input_tokens.unwrap().get(),
            256
        );
    }

    #[test]
    fn cancelled_publication_preserves_the_active_file_and_cleans_staging() {
        let directory = private_directory();
        let configuration = crate::configuration::Configuration::open(directory.path()).unwrap();
        let before = configuration.snapshot().unwrap();
        let checks = std::sync::atomic::AtomicUsize::new(0);
        let result = configuration.update_guarded(
            None,
            SettingChange::SetContextMaxInputTokens {
                value: NonZeroU64::new(64).unwrap(),
            },
            || {
                if checks.fetch_add(1, std::sync::atomic::Ordering::Relaxed) == 0 {
                    return Ok(());
                }
                Err(Error::new(
                    ErrorKind::Unavailable,
                    "configuration_cancelled",
                ))
            },
        );
        assert_eq!(result.unwrap_err().code, "configuration_cancelled");
        assert_eq!(checks.load(std::sync::atomic::Ordering::Relaxed), 2);
        assert_eq!(configuration.snapshot().unwrap(), before);
        assert!(!directory.path().join("config.toml").exists());
        assert!(!std::fs::read_dir(directory.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".config-")
        }));
    }
}
