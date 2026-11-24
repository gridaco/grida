//! GRIDA-SEC-004 — ordered attachment admission, checkout edits and recovery.

use super::approvals::Stdio as Peer;
use super::lifecycle::{prompt_request, queue_basis, queue_ids, task_basis};
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use tokio::sync::oneshot;

const BATCHES: &str = "co.grida/session/attachment-batches";
const QUEUE_ACTIONS: &str = "co.grida/session/queue-actions";
const QUEUED_IMAGES: &str = "co.grida/session/queued-input-image-chunks";
const RECORDED_IMAGES: &str = "co.grida/session/input-image-chunks";
const WINDOW: &str = "co.grida/session/transcript-window";
const MODEL: &str = "gpt-6.1-sol";
const SUBMIT: &str = "_co.grida/session/submit";
const ENQUEUE: &str = "_co.grida/session/enqueue";
const CHECKOUT: &str = "_co.grida/session/queue-checkout";
const REINSERT: &str = "_co.grida/session/queue-reinsert";
const STEER: &str = "_co.grida/session/steer-queued";
const RED: [u8; 3] = [239, 27, 43];
const BLUE: [u8; 3] = [29, 42, 217];
const GREEN: [u8; 3] = [24, 229, 84];

async fn call(client: &mut Peer, method: &str, params: Value) -> Value {
    let response = client.request(method, params).await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{method}: {response}"))
        .clone()
}

async fn connect(state: &Path, endpoint: &str, batches: bool) -> Peer {
    let child = executable()
        .args(["serve", "--stdio", "--provider", "responses", "--state-dir"])
        .arg(state)
        .args(["--endpoint", endpoint, "--model", MODEL])
        .args(["--credential-env", "GRIDA_AGENT_PROCESS_TEST_KEY"])
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL)
        .env("GRIDA_HOME", fixture_config_home(state))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut peer = Peer::from_child(child);
    let mut initialize = extension_initialize();
    for capability in [
        QUEUE_ACTIONS,
        QUEUED_IMAGES,
        RECORDED_IMAGES,
        WINDOW,
        "co.grida/session/selected-image",
        "co.grida/session/selected-file",
        "co.grida/session/file-reference",
    ] {
        initialize["clientCapabilities"]["_meta"][capability] = 1.into();
    }
    if batches {
        initialize["clientCapabilities"]["_meta"][BATCHES] = 1.into();
    }
    let capabilities = call(&mut peer, "initialize", initialize).await;
    if batches {
        assert_eq!(capabilities["agentCapabilities"]["_meta"][BATCHES], 1);
    }
    peer
}

async fn new_session(client: &mut Peer, workspace: &Path) -> String {
    call(
        client,
        "session/new",
        json!({"cwd":workspace,"mcpServers":[]}),
    )
    .await["sessionId"]
        .as_str()
        .unwrap()
        .to_owned()
}

async fn attach(client: &mut Peer, workspace: &Path, session: &str) {
    call(
        client,
        "session/load",
        json!({
            "sessionId":session,"cwd":workspace,"mcpServers":[],"_meta":{WINDOW:{"kind":"attach"}}
        }),
    )
    .await;
}

async fn snapshot(client: &mut Peer, session: &str) -> Value {
    call(
        client,
        "_co.grida/session/snapshot",
        json!({"sessionId":session}),
    )
    .await
}

async fn idle(client: &mut Peer, session: &str) -> Value {
    timeout(WAIT, async {
        loop {
            let view = snapshot(client, session).await;
            if view["current"].is_null() {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

async fn input(client: &mut Peer, session: &str, input_id: &str) -> Value {
    call(
        client,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":input_id}),
    )
    .await
}

async fn action_receipt(client: &mut Peer, session: &str, request_id: &str) -> Value {
    call(
        client,
        "_co.grida/session/queue-action-receipt",
        json!({"sessionId":session,"requestId":request_id}),
    )
    .await["receipt"]
        .clone()
}

async fn checkout(client: &mut Peer, session: &str, request: &str, input_id: &str) -> Value {
    let view = snapshot(client, session).await;
    let mut params = queue_basis(&view, session, request);
    params["inputId"] = input_id.into();
    call(client, CHECKOUT, params).await
}

async fn held_message(
    client: &mut Peer,
    session: &str,
    input_id: &str,
    checkout_id: &Value,
) -> Value {
    call(
        client,
        "_co.grida/session/queued-message",
        json!({
            "sessionId":session,"inputId":input_id,"checkoutId":checkout_id,
        }),
    )
    .await
}

fn raster(path: &Path, name: &str, pixel: [u8; 3]) -> Value {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, 3, 2);
    encoder.set_color(png::ColorType::Rgb);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&pixel.repeat(6)).unwrap();
    writer.finish().unwrap();
    fs::write(path, &bytes).unwrap();
    let digest: [u8; 32] = Sha256::digest(&bytes).into();
    json!({"kind":"image","selection":{"path":path,"name":name,"sha256":digest,"source":"disk"}})
}

fn upload(name: &str, bytes: &[u8]) -> Value {
    json!({"kind":"file","name":name,"data":STANDARD.encode(bytes)})
}

fn staged_file(path: &Path, name: &str, bytes: &[u8]) -> Value {
    fs::write(path, bytes).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).unwrap();
    let digest: [u8; 32] = Sha256::digest(bytes).into();
    json!({"kind":"staged_file","size":bytes.len(),
        "selection":{"path":path,"name":name,"sha256":digest,"source":"snapshot"},
    })
}

fn attachment_input(session: &str, id: &str, text: &str, attachments: Vec<Value>) -> Value {
    let mut request = prompt_request(session, id, text);
    request["attachments"] = attachments.into();
    request
}

fn attached_content<'a>(request: &'a Value, text: &str) -> &'a [Value] {
    request["input"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["role"] == "user")
        .filter_map(|message| message["content"].as_array())
        .find(|content| content.first().is_some_and(|item| item["text"] == text))
        .unwrap_or_else(|| panic!("no user input {text:?} in {request}"))
}

fn assert_user_text(request: &Value, text: &str) {
    assert!(
        request["input"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| message["role"] == "user" && message["content"] == text),
        "{request}"
    );
}

fn pixels(bytes: &[u8]) -> [u8; 3] {
    image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .unwrap()
        .to_rgb8()
        .get_pixel(0, 0)
        .0
}

fn observed_image(content: &Value) -> [u8; 3] {
    assert_eq!(content["type"], "input_image", "{content}");
    let data = content["image_url"]
        .as_str()
        .unwrap()
        .strip_prefix("data:image/png;base64,")
        .unwrap();
    pixels(&STANDARD.decode(data).unwrap())
}

fn stored_assets(state: &Path) -> Vec<PathBuf> {
    let root = state.join("retained-inputs");
    if !root.exists() {
        return Vec::new();
    }
    fs::read_dir(root)
        .unwrap()
        .map(|entry| entry.unwrap().path().join("sources"))
        .filter(|sources| sources.is_dir())
        .flat_map(|sources| fs::read_dir(sources).unwrap())
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "asset")
        })
        .collect()
}

fn inspection_reply(index: usize) -> Reply {
    Reply::Choose(Box::new(move |request| {
        let tool = request["tools"]
            .as_array()
            .unwrap()
            .iter()
            .find(|tool| tool["name"] == "inspect_retained_file")
            .unwrap();
        let ids = tool["parameters"]["properties"]["attachment_id"]["enum"]
            .as_array()
            .unwrap();
        assert_eq!(ids.len(), 2);
        assert_ne!(ids[0], ids[1]);
        let arguments = json!({"attachment_id":ids[index],"include_text":true});
        Reply::ResponsesEvents(vec![
            json!({"type":"response.output_item.done","output_index":0,"item":{
                "type":"function_call","id":format!("fc_{index}"),"call_id":format!("call_{index}"),
                "name":"inspect_retained_file","arguments":arguments.to_string(),"status":"completed",
            }}),
            json!({"type":"response.completed","response":{"status":"completed",
                "usage":{"input_tokens":5,"output_tokens":3},
            }}),
        ])
    }))
}

fn inspected_file(request: &Value, index: usize) -> Value {
    let output = request["input"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| {
            item["type"] == "function_call_output" && item["call_id"] == format!("call_{index}")
        })
        .unwrap_or_else(|| panic!("missing retained file result {index}: {request}"));
    serde_json::from_str::<Value>(output["output"].as_str().unwrap()).unwrap()["structured"].clone()
}

#[tokio::test]
async fn staged_files_cross_the_inline_budget_and_remain_individually_inspectable() {
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = fixture.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            inspection_reply(1),
            inspection_reply(0),
            Reply::Finished("Inspected both files."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url, true).await;
    let session = new_session(&mut client, workspace.path()).await;
    let custody = state.canonicalize().unwrap().join("desktop-image-custody");
    let snapshots = custody.join("snapshots");
    for directory in [&custody, &snapshots] {
        fs::create_dir(directory).unwrap();
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let first = "first file. ".repeat(18_000);
    let second = "second file. ".repeat(18_000);
    let first_path = snapshots.join("first");
    let second_path = snapshots.join("second");
    let request = attachment_input(
        &session,
        "staged-files",
        "Inspect both attached files.",
        vec![
            staged_file(&first_path, "notes.txt", first.as_bytes()),
            staged_file(&second_path, "notes.txt", second.as_bytes()),
        ],
    );
    call(&mut client, SUBMIT, request).await;
    endpoint.request().await;
    fs::remove_file(first_path).unwrap();
    fs::remove_file(second_path).unwrap();
    let second_result = inspected_file(&endpoint.request().await, 1);
    let first_result = inspected_file(&endpoint.request().await, 0);
    assert_eq!(first_result["bytes"], first.len());
    assert_eq!(second_result["bytes"], second.len());
    assert!(
        first_result["text"]
            .as_str()
            .unwrap()
            .starts_with("first file. ")
    );
    assert!(
        second_result["text"]
            .as_str()
            .unwrap()
            .starts_with("second file. ")
    );
    assert_ne!(first_result["attachmentId"], second_result["attachmentId"]);
    assert_eq!(
        idle(&mut client, &session).await["latest"]["status"],
        "succeeded"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn mixed_batch_keeps_order_in_the_provider_request_and_reopened_transcript() {
    const CAPTION: &str = "Compare the two colors and inspect the attached notes.";
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let cwd = workspace.path().canonicalize().unwrap();
    let state = fixture.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::Finished("Compared both references.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url, true).await;
    let session = new_session(&mut client, &cwd).await;
    let red = cwd.join("a.png");
    let blue = cwd.join("b.png");
    let folder = cwd.join("resources");
    fs::create_dir(&folder).unwrap();
    let request = attachment_input(
        &session,
        "mixed",
        CAPTION,
        vec![
            raster(&red, "reference.png", RED),
            upload("notes.txt", b"This content is inspected on demand."),
            raster(&blue, "reference.png", BLUE),
            json!({"kind":"reference","reference":{"name":"resources","path":folder,
            "workspacePath":"resources","mimeType":"inode/directory"}}),
        ],
    );
    let accepted = call(&mut client, SUBMIT, request.clone()).await;
    let outbound = endpoint.request().await;
    let parts = attached_content(&outbound, CAPTION);
    assert_eq!(parts.len(), 7, "{parts:?}");
    assert!(parts[1]["text"].as_str().unwrap().contains("a.png"));
    assert_eq!(observed_image(&parts[2]), RED);
    assert!(parts[3]["text"].as_str().unwrap().contains("notes.txt"));
    assert!(parts[4]["text"].as_str().unwrap().contains("b.png"));
    assert_eq!(observed_image(&parts[5]), BLUE);
    let folder = parts[6]["text"].as_str().unwrap();
    assert!(folder.contains("Attached folder by reference:") && folder.contains("resources"));
    assert!(
        !outbound
            .to_string()
            .contains("This content is inspected on demand.")
    );
    let settled = idle(&mut client, &session).await;
    assert_eq!(settled["latest"]["status"], "succeeded");
    let retained = input(&mut client, &session, "mixed").await;
    assert_eq!(
        retained["receipt"]["inputPosition"],
        accepted["inputPosition"]
    );
    client.close().await;
    fs::remove_file(red).unwrap();
    fs::remove_file(blue).unwrap();

    let mut reopened = connect(&state, &endpoint.url, true).await;
    attach(&mut reopened, &cwd, &session).await;
    assert_eq!(
        call(&mut reopened, SUBMIT, request).await,
        retained["receipt"]
    );
    let id = reopened
        .send(
            "session/load",
            json!({"sessionId":session,"cwd":cwd,"mcpServers":[],
                "_meta":{WINDOW:{"kind":"read","requestId":"replay-batch"}},
            }),
        )
        .await;
    let mut caption_message = Value::Null;
    let mut attachments = Vec::new();
    loop {
        let frame = reopened.read_frame().await;
        if frame["id"] == id {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let update = &frame["params"]["update"];
        let content = &update["content"];
        if content["text"] == CAPTION {
            caption_message = update["messageId"].clone();
        } else if content["type"] == "resource_link"
            && !caption_message.is_null()
            && update["messageId"] == caption_message
        {
            attachments.push(content.clone());
        }
    }
    assert!(caption_message.is_string());
    let names = attachments
        .iter()
        .map(|item| item["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        ["reference.png", "notes.txt", "reference.png", "resources"]
    );
    assert_ne!(attachments[0]["uri"], attachments[2]["uri"]);
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn invalid_later_attachment_leaves_no_input_or_new_retained_assets() {
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = fixture.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::Finished("Both references accepted.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut legacy = connect(&state, &endpoint.url, false).await;
    let session = new_session(&mut legacy, workspace.path()).await;
    let valid = attachment_input(
        &session,
        "candidate",
        "Check the attachments.",
        vec![
            raster(&workspace.path().join("first.png"), "first.png", RED),
            raster(&workspace.path().join("second.png"), "second.png", BLUE),
        ],
    );
    let refused = legacy.request(SUBMIT, valid.clone()).await;
    assert!(refused["error"].is_object(), "{refused}");
    assert!(stored_assets(&state).is_empty());
    legacy.close().await;

    let mut client = connect(&state, &endpoint.url, true).await;
    attach(&mut client, workspace.path(), &session).await;
    let before = snapshot(&mut client, &session).await;
    let mut over_count = valid.clone();
    over_count["attachments"] = json!(vec![valid["attachments"][0].clone(); 9]);
    let refused = client.request(SUBMIT, over_count).await;
    assert_eq!(
        refused["error"]["data"], "attachment_count_limit",
        "{refused}"
    );
    let over_bytes = attachment_input(
        &session,
        "candidate",
        "Check the attachments.",
        vec![
            upload("first.bin", &vec![5; 200 * 1024]),
            upload("second.bin", &vec![7; 200 * 1024]),
        ],
    );
    let refused = client.request(SUBMIT, over_bytes).await;
    assert_eq!(
        refused["error"]["data"], "attachment_batch_bytes_limit",
        "{refused}"
    );
    let mut bad_digest = valid.clone();
    bad_digest["attachments"][1]["selection"]["sha256"] = json!(vec![0; 32]);
    let refused = client.request(SUBMIT, bad_digest).await;
    assert!(refused["error"].is_object(), "{refused}");
    assert_eq!(snapshot(&mut client, &session).await, before);
    assert!(
        stored_assets(&state).is_empty(),
        "{:?}",
        stored_assets(&state)
    );
    assert!(endpoint.requests.try_recv().is_err());
    call(&mut client, SUBMIT, valid).await;
    assert_eq!(
        attached_content(&endpoint.request().await, "Check the attachments.").len(),
        5
    );
    assert_eq!(
        idle(&mut client, &session).await["latest"]["status"],
        "succeeded"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn queued_save_replaces_attachment_members_at_reserved_rank_and_replays_without_source() {
    const CAPTION: &str = "Review the two remaining attachments.";
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = fixture.path().join("state");
    let (finish_active, first_gate) = oneshot::channel();
    let (finish_neighbor, neighbor_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("Active finishes.", first_gate),
            Reply::Release("Neighbor finishes.", neighbor_gate),
            Reply::Finished("Revised batch finishes."),
            Reply::Finished("Tail finishes."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url, true).await;
    let session = new_session(&mut client, workspace.path()).await;
    call(
        &mut client,
        SUBMIT,
        prompt_request(&session, "active", "Start the active turn."),
    )
    .await;
    endpoint.request().await;
    call(
        &mut client,
        ENQUEUE,
        prompt_request(&session, "neighbor", "Run the neighbor first."),
    )
    .await;
    let repeated = raster(
        &workspace.path().join("original.png"),
        "reference.png",
        BLUE,
    );
    let mut original_request = attachment_input(
        &session,
        "original",
        "Original caption.",
        vec![
            repeated.clone(),
            upload("remove.txt", b"Only the original retained input has this."),
            repeated,
        ],
    );
    original_request["operatingRegime"] = "plan".into();
    call(&mut client, ENQUEUE, original_request).await;
    call(
        &mut client,
        ENQUEUE,
        prompt_request(&session, "tail", "Run the tail last."),
    )
    .await;
    let original = input(&mut client, &session, "original").await;
    let checkout_id =
        checkout(&mut client, &session, "edit-original", "original").await["checkoutId"].clone();
    let held = held_message(&mut client, &session, "original", &checkout_id).await;
    assert_eq!(held["attachmentIndexes"], json!([0, 1, 2]), "{held}");
    assert_ne!(held["prompt"][1]["uri"], held["prompt"][3]["uri"]);
    finish_active.send(()).unwrap();
    assert_user_text(&endpoint.request().await, "Run the neighbor first.");
    assert_eq!(queue_ids(&snapshot(&mut client, &session).await), ["tail"]);
    let invalid = json!({"sessionId":session,"requestId":"invalid-keep","checkoutId":checkout_id,
        "text":CAPTION,"attachments":[{"kind":"keep","index":3}]
    });
    let refused = client.request(REINSERT, invalid).await;
    assert_eq!(
        refused["error"]["data"], "queue_attachment_unavailable",
        "{refused}"
    );
    assert_eq!(
        snapshot(&mut client, &session).await["queueCheckout"]["checkoutId"],
        checkout_id
    );

    let replacement_path = workspace.path().join("new.png");
    let save = json!({"sessionId":session,"requestId":"save-batch","checkoutId":checkout_id,"text":CAPTION,
        "attachments":[raster(&replacement_path, "new.png", GREEN),{"kind":"keep","index":2}],
    });
    // Discard the response and recover the accepted mutation by its identity.
    client.send(REINSERT, save.clone()).await;
    let receipt = timeout(WAIT, async {
        loop {
            let receipt = action_receipt(&mut client, &session, "save-batch").await;
            if !receipt.is_null() {
                return receipt;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let replacement_id = receipt["inputId"].as_str().unwrap();
    assert_ne!(replacement_id, "original");
    let waiting = snapshot(&mut client, &session).await;
    assert_eq!(queue_ids(&waiting), [replacement_id, "tail"]);
    assert!(waiting["queueCheckout"].is_null());
    let replacement = input(&mut client, &session, replacement_id).await;
    assert_eq!(replacement["settings"], original["settings"]);
    assert_eq!(replacement["settings"]["operatingRegime"], "plan");
    assert_eq!(
        input(&mut client, &session, "original").await["prompt"],
        original["prompt"]
    );
    fs::remove_file(replacement_path).unwrap();
    finish_neighbor.send(()).unwrap();
    let outbound = endpoint.request().await;
    let parts = attached_content(&outbound, CAPTION);
    assert_eq!(parts.len(), 5, "{parts:?}");
    assert_eq!(observed_image(&parts[2]), GREEN);
    assert_eq!(observed_image(&parts[4]), BLUE);
    assert_user_text(&endpoint.request().await, "Run the tail last.");
    assert!(queue_ids(&idle(&mut client, &session).await).is_empty());
    client.close().await;

    let mut reopened = connect(&state, &endpoint.url, true).await;
    attach(&mut reopened, workspace.path(), &session).await;
    assert_eq!(call(&mut reopened, REINSERT, save.clone()).await, receipt);
    let mut changed = save;
    changed["attachments"].as_array_mut().unwrap().reverse();
    assert!(reopened.request(REINSERT, changed).await["error"].is_object());
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn cancel_restores_the_exact_attachment_batch_after_reopen() {
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = fixture.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::Hold("Hold the first turn.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url, true).await;
    let session = new_session(&mut client, workspace.path()).await;
    call(
        &mut client,
        SUBMIT,
        prompt_request(&session, "active", "Hold while I queue messages."),
    )
    .await;
    endpoint.request().await;
    call(
        &mut client,
        ENQUEUE,
        prompt_request(&session, "left", "Before the edit."),
    )
    .await;
    let image_path = workspace.path().join("original.png");
    let batch = attachment_input(
        &session,
        "original",
        "Original to restore.",
        vec![
            upload("notes.txt", b"Keep the original bytes."),
            raster(&image_path, "keep.png", BLUE),
        ],
    );
    call(&mut client, ENQUEUE, batch).await;
    call(
        &mut client,
        ENQUEUE,
        prompt_request(&session, "right", "After the edit."),
    )
    .await;
    let original = input(&mut client, &session, "original").await;
    let running = snapshot(&mut client, &session).await;
    call(
        &mut client,
        "_co.grida/session/stop",
        task_basis(&running, &session, "hold-queue"),
    )
    .await;
    idle(&mut client, &session).await;
    let held = checkout(&mut client, &session, "checkout-cancel", "original").await;
    let checkout_id = &held["checkoutId"];
    let original_display = held_message(&mut client, &session, "original", checkout_id).await;
    client.close().await;
    fs::remove_file(image_path).unwrap();

    let mut reopened = connect(&state, &endpoint.url, true).await;
    attach(&mut reopened, workspace.path(), &session).await;
    let view = snapshot(&mut reopened, &session).await;
    assert_eq!(view["queueCheckout"]["checkoutId"], *checkout_id);
    assert_eq!(
        held_message(&mut reopened, &session, "original", checkout_id).await,
        original_display
    );
    let cancel = json!({"sessionId":session,"requestId":"restore-batch","checkoutId":checkout_id});
    let receipt = call(&mut reopened, REINSERT, cancel.clone()).await;
    assert_eq!(receipt["inputId"], "original");
    let view = snapshot(&mut reopened, &session).await;
    assert!(view["queueCheckout"].is_null());
    assert_eq!(queue_ids(&view), ["left", "original", "right"]);
    assert_eq!(input(&mut reopened, &session, "original").await, original);
    assert_eq!(call(&mut reopened, REINSERT, cancel).await, receipt);

    let held_again = checkout(&mut reopened, &session, "checkout-remove-all", "original").await;
    let blank = json!({"sessionId":session,"requestId":"blank-edit","checkoutId":held_again["checkoutId"],
        "text":"","attachments":[],
    });
    assert!(reopened.request(REINSERT, blank).await["error"].is_object());
    let clear = json!({"sessionId":session,"requestId":"remove-all","checkoutId":held_again["checkoutId"],
        "attachments":[],
    });
    let edited = call(&mut reopened, REINSERT, clear).await;
    let edited_id = edited["inputId"].as_str().unwrap();
    let view = snapshot(&mut reopened, &session).await;
    assert_eq!(queue_ids(&view), ["left", edited_id, "right"]);
    assert_eq!(
        input(&mut reopened, &session, edited_id).await["prompt"],
        json!([{"type":"text","text":"Original to restore."}])
    );
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn steering_refuses_the_whole_batch_when_only_its_second_raster_is_unavailable() {
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = fixture.path().join("state");
    let (finish_target, target_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("Keep the target turn running.", target_gate),
            Reply::Finished("Both images applied."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url, true).await;
    let session = new_session(&mut client, workspace.path()).await;
    call(
        &mut client,
        SUBMIT,
        prompt_request(&session, "target", "Start the target turn."),
    )
    .await;
    endpoint.request().await;
    let queued = attachment_input(
        &session,
        "raster-batch",
        "Steer with both images.",
        vec![
            raster(&workspace.path().join("first.png"), "first.png", RED),
            raster(&workspace.path().join("second.png"), "second.png", BLUE),
        ],
    );
    call(&mut client, ENQUEUE, queued).await;
    let running = snapshot(&mut client, &session).await;
    assert_eq!(running["queue"][0]["steerable"], true, "{running}");
    let mut removed = Vec::new();
    for path in stored_assets(&state) {
        let bytes = fs::read(&path).unwrap();
        let signature = b"\x89PNG\r\n\x1a\n";
        let start = bytes
            .windows(signature.len())
            .position(|window| window == signature)
            .unwrap();
        if pixels(&bytes[start..]) == BLUE {
            let moved = fixture.path().join(path.file_name().unwrap());
            fs::rename(&path, &moved).unwrap();
            removed.push((path, moved));
        }
    }
    assert_eq!(removed.len(), 2, "second original and prepared raster");
    assert_eq!(
        stored_assets(&state).len(),
        2,
        "first raster remains readable"
    );
    let denied = client
        .request(
            STEER,
            json!({
                "task":task_basis(&running,&session,"unavailable-steer"),"inputId":"raster-batch",
            }),
        )
        .await;
    assert_eq!(
        denied["error"]["data"], "retained_image_unavailable",
        "{denied}"
    );
    let latest = snapshot(&mut client, &session).await;
    assert_eq!(queue_ids(&latest), ["raster-batch"]);
    assert_eq!(latest["current"]["turnId"], running["current"]["turnId"]);
    assert!(
        action_receipt(&mut client, &session, "unavailable-steer")
            .await
            .is_null()
    );
    for (original, moved) in removed {
        fs::rename(moved, original).unwrap();
    }
    let applied = call(
        &mut client,
        STEER,
        json!({
            "task":task_basis(&latest,&session,"available-steer"),"inputId":"raster-batch",
        }),
    )
    .await;
    assert_eq!(applied["turnId"], running["current"]["turnId"]);
    finish_target.send(()).unwrap();
    let outbound = endpoint.request().await;
    let parts = attached_content(&outbound, "Steer with both images.");
    assert_eq!(parts.len(), 5);
    assert_eq!(observed_image(&parts[2]), RED);
    assert_eq!(observed_image(&parts[4]), BLUE);
    assert_eq!(
        idle(&mut client, &session).await["latest"]["status"],
        "succeeded"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn steered_image_originals_are_readable_from_active_and_reopened_transcripts() {
    let fixture = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = fixture.path().join("state");
    let (finish_target, target_gate) = oneshot::channel();
    let (finish_reply, reply_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("Keep the target turn running.", target_gate),
            Reply::Release("Both images applied.", reply_gate),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url, true).await;
    let session = new_session(&mut client, workspace.path()).await;
    call(
        &mut client,
        SUBMIT,
        prompt_request(&session, "target", "Start the target turn."),
    )
    .await;
    endpoint.request().await;
    let paths = [
        workspace.path().join("first.png"),
        workspace.path().join("second.png"),
    ];
    let queued = attachment_input(
        &session,
        "raster-batch",
        "Steer with both images.",
        vec![
            raster(&paths[0], "first.png", RED),
            raster(&paths[1], "second.png", BLUE),
        ],
    );
    call(&mut client, ENQUEUE, queued).await;
    let originals = paths.map(|path| {
        let bytes = fs::read(&path).unwrap();
        fs::remove_file(path).unwrap();
        bytes
    });
    let running = snapshot(&mut client, &session).await;
    call(
        &mut client,
        STEER,
        json!({
            "task":task_basis(&running,&session,"steer-images"),"inputId":"raster-batch",
        }),
    )
    .await;
    finish_target.send(()).unwrap();
    endpoint.request().await;
    assert!(!snapshot(&mut client, &session).await["current"].is_null());
    let active =
        steered_image_links(&mut client, &session, workspace.path(), "active-images").await;
    assert_steered_image_originals(&mut client, &session, &active, &originals).await;
    finish_reply.send(()).unwrap();
    assert_eq!(
        idle(&mut client, &session).await["latest"]["status"],
        "succeeded"
    );
    client.close().await;

    let mut reopened = connect(&state, &endpoint.url, true).await;
    attach(&mut reopened, workspace.path(), &session).await;
    let replayed =
        steered_image_links(&mut reopened, &session, workspace.path(), "reopened-images").await;
    assert_eq!(replayed, active);
    assert_steered_image_originals(&mut reopened, &session, &replayed, &originals).await;
    reopened.close().await;
    endpoint.done().await;
}

async fn steered_image_links(
    client: &mut Peer,
    session: &str,
    cwd: &Path,
    request: &str,
) -> Vec<(String, String)> {
    let id = client
        .send(
            "session/load",
            json!({"sessionId":session,"cwd":cwd,"mcpServers":[],
                "_meta":{WINDOW:{"kind":"read","requestId":request}},
            }),
        )
        .await;
    let mut links = Vec::new();
    let mut names = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == id {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let params = &frame["params"];
        let update = &params["update"];
        let content = &update["content"];
        if params["_meta"][WINDOW]["requestId"] != request
            || params["_meta"][WINDOW]["inputId"] != "raster-batch"
            || update["sessionUpdate"] != "user_message_chunk"
            || content["type"] != "resource_link"
        {
            continue;
        }
        assert_eq!(content["mimeType"], "image/png");
        names.push(content["name"].as_str().unwrap().to_owned());
        links.push((
            update["messageId"].as_str().unwrap().to_owned(),
            content["uri"].as_str().unwrap().to_owned(),
        ));
    }
    assert_eq!(names, ["first.png", "second.png"]);
    assert_eq!(links[0].0, links[1].0);
    assert_ne!(links[0].1, links[1].1);
    links
}

async fn assert_steered_image_originals(
    client: &mut Peer,
    session: &str,
    links: &[(String, String)],
    originals: &[Vec<u8>; 2],
) {
    for ((message, uri), original) in links.iter().zip(originals) {
        let read = call(
            client,
            "_co.grida/session/read-input-image-chunk",
            json!({"sessionId":session,"messageId":message,"attachmentUri":uri,"offset":0}),
        )
        .await;
        assert_eq!(read["mimeType"], "image/png");
        assert_eq!(read["totalBytes"], original.len());
        assert_eq!(
            STANDARD.decode(read["data"].as_str().unwrap()).unwrap(),
            *original
        );
    }
}
