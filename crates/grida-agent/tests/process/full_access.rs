//! GRIDA-SEC-004 / GRIDA-SEC-014 — explicit unconfined grants and unchanged defaults.

use super::approvals::{Fixture, Stdio as Client};
use super::*;
use std::fs;
use std::path::PathBuf;

const CAPABILITY: &str = "co.grida/session/permission-mode";
const INSPECT: &str = "_co.grida/session/permission-mode";
const UPDATE: &str = "_co.grida/session/permission-mode/update";

fn fixture(allow: bool) -> Fixture {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandReadWrite"] = json!("allow");
    profile["directories"][0]["write"] = json!("allow");
    profile["allowFullAccess"] = json!(allow);
    profile["command"]["diskRead"] = json!(true);
    profile["command"]["environment"] = json!({
        "PATH":std::env::var("PATH").unwrap(),
        "HOME":fixture.extra,
        "SHELL":"/bin/sh",
    });
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    fixture
}

async fn start(fixture: &Fixture, endpoint: &str, negotiate: bool) -> Client {
    start_options(fixture, endpoint, negotiate, false).await
}

async fn start_options(
    fixture: &Fixture,
    endpoint: &str,
    negotiate: bool,
    workers: bool,
) -> Client {
    let mut process = fixture.process(endpoint, "serve");
    if workers {
        process.arg("--subagents");
    }
    let mut client = Client::from_child(
        process
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let mut initialize = extension_initialize();
    if negotiate {
        initialize["clientCapabilities"]["_meta"][CAPABILITY] = json!(1);
    }
    initialize["clientCapabilities"]["_meta"]["co.grida/session/processes"] = json!(1);
    let ready = client.request("initialize", initialize).await;
    assert!(ready.get("error").is_none(), "{ready}");
    client
}

fn offered(request: &Value, name: &str) -> bool {
    request["tools"].as_array().is_some_and(|tools| {
        tools
            .iter()
            .any(|tool| tool["function"]["name"] == name || tool["name"] == name)
    })
}

async fn session(client: &mut Client, fixture: &Fixture) -> String {
    let created = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    created["result"]["sessionId"].as_str().unwrap().to_owned()
}

async fn attach(client: &mut Client, fixture: &Fixture, session: &str) {
    let loaded = client
        .request(
            "session/load",
            json!({"cwd":fixture.primary,"sessionId":session,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
}

fn target(fixture: &Fixture, session: &str) -> Value {
    json!({"cwd":fixture.primary,"sessionId":session})
}

fn change(fixture: &Fixture, session: &str, revision: u64, request: &str, mode: &str) -> Value {
    json!({"cwd":fixture.primary,"sessionId":session,"expectedRevision":revision,"requestId":request,"mode":mode})
}

async fn prompt(client: &mut Client, session: &str) {
    let result = client.request("session/prompt",json!({"sessionId":session,"prompt":[{"type":"text","text":"Perform the bounded local fixture operation and report the result."}]})).await;
    assert!(result.get("error").is_none(), "{result}");
}

fn tool(name: &'static str, arguments: Value) -> Reply {
    Reply::Tool(name, Box::leak(arguments.to_string().into_boxed_str()))
}

fn last_tool(request: &Value) -> Value {
    let message = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|message| message["role"] == "tool")
        .unwrap();
    serde_json::from_str(message["content"].as_str().unwrap()).unwrap()
}

fn confined_denial(request: &Value) -> Reply {
    let result = last_tool(request);
    #[cfg(target_os = "macos")]
    assert_eq!(result["structured"]["backend"], "seatbelt", "{result}");
    #[cfg(target_os = "linux")]
    assert_eq!(result["structured"]["backend"], "bubblewrap", "{result}");
    assert!(
        result["structured"]["completion"]["code"]
            .as_i64()
            .is_some_and(|code| code != 0),
        "the denied fixture must actually execute inside its native boundary: {result}"
    );
    Reply::Finished("Observed the native restricted result.")
}

#[tokio::test]
#[ignore = "requires the current native helper"]
async fn permission_choice_is_per_chat_durable_exact_and_requires_launch_authority() {
    let fixture = fixture(true);
    let endpoint = Endpoint::start(vec![]).await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let a = session(&mut client, &fixture).await;
    let b = session(&mut client, &fixture).await;
    let initial = client.request(INSPECT, target(&fixture, &a)).await;
    assert_eq!(initial["result"]["mode"], "restricted", "{initial}");
    assert_eq!(initial["result"]["revision"], 0, "{initial}");
    assert!(
        initial["result"]["available"]
            .as_array()
            .unwrap()
            .contains(&json!("full_access"))
    );
    let update = change(&fixture, &a, 0, "enable-full", "full_access");
    let enabled = client.request(UPDATE, update.clone()).await;
    assert_eq!(enabled["result"]["mode"], "full_access", "{enabled}");
    assert_eq!(enabled["result"]["revision"], 1, "{enabled}");
    assert_eq!(
        client.request(UPDATE, update).await["result"],
        enabled["result"]
    );
    let conflict = client
        .request(UPDATE, change(&fixture, &a, 0, "enable-full", "restricted"))
        .await;
    assert!(conflict.get("error").is_some(), "{conflict}");
    assert_eq!(
        client.request(INSPECT, target(&fixture, &b)).await["result"]["mode"],
        "restricted"
    );
    client.close().await;

    let mut client = start(&fixture, &endpoint.url, true).await;
    attach(&mut client, &fixture, &a).await;
    let retained = client.request(INSPECT, target(&fixture, &a)).await;
    assert_eq!(retained["result"]["mode"], "full_access", "{retained}");
    client.close().await;
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowFullAccess"] = json!(false);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut client = start(&fixture, &endpoint.url, true).await;
    attach(&mut client, &fixture, &a).await;
    attach(&mut client, &fixture, &b).await;
    let refused = client.request(INSPECT, target(&fixture, &a)).await;
    assert_eq!(
        refused["error"]["data"], "permission_mode_unavailable",
        "{refused}"
    );
    let refused = client
        .request(
            UPDATE,
            change(&fixture, &b, 0, "unavailable-full", "full_access"),
        )
        .await;
    assert_eq!(
        refused["error"]["data"], "permission_mode_unavailable",
        "{refused}"
    );
    client.close().await;
    let mut client = start(&fixture, &endpoint.url, false).await;
    attach(&mut client, &fixture, &b).await;
    let refused = client.request(INSPECT, target(&fixture, &b)).await;
    assert!(refused.get("error").is_some(), "{refused}");
    client.close().await;
    endpoint.done().await;
}

struct ResourceServer {
    url: String,
    paths: Arc<Mutex<Vec<String>>>,
    task: tokio::task::JoinHandle<()>,
}

impl ResourceServer {
    async fn start(body: Vec<u8>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let paths = Arc::new(Mutex::new(Vec::new()));
        let observed = paths.clone();
        let task = tokio::spawn(async move {
            loop {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut headers = Vec::new();
                loop {
                    let byte = stream.read_u8().await.unwrap();
                    headers.push(byte);
                    assert!(headers.len() <= 16 * 1024);
                    if headers.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                let request = String::from_utf8(headers).unwrap();
                observed
                    .lock()
                    .unwrap()
                    .push(request.lines().next().unwrap().to_owned());
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                stream.write_all(header.as_bytes()).await.unwrap();
                if !request.starts_with("HEAD ") {
                    stream.write_all(&body).await.unwrap();
                }
                stream.shutdown().await.unwrap();
            }
        });
        Self { url, paths, task }
    }
}

impl Drop for ResourceServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn default_denies_network_and_outside_writes_full_access_allows_both_and_can_be_removed() {
    let fixture = fixture(true);
    let resource = ResourceServer::start(b"local resource".to_vec()).await;
    let outside = fixture.extra.join("outside.txt");
    let cmd = format!(
        "/usr/bin/curl --fail --silent --show-error --max-time 2 '{}' > fetched; printf authorized > '{}'",
        resource.url,
        outside.display()
    );
    let endpoint = Endpoint::start(vec![
        tool(
            "exec_command",
            json!({"access":"read_write","cmd":cmd,"yield_time_ms":1000}),
        ),
        Reply::Choose(Box::new(confined_denial)),
        tool(
            "exec_command",
            json!({"access":"read_write","cmd":cmd,"yield_time_ms":1000}),
        ),
        Reply::Choose(Box::new(|request| {
            let result = last_tool(request);
            assert!(
                result["content"]
                    .to_string()
                    .contains("Process exited with code 0"),
                "{result}"
            );
            assert_eq!(result["structured"]["backend"], "unconfined", "{result}");
            Reply::Finished("Observed the unconfined result.")
        })),
        tool(
            "read_file",
            json!({"directory":"filesystem","path":outside.strip_prefix("/").unwrap()}),
        ),
        Reply::Choose(Box::new(|request| {
            let result = last_tool(request);
            assert_eq!(result["status"], "succeeded", "{result}");
            assert!(result.to_string().contains("authorized"), "{result}");
            Reply::Finished("Read the explicitly granted file.")
        })),
        tool(
            "exec_command",
            json!({"access":"read_write","cmd":cmd,"yield_time_ms":1000}),
        ),
        Reply::Choose(Box::new(confined_denial)),
    ])
    .await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let session = session(&mut client, &fixture).await;
    prompt(&mut client, &session).await;
    assert!(!outside.exists());
    assert!(resource.paths.lock().unwrap().is_empty());
    let enabled = client
        .request(
            UPDATE,
            change(&fixture, &session, 0, "enable", "full_access"),
        )
        .await;
    assert!(enabled.get("error").is_none(), "{enabled}");
    prompt(&mut client, &session).await;
    assert_eq!(fs::read(&outside).unwrap(), b"authorized");
    assert_eq!(
        fs::read(fixture.primary.join("fetched")).unwrap(),
        b"local resource"
    );
    prompt(&mut client, &session).await;
    fs::remove_file(&outside).unwrap();
    let disabled = client
        .request(
            UPDATE,
            change(&fixture, &session, 1, "disable", "restricted"),
        )
        .await;
    assert!(disabled.get("error").is_none(), "{disabled}");
    prompt(&mut client, &session).await;
    assert!(!outside.exists());
    assert_eq!(resource.paths.lock().unwrap().len(), 1);
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn confined_commands_run_projected_programs_under_install_exclusion() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = fixture(false);
    let root = fixture.primary.parent().unwrap();
    let install = root.join("install");
    let runtime = root.join("command-runtime");
    let bin = runtime.join("bin");
    fs::create_dir(&install).unwrap();
    fs::create_dir_all(&bin).unwrap();
    fs::write(install.join("application"), b"excluded").unwrap();

    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    let helper = &mut profile["command"]["helper"];
    let installed_helper = install.join("agent-kit-sandbox-helper");
    let projected_helper = runtime.join("agent-kit-sandbox-helper");
    fs::copy(helper["path"].as_str().unwrap(), &installed_helper).unwrap();
    fs::copy(&installed_helper, &projected_helper).unwrap();
    fs::set_permissions(&projected_helper, fs::Permissions::from_mode(0o500)).unwrap();
    helper["path"] = json!(projected_helper);

    let program = bin.join("bundled-check");
    fs::write(
        &program,
        "#!/bin/sh\nprintf 'bundled execution verified\\n'\n",
    )
    .unwrap();
    fs::set_permissions(&program, fs::Permissions::from_mode(0o500)).unwrap();
    profile["protectedPaths"] = json!([install]);
    profile["command"]["runtimePaths"]
        .as_array_mut()
        .unwrap()
        .push(json!(bin));
    profile["command"]["environment"]["PATH"] = json!(
        std::env::join_paths([
            bin.as_path(),
            std::path::Path::new("/usr/bin"),
            std::path::Path::new("/bin")
        ])
        .unwrap()
        .into_string()
        .unwrap()
    );
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();

    let quote =
        |path: &std::path::Path| format!("'{}'", path.to_str().unwrap().replace('\'', "'\\''"));
    let command = format!(
        "test \"$(command -v bundled-check)\" = {} && bundled-check && ! /bin/cat {} && ! /bin/chmod u+w {}",
        quote(&program),
        quote(&install.join("application")),
        quote(&program),
    );
    let endpoint = Endpoint::start(vec![
        tool(
            "exec_command",
            json!({"access":"read_write","cmd":command,"yield_time_ms":1000}),
        ),
        Reply::Choose(Box::new(|request| {
            let result = last_tool(request);
            assert_eq!(result["structured"]["completion"]["code"], 0, "{result}");
            assert!(
                result["content"]
                    .to_string()
                    .contains("bundled execution verified"),
                "{result}"
            );
            Reply::Finished("Verified the confined command result.")
        })),
    ])
    .await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let id = session(&mut client, &fixture).await;
    prompt(&mut client, &id).await;
    assert_eq!(
        fs::metadata(program).unwrap().permissions().mode() & 0o777,
        0o500
    );
    client.close().await;
    endpoint.done().await;
}

fn npm_executable() -> PathBuf {
    if let Some(path) = std::env::var_os("GRIDA_AGENT_TEST_NPM") {
        return PathBuf::from(path);
    }
    std::env::split_paths(&std::env::var_os("PATH").unwrap())
        .map(|dir| dir.join("npm"))
        .find(|path| path.is_file())
        .expect("npm must be installed for the package-install fixture")
}

#[tokio::test]
#[ignore = "requires the current native helper, npm and tar"]
async fn full_access_installs_a_local_http_package_with_cache_and_lifecycle_script() {
    let fixture = fixture(true);
    let package = fixture.extra.join("package");
    fs::create_dir(&package).unwrap();
    fs::write(package.join("package.json"),serde_json::to_vec(&json!({
        "name":"full-access-fixture","version":"1.0.0",
        "scripts":{"postinstall":"node -e \"require('node:fs').writeFileSync('installed.txt','ready')\""},
    })).unwrap()).unwrap();
    fs::write(package.join("index.js"), "module.exports = 42;\n").unwrap();
    let archive = fixture.extra.join("package.tgz");
    assert!(
        std::process::Command::new("tar")
            .arg("-czf")
            .arg(&archive)
            .arg("-C")
            .arg(&fixture.extra)
            .arg("package")
            .status()
            .unwrap()
            .success()
    );
    let resource = ResourceServer::start(fs::read(archive).unwrap()).await;
    fs::write(fixture.primary.join("package.json"), "{\"private\":true}\n").unwrap();
    let cmd = format!(
        "'{}' install '{}/package.tgz' --cache '{}' --userconfig '{}' --no-audit --no-fund --update-notifier=false",
        npm_executable().display(),
        resource.url,
        fixture.extra.join("npm-cache").display(),
        fixture.extra.join("empty-npmrc").display()
    );
    let endpoint = Endpoint::start(vec![
        tool(
            "exec_command",
            json!({"access":"read_write","cmd":cmd,"yield_time_ms":10000}),
        ),
        Reply::Choose(Box::new(|request| {
            let result = last_tool(request);
            assert!(
                result["content"]
                    .to_string()
                    .contains("Process exited with code 0"),
                "{result}"
            );
            assert_eq!(result["structured"]["backend"], "unconfined", "{result}");
            Reply::Finished("The local package and its install script completed.")
        })),
    ])
    .await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let session = session(&mut client, &fixture).await;
    let enabled = client
        .request(
            UPDATE,
            change(&fixture, &session, 0, "install-grant", "full_access"),
        )
        .await;
    assert!(enabled.get("error").is_none(), "{enabled}");
    prompt(&mut client, &session).await;
    let installed = fixture.primary.join("node_modules/full-access-fixture");
    assert_eq!(fs::read(installed.join("installed.txt")).unwrap(), b"ready");
    assert_eq!(
        fs::read(installed.join("index.js")).unwrap(),
        b"module.exports = 42;\n"
    );
    assert!(fixture.extra.join("npm-cache").is_dir());
    assert!(!resource.paths.lock().unwrap().is_empty());
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper"]
async fn running_full_access_process_prevents_a_misleading_downgrade_until_stopped() {
    let fixture = fixture(true);
    let beat = fixture.primary.join("full-access-beat");
    let endpoint = Endpoint::start(vec![
        tool("exec_command",json!({"access":"read_write","cmd":"while :; do printf . >> full-access-beat; /bin/sleep 0.05; done","yield_time_ms":1000})),
        Reply::Choose(Box::new(|request| {
            let result = last_tool(request);
            assert!(result["content"].to_string().contains("Process running with session ID"),"{result}");
            Reply::Finished("The process remains owned by this chat.")
        })),
    ]).await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let session = session(&mut client, &fixture).await;
    let enabled = client
        .request(
            UPDATE,
            change(&fixture, &session, 0, "enable-process", "full_access"),
        )
        .await;
    assert!(enabled.get("error").is_none(), "{enabled}");
    prompt(&mut client, &session).await;
    assert!(fs::metadata(&beat).unwrap().len() > 0);
    let update = change(&fixture, &session, 1, "disable-process", "restricted");
    let busy = client.request(UPDATE, update.clone()).await;
    assert_eq!(busy["error"]["data"], "permission_mode_busy", "{busy}");
    assert_eq!(
        client.request(INSPECT, target(&fixture, &session)).await["result"]["mode"],
        "full_access"
    );
    let stopped = client
        .request(
            "_co.grida/session/stop-processes",
            json!({"sessionId":session}),
        )
        .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let after = fs::metadata(&beat).unwrap().len();
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert_eq!(fs::metadata(&beat).unwrap().len(), after);
    let disabled = client.request(UPDATE, update).await;
    assert_eq!(disabled["result"]["mode"], "restricted", "{disabled}");
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper"]
async fn model_created_worker_inherits_full_access_for_its_exact_assignment() {
    let fixture = fixture(true);
    let resource = ResourceServer::start(b"worker resource".to_vec()).await;
    let outside = fixture.extra.join("worker-result");
    let cmd = format!(
        "/usr/bin/curl --fail --silent --show-error --max-time 2 '{}' > '{}'",
        resource.url,
        outside.display()
    );
    let steps = Arc::new(Mutex::new((0, 0)));
    let replies = (0..5).map(|_| {
        let steps = steps.clone();
        let cmd = cmd.clone();
        Reply::Choose(Box::new(move |request| {
            let mut steps = steps.lock().unwrap();
            if offered(request,"spawn_agent") {
                let step = steps.0; steps.0 += 1;
                match step {
                    0 => tool("spawn_agent",json!({"name":"Resource check","instructions":"Fetch the bounded local resource into the assigned output and report its result."})),
                    1 => {
                        let assignment = last_tool(request)["structured"]["assignment"].clone();
                        tool("wait_agent",json!({"children":[assignment["child"]]}))
                    },
                    2 => {
                        let result = last_tool(request);
                        assert!(result["structured"]["pending"].as_array().unwrap().is_empty(),"{result}");
                        assert_eq!(result["structured"]["collected"][0]["status"],"succeeded","{result}");
                        assert_eq!(result["structured"]["collected"][0]["resource_status"],"verified","{result}");
                        Reply::Finished("The child's result and resources were collected.")
                    },
                    _ => panic!("unexpected parent inference"),
                }
            } else {
                let step = steps.1; steps.1 += 1;
                match step {
                    0 => {
                        assert!(offered(request,"exec_command"));
                        tool("exec_command",json!({"access":"read_write","cmd":cmd,"yield_time_ms":1000}))
                    },
                    1 => {
                        let result = last_tool(request);
                        assert_eq!(result["structured"]["backend"],"unconfined","{result}");
                        assert!(result["content"].to_string().contains("Process exited with code 0"),"{result}");
                        Reply::Finished("Fetched the local resource into the assigned output.")
                    },
                    _ => panic!("unexpected child inference"),
                }
            }
        }))
    }).collect();
    let endpoint = Endpoint::start(replies).await;
    let mut client = start_options(&fixture, &endpoint.url, true, true).await;
    let session = session(&mut client, &fixture).await;
    let enabled = client
        .request(
            UPDATE,
            change(&fixture, &session, 0, "enable-worker", "full_access"),
        )
        .await;
    assert!(enabled.get("error").is_none(), "{enabled}");
    prompt(&mut client, &session).await;
    assert_eq!(*steps.lock().unwrap(), (3, 2));
    assert_eq!(fs::read(&outside).unwrap(), b"worker resource");
    assert_eq!(resource.paths.lock().unwrap().len(), 1);
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper"]
async fn full_access_does_not_enable_mutation_or_command_tools_in_plan() {
    let fixture = fixture(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["initialPermissionMode"] = json!("full_access");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let endpoint = Endpoint::start(vec![Reply::Choose(Box::new(|request| {
        assert!(offered(request, "read_file"));
        for tool in [
            "exec_command",
            "write_stdin",
            "write_file",
            "edit_file",
            "spawn_agent",
        ] {
            assert!(!offered(request, tool), "Plan offered {tool}");
        }
        Reply::Finished("The investigation requires no mutation.")
    }))])
    .await;
    let output = fixture
        .process(&endpoint.url, "run")
        .args([
            "--mode",
            "plan",
            "--prompt",
            "Inspect the available resources.",
        ])
        .arg("--cwd")
        .arg(&fixture.primary)
        .output()
        .await
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper"]
async fn captured_full_access_cannot_resume_after_launch_authority_is_withdrawn() {
    let fixture = fixture(true);
    let mut endpoint =
        Endpoint::start(vec![Reply::Hold("Working under the captured authority.")]).await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let session = session(&mut client, &fixture).await;
    let enabled = client
        .request(
            UPDATE,
            change(&fixture, &session, 0, "capture-grant", "full_access"),
        )
        .await;
    assert!(enabled.get("error").is_none(), "{enabled}");
    let submitted = client
        .request(
            "_co.grida/session/submit",
            super::lifecycle::prompt_request(
                &session,
                "captured-input",
                "Perform the bounded task.",
            ),
        )
        .await;
    assert!(submitted.get("error").is_none(), "{submitted}");
    endpoint.request().await;
    let before = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let paused = client
        .request(
            "_co.grida/session/pause",
            super::lifecycle::task_basis(&before["result"], &session, "hold-captured-task"),
        )
        .await;
    assert!(paused.get("error").is_none(), "{paused}");
    timeout(WAIT, async {
        loop {
            let view = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if view["result"]["current"]["disposition"] == "suspended" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    client.close().await;
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowFullAccess"] = json!(false);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut client = start(&fixture, &endpoint.url, true).await;
    attach(&mut client, &fixture, &session).await;
    let view = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let snapshot = &view["result"];
    let resumed = client
        .request(
            "_co.grida/session/resume",
            json!({
                "task":super::lifecycle::task_basis(snapshot,&session,"resume-without-grant"),
                "expectedEpoch":snapshot["current"]["epoch"],
                "expectedJournalPosition":snapshot["current"]["journalPosition"],
            }),
        )
        .await;
    assert!(
        resumed["error"]
            .to_string()
            .contains("permission_mode_unavailable"),
        "{resumed}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}
