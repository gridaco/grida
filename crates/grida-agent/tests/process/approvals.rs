use super::lifecycle::{session_snapshot, terminate_shared_server};
use super::*;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use tokio::process::{ChildStdin, ChildStdout};

const LIST: &str = "co.grida/session/approvals";
const ANSWER: &str = "co.grida/session/answer-approval";

struct Fixture {
    _base: TempDir,
    state: PathBuf,
    primary: PathBuf,
    extra: PathBuf,
    profile: PathBuf,
}

impl Fixture {
    fn new(command: bool) -> Self {
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

    fn process(&self, endpoint: &str, mode: &str) -> Command {
        let mut process = executable();
        process.arg(mode);
        configured(&mut process, &self.state, endpoint);
        process.arg("--permission-profile").arg(&self.profile);
        process
    }

    async fn run(&self, endpoint: &str, cwd: &Path, code: i32) -> Vec<Value> {
        let output = timeout(
            WAIT,
            self.process(endpoint, "run")
                .arg("--cwd")
                .arg(cwd)
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

struct Stdio {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    id: u64,
}

impl Stdio {
    fn start(fixture: &Fixture, endpoint: &str) -> Self {
        let mut child = fixture
            .process(endpoint, "serve")
            .arg("--stdio")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Self {
            child,
            stdin,
            stdout,
            id: 0,
        }
    }

    async fn request(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        let id = self.id;
        let frame = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        timeout(WAIT, async {
            self.stdin
                .write_all(format!("{frame}\n").as_bytes())
                .await
                .unwrap();
            loop {
                let mut line = String::new();
                assert_ne!(
                    self.stdout.read_line(&mut line).await.unwrap(),
                    0,
                    "{method}"
                );
                let response: Value = serde_json::from_str(&line).unwrap();
                if response["id"] == id {
                    return response;
                }
            }
        })
        .await
        .unwrap()
    }

    async fn close(self) {
        let Self {
            child,
            stdin,
            stdout,
            ..
        } = self;
        drop(stdin);
        let output = finish_child(child).await;
        drop(stdout);
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
