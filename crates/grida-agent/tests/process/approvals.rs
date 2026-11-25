use super::lifecycle::{session_snapshot, terminate_shared_server};
use super::*;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use tokio::process::{ChildStdin, ChildStdout};

#[path = "approvals/confinement.rs"]
mod confinement;
#[path = "approvals/deployments.rs"]
mod deployments;
#[path = "approvals/escalation.rs"]
mod escalation;
#[path = "approvals/reviewer.rs"]
mod reviewer;

const LIST: &str = "co.grida/session/approvals";
const ANSWER: &str = "co.grida/session/answer-approval";

/// Current authorization evidence follows any replayed private reviewer conversation.
fn current_review_message(wire: &Value) -> &Value {
    wire["messages"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|message| message["role"] == "user")
        .unwrap()
}

pub(super) struct Fixture {
    _base: TempDir,
    pub(super) state: PathBuf,
    pub(super) primary: PathBuf,
    pub(super) extra: PathBuf,
    pub(super) profile: PathBuf,
    scoped_approvals: bool,
}

/// Fixture directories outside the system's shared temporary directory, which
/// a read-write command may write: the host keeps a command temporary parent
/// there, and fixtures must not reach each other through it. Linux's default
/// temporary directory is that shared directory.
fn outside_shared_temporary() -> TempDir {
    let default = std::env::temp_dir().canonicalize().unwrap();
    let shared = Path::new("/tmp").canonicalize().ok();
    let root = if shared.is_some_and(|shared| default.starts_with(shared)) {
        Path::new("/var/tmp").canonicalize().unwrap()
    } else {
        default
    };
    tempfile::tempdir_in(root).unwrap()
}

impl Fixture {
    pub(super) fn new(command: bool) -> Self {
        let base = outside_shared_temporary();
        let root = base.path().canonicalize().unwrap();
        let state = root.join("state");
        let primary = root.join("primary");
        let extra = root.join("extra");
        let temporary = root.join("temporary");
        let private = root.join("private");
        for directory in [&primary, &extra, &temporary, &private] {
            fs::create_dir(directory).unwrap();
            fs::set_permissions(directory, fs::Permissions::from_mode(0o700)).unwrap();
        }
        let profile = private.join("permission.json");
        let mut options = json!({
            "version":1,"workspace":"project","revision":"owner-selection","primary":"primary",
            "directories":[
                {"id":"primary","name":"Primary","path":primary,"generation":"first","read":"allow"},
                {"id":"extra","name":"Extra","path":extra,"generation":"first","read":"ask"}
            ],
        });
        if command {
            options["directories"][1]["commandReadWrite"] = json!("ask");
            let helper = tool_identity("GRIDA_AGENT_TEST_SANDBOX_HELPER");
            #[cfg(target_os = "macos")]
            let bubblewrap = Value::Null;
            #[cfg(target_os = "linux")]
            let bubblewrap = tool_identity("AGENT_KIT_TEST_BWRAP");
            let runtime: Vec<_> = [
                "/bin",
                "/usr/bin",
                "/usr/lib",
                "/usr/lib64",
                "/lib",
                "/lib64",
                "/System/Library",
                // macOS /bin/sh reads its selected shell here.
                "/private/var/select",
            ]
            .into_iter()
            .filter(|path| Path::new(path).is_dir())
            .collect();
            options["command"] = json!({
                "helper":helper,"bubblewrap":bubblewrap,"runtimePaths":runtime,"temporaryParent":temporary,
            });
        }
        fs::write(&profile, serde_json::to_vec(&options).unwrap()).unwrap();
        fs::set_permissions(&profile, fs::Permissions::from_mode(0o600)).unwrap();
        Self {
            _base: base,
            state,
            primary,
            extra,
            profile,
            scoped_approvals: false,
        }
    }

    pub(super) fn process(&self, endpoint: &str, mode: &str) -> Command {
        let mut process = executable();
        process.arg(mode);
        configured(&mut process, &self.state, endpoint);
        process.env("GRIDA_HOME", self.profile.with_file_name("grida-home"));
        process.arg("--permission-profile").arg(&self.profile);
        if self.scoped_approvals {
            process.arg("--allow-scoped-approvals");
        }
        process
    }

    async fn run(&self, endpoint: &str, cwd: &Path, code: i32) -> Vec<Value> {
        self.run_with_cwd(endpoint, Some(cwd), code).await
    }

    async fn run_with_cwd(&self, endpoint: &str, cwd: Option<&Path>, code: i32) -> Vec<Value> {
        let mut process = self.process(endpoint, "run");
        if let Some(cwd) = cwd {
            process.arg("--cwd").arg(cwd);
        }
        let output = timeout(
            WAIT,
            process
                .args(["--prompt", "Use the selected directory"])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(
            output.status.code(),
            Some(code),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        records(&output.stdout)
    }
}

fn tool_identity(variable: &str) -> Value {
    let path = PathBuf::from(std::env::var_os(variable).expect(variable))
        .canonicalize()
        .unwrap();
    let sha256: [u8; 32] = Sha256::digest(fs::read(&path).unwrap()).into();
    json!({"path":path,"sha256":sha256})
}

fn initialize() -> Value {
    let mut request = extension_initialize();
    let meta = request["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap();
    for key in [LIST, ANSWER, "co.grida/session/reconsider-denial"] {
        meta.insert(key.into(), 1.into());
    }
    request
}

pub(super) struct Stdio {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    id: u64,
}

impl Stdio {
    fn start(fixture: &Fixture, endpoint: &str) -> Self {
        let child = fixture
            .process(endpoint, "serve")
            .arg("--stdio")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        Self::from_child(child)
    }

    pub(super) fn from_child(mut child: Child) -> Self {
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Self {
            child,
            stdin,
            stdout,
            id: 0,
        }
    }

    pub(super) async fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.send(method, params).await;
        loop {
            let response = self.read_reply().await;
            if response["id"] == id {
                return response;
            }
        }
    }

    pub(super) async fn send(&mut self, method: &str, params: Value) -> u64 {
        self.id += 1;
        let id = self.id;
        self.write_frame(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await;
        id
    }

    pub(super) async fn respond(&mut self, id: &Value, result: Value) {
        self.write_frame(json!({"jsonrpc":"2.0","id":id,"result":result}))
            .await;
    }

    pub(super) async fn reject(&mut self, id: &Value, message: &str) {
        self.write_frame(
            json!({"jsonrpc":"2.0","id":id,"error":{"code":-32603,"message":message}}),
        )
        .await;
    }

    async fn write_frame(&mut self, frame: Value) {
        timeout(WAIT, self.stdin.write_all(format!("{frame}\n").as_bytes()))
            .await
            .unwrap()
            .unwrap();
    }

    pub(super) async fn read_reply(&mut self) -> Value {
        timeout(WAIT, async {
            loop {
                let response = self.read_frame().await;
                if !response["id"].is_null() {
                    return response;
                }
            }
        })
        .await
        .unwrap()
    }

    pub(super) async fn read_frame(&mut self) -> Value {
        let mut line = String::new();
        if timeout(WAIT, self.stdout.read_line(&mut line))
            .await
            .unwrap()
            .unwrap()
            == 0
        {
            use tokio::io::AsyncReadExt;
            let mut error = String::new();
            if let Some(stderr) = &mut self.child.stderr {
                timeout(WAIT, stderr.take(4096).read_to_string(&mut error))
                    .await
                    .unwrap()
                    .unwrap();
            }
            panic!("native host closed stdio: {error}");
        }
        serde_json::from_str(&line).unwrap()
    }

    pub(super) async fn finish(self) -> std::process::Output {
        let Self {
            child,
            stdin,
            stdout,
            ..
        } = self;
        drop(stdin);
        let output = finish_child(child).await;
        drop(stdout);
        output
    }

    /// End the host without letting it shut down, as a crash would.
    pub(super) async fn kill(mut self) {
        self.child.kill().await.unwrap();
    }

    pub(super) async fn close(self) {
        let output = self.finish().await;
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

async fn approve(
    fixture: &Fixture,
    endpoint: &str,
    session: &str,
    turn: &str,
    wait: &str,
) -> Stdio {
    let mut owner = Stdio::start(fixture, endpoint);
    let ready = owner.request("initialize", initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][ANSWER], 1);
    let loaded = owner
        .request(
            "session/load",
            json!({
                "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
            }),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let listed = owner
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    assert_eq!(listed["result"]["approvals"][0]["waitId"], wait);
    let snapshot = owner
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let answer = json!({
        "sessionId":session,"turnId":turn,"waitId":wait,"requestId":"approval-answer",
        "expectedSessionRevision":snapshot["result"]["sessionRevision"],
        "expectedControlRevision":listed["result"]["controlRevision"],"decision":"approve_once",
    });
    let first = owner
        .request("_co.grida/session/answer-approval", answer.clone())
        .await;
    assert!(first.get("error").is_none(), "{first}");
    let retry = owner
        .request("_co.grida/session/answer-approval", answer)
        .await;
    assert_eq!(first["result"], retry["result"], "{retry}");
    owner
}

async fn settle(owner: &mut Stdio, session: &str) {
    timeout(WAIT, async {
        loop {
            let snapshot = owner
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if snapshot["result"]["current"].is_null() {
                assert_eq!(
                    snapshot["result"]["latest"]["status"], "succeeded",
                    "{snapshot}"
                );
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn durable_headless_approval_accepts_only_the_private_reviewer() {
    let fixture = Fixture::new(false);
    fs::write(fixture.extra.join("note"), "approved fixture text").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"directory":"extra","path":"note"}"#),
        Reply::Finished("Read complete."),
    ])
    .await;
    let output = fixture.run(&endpoint.url, &fixture.primary, 6).await;
    assert_eq!(output[1]["disposition"], "input_required");
    let session = output[0]["session_id"].as_str().unwrap();
    let turn = output[0]["turn_id"].as_str().unwrap();
    let wait = output[1]["approvals"][0]["waitId"].as_str().unwrap();
    assert_eq!(output[1]["approvals"][0]["request"]["directory"], "extra");
    assert!(
        !endpoint.request().await["tools"]
            .as_array()
            .unwrap()
            .is_empty()
    );

    let (child, url) = shared_server(&fixture.state, &endpoint.url).await;
    let mut observer = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let ready = ws_rpc(&mut observer, 1, "initialize", initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][LIST], 1);
    assert!(ready["result"]["agentCapabilities"]["_meta"][ANSWER].is_null());
    assert!(
        ready["result"]["agentCapabilities"]["_meta"]["co.grida/session/reconsider-denial"]
            .is_null()
    );
    let loaded = ws_rpc(
        &mut observer,
        2,
        "session/load",
        json!({
            "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
        }),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let unauthorized = ws_rpc(
        &mut observer,
        30,
        "_co.grida/session/reconsider-denial",
        json!({"sessionId":session,"turnId":turn,"reviewId":"untrusted-control"}),
    )
    .await;
    assert_eq!(
        unauthorized["error"]["data"], "approval_reviewer_required",
        "{unauthorized}"
    );
    let listed = ws_rpc(
        &mut observer,
        3,
        "_co.grida/session/approvals",
        json!({"sessionId":session,"turnId":turn}),
    )
    .await;
    let snapshot = session_snapshot(&mut observer, session).await;
    let denied = ws_rpc(
        &mut observer,
        4,
        "_co.grida/session/answer-approval",
        json!({
            "sessionId":session,"turnId":turn,"waitId":wait,"requestId":"observer-approval",
            "expectedSessionRevision":snapshot["sessionRevision"],
            "expectedControlRevision":listed["result"]["controlRevision"],"decision":"approve_once",
        }),
    )
    .await;
    assert!(
        denied["error"]
            .to_string()
            .contains("approval_reviewer_required"),
        "{denied}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    drop(observer);
    terminate_shared_server(child).await;

    let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains("approved fixture text")
    );
    settle(&mut owner, session).await;
    owner.close().await;
    endpoint.done().await;
}

fn external_read_fixture() -> Fixture {
    let mut fixture = Fixture::new(false);
    fixture.scoped_approvals = true;
    fixture
}

fn external_read(path: &Path) -> Reply {
    let args = json!({"directory":"external-file","path":path.strip_prefix("/").unwrap()});
    Reply::Tool("read_file", Box::leak(args.to_string().into_boxed_str()))
}

#[tokio::test]
async fn external_file_approval_after_restart_checks_the_same_file_version() {
    for replace in [false, true] {
        let fixture = external_read_fixture();
        let outside = fixture.primary.parent().unwrap().join("outside.txt");
        fs::write(&outside, "approved external reference").unwrap();
        let relative = outside.strip_prefix("/").unwrap();
        let mut endpoint =
            Endpoint::start(vec![external_read(&outside), Reply::Finished("Done.")]).await;
        let output = fixture.run(&endpoint.url, &fixture.primary, 6).await;
        let approval = &output[1]["approvals"][0];
        assert_eq!(approval["request"]["root"], "/");
        assert_eq!(approval["request"]["directory"], "external-file");
        assert_eq!(
            approval["request"]["effect"]["relative_path"],
            json!(relative)
        );
        let session = output[0]["session_id"].as_str().unwrap();
        let turn = output[0]["turn_id"].as_str().unwrap();
        let wait = approval["waitId"].as_str().unwrap();
        endpoint.request().await;
        if replace {
            let replacement = outside.with_extension("new");
            fs::write(&replacement, "substituted external reference").unwrap();
            fs::rename(replacement, &outside).unwrap();
        }
        let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
        let continuation = endpoint.request().await["messages"].to_string();
        assert_eq!(
            continuation.contains("approved external reference"),
            !replace,
            "{continuation}"
        );
        assert_eq!(
            continuation.contains("permission_action_changed"),
            replace,
            "{continuation}"
        );
        assert!(!continuation.contains("substituted external reference"));
        settle(&mut owner, session).await;
        owner.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
async fn external_file_approval_leaves_a_sibling_read_waiting_for_its_own_decision() {
    let fixture = external_read_fixture();
    let directory = fixture.primary.parent().unwrap();
    let first = directory.join("a.txt");
    let second = directory.join("b.txt");
    fs::write(&first, "reference A contents").unwrap();
    fs::write(&second, "reference B contents").unwrap();
    let mut endpoint = Endpoint::start(vec![
        external_read(&first),
        external_read(&second),
        Reply::Finished("Done."),
    ])
    .await;
    let output = fixture.run(&endpoint.url, &fixture.primary, 6).await;
    let session = output[0]["session_id"].as_str().unwrap();
    let turn = output[0]["turn_id"].as_str().unwrap();
    let first_wait = output[1]["approvals"][0]["waitId"].as_str().unwrap();
    endpoint.request().await;
    let mut owner = approve(&fixture, &endpoint.url, session, turn, first_wait).await;
    let continued = endpoint.request().await["messages"].to_string();
    assert!(continued.contains("reference A contents"));
    let second_pending = timeout(WAIT, async {
        loop {
            let view = owner
                .request(
                    "_co.grida/session/approvals",
                    json!({"sessionId":session,"turnId":turn}),
                )
                .await;
            if view["result"]["approvals"][0]["request"]["effect"]["relative_path"]
                == json!(second.strip_prefix("/").unwrap())
            {
                break view["result"].clone();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let next_wait = second_pending["approvals"][0]["waitId"].as_str().unwrap();
    assert_ne!(first_wait, next_wait);
    let state = owner
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let declined = owner.request("_co.grida/session/answer-approval", json!({
        "sessionId":session,"turnId":turn,"waitId":next_wait,"decision":"decline","requestId":"decline-sibling",
        "expectedSessionRevision":state["result"]["sessionRevision"],"expectedControlRevision":second_pending["controlRevision"],
    })).await;
    assert!(declined.get("error").is_none(), "{declined}");
    let messages = endpoint.request().await["messages"].to_string();
    assert!(messages.contains("permission_declined"));
    assert!(!messages.contains("reference B contents"));
    settle(&mut owner, session).await;
    owner.close().await;
    endpoint.done().await;
}

const HOST_SETTINGS: &str = "schema_version = 1\n# protected host settings\n";

fn seed_host_settings(fixture: &Fixture) -> PathBuf {
    let home = fixture.profile.with_file_name("grida-home");
    fs::create_dir(&home).unwrap();
    fs::set_permissions(&home, fs::Permissions::from_mode(0o700)).unwrap();
    let config = home.join("config.toml");
    fs::write(&config, HOST_SETTINGS).unwrap();
    fs::set_permissions(&config, fs::Permissions::from_mode(0o600)).unwrap();
    config
}

#[tokio::test]
async fn removed_settings_directory_cannot_read_write_or_edit_global_config() {
    let fixture = Fixture::new(false);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["write"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let settings = seed_host_settings(&fixture);
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"directory":"agent-settings","path":"config.toml"}"#),
        Reply::Tool(
            "write_file",
            r#"{"directory":"agent-settings","path":"config.toml","content":"schema_version = 1\n"}"#,
        ),
        Reply::Tool(
            "edit_file",
            r#"{"directory":"agent-settings","path":"config.toml","old_string":"schema_version = 1","new_string":"schema_version = 2"}"#,
        ),
        Reply::Tool("write_file", r#"{"path":"note.txt","content":"project"}"#),
        Reply::Tool(
            "edit_file",
            r#"{"path":"note.txt","old_string":"project","new_string":"revised"}"#,
        ),
        Reply::Finished("Updated the project note."),
    ])
    .await;
    let output = fixture.run(&endpoint.url, &fixture.primary, 0).await;
    assert!(
        output
            .iter()
            .all(|record| record.get("approvals").is_none())
    );
    let offered = endpoint.request().await;
    assert!(
        !offered["tools"].to_string().contains("agent-settings"),
        "{offered}"
    );
    for _ in 0..3 {
        let result = crate::full_access::last_tool(&endpoint.request().await);
        assert_eq!(result["status"], "failed", "{result}");
        assert!(
            !result.to_string().contains("protected host settings"),
            "{result}"
        );
    }
    for _ in 0..2 {
        let result = crate::full_access::last_tool(&endpoint.request().await);
        assert_eq!(result["status"], "succeeded", "{result}");
    }
    assert_eq!(
        fs::read_to_string(fixture.primary.join("note.txt")).unwrap(),
        "revised"
    );
    assert_eq!(fs::read_to_string(settings).unwrap(), HOST_SETTINGS);
    endpoint.done().await;
}

#[tokio::test]
async fn headless_profile_defaults_to_primary_and_scopes_named_reads() {
    let fixture = Fixture::new(false);
    let membership_only = fixture.primary.with_file_name("membership-only");
    fs::create_dir(&membership_only).unwrap();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][1]["read"] = json!("allow");
    profile["directories"].as_array_mut().unwrap().push(json!({
        "id":"membership-only","name":"Membership only","path":membership_only,"generation":"first"
    }));
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    for (root, text) in [
        (&fixture.primary, "primary fixture content"),
        (&fixture.extra, "secondary fixture content"),
        (&membership_only, "ungranted fixture content"),
    ] {
        fs::write(root.join("same.txt"), text).unwrap();
    }

    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"path":"same.txt"}"#),
        Reply::Tool("read_file", r#"{"directory":"extra","path":"same.txt"}"#),
        Reply::Tool(
            "read_file",
            r#"{"directory":"membership-only","path":"same.txt"}"#,
        ),
        Reply::Finished("Reads checked."),
    ])
    .await;
    let output = fixture.run_with_cwd(&endpoint.url, None, 0).await;
    assert_eq!(output[1]["disposition"], "succeeded");
    let tools = endpoint.request().await["tools"].clone();
    let names: Vec<_> = tools
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["function"]["name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"read_file"));
    assert!(names.contains(&"list_files"));
    assert!(names.contains(&"search_text"));
    assert!(!names.contains(&"exec_command"));
    assert!(!names.contains(&"write_stdin"));

    let primary = endpoint.request().await["messages"].to_string();
    assert!(primary.contains("primary fixture content"));
    assert!(!primary.contains("secondary fixture content"));
    let secondary = endpoint.request().await["messages"].to_string();
    assert!(secondary.contains("secondary fixture content"));
    let denied = endpoint.request().await["messages"].to_string();
    assert!(denied.contains("permission_denied"), "{denied}");
    assert!(!denied.contains("ungranted fixture content"));
    endpoint.done().await;
}

#[tokio::test]
async fn headless_run_still_requires_cwd_without_a_profile() {
    let fixture = Fixture::new(false);
    let mut process = executable();
    process.arg("run").args(["--prompt", "No selected root"]);
    configured(&mut process, &fixture.state, "http://127.0.0.1:1/v1");
    let output = timeout(WAIT, process.output()).await.unwrap().unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("--cwd"));
    assert!(!fixture.state.exists());
}

#[tokio::test]
async fn changed_secondary_rule_cannot_resume_a_retained_read() {
    let fixture = Fixture::new(false);
    fs::write(fixture.extra.join("note"), "only under a current grant").unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Tool(
        "read_file",
        r#"{"directory":"extra","path":"note"}"#,
    )])
    .await;
    let output = fixture.run_with_cwd(&endpoint.url, None, 6).await;
    assert_eq!(output[1]["disposition"], "input_required");
    let session = output[0]["session_id"].as_str().unwrap();
    endpoint.request().await;

    let mut before = Stdio::start(&fixture, &endpoint.url);
    before.request("initialize", initialize()).await;
    let load = json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[]});
    let loaded = before.request("session/load", load.clone()).await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let current = before
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let paused = before
        .request(
            "_co.grida/session/pause",
            super::lifecycle::task_basis(&current["result"], session, "pause-before-rule-change"),
        )
        .await;
    assert!(paused.get("result").is_some(), "{paused}");
    before.close().await;

    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][1]["read"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut after = Stdio::start(&fixture, &endpoint.url);
    after.request("initialize", initialize()).await;
    let loaded = after.request("session/load", load).await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let snapshot = json!({"sessionId":session});
    let paused = after
        .request("_co.grida/session/snapshot", snapshot.clone())
        .await;
    let paused = &paused["result"];
    assert_eq!(paused["current"]["paused"], true);
    assert_eq!(paused["current"]["disposition"], "suspended");
    let denied = after
        .request(
            "_co.grida/session/resume",
            json!({
                "task":super::lifecycle::task_basis(paused,session,"resume-after-rule-change"),
                "expectedEpoch":paused["current"]["epoch"],
                "expectedJournalPosition":paused["current"]["journalPosition"],
            }),
        )
        .await;
    assert_eq!(
        denied["error"]["data"], "permission_profile_changed",
        "{denied}"
    );
    let retained = after.request("_co.grida/session/snapshot", snapshot).await;
    assert_eq!(retained["result"]["current"], paused["current"]);
    after.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn unrelated_cwd_does_not_inherit_launch_permissions() {
    let fixture = Fixture::new(false);
    let unrelated = tempfile::tempdir().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("No workspace tools.")]).await;
    fixture.run(&endpoint.url, unrelated.path(), 0).await;
    assert_only_clock_tools(&endpoint.request().await);
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn command_ready_workspace_uses_the_shell_for_exploration() {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandRead"] = json!("allow");
    profile["directories"][0]["write"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    fs::write(fixture.primary.join("note"), "permitted exploration input").unwrap();

    let replies = vec![
        Reply::Tool("exec_command", r#"{"cmd":"/bin/cat note","access":"read"}"#),
        Reply::Finished("Exploration complete."),
    ];
    let mut endpoint = Endpoint::start(replies).await;
    fixture.run(&endpoint.url, &fixture.primary, 0).await;
    let first = endpoint.request().await;
    let tools = first["tools"].as_array().unwrap();
    let offered = |name| tools.iter().any(|tool| tool["function"]["name"] == name);
    for name in ["exec_command", "write_stdin", "write_file", "edit_file"] {
        assert!(offered(name), "Act omitted {name}: {tools:?}");
    }
    for name in ["read_file", "read_scoped_file", "list_files", "search_text"] {
        assert!(!offered(name), "Act offered {name}: {tools:?}");
    }
    let result = crate::full_access::last_tool(&endpoint.request().await);
    assert!(
        result.to_string().contains("permitted exploration input"),
        "{result}"
    );
    endpoint.done().await;
}

fn exec_input_file(arguments: Value) -> Reply {
    Reply::Tool(
        "exec_command",
        Box::leak(arguments.to_string().into_boxed_str()),
    )
}

fn assert_command_output(outcome: &Value, expected: &str) {
    assert_eq!(outcome["status"], "succeeded", "{outcome}");
    assert_eq!(outcome["structured"]["completion"]["code"], 0, "{outcome}");
    assert_eq!(outcome["structured"]["cleanup_verified"], true, "{outcome}");
    assert_eq!(outcome["truncated"], false, "{outcome}");
    let text = outcome["content"][0].as_str().unwrap();
    let (_, bytes) = text.split_once("\nOutput:\n").expect("command output");
    assert_eq!(bytes, expected);
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn command_input_file_keeps_exact_named_and_external_approvals() {
    for (outside_workspace, replace) in [(false, false), (true, false), (true, true)] {
        let mut fixture = Fixture::new(true);
        fixture.scoped_approvals = outside_workspace;
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        profile["directories"][0]["commandRead"] = json!("allow");
        profile["directories"][0]["commandReadWrite"] = json!("allow");
        profile["directories"][1]["commandReadWrite"] = json!("deny");
        fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
        let (directory, root) = if outside_workspace {
            ("external-file", Path::new("/"))
        } else {
            ("extra", fixture.extra.as_path())
        };
        let file = if outside_workspace {
            fixture.primary.parent().unwrap().join("outside.txt")
        } else {
            fixture.extra.join("reference.txt")
        };
        let expected = "only for the approved target — UTF-8\r\nsecond line\n";
        fs::write(&file, expected).unwrap();
        fs::write(fixture.primary.join("note"), "unmodified project").unwrap();
        let path = file.strip_prefix(root).unwrap();
        let raw_source = if outside_workspace {
            "../outside.txt"
        } else {
            "../extra/reference.txt"
        };
        let command = format!(
            "if (: < {raw_source}) 2>/dev/null; then exit 41; fi; if (printf write > note) 2>/dev/null; then exit 42; fi; /bin/cat"
        );
        let mut endpoint = Endpoint::start(vec![
            exec_input_file(json!({
                "cmd":command,
                "access":"read",
                "input_file":{"directory":directory,"path":path},
            })),
            Reply::Finished("Inspected the approved file request."),
        ])
        .await;
        let output = fixture.run(&endpoint.url, &fixture.primary, 6).await;
        let approval = &output[1]["approvals"][0];
        assert_eq!(approval["request"]["directory"], directory, "{approval}");
        assert_eq!(approval["request"]["root"], json!(root), "{approval}");
        assert_eq!(
            approval["request"]["effect"],
            json!({"kind":"read","tool":"read_file","relative_path":path}),
            "{approval}"
        );
        let first = endpoint.request().await;
        assert!(
            !first.to_string().contains("only for the approved target"),
            "{first}"
        );
        if replace {
            let replacement = file.with_extension("new");
            fs::write(&replacement, "replacement file contents").unwrap();
            fs::rename(replacement, &file).unwrap();
        }
        let session = output[0]["session_id"].as_str().unwrap();
        let turn = output[0]["turn_id"].as_str().unwrap();
        let wait = approval["waitId"].as_str().unwrap();
        let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
        let result = crate::full_access::last_tool(&endpoint.request().await);
        if replace {
            assert_eq!(result["status"], "failed", "{result}");
            assert!(result["structured"].is_null(), "{result}");
            let text = result.to_string();
            assert!(text.contains("permission_action_changed"), "{result}");
            assert!(!text.contains("replacement file contents"), "{result}");
            assert!(!text.contains("only for the approved target"), "{result}");
        } else {
            assert_command_output(&result, expected);
        }
        assert_eq!(
            fs::read_to_string(fixture.primary.join("note")).unwrap(),
            "unmodified project"
        );
        settle(&mut owner, session).await;
        owner.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn plan_explores_with_finite_read_only_commands() {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandRead"] = json!("allow");
    profile["directories"][0]["commandReadWrite"] = json!("allow");
    profile["directories"][0]["write"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    fs::write(fixture.primary.join("note"), "permitted plan input").unwrap();
    fs::write(
        fixture.primary.parent().unwrap().join("outside.txt"),
        "outside narrow Plan read scope",
    )
    .unwrap();
    let protected_settings = seed_host_settings(&fixture);

    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(
            "exec_command",
            r#"{"cmd":"if (printf write > note) 2>/dev/null; then exit 42; fi; if (printf write > new-note) 2>/dev/null; then exit 43; fi; printf scratch > \"$TMPDIR/plan-note\" && /bin/cat note"}"#,
        ),
        Reply::Tool(
            "exec_command",
            r#"{"cmd":"printf UNSCOPED_WRITE","access":"read_write"}"#,
        ),
        Reply::Tool(
            "exec_command",
            r#"{"cmd":"printf NETWORK_REQUEST","network":{"host":"example.invalid","port":443}}"#,
        ),
        Reply::Tool(
            "exec_command",
            r#"{"cmd":"printf TTY_REQUEST","tty":true}"#,
        ),
        Reply::Tool(
            "exec_command",
            r#"{"cmd":"printf SESSION_REQUEST","yield_time_ms":250}"#,
        ),
        Reply::Tool("exec_command", r#"{"cmd":"/bin/cat ../outside.txt"}"#),
        Reply::Tool(
            "exec_command",
            r#"{"cmd":"/bin/cat","input_file":{"directory":"agent-settings","path":"config.toml"}}"#,
        ),
        Reply::Finished("Proposed result and verification."),
    ])
    .await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .args(["--mode", "plan", "--prompt", "Plan using the note"])
            .arg("--cwd")
            .arg(&fixture.primary)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let first = endpoint.request().await;
    let assert_plan_tools = |request: &Value| {
        let tools = request["tools"].as_array().unwrap();
        let offered = |name| tools.iter().any(|tool| tool["function"]["name"] == name);
        assert!(
            offered("exec_command"),
            "Plan omitted exec_command: {tools:?}"
        );
        for name in [
            "read_file",
            "read_scoped_file",
            "list_files",
            "search_text",
            "write_stdin",
            "write_file",
            "edit_file",
        ] {
            assert!(!offered(name), "Plan offered {name}: {tools:?}");
        }
    };
    assert_plan_tools(&first);
    assert!(
        output.status.success(),
        "stdout: {}
stderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let after_read = endpoint.request().await;
    let read = crate::full_access::last_tool(&after_read);
    assert_eq!(read["status"], "succeeded", "{read}");
    assert_eq!(read["structured"]["completion"]["code"], 0, "{read}");
    assert!(read.to_string().contains("permitted plan input"), "{read}");
    for forbidden in [
        "UNSCOPED_WRITE",
        "NETWORK_REQUEST",
        "TTY_REQUEST",
        "SESSION_REQUEST",
    ] {
        let request = endpoint.request().await;
        assert_plan_tools(&request);
        let result = crate::full_access::last_tool(&request);
        assert_eq!(result["status"], "failed", "{result}");
        assert!(!result.to_string().contains(forbidden), "{result}");
    }
    let outside = crate::full_access::last_tool(&endpoint.request().await);
    assert_eq!(outside["status"], "failed", "{outside}");
    assert!(
        outside["structured"]["completion"]["code"]
            .as_i64()
            .is_some_and(|code| code != 0),
        "{outside}"
    );
    assert!(
        !outside
            .to_string()
            .contains("outside narrow Plan read scope"),
        "{outside}"
    );
    let settings_result = endpoint.request().await;
    assert_plan_tools(&settings_result);
    let settings = crate::full_access::last_tool(&settings_result);
    assert_eq!(settings["status"], "failed", "{settings}");
    assert!(settings["structured"].is_null(), "{settings}");
    assert!(
        !settings.to_string().contains("protected host settings"),
        "{settings}"
    );
    assert_eq!(
        fs::read_to_string(protected_settings).unwrap(),
        HOST_SETTINGS
    );
    assert_eq!(
        fs::read_to_string(fixture.primary.join("note")).unwrap(),
        "permitted plan input"
    );
    assert!(!fixture.primary.join("new-note").exists());
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn plan_and_act_read_outside_the_workspace_with_a_broad_read_profile() {
    for mode in ["plan", "act"] {
        let mut fixture = Fixture::new(true);
        fixture.scoped_approvals = true;
        let root = fixture.primary.parent().unwrap();
        let protected = root.join("protected");
        fs::create_dir(&protected).unwrap();
        fs::write(
            protected.join("secret"),
            "never readable under this profile",
        )
        .unwrap();
        let outside = root.join("ordinary.txt");
        let expected = "ordinary outside file contents\n";
        fs::write(&outside, expected).unwrap();
        fs::write(fixture.primary.join("note"), "workspace note").unwrap();
        let protected_settings = seed_host_settings(&fixture);
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        profile["directories"][0]["commandRead"] = json!("allow");
        profile["directories"][0]["commandReadWrite"] = json!("allow");
        profile["command"]["diskRead"] = json!(true);
        profile["protectedPaths"] = json!([protected]);
        fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();

        let mut endpoint = Endpoint::start(vec![
            Reply::Tool(
                "exec_command",
                r#"{"cmd":"if (: < ../protected/secret) 2>/dev/null; then exit 41; fi; if (: < ../private/grida-home/config.toml) 2>/dev/null; then exit 44; fi; if (printf write > note) 2>/dev/null; then exit 42; fi; if (printf write > ../ordinary.txt) 2>/dev/null; then exit 43; fi; /bin/cat ../ordinary.txt","access":"read"}"#,
            ),
            exec_input_file(json!({
                "cmd":"/bin/cat","access":"read", "input_file":{
                    "directory":"external-file","path":outside.strip_prefix("/").unwrap(),
                },
            })),
            Reply::Tool(
                "exec_command",
                r#"{"cmd":"/bin/cat","access":"read","input_file":{"directory":"agent-settings","path":"config.toml"}}"#,
            ),
            Reply::Finished("Read the ordinary file."),
        ])
        .await;
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args(["--mode", mode, "--prompt", "Inspect the local file."])
                .arg("--cwd")
                .arg(&fixture.primary)
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{mode}: stdout {}\nstderr {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            records(&output.stdout)
                .iter()
                .all(|record| record.get("approvals").is_none()),
            "{mode}: {}",
            String::from_utf8_lossy(&output.stdout)
        );
        let first = endpoint.request().await;
        let tools = first["tools"].as_array().unwrap();
        let exec = tools
            .iter()
            .find(|tool| tool["function"]["name"] == "exec_command")
            .unwrap();
        assert!(
            exec["function"]["parameters"]["properties"]
                .get("input_file")
                .is_none(),
            "{mode}: {exec}"
        );
        assert!(!first.to_string().contains("protected host settings"));
        let result = crate::full_access::last_tool(&endpoint.request().await);
        assert_command_output(&result, expected);
        for _ in 0..2 {
            let refused = crate::full_access::last_tool(&endpoint.request().await);
            assert_eq!(refused["status"], "failed", "{refused}");
            assert!(refused["structured"].is_null(), "{refused}");
            assert!(
                !refused.to_string().contains("protected host settings"),
                "{refused}"
            );
        }
        assert_eq!(
            fs::read_to_string(protected_settings).unwrap(),
            HOST_SETTINGS
        );
        assert_eq!(fs::read_to_string(outside).unwrap(), expected);
        assert_eq!(
            fs::read_to_string(fixture.primary.join("note")).unwrap(),
            "workspace note"
        );
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn approved_native_command_dispatches_the_exact_scope_once_after_restart() {
    let fixture = Fixture::new(true);
    let arguments = Box::leak(
        json!({"directory":"extra","access":"read_write","cmd":"printf x >> effect"})
            .to_string()
            .into_boxed_str(),
    );
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("exec_command", arguments),
        Reply::Finished("Command complete."),
    ])
    .await;
    let output = fixture.run(&endpoint.url, &fixture.primary, 6).await;
    let session = output[0]["session_id"].as_str().unwrap();
    let turn = output[0]["turn_id"].as_str().unwrap();
    let wait = output[1]["approvals"][0]["waitId"].as_str().unwrap();
    assert_eq!(
        output[1]["approvals"][0]["request"]["effect"]["access"],
        "read_write"
    );
    assert!(!fixture.extra.join("effect").exists());
    endpoint.request().await;
    let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains("cleanup_verified")
    );
    settle(&mut owner, session).await;
    assert_eq!(fs::read(fixture.extra.join("effect")).unwrap(), b"x");
    owner.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn stopped_approval_settles_without_reinstalling_the_permission_profile() {
    let fixture = Fixture::new(false);
    let mut endpoint = Endpoint::start(vec![Reply::Tool(
        "read_file",
        r#"{"directory":"extra","path":"note"}"#,
    )])
    .await;
    let output = fixture.run(&endpoint.url, &fixture.primary, 6).await;
    let session = output[0]["session_id"].as_str().unwrap();
    endpoint.request().await;

    let (child, url) = shared_server(&fixture.state, &endpoint.url).await;
    let mut observer = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    ws_rpc(&mut observer, 1, "initialize", initialize()).await;
    let loaded = ws_rpc(
        &mut observer,
        2,
        "session/load",
        json!({
            "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
        }),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let snapshot = session_snapshot(&mut observer, session).await;
    let stop = ws_rpc(
        &mut observer,
        3,
        "_co.grida/session/stop",
        super::lifecycle::task_basis(&snapshot, session, "cancel-review"),
    )
    .await;
    assert!(stop.get("error").is_none(), "{stop}");
    let cancelled = super::lifecycle::wait_for_snapshot(&mut observer, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(cancelled["latest"]["status"], "cancelled");
    drop(observer);
    terminate_shared_server(child).await;
    endpoint.done().await;
}

#[tokio::test]
async fn answering_an_approval_interrupts_a_passive_wait_in_the_same_step() {
    let fixture = external_read_fixture();
    let outside = fixture.primary.parent().unwrap().join("reference.txt");
    fs::write(&outside, "approved wait fixture text").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tools(vec![
            ("clock_sleep", json!({"duration_ms":60000})),
            (
                "read_file",
                json!({"directory":"external-file","path":outside.strip_prefix("/").unwrap()}),
            ),
        ]),
        Reply::Finished("Done."),
    ])
    .await;
    let mut client = Stdio::start(&fixture, &endpoint.url);
    let mut init = initialize();
    init["clientCapabilities"]["_meta"]["co.grida/session/updates"] = 1.into();
    waits::call(&mut client, "initialize", init).await;
    let session = waits::call(
        &mut client,
        "session/new",
        json!({"cwd":fixture.primary,"mcpServers":[]}),
    )
    .await["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let accepted = waits::call(
        &mut client,
        "_co.grida/session/submit",
        lifecycle::prompt_request(&session, "first", "Wait while opening the reference."),
    )
    .await;
    endpoint.request().await;
    waits::tool_started(&mut client, "clock_sleep").await;
    let turn = &accepted["turnId"];
    let listed = timeout(WAIT, async {
        loop {
            let available = waits::call(
                &mut client,
                "_co.grida/session/approvals",
                json!({"sessionId":session,"turnId":turn}),
            )
            .await;
            if available["approvals"][0]["waitId"].is_string() {
                break available;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    waits::quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    let snapshot = waits::snapshot(&mut client, &session).await;
    waits::call(
        &mut client,
        "_co.grida/session/answer-approval",
        json!({
            "sessionId":session,"turnId":turn,"waitId":listed["approvals"][0]["waitId"],
            "requestId":"answer-during-wait","expectedSessionRevision":snapshot["sessionRevision"],
            "expectedControlRevision":listed["controlRevision"],"decision":"approve_once",
        }),
    )
    .await;

    let continuation = timeout(Duration::from_secs(5), endpoint.request())
        .await
        .unwrap();
    assert_eq!(
        waits::results(&continuation)
            .filter(|result| result["structured"]["status"] == "input")
            .count(),
        1
    );
    assert!(
        continuation["messages"]
            .to_string()
            .contains("approved wait fixture text")
    );
    settle(&mut client, &session).await;
    client.close().await;
    endpoint.done().await;
}
