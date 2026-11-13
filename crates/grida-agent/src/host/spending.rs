//! GRIDA-SEC-006 / GRIDA-GG: provider — durable, shared task spending authority.
//!
//! This allocates user authority, not organization credits or provider prices.
//! Each partition is enforced by Gateway before paid dispatch. Unconfirmed
//! attempts retain their entire partition until an authoritative settlement.

use super::*;
use agent_kit_core::AttemptId;
use agent_kit_core::inference::{
    InferenceControl, InferenceFailure, InferenceRequest, InferenceRun, InputMeasurement,
    PreparedRequest,
};
use agent_kit_providers::{
    InputImageResolver, TransportFailure, TransportRequest, TransportResponse,
};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::Mutex as StdMutex;

const SCALE: u128 = 1_000_000_000_000_000_000;
const MAX_LEDGER_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ATTEMPTS: usize = 4096;
const SCHEMA: &str = "grida.agent.task-spending";
const STAGE_PREFIX: &str = ".task-spending-stage-";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Selection {
    owner: SessionId,
    task: Fingerprint,
    scope: Fingerprint,
    max_cost_mills: String,
    per_request_max_cost_mills: String,
}

impl Selection {
    pub(super) fn maximum(&self) -> &str {
        &self.max_cost_mills
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendingInspection {
    pub max_cost_mills: String,
    pub per_request_max_cost_mills: String,
    pub charged_mills: String,
    pub held_mills: String,
    pub remaining_mills: String,
    pub unsettled_attempts: usize,
}

/// Keep the runtime database's exclusive writer authority alive with this
/// store. All allocations in a host, including independently owned children,
/// serialize through one gate. No renderer receives the files or mutation API.
pub(super) struct Store {
    directory: PathBuf,
    _owner: Arc<SqliteStore>,
    gate: StdMutex<()>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Ledger {
    schema: String,
    version: u32,
    selection: Selection,
    #[serde(default)]
    blocked: bool,
    attempts: BTreeMap<AttemptId, Allocation>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Allocation {
    request: Fingerprint,
    ceiling_mills: String,
    charged_mills: Option<String>,
}

impl Store {
    pub(super) fn detached(owner: Arc<SqliteStore>) -> Self {
        Self {
            directory: PathBuf::new(),
            _owner: owner,
            gate: StdMutex::new(()),
        }
    }

    pub(super) fn new(directory: &Path, owner: Arc<SqliteStore>) -> Self {
        Self {
            directory: directory.join("task-spending"),
            _owner: owner,
            gate: StdMutex::new(()),
        }
    }

    pub(super) fn select(
        scope: Fingerprint,
        session: &SessionId,
        input: &ChangeId,
        max_cost_mills: &str,
        steps: u32,
    ) -> Result<Selection> {
        let maximum = amount(max_cost_mills)?;
        if steps == 0 || steps as usize > MAX_ATTEMPTS || maximum < u128::from(steps) {
            return Err(problem(
                ErrorKind::InvalidInput,
                "task_spending_limit_invalid",
            ));
        }
        Ok(Selection {
            owner: session.clone(),
            task: Fingerprint::of(&(SCHEMA, scope, session, input))?,
            scope,
            max_cost_mills: decimal(maximum),
            per_request_max_cost_mills: decimal(maximum / u128::from(steps)),
        })
    }

    /// Called only for a newly committed input while host admission is held.
    /// An accepted retry must inspect its existing record, never call this path.
    pub(super) fn publish_initial(&self, selection: &Selection) -> Result<()> {
        let _guard = self.gate.lock().map_err(|_| unavailable())?;
        self.prepare()?;
        private_directory(&self.owner_directory(&selection.owner)?, true)?;
        match self.read(selection)? {
            Some(ledger) if ledger.selection == *selection && ledger.attempts.is_empty() => {
                ledger.inspection()?;
            }
            Some(_) => {
                return Err(problem(
                    ErrorKind::Conflict,
                    "task_spending_selection_changed",
                ));
            }
            None => self.write(&Ledger {
                schema: SCHEMA.into(),
                version: 1,
                selection: selection.clone(),
                blocked: false,
                attempts: BTreeMap::new(),
            })?,
        }
        Ok(())
    }

    #[cfg(test)]
    fn capture(
        &self,
        scope: Fingerprint,
        session: &SessionId,
        input: &ChangeId,
        maximum: &str,
        steps: u32,
        create: bool,
    ) -> Result<Selection> {
        let selection = Self::select(scope, session, input, maximum, steps)?;
        if create {
            self.publish_initial(&selection)?;
        } else {
            self.inspect(&selection)?;
        }
        Ok(selection)
    }

    pub(super) fn inspect(&self, selection: &Selection) -> Result<SpendingInspection> {
        let _guard = self.gate.lock().map_err(|_| unavailable())?;
        self.prepare()?;
        self.load(selection)?.inspection()
    }

    fn reserve(
        &self,
        selection: &Selection,
        attempt: &AttemptId,
        request: Fingerprint,
    ) -> Result<String> {
        let _guard = self.gate.lock().map_err(|_| unavailable())?;
        self.prepare()?;
        let mut ledger = self.load(selection)?;
        // A reserved identity cannot dispatch again, even if the earlier
        // process disappeared before recording an HTTP receipt.
        if ledger.attempts.contains_key(attempt) {
            return Err(problem(
                ErrorKind::Uncertain,
                "task_spending_attempt_reserved",
            ));
        }
        if ledger.attempts.len() == MAX_ATTEMPTS {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "task_spending_attempt_limit",
            ));
        }
        let remaining = amount(&ledger.inspection()?.remaining_mills)?;
        let ceiling = amount(&selection.per_request_max_cost_mills)?.min(remaining);
        if ceiling == 0 {
            return Err(problem(ErrorKind::LimitExceeded, "task_spending_exhausted"));
        }
        let ceiling_mills = decimal(ceiling);
        ledger.attempts.insert(
            attempt.clone(),
            Allocation {
                request,
                ceiling_mills: ceiling_mills.clone(),
                charged_mills: None,
            },
        );
        self.write(&ledger)?;
        Ok(ceiling_mills)
    }

    fn settle(&self, selection: &Selection, attempt: &AttemptId, charged: &str) -> Result<()> {
        let charged_value = amount(charged)?;
        let _guard = self.gate.lock().map_err(|_| unavailable())?;
        self.prepare()?;
        let mut ledger = self.load(selection)?;
        let allocation = ledger.attempts.get_mut(attempt).ok_or_else(unavailable)?;
        if charged_value > amount(&allocation.ceiling_mills)? {
            ledger.blocked = true;
            self.write(&ledger)?;
            return Err(problem(
                ErrorKind::Uncertain,
                "task_spending_charge_above_ceiling",
            ));
        }
        if let Some(previous) = &allocation.charged_mills {
            if amount(previous)? == charged_value {
                return Ok(());
            }
            ledger.blocked = true;
            self.write(&ledger)?;
            return Err(problem(
                ErrorKind::Conflict,
                "task_spending_settlement_changed",
            ));
        }
        allocation.charged_mills = Some(decimal(charged_value));
        self.write(&ledger)
    }

    fn prepare(&self) -> Result<()> {
        if self.directory.as_os_str().is_empty() {
            return Err(problem(ErrorKind::Unsupported, "task_spending_unavailable"));
        }
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            crate::scratch::check_private_directory(
                self.directory.parent().ok_or_else(unavailable)?,
            )?;
            let mut builder = std::fs::DirBuilder::new();
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
            match builder.create(&self.directory) {
                Ok(()) => File::open(self.directory.parent().ok_or_else(unavailable)?)
                    .and_then(|file| file.sync_all())
                    .map_err(|_| unavailable())?,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(_) => return Err(unavailable()),
            }
            crate::scratch::check_private_directory(&self.directory)
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        Err(problem(
            ErrorKind::Unsupported,
            "task_spending_platform_unsupported",
        ))
    }

    fn path(&self, selection: &Selection) -> PathBuf {
        let name = selection.task.to_hex();
        self.owner_directory(&selection.owner)
            .expect("validated session identity")
            .join(format!("{name}.json"))
    }

    fn owner_directory(&self, session: &SessionId) -> Result<PathBuf> {
        let fingerprint = Fingerprint::of(&("task-spending-owner-v1", session))?;
        let name = fingerprint.to_hex();
        Ok(self.directory.join(name))
    }

    fn load(&self, selection: &Selection) -> Result<Ledger> {
        let ledger = self.read(selection)?.ok_or_else(unavailable)?;
        if ledger.selection != *selection {
            return Err(unavailable());
        }
        ledger.inspection()?;
        Ok(ledger)
    }

    fn read(&self, selection: &Selection) -> Result<Option<Ledger>> {
        let path = self.path(selection);
        if !private_directory(path.parent().ok_or_else(unavailable)?, false)? {
            return Ok(None);
        }
        self.read_path(&path)
    }

    fn read_path(&self, path: &Path) -> Result<Option<Ledger>> {
        let before = match std::fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(unavailable()),
        };
        private_file(&before)?;
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let mut file = options.open(path).map_err(|_| unavailable())?;
        let opened = file.metadata().map_err(|_| unavailable())?;
        private_file(&opened)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if before.ino() != opened.ino() || before.dev() != opened.dev() {
                return Err(unavailable());
            }
        }
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(MAX_LEDGER_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| unavailable())?;
        if bytes.len() as u64 > MAX_LEDGER_BYTES {
            return Err(unavailable());
        }
        let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
        if ledger.schema != SCHEMA || ledger.version != 1 || ledger.attempts.len() > MAX_ATTEMPTS {
            return Err(unavailable());
        }
        Ok(Some(ledger))
    }

    fn write(&self, ledger: &Ledger) -> Result<()> {
        if !ledger.blocked {
            ledger.inspection()?;
        }
        let bytes = serde_json::to_vec(ledger).map_err(|_| unavailable())?;
        if bytes.len() as u64 > MAX_LEDGER_BYTES {
            return Err(unavailable());
        }
        match std::fs::symlink_metadata(self.path(&ledger.selection)) {
            Ok(metadata) => private_file(&metadata)?,
            Err(error)
                if error.kind() == std::io::ErrorKind::NotFound && ledger.attempts.is_empty() => {}
            Err(_) => return Err(unavailable()),
        }
        let parent = self.owner_directory(&ledger.selection.owner)?;
        if !private_directory(&parent, false)? {
            return Err(unavailable());
        }
        let mut stage = tempfile::Builder::new()
            .prefix(STAGE_PREFIX)
            .tempfile_in(&parent)
            .map_err(|_| unavailable())?;
        stage
            .write_all(&bytes)
            .and_then(|_| stage.as_file().sync_all())
            .map_err(|_| unavailable())?;
        stage
            .persist(self.path(&ledger.selection))
            .map_err(|_| unavailable())?;
        File::open(parent)
            .and_then(|file| file.sync_all())
            .map_err(|_| unavailable())
    }

    pub(super) fn retire(&self, session: &SessionId) -> Result<()> {
        let _guard = self.gate.lock().map_err(|_| unavailable())?;
        if !private_directory(&self.directory, false)? {
            return Ok(());
        }
        let directory = self.owner_directory(session)?;
        if !private_directory(&directory, false)? {
            return Ok(());
        }
        let mut owned = Vec::new();
        for entry in std::fs::read_dir(&directory).map_err(|_| unavailable())? {
            let path = entry.map_err(|_| unavailable())?.path();
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(|name| name.strip_prefix(STAGE_PREFIX))
                .is_some_and(|suffix| {
                    suffix.len() == 6 && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric())
                })
            {
                private_file(&std::fs::symlink_metadata(&path).map_err(|_| unavailable())?)?;
                owned.push(path);
                continue;
            }
            let ledger = self.read_path(&path)?.ok_or_else(unavailable)?;
            if &ledger.selection.owner != session || self.path(&ledger.selection) != path {
                return Err(unavailable());
            }
            owned.push(path);
        }
        // Validate the whole owner directory before deleting any entry.
        for path in owned {
            std::fs::remove_file(path).map_err(|_| unavailable())?;
        }
        std::fs::remove_dir(directory).map_err(|_| unavailable())?;
        File::open(&self.directory)
            .and_then(|file| file.sync_all())
            .map_err(|_| unavailable())
    }
}

fn private_directory(path: &Path, create: bool) -> Result<bool> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        if let Err(error) = std::fs::symlink_metadata(path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(unavailable());
            }
            if !create {
                return Ok(false);
            }
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new()
                .mode(0o700)
                .create(path)
                .map_err(|_| unavailable())?;
            File::open(path.parent().ok_or_else(unavailable)?)
                .and_then(|file| file.sync_all())
                .map_err(|_| unavailable())?;
        }
        crate::scratch::check_private_directory(path)?;
        Ok(true)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (path, create);
        Err(unavailable())
    }
}

impl Host {
    pub(super) fn spending_provider(
        &self,
        execution: &Execution,
        selection: Option<&Selection>,
    ) -> Result<Arc<dyn Provider>> {
        let Some(selection) = selection else {
            return Ok(execution.provider.clone());
        };
        Ok(Arc::new(SpendingProvider {
            base: execution.provider.clone(),
            profile: execution
                .spending_profile
                .clone()
                .ok_or_else(|| problem(ErrorKind::Unsupported, "goal_spending_unavailable"))?,
            connection: self
                .supervised_gateway()
                .cloned()
                .ok_or_else(|| problem(ErrorKind::Unsupported, "goal_spending_unavailable"))?,
            store: self.spending.clone(),
            selection: selection.clone(),
        }))
    }

    /// A trusted supervisor's explicit billing refresh can resolve an old
    /// hold. The caller has already matched its retained request identity.
    pub(crate) async fn retain_spending_settlement(
        &self,
        session: SessionId,
        turn: TurnId,
        attempt: AttemptId,
        billing: &crate::gg::GatewayBillingRead,
    ) -> Result<()> {
        let crate::gg::GatewayBillingRead::Settled { charged_mills } = billing else {
            return Ok(());
        };
        let inputs = self.store.turn_submissions(session, turn).await?;
        let [input] = inputs.as_slice() else {
            return Ok(());
        };
        if !is_stored_input(&input.payload) {
            return Ok(());
        }
        let stored: StoredPrompt = decode_input(input)?;
        let Some(selection) = stored.spending else {
            return Ok(());
        };
        let owner = self.supervised_gateway().ok_or_else(unavailable)?;
        owner.validate()?;
        if selection.scope != owner.scope {
            return Err(unavailable());
        }
        self.spending.settle(&selection, &attempt, charged_mills)
    }
}

impl Ledger {
    fn inspection(&self) -> Result<SpendingInspection> {
        if self.blocked {
            return Err(unavailable());
        }
        let maximum = amount(&self.selection.max_cost_mills)?;
        let partition = amount(&self.selection.per_request_max_cost_mills)?;
        if partition == 0 || partition > maximum {
            return Err(unavailable());
        }
        let mut charged = 0u128;
        let mut held = 0u128;
        let mut uncertain = 0;
        for allocation in self.attempts.values() {
            let ceiling = amount(&allocation.ceiling_mills)?;
            if ceiling == 0 || ceiling > partition {
                return Err(unavailable());
            }
            if let Some(value) = &allocation.charged_mills {
                let value = amount(value)?;
                if value > ceiling {
                    return Err(unavailable());
                }
                charged = charged.checked_add(value).ok_or_else(unavailable)?;
            } else {
                held = held.checked_add(ceiling).ok_or_else(unavailable)?;
                uncertain += 1;
            }
        }
        let remaining = maximum
            .checked_sub(charged.checked_add(held).ok_or_else(unavailable)?)
            .ok_or_else(unavailable)?;
        Ok(SpendingInspection {
            max_cost_mills: decimal(maximum),
            per_request_max_cost_mills: decimal(partition),
            charged_mills: decimal(charged),
            held_mills: decimal(held),
            remaining_mills: decimal(remaining),
            unsettled_attempts: uncertain,
        })
    }
}

fn private_file(metadata: &std::fs::Metadata) -> Result<()> {
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(unavailable());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0
            || metadata.nlink() != 1
            || metadata.uid() != rustix::process::geteuid().as_raw()
        {
            return Err(unavailable());
        }
    }
    Ok(())
}

fn amount(value: &str) -> Result<u128> {
    let mut parts = value.split('.');
    let whole = parts.next().unwrap_or("");
    let fractional = parts.next().unwrap_or("");
    if parts.next().is_some()
        || whole.is_empty()
        || whole.len() > 18
        || (whole.len() > 1 && whole.starts_with('0'))
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || fractional.len() > 18
        || !fractional.bytes().all(|byte| byte.is_ascii_digit())
        || (value.contains('.') && fractional.is_empty())
    {
        return Err(problem(
            ErrorKind::InvalidInput,
            "task_spending_amount_invalid",
        ));
    }
    let whole = whole.parse::<u128>().map_err(|_| unavailable())? * SCALE;
    let fraction = if fractional.is_empty() {
        0
    } else {
        fractional.parse::<u128>().map_err(|_| unavailable())?
            * 10u128.pow(18 - fractional.len() as u32)
    };
    Ok(whole + fraction)
}

fn decimal(value: u128) -> String {
    let whole = value / SCALE;
    let fraction = value % SCALE;
    if fraction == 0 {
        whole.to_string()
    } else {
        format!(
            "{whole}.{}",
            format!("{fraction:018}").trim_end_matches('0')
        )
    }
}

fn unavailable() -> Error {
    problem(ErrorKind::Uncertain, "task_spending_unavailable")
}

/// The existing GG profile is rebuilt with only an attempt-bound transport.
/// It prepares the identical provider request and retains the adapter's normal
/// protocol, usage, receipt, cancellation and replay checks.
pub(super) struct ProviderProfile {
    pub binding: ProviderBinding,
    pub model: ModelId,
    pub profile: ModelProfile,
    pub images: Option<Arc<InputImageResolver>>,
}

pub(super) struct SpendingProvider {
    pub base: Arc<dyn Provider>,
    pub profile: Arc<ProviderProfile>,
    pub connection: Arc<crate::gg::SupervisedGg>,
    pub store: Arc<Store>,
    pub selection: Selection,
}

impl Provider for SpendingProvider {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        self.base.capabilities(model)
    }
    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        self.base.prepare(request)
    }
    fn measure_input(&self, request: &PreparedRequest) -> Result<InputMeasurement> {
        self.base.measure_input(request)
    }
    fn measure_input_async<'a>(
        &'a self,
        request: &'a PreparedRequest,
        control: RequestControl,
    ) -> BoxFuture<'a, std::result::Result<InputMeasurement, InferenceFailure>> {
        self.base.measure_input_async(request, control)
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        if self.selection.scope != self.connection.scope {
            return Err(unavailable());
        }
        self.connection.validate()?;
        let ceiling =
            self.store
                .reserve(&self.selection, &control.attempt, request.fingerprint())?;
        let transport = Arc::new(CappedTransport {
            connection: self.connection.clone(),
            ceiling,
            store: self.store.clone(),
            selection: self.selection.clone(),
            attempt: control.attempt.clone(),
            cancellation: control.cancellation.clone(),
        });
        let provider = OpenAiCompatible::with_image_resolver(
            self.profile.binding.clone(),
            BTreeMap::from([(self.profile.model.clone(), self.profile.profile.clone())]),
            transport,
            PROVIDER_LIMITS,
            self.profile.images.clone(),
        )?
        .with_admission_rate_limit_evidence();
        match provider.start(request, control.clone()) {
            Ok(run) => Ok(run),
            Err(error) => {
                // Provider::start guarantees that its error precedes dispatch.
                self.store.settle(&self.selection, &control.attempt, "0")?;
                Err(error)
            }
        }
    }
}

struct CappedTransport {
    connection: Arc<crate::gg::SupervisedGg>,
    ceiling: String,
    store: Arc<Store>,
    selection: Selection,
    attempt: AttemptId,
    cancellation: agent_kit_core::CancellationToken,
}

impl StreamingTransport for CappedTransport {
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            let result = self
                .connection
                .send_capped(request, control, &self.ceiling)
                .await;
            if matches!(result, Err(TransportFailure::Unavailable)) {
                // This transport disposition proves that HTTP never started.
                // Interrupted or invalid responses retain the whole partition.
                let _ = self.store.settle(&self.selection, &self.attempt, "0");
            }
            result
        })
    }
    fn terminal_receipt_decoder(&self) -> Option<Arc<agent_kit_providers::TerminalReceiptDecoder>> {
        let decode = self.connection.terminal_receipt_decoder()?;
        let scope = self.connection.scope;
        let store = self.store.clone();
        let selection = self.selection.clone();
        let attempt = self.attempt.clone();
        let cancellation = self.cancellation.clone();
        Some(Arc::new(move |request, frame| {
            let receipt = decode(request, frame)?;
            if let Some(crate::gg::GatewayBillingRead::Settled { charged_mills }) =
                crate::gg::spending_receipt(scope, &receipt)
                && store.settle(&selection, &attempt, &charged_mills).is_err()
            {
                cancellation.cancel();
            }
            Some(receipt)
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, Arc<Store>, Selection) {
        let directory = tempfile::tempdir().unwrap();
        let state = directory.path().join("state");
        prepare_state_dir(&state).unwrap();
        let state = state.canonicalize().unwrap();
        let owner = Arc::new(SqliteStore::open(state.join(DATABASE_FILE)).unwrap());
        let store = Arc::new(Store::new(&state, owner));
        let selection = store
            .capture(
                Fingerprint::of(&"scope").unwrap(),
                &SessionId::new("parent").unwrap(),
                &ChangeId::new("goal").unwrap(),
                "10",
                4,
                true,
            )
            .unwrap();
        (directory, store, selection)
    }

    #[test]
    fn exact_partitions_share_one_ceiling_and_unknown_attempts_keep_their_holds() {
        let (_directory, store, selection) = setup();
        let fingerprint = Fingerprint::of(&"request").unwrap();
        for id in ["parent-1", "child-1", "parent-2", "child-2"] {
            assert_eq!(
                store
                    .reserve(&selection, &AttemptId::new(id).unwrap(), fingerprint)
                    .unwrap(),
                "2.5"
            );
        }
        assert!(
            store
                .reserve(&selection, &AttemptId::new("extra").unwrap(), fingerprint)
                .is_err()
        );
        let view = store.inspect(&selection).unwrap();
        assert_eq!(view.held_mills, "10");
        assert_eq!(view.remaining_mills, "0");
        assert_eq!(view.unsettled_attempts, 4);
        store
            .settle(&selection, &AttemptId::new("child-1").unwrap(), "0.125")
            .unwrap();
        store
            .settle(&selection, &AttemptId::new("child-1").unwrap(), "0.1250")
            .unwrap();
        let view = store.inspect(&selection).unwrap();
        assert_eq!(view.charged_mills, "0.125");
        assert_eq!(view.remaining_mills, "2.375");
        assert_eq!(
            store
                .reserve(&selection, &AttemptId::new("last").unwrap(), fingerprint)
                .unwrap(),
            "2.375"
        );
    }

    #[test]
    fn reopen_retains_authority_and_cannot_repeat_a_reserved_attempt() {
        let (_directory, store, selection) = setup();
        let attempt = AttemptId::new("uncertain").unwrap();
        store
            .reserve(&selection, &attempt, Fingerprint::of(&"request").unwrap())
            .unwrap();
        let reopened = Store::new(store.directory.parent().unwrap(), store._owner.clone());
        assert_eq!(reopened.inspect(&selection).unwrap().held_mills, "2.5");
        assert!(
            reopened
                .reserve(&selection, &attempt, Fingerprint::of(&"request").unwrap())
                .is_err()
        );
        assert!(
            reopened
                .capture(
                    selection.scope,
                    &SessionId::new("parent").unwrap(),
                    &ChangeId::new("goal").unwrap(),
                    "20",
                    4,
                    false
                )
                .is_err()
        );
        assert!(
            reopened
                .settle(&selection, &attempt, "2.500000000000000001")
                .is_err()
        );
        assert!(reopened.inspect(&selection).is_err());
    }

    #[test]
    fn money_is_exact_and_malformed_or_missing_authority_fails_closed() {
        assert_eq!(
            decimal(amount("999999999999999999.999999999999999999").unwrap()),
            "999999999999999999.999999999999999999"
        );
        for bad in [
            "-1",
            "1e3",
            "NaN",
            "01",
            "1.",
            ".5",
            "0.0000000000000000001",
            "1000000000000000000",
        ] {
            assert!(amount(bad).is_err(), "{bad}");
        }
        let (_directory, store, selection) = setup();
        store
            .reserve(
                &selection,
                &AttemptId::new("before-loss").unwrap(),
                Fingerprint::of(&"request").unwrap(),
            )
            .unwrap();
        let before_loss = store.load(&selection).unwrap();
        std::fs::write(store.path(&selection), b"broken").unwrap();
        assert!(store.inspect(&selection).is_err());
        std::fs::remove_file(store.path(&selection)).unwrap();
        assert!(store.inspect(&selection).is_err());
        assert!(store.write(&before_loss).is_err());
        assert!(
            store
                .capture(
                    selection.scope,
                    &SessionId::new("parent").unwrap(),
                    &ChangeId::new("goal").unwrap(),
                    "10",
                    4,
                    false
                )
                .is_err()
        );
    }

    #[test]
    fn retirement_removes_only_the_parent_owned_authority_without_refunding_other_tasks() {
        let (_directory, store, selection) = setup();
        let other = store
            .capture(
                selection.scope,
                &SessionId::new("other").unwrap(),
                &ChangeId::new("goal").unwrap(),
                "5",
                2,
                true,
            )
            .unwrap();
        let attempt = AttemptId::new("held-review").unwrap();
        store
            .reserve(&selection, &attempt, Fingerprint::of(&"request").unwrap())
            .unwrap();
        let mut interrupted = tempfile::Builder::new()
            .prefix(STAGE_PREFIX)
            .tempfile_in(store.owner_directory(&selection.owner).unwrap())
            .unwrap();
        interrupted.write_all(b"{\"partial").unwrap();
        let _interrupted = interrupted.keep().unwrap();
        store.retire(&SessionId::new("child").unwrap()).unwrap();
        assert_eq!(store.inspect(&selection).unwrap().held_mills, "2.5");
        store.retire(&selection.owner).unwrap();
        store.retire(&selection.owner).unwrap();
        assert!(store.inspect(&selection).is_err());
        assert_eq!(store.inspect(&other).unwrap().remaining_mills, "5");
    }
}
