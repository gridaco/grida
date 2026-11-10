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
#[path = "approvals/reviewer.rs"]
mod reviewer;

const LIST: &str = "co.grida/session/approvals";
const ANSWER: &str = "co.grida/session/answer-approval";

pub(super) struct Fixture {
    _base: TempDir,
    state: PathBuf,
    pub(super) primary: PathBuf,
    extra: PathBuf,
    pub(super) profile: PathBuf,
}

impl Fixture {
    pub(super) fn new(command: bool) -> Self {
        let base = tempfile::tempdir().unwrap();
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
        }
    }

    pub(super) fn process(&self, endpoint: &str, mode: &str) -> Command {
        let mut process = executable();
        process.arg(mode);
        configured(&mut process, &self.state, endpoint);
        process.arg("--permission-profile").arg(&self.profile);
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
    for key in [LIST, ANSWER] {
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
        assert_ne!(
            timeout(WAIT, self.stdout.read_line(&mut line))
                .await
                .unwrap()
                .unwrap(),
            0
        );
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
    assert!(!names.contains(&"run_command"));

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
    let mut endpoint = Endpoint::start(vec![Reply::Finished("No local tools.")]).await;
    fixture.run(&endpoint.url, unrelated.path(), 0).await;
    assert!(
        endpoint.request().await["tools"]
            .as_array()
            .is_none_or(Vec::is_empty)
    );
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn plan_can_read_but_does_not_offer_the_provisioned_command_tool() {
    let fixture = Fixture::new(true);
    fs::write(fixture.primary.join("note"), "permitted plan input").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"path":"note"}"#),
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
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let first = endpoint.request().await;
    let tools = first["tools"].as_array().unwrap();
    assert!(
        tools
            .iter()
            .any(|tool| tool["function"]["name"] == "read_file")
    );
    assert!(
        !tools
            .iter()
            .any(|tool| tool["function"]["name"] == "run_command")
    );
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains("permitted plan input")
    );
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn approved_native_command_dispatches_the_exact_scope_once_after_restart() {
    let fixture = Fixture::new(true);
    let arguments = Box::leak(
        json!({
            "directory":"extra","access":"read_write","program":"/bin/bash",
            "args":["-c","printf x >> effect"],"cwd":fixture.extra,
        })
        .to_string()
        .into_boxed_str(),
    );
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("run_command", arguments),
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
