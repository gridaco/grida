//! GRIDA-SEC-004 — private attachment intake and exact restart recovery.

use super::approvals::Stdio as StdioClient;
use super::lifecycle::{queue_basis, task_basis};
use super::*;
use agent_kit_core::{ChangeId, SessionId};
use base64::{Engine, engine::general_purpose::STANDARD};

const IMAGE_MODEL: &str = "gpt-5.4";
const ARTIFACTS: &str = "co.grida/session/artifacts";

#[tokio::test]
async fn deleting_a_crop_chat_reclaims_its_private_files_and_recovers_after_interruption() {
    use agent_kit_core::Fingerprint;
    use agent_kit_sessions::SessionRevision;
    use agent_kit_store_sqlite::{SqliteStore, deletion::DeleteSession};
    use std::fs;
    use std::os::unix::fs::{DirBuilderExt, MetadataExt};

    const DELETE: &str = "_co.grida/session/delete";
    for interrupted in [false, true] {
        let root = TempDir::new().unwrap();
        let state = root.path().join("state");
        let workspace = TempDir::new().unwrap();
        let cwd = workspace.path().canonicalize().unwrap();
        let original = encode_png(2, 1, &[255, 0, 0, 0, 255, 0]);
        let data = STANDARD.encode(&original);
        let mut endpoint = Endpoint::start_protocol(
            ProviderProtocol::Responses,
            vec![
                Reply::Tool(
                    "crop_retained_image",
                    r#"{"x":1,"y":0,"width":1,"height":1}"#,
                ),
                Reply::Finished("The cropped copy is ready."),
            ],
            Some(TEST_CREDENTIAL),
        )
        .await;
        let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
        client
            .request("initialize", super::deletion::capabilities())
            .await;
        let created = client
            .request("session/new", json!({"cwd":cwd,"mcpServers":[]}))
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let owner = SessionId::new(session).unwrap();
        let crop = client
            .request(
                "session/prompt",
                json!({
                    "sessionId":session,"prompt":upload(session,"crop",&data)["prompt"],
                }),
            )
            .await;
        assert_eq!(crop["result"]["stopReason"], "end_turn", "{crop}");
        endpoint.request().await;
        assert_eq!(
            last_tool_result(endpoint.request().await)["status"],
            "succeeded"
        );
        settled(&mut client, session).await;
        let history = client
            .request("_co.grida/session/history", json!({"sessionId":session}))
            .await;
        let forked = client.request("_co.grida/session/fork", json!({
            "sessionId":session,"requestId":"fork-portable","expectedHistory":history["result"]["basis"],
            "anchor":history["result"]["messages"].as_array().unwrap().last().unwrap()["anchor"],
        })).await;
        let fork = forked["result"]["sessionId"].as_str().unwrap();
        let scope = fs::read_dir(state.join("retained-inputs"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let source = scope
            .join("sources")
            .read_dir()
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "asset")
            })
            .unwrap();
        let staging = source.with_file_name(".stage-f9e1302d-f4d7-4980-bf19-c43b07c9dce2");
        fs::hard_link(&source, &staging).unwrap();
        assert_eq!(source.metadata().unwrap().nlink(), 2);
        let work = scope
            .join("work")
            .read_dir()
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let published = cwd.join("independent.png");
        let output = fs::read(work).unwrap();
        fs::write(&published, &output).unwrap();
        let request = super::deletion::deletion(&mut client, session, &cwd).await;

        if interrupted {
            client.close().await;
            // Leave the exact committed state a process exit would leave
            // between retirement in SQLite and removal by the file owner.
            let metadata = scope.metadata().unwrap();
            let identity = *Fingerprint::of(&(
                &owner,
                metadata.dev(),
                metadata.ino(),
                metadata.created().unwrap(),
            ))
            .unwrap()
            .bytes();
            let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
            store
                .delete_idle_with_cleanup(
                    DeleteSession {
                        session: owner.clone(),
                        scope: Fingerprint::of(&("grida-session-workspace-v1", &cwd)).unwrap(),
                        request: ChangeId::new(request["requestId"].as_str().unwrap()).unwrap(),
                        expected_revision: SessionRevision(
                            request["expectedSessionRevision"].as_u64().unwrap(),
                        ),
                        expected_catalog_revision: request["expectedCatalogRevision"]
                            .as_u64()
                            .unwrap(),
                        dependents: None,
                    },
                    Some(identity),
                    |_, _| Ok(()),
                    |_| Ok(()),
                )
                .await
                .unwrap();
            assert_eq!(
                store.pending_retirement_cleanup(None).await.unwrap(),
                vec![(owner, identity)]
            );
            drop(store);

            let original_scope = scope.with_extension("original-fixture");
            fs::rename(&scope, &original_scope).unwrap();
            fs::DirBuilder::new().mode(0o700).create(&scope).unwrap();
            client = stdio(&state, &endpoint.url, IMAGE_MODEL);
            client
                .request("initialize", super::deletion::capabilities())
                .await;
            let unverified = client.request(DELETE, request.clone()).await;
            assert_eq!(
                unverified["error"]["data"], "session_deletion_unverified",
                "{unverified}"
            );
            assert!(scope.is_dir());
            client.close().await;
            fs::remove_dir(&scope).unwrap();
            fs::rename(&original_scope, &scope).unwrap();
            client = stdio(&state, &endpoint.url, IMAGE_MODEL);
            client
                .request("initialize", super::deletion::capabilities())
                .await;
            timeout(WAIT, async {
                while scope.exists() {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
        }

        let deleted = client.request(DELETE, request.clone()).await;
        assert_eq!(
            deleted["result"],
            json!({"sessionId":session,"requestId":request["requestId"]})
        );
        assert!(!scope.exists());
        assert_eq!(fs::read(published).unwrap(), output);
        let loaded = client
            .request(
                "session/load",
                json!({"sessionId":fork,"cwd":cwd,"mcpServers":[]}),
            )
            .await;
        assert!(loaded["result"].is_object(), "{loaded}");
        assert_eq!(
            client.request(DELETE, request).await["result"],
            deleted["result"]
        );
        client.close().await;
        assert!(endpoint.requests.try_recv().is_err());
        endpoint.done().await;
    }
}

fn artifact_initialize() -> Value {
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"][ARTIFACTS] = 1.into();
    request["clientCapabilities"]["_meta"]["co.grida/session/turn-summary"] = 1.into();
    request
}

fn png(pixel: [u8; 3]) -> Vec<u8> {
    encode_png(1, 1, &pixel)
}

fn encode_png(width: u32, height: u32, pixels: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, width, height);
    encoder.set_color(png::ColorType::Rgb);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(pixels).unwrap();
    writer.finish().unwrap();
    bytes
}

fn server(state: &Path, endpoint: &str, model: &str) -> Command {
    let mut process = executable();
    process
        .args(["serve", "--provider", "responses", "--state-dir"])
        .arg(state)
        .args(["--endpoint", endpoint, "--model", model])
        .args(["--credential-env", "GRIDA_AGENT_PROCESS_TEST_KEY"])
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL);
    process
}

fn stdio(state: &Path, endpoint: &str, model: &str) -> StdioClient {
    let child = server(state, endpoint, model)
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    StdioClient::from_child(child)
}

fn upload(session: &str, input: &str, data: &str) -> Value {
    json!({
        "sessionId": session,
        "inputId": input,
        "prompt": [
            {"type":"text", "text":"Describe the attached image."},
            {"type":"image", "mimeType":"image/png", "data":data}
        ],
    })
}

async fn snapshot(client: &mut StdioClient, session: &str) -> Value {
    let reply = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(reply["result"].is_object(), "{reply}");
    reply["result"].clone()
}

async fn settled(client: &mut StdioClient, session: &str) -> Value {
    timeout(WAIT, async {
        loop {
            let state = snapshot(client, session).await;
            if state["current"].is_null() && state["latest"].is_object() {
                return state;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn private_image_bytes_survive_waiting_input_restart_and_reach_responses() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Hold("Earlier work."),
            Reply::Finished("A tiny image."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut first = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let initialized = first.request("initialize", extension_initialize()).await;
    assert_eq!(
        initialized["result"]["agentCapabilities"]["promptCapabilities"]["image"],
        true
    );
    let created = first
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let started = first
        .request(
            "_co.grida/session/submit",
            super::lifecycle::prompt_request(session, "earlier", "Earlier work"),
        )
        .await;
    assert_eq!(started["result"]["disposition"], "claimed", "{started}");
    endpoint.request().await;

    let data = STANDARD.encode(png([15, 255, 0]));
    let supplied = upload(session, "image", &data);
    let enqueued = first
        .request("_co.grida/session/enqueue", supplied.clone())
        .await;
    assert_eq!(enqueued["result"]["disposition"], "queued", "{enqueued}");
    let duplicate = first.request("_co.grida/session/enqueue", supplied).await;
    assert_eq!(duplicate["result"], enqueued["result"]);
    let replacement = first
        .request(
            "_co.grida/session/enqueue",
            upload(session, "image", &STANDARD.encode(png([16, 255, 0]))),
        )
        .await;
    assert_eq!(
        replacement["error"]["data"], "submission_input_changed",
        "{replacement}"
    );
    let inspected = first
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"image"}),
        )
        .await;
    assert_eq!(
        inspected["result"]["prompt"][1]["text"],
        "[Retained PNG image]"
    );
    assert!(!inspected.to_string().contains(&data));

    let active = snapshot(&mut first, session).await;
    let stopped = first
        .request(
            "_co.grida/session/stop",
            task_basis(&active, session, "stop-earlier"),
        )
        .await;
    assert!(stopped["result"].is_object(), "{stopped}");
    assert_eq!(settled(&mut first, session).await["admissionPaused"], true);
    first.close().await;

    let store = agent_kit_store_sqlite::SqliteStore::open(state.join("runtime.sqlite")).unwrap();
    let input = store
        .input(
            SessionId::new(session).unwrap(),
            ChangeId::new("image").unwrap(),
        )
        .await
        .unwrap()
        .unwrap();
    let payload = std::str::from_utf8(input.input.payload.bytes()).unwrap();
    assert!(payload.contains("retained_image"));
    assert!(payload.contains("digest"));
    assert!(!payload.contains(&data));
    assert!(!payload.contains(state.to_str().unwrap()));
    drop(store);
    // The original is independent of materialized working storage.
    let scope = std::fs::read_dir(state.join("retained-inputs"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let work = scope.join("work");
    std::fs::remove_dir(&work).unwrap();

    let mut resumed = stdio(&state, &endpoint.url, IMAGE_MODEL);
    resumed.request("initialize", extension_initialize()).await;
    let loaded = resumed
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded["result"].is_object(), "{loaded}");
    let waiting = snapshot(&mut resumed, session).await;
    assert_eq!(waiting["queue"][0]["inputId"], "image");
    assert!(endpoint.requests.try_recv().is_err());
    let release = resumed
        .request(
            "_co.grida/session/resume-queue",
            queue_basis(&waiting, session, "release-image"),
        )
        .await;
    assert!(release["result"].is_object(), "{release}");
    let request = endpoint.request().await;
    assert_eq!(request["model"], IMAGE_MODEL);
    assert!(request["input"].as_array().unwrap().iter().any(|entry| entry["content"] == json!([
        {"type":"input_text","text":"Describe the attached image."},
        {"type":"input_image","image_url":format!("data:image/png;base64,{data}"),"detail":"auto"}
    ])));
    assert_eq!(
        settled(&mut resumed, session).await["latest"]["status"],
        "succeeded"
    );
    assert!(!work.exists());
    resumed.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn missing_retained_png_after_restart_fails_before_provider_requests() {
    use agent_kit_sessions::InputDisposition;
    use std::fs;

    for count in [false, true] {
        let directory = TempDir::new().unwrap();
        let state = directory.path().join("state");
        let workspace = TempDir::new().unwrap();
        let mut replies = vec![];
        if count {
            super::responses::input_limit(&state, 1024);
            replies.push(Reply::InputCount(16));
        }
        replies.push(Reply::Hold("Earlier work."));
        // Keep the listener open so an unexpected attempt cannot hide behind
        // connection refusal. Both paths must stop before their next request.
        replies.push(if count {
            Reply::InputCount(16)
        } else {
            Reply::Finished("The missing image must never reach the provider.")
        });
        let mut endpoint =
            Endpoint::start_protocol(ProviderProtocol::Responses, replies, Some(TEST_CREDENTIAL))
                .await;
        let mut first = stdio(&state, &endpoint.url, IMAGE_MODEL);
        first.request("initialize", artifact_initialize()).await;
        let created = first
            .request(
                "session/new",
                json!({"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let earlier = first
            .request(
                "_co.grida/session/submit",
                super::lifecycle::prompt_request(session, "earlier", "Earlier work"),
            )
            .await;
        assert_eq!(earlier["result"]["disposition"], "claimed", "{earlier}");
        if count {
            endpoint.request().await;
        }
        endpoint.request().await;
        let data = STANDARD.encode(png([15, 255, 0]));
        let accepted = first
            .request(
                "_co.grida/session/enqueue",
                upload(session, "missing-png", &data),
            )
            .await;
        assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
        let active = snapshot(&mut first, session).await;
        let stopped = first
            .request(
                "_co.grida/session/stop",
                task_basis(&active, session, "stop-earlier"),
            )
            .await;
        assert!(stopped["result"].is_object(), "{stopped}");
        let paused = settled(&mut first, session).await;
        assert_eq!(paused["admissionPaused"], true);
        let earlier_turn = paused["latest"]["turnId"].as_str().unwrap();
        first.close().await;

        let owner = fs::read_dir(state.join("retained-inputs"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::rename(&owner, directory.path().join("unavailable-scope")).unwrap();
        let mut resumed = stdio(&state, &endpoint.url, IMAGE_MODEL);
        resumed.request("initialize", artifact_initialize()).await;
        let loaded = resumed
            .request(
                "session/load",
                json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await;
        assert!(loaded["result"].is_object(), "{loaded}");
        let waiting = snapshot(&mut resumed, session).await;
        assert_eq!(waiting["queue"][0]["inputId"], "missing-png");
        let release = resumed
            .request(
                "_co.grida/session/resume-queue",
                queue_basis(&waiting, session, "release-missing-png"),
            )
            .await;
        assert!(release["result"].is_object(), "{release}");
        let failed = timeout(WAIT, async {
            loop {
                let view = settled(&mut resumed, session).await;
                if view["latest"]["turnId"] != earlier_turn {
                    break view;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(failed["latest"]["status"], "failed", "{failed}");
        let turn = failed["latest"]["turnId"].as_str().unwrap();
        let summary = crop_summary(&mut resumed, session, turn).await;
        assert_eq!(summary["result"]["status"], "failed", "{summary}");
        assert_eq!(summary["result"]["unresolvedOperations"], 0, "{summary}");
        assert_eq!(
            summary["result"]["text"],
            "The retained PNG is unavailable. Start a new chat and attach the original PNG again."
        );
        let inspected = resumed
            .request(
                "_co.grida/session/input",
                json!({"sessionId":session,"inputId":"missing-png"}),
            )
            .await;
        assert_eq!(
            inspected["result"]["prompt"][1]["text"],
            "[Retained PNG image]"
        );
        assert!(!inspected.to_string().contains(&data));
        resumed.close().await;
        assert!(matches!(
            endpoint.requests.try_recv(),
            Err(tokio::sync::mpsc::error::TryRecvError::Empty)
        ));
        endpoint.task.abort();
        assert!(endpoint.task.await.unwrap_err().is_cancelled());
        assert!(!owner.exists());

        let store =
            agent_kit_store_sqlite::SqliteStore::open(state.join("runtime.sqlite")).unwrap();
        let input = store
            .input(
                SessionId::new(session).unwrap(),
                ChangeId::new("missing-png").unwrap(),
            )
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(
            input.disposition,
            InputDisposition::Completed { turn: retained } if retained.as_str() == turn
        ));
    }
}

#[tokio::test]
async fn shared_clients_cannot_import_image_bytes_even_with_the_image_profile() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start_protocol(ProviderProtocol::Responses, vec![], Some(TEST_CREDENTIAL)).await;
    let mut command = server(&state, &endpoint.url, IMAGE_MODEL);
    command
        .args([
            "--listen",
            "ws://127.0.0.1:0/acp",
            "--server-token-env",
            "GRIDA_AGENT_FIXTURE_SERVER_TOKEN",
        ])
        .env("GRIDA_AGENT_FIXTURE_SERVER_TOKEN", SERVER_TOKEN);
    let (child, url) = spawn_shared_server(command).await;
    let mut client = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let ready = ws_rpc(&mut client, 1, "initialize", artifact_initialize()).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["promptCapabilities"]["image"],
        false
    );
    assert!(ready["result"]["agentCapabilities"]["_meta"][ARTIFACTS].is_null());
    let created = ws_rpc(
        &mut client,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let attempted = ws_rpc(
        &mut client,
        3,
        "_co.grida/session/enqueue",
        upload(session, "shared", &STANDARD.encode(png([1, 2, 3]))),
    )
    .await;
    assert_eq!(
        attempted["error"]["data"], "image_input_unavailable",
        "{attempted}"
    );
    let artifact = ws_rpc(
        &mut client,
        4,
        "_co.grida/session/read-artifact",
        json!({"sessionId":session,"turnId":"any-turn","artifactId":"any-artifact"}),
    )
    .await;
    assert_eq!(artifact["error"]["code"], -32601, "{artifact}");
    assert!(endpoint.requests.try_recv().is_err());
    assert!(!state.join("retained-inputs").exists());
    drop(client);
    super::lifecycle::terminate_shared_server(child).await;
    endpoint.done().await;
}

#[tokio::test]
async fn unsupported_and_malformed_image_intakes_never_dispatch_the_text_subset() {
    let workspace = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start_protocol(ProviderProtocol::Responses, vec![], Some(TEST_CREDENTIAL)).await;
    let data = STANDARD.encode(png([1, 2, 3]));
    for (model, image) in [("fixture-model", false), (IMAGE_MODEL, true)] {
        let mut client = stdio(&state.path().join(model), &endpoint.url, model);
        let ready = client.request("initialize", extension_initialize()).await;
        assert_eq!(
            ready["result"]["agentCapabilities"]["promptCapabilities"]["image"],
            image
        );
        let created = client
            .request(
                "session/new",
                json!({"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let mut request = upload(session, "refused", &data);
        if image {
            request["prompt"][1]["data"] = json!("aW52YWxpZCBwbmc=");
        }
        let refused = client.request("_co.grida/session/enqueue", request).await;
        assert_eq!(
            refused["error"]["data"],
            if image {
                "invalid_png_image"
            } else {
                "image_input_unavailable"
            },
            "{refused}"
        );
        let view = snapshot(&mut client, session).await;
        assert_eq!(view["queuedInputs"], 0);
        assert!(view["latest"].is_null());
        client.close().await;
    }
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
async fn a_crop_saves_a_recoverable_copy_in_its_chat_without_touching_the_original() {
    use sha2::{Digest, Sha256};
    use std::fs;

    const TOOL: &str = "crop_retained_image";
    let digest = |bytes: &[u8]| {
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    };
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    fs::write(workspace.path().join("keep.txt"), "authored").unwrap();
    let original = encode_png(2, 2, &[255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]);
    let data = STANDARD.encode(&original);
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Tool(TOOL, r#"{"x":1,"y":0,"width":1,"height":2}"#),
            Reply::Finished("Saved the crop."),
            Reply::Finished("The chat still has its attachment."),
            Reply::Tool(TOOL, r#"{"x":0,"y":0,"width":1,"height":2}"#),
            Reply::Finished("Saved a different crop."),
            Reply::Tool(TOOL, r#"{"x":0,"y":0,"width":1,"height":2}"#),
            Reply::Finished("The earlier working copy is unavailable."),
            Reply::Finished("This chat has no image."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let ready = client.request("initialize", artifact_initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][ARTIFACTS], 1);
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let crop = client
        .request(
            "session/prompt",
            json!({
                "sessionId":session, "prompt":[
                    {"type":"text","text":"Crop the right half into a working copy."},
                    {"type":"image","mimeType":"image/png","data":data},
                ]
            }),
        )
        .await;
    assert_eq!(crop["result"]["stopReason"], "end_turn", "{crop}");
    let request = endpoint.request().await;
    assert_eq!(request["tools"][0]["name"], TOOL);
    let result = last_tool_result(endpoint.request().await);
    assert_eq!(result["status"], "succeeded", "{result}");
    let receipt = &result["structured"];
    assert_eq!(receipt["retention"], "chat_state");
    assert_eq!(receipt["width"], 1);
    assert_eq!(receipt["height"], 2);
    assert_eq!(receipt["sourceSha256"], digest(&original));
    assert!(!receipt.to_string().contains(state.to_str().unwrap()));
    let snapshot = settled(&mut client, session).await;
    let turn = snapshot["latest"]["turnId"].as_str().unwrap();
    let summary = crop_summary(&mut client, session, turn).await;
    assert!(summary["result"].get("artifactsOmitted").is_none());
    let artifacts = summary["result"]["artifacts"].as_array().unwrap();
    let [artifact] = artifacts.as_slice() else {
        panic!("expected exactly one result in {summary}");
    };
    let id = artifact["id"].as_str().unwrap();
    assert_eq!(
        *artifact,
        json!({
            "id": id, "kind": "image", "mimeType": "image/png", "label": "Cropped PNG",
            "width": 1, "height": 2, "bytes": receipt["bytes"]
        })
    );
    let opened = read_crop(&mut client, session, turn, id).await;
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;

    let scope = fs::read_dir(state.join("retained-inputs"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let source = fs::read_dir(scope.join("sources"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.extension()
                .is_some_and(|extension| extension == "asset")
        })
        .unwrap();
    assert!(fs::read(&source).unwrap().ends_with(&original));
    let work = fs::read_dir(scope.join("work"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let edited = fs::read(&work).unwrap();
    assert_eq!(receipt["sha256"], digest(&edited));
    assert_eq!(
        opened["result"],
        json!({"artifactId":id,"mimeType":"image/png","data":STANDARD.encode(&edited)})
    );
    assert_eq!(
        receipt["workingCopyId"],
        format!("working/{}", work.file_stem().unwrap().to_str().unwrap())
    );
    let mut reader = png::Decoder::new(std::io::Cursor::new(&edited))
        .read_info()
        .unwrap();
    let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
    let frame = reader.next_frame(&mut pixels).unwrap();
    assert_eq!((frame.width, frame.height), (1, 2));
    assert_eq!(pixels, [0, 255, 0, 255, 255, 0]);

    let mut restarted = stdio(&state, &endpoint.url, IMAGE_MODEL);
    restarted.request("initialize", artifact_initialize()).await;
    let detached = read_crop(&mut restarted, session, turn, id).await;
    assert!(detached["error"].is_object(), "{detached}");
    assert!(detached["result"].is_null());
    let load = restarted
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(load["result"].is_object(), "{load}");
    assert_eq!(
        crop_summary(&mut restarted, session, turn).await["result"],
        summary["result"]
    );
    assert_eq!(
        read_crop(&mut restarted, session, turn, id).await["result"],
        opened["result"]
    );
    let lock = scope.join("owner.lock");
    let moved_lock = scope.join("owner.lock-fixture");
    fs::rename(&lock, &moved_lock).unwrap();
    let no_lock = read_crop(&mut restarted, session, turn, id).await;
    assert_eq!(
        no_lock["error"]["data"], "artifact_unavailable",
        "{no_lock}"
    );
    assert!(!lock.exists());
    fs::rename(&moved_lock, &lock).unwrap();
    let invented = read_crop(&mut restarted, session, turn, "invented-artifact").await;
    assert_eq!(
        invented["error"]["data"], "artifact_unavailable",
        "{invented}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    let resumed = restarted
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":"Continue this chat."}]}),
        )
        .await;
    assert_eq!(resumed["result"]["stopReason"], "end_turn", "{resumed}");
    let retained = endpoint.request().await;
    assert_eq!(retained["tools"][0]["name"], TOOL);
    assert!(
        retained["input"]
            .to_string()
            .contains(&format!("data:image/png;base64,{data}"))
    );
    assert_eq!(fs::read(&work).unwrap(), edited);
    let replaced = restarted
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":"Crop the left half."}]}),
        )
        .await;
    assert_eq!(replaced["result"]["stopReason"], "end_turn", "{replaced}");
    endpoint.request().await;
    let replacement = last_tool_result(endpoint.request().await);
    assert_eq!(replacement["status"], "succeeded", "{replacement}");
    assert_eq!(
        replacement["structured"]["workingCopyId"],
        receipt["workingCopyId"]
    );
    assert_ne!(replacement["structured"]["sha256"], receipt["sha256"]);
    let different = read_crop(&mut restarted, session, turn, id).await;
    assert_eq!(
        different["error"]["data"], "artifact_unavailable",
        "{different}"
    );
    let snapshot = settled(&mut restarted, session).await;
    let replacement_turn = snapshot["latest"]["turnId"].as_str().unwrap();
    let summary = crop_summary(&mut restarted, session, replacement_turn).await;
    let replacement_id = summary["result"]["artifacts"][0]["id"].as_str().unwrap();
    assert_ne!(replacement_id, id);
    fs::remove_file(&work).unwrap();
    let missing = read_crop(&mut restarted, session, replacement_turn, replacement_id).await;
    assert_eq!(
        missing["error"]["data"], "artifact_unavailable",
        "{missing}"
    );
    assert!(!work.exists());
    assert!(endpoint.requests.try_recv().is_err());
    let lost = restarted
        .request(
            "session/prompt",
            json!({
                "sessionId":session,"prompt":[{"type":"text","text":"Crop the left half."}],
            }),
        )
        .await;
    assert_eq!(lost["result"]["stopReason"], "end_turn", "{lost}");
    assert_eq!(endpoint.request().await["tools"][0]["name"], TOOL);
    let unavailable = last_tool_result(endpoint.request().await);
    assert_eq!(unavailable["status"], "failed", "{unavailable}");
    assert_eq!(
        unavailable["content"][0],
        "scratch_working_copy_unavailable"
    );
    assert!(!work.exists());
    let created = restarted
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let other = created["result"]["sessionId"].as_str().unwrap();
    let foreign = read_crop(&mut restarted, other, turn, id).await;
    assert_eq!(
        foreign["error"]["data"], "artifact_unavailable",
        "{foreign}"
    );
    let other_chat = restarted
        .request(
            "session/prompt",
            json!({"sessionId":other,"prompt":[{"type":"text","text":"Start a separate chat."}]}),
        )
        .await;
    assert_eq!(
        other_chat["result"]["stopReason"], "end_turn",
        "{other_chat}"
    );
    assert!(endpoint.request().await.get("tools").is_none());
    restarted.close().await;
    assert!(fs::read(&source).unwrap().ends_with(&original));
    assert_eq!(
        fs::read_to_string(workspace.path().join("keep.txt")).unwrap(),
        "authored"
    );
    assert_eq!(fs::read_dir(workspace.path()).unwrap().count(), 1);
    endpoint.done().await;
}

#[tokio::test]
async fn a_failed_final_response_retains_partial_crops_and_discloses_the_listing_limit() {
    use std::fmt::Write as _;

    let root = TempDir::new().unwrap();
    let state = root.path().join("state");
    let workspace = TempDir::new().unwrap();
    // Each crop checks real scratch ACLs. Keep the fixture's provider waits
    // independent of a large burst of filesystem checks in the parallel suite.
    let crop_batch = |first| {
        let mut body = String::new();
        for index in 0..3 {
            let id = first + index;
            let item = json!({
                "type":"response.output_item.done", "output_index":index,
                "item":{"type":"function_call","id":format!("crop-{id}"),
                    "call_id":format!("crop-call-{id}"),"name":"crop_retained_image",
                    "arguments":r#"{"x":0,"y":0,"width":1,"height":1}"#,"status":"completed"}
            });
            write!(body, "data: {item}\n\n").unwrap();
        }
        let done = json!({"type":"response.completed", "response":{"status":"completed"}});
        write!(body, "data: {done}\n\n").unwrap();
        Reply::RawHttp(format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
    };
    let mut endpoint = Endpoint::start_protocol_with_wait(
        ProviderProtocol::Responses,
        vec![
            crop_batch(0),
            crop_batch(3),
            crop_batch(6),
            Reply::RawHttp(
                "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    .into(),
            ),
        ],
        Some(TEST_CREDENTIAL),
        // A multi-crop batch can still be in scratch checks when the
        // ordinary provider fixture deadline expires under concurrent I/O.
        WAIT * 3,
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    client.request("initialize", artifact_initialize()).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let data = STANDARD.encode(png([150, 50, 90]));
    let accepted = client
        .request(
            "_co.grida/session/submit",
            upload(session, "partial-crops", &data),
        )
        .await;
    assert_eq!(accepted["result"]["inputId"], "partial-crops", "{accepted}");
    for _ in 0..4 {
        endpoint.request().await;
    }
    let latest = settled(&mut client, session).await;
    let turn = latest["latest"]["turnId"].as_str().unwrap();
    let before = crop_summary(&mut client, session, turn).await;
    let summary = &before["result"];
    assert_eq!(summary["status"], "failed", "{before}");
    assert!(summary["text"].as_str().unwrap().contains("authentication"));
    assert_eq!(summary["toolActivity"]["succeeded"], 9);
    let artifacts = summary["artifacts"].as_array().unwrap();
    assert_eq!(artifacts.len(), 8);
    assert_eq!(summary["artifactsOmitted"], 1);
    let artifact = artifacts[0]["id"].as_str().unwrap();
    let preview = read_crop(&mut client, session, turn, artifact).await;
    assert!(preview["result"]["data"].is_string(), "{preview}");
    client.close().await;

    let load = json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]});
    let mut ordinary = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let mut initialize = artifact_initialize();
    initialize["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap()
        .remove(ARTIFACTS);
    ordinary.request("initialize", initialize).await;
    ordinary.request("session/load", load.clone()).await;
    let without_artifacts = crop_summary(&mut ordinary, session, turn).await;
    assert_eq!(without_artifacts["result"]["status"], "failed");
    assert!(without_artifacts["result"].get("artifacts").is_none());
    assert!(
        without_artifacts["result"]
            .get("artifactsOmitted")
            .is_none()
    );
    ordinary.close().await;

    let mut reopened = stdio(&state, &endpoint.url, IMAGE_MODEL);
    reopened.request("initialize", artifact_initialize()).await;
    reopened.request("session/load", load).await;
    assert_eq!(
        crop_summary(&mut reopened, session, turn).await["result"],
        *summary
    );
    assert_eq!(
        read_crop(&mut reopened, session, turn, artifact).await["result"],
        preview["result"]
    );
    reopened.close().await;
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

async fn crop_summary(client: &mut StdioClient, session: &str, turn: &str) -> Value {
    client
        .request(
            "_co.grida/session/turn-summary",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await
}

async fn read_crop(client: &mut StdioClient, session: &str, turn: &str, id: &str) -> Value {
    client
        .request(
            "_co.grida/session/read-artifact",
            json!({"sessionId":session,"turnId":turn,"artifactId":id}),
        )
        .await
}

fn last_tool_result(request: Value) -> Value {
    let output = request["input"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|part| part["type"] == "function_call_output")
        .unwrap();
    serde_json::from_str(output["output"].as_str().unwrap()).unwrap()
}
