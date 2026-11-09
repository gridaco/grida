//! GRIDA-SEC-004 — private attachment intake and exact restart recovery.

use super::approvals::Stdio as StdioClient;
use super::lifecycle::{queue_basis, task_basis};
use super::*;
use agent_kit_core::{ChangeId, SessionId};
use base64::{Engine, engine::general_purpose::STANDARD};

const IMAGE_MODEL: &str = "gpt-5.4";

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
    resumed.close().await;
    endpoint.done().await;
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
    let ready = ws_rpc(&mut client, 1, "initialize", extension_initialize()).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["promptCapabilities"]["image"],
        false
    );
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
            Reply::Finished("The earlier working copy is unavailable."),
            Reply::Finished("This chat has no image."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    client.request("initialize", extension_initialize()).await;
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
    restarted
        .request("initialize", extension_initialize())
        .await;
    let load = restarted
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(load["result"].is_object(), "{load}");
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
    fs::remove_file(&work).unwrap();
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
