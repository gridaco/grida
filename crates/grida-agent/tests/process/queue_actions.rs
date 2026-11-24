//! Private ACP queue controls against the real host and a scripted provider.

use super::approvals::Stdio as Client;
use super::lifecycle::{prompt_request, queue_basis, queue_ids, task_basis};
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use tokio::sync::oneshot;

const CAPABILITY: &str = "co.grida/session/queue-actions";
const WINDOW: &str = "co.grida/session/transcript-window";
const QUEUED_IMAGES: &str = "co.grida/session/queued-input-image-chunks";
const MODEL: &str = "gpt-6.1-sol";
const CHECKOUT: &str = "_co.grida/session/queue-checkout";
const REINSERT: &str = "_co.grida/session/queue-reinsert";
const STEER: &str = "_co.grida/session/steer-queued";

async fn call(client: &mut Client, method: &str, params: Value) -> Value {
    let response = client.request(method, params).await;
    assert!(response.get("result").is_some(), "{method}: {response}");
    response["result"].clone()
}

async fn connect(state: &Path, endpoint: &str) -> Client {
    let child = executable()
        .args([
            "serve",
            "--stdio",
            "--subagents",
            "--provider",
            "responses",
            "--state-dir",
        ])
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
    let mut client = Client::from_child(child);
    let mut initialization = extension_initialize();
    for key in [
        CAPABILITY,
        WINDOW,
        QUEUED_IMAGES,
        "co.grida/session/effort",
        "co.grida/goal/start",
        "co.grida/goal/inspect",
    ] {
        initialization["clientCapabilities"]["_meta"][key] = 1.into();
    }
    let result = call(&mut client, "initialize", initialization).await;
    assert_eq!(result["agentCapabilities"]["_meta"][CAPABILITY], 1);
    client
}

async fn new_session(client: &mut Client, workspace: &Path) -> String {
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

async fn attach(client: &mut Client, workspace: &Path, session: &str) {
    call(
        client,
        "session/load",
        json!({
            "sessionId":session,"cwd":workspace,"mcpServers":[],
            "_meta":{WINDOW:{"kind":"attach"}},
        }),
    )
    .await;
}

async fn snapshot(client: &mut Client, session: &str) -> Value {
    call(
        client,
        "_co.grida/session/snapshot",
        json!({"sessionId":session}),
    )
    .await
}

async fn wait_snapshot(
    client: &mut Client,
    session: &str,
    condition: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let state = snapshot(client, session).await;
            if condition(&state) {
                return state;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

async fn enqueue(client: &mut Client, input: Value) {
    let accepted = call(client, "_co.grida/session/enqueue", input).await;
    assert_eq!(accepted["disposition"], "queued", "{accepted}");
}

async fn input(client: &mut Client, session: &str, id: &str) -> Value {
    call(
        client,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":id}),
    )
    .await
}

async fn receipt(client: &mut Client, session: &str, request: &str) -> Value {
    call(
        client,
        "_co.grida/session/queue-action-receipt",
        json!({"sessionId":session,"requestId":request}),
    )
    .await["receipt"]
        .clone()
}

fn checkout(view: &Value, session: &str, request: &str, input: &str) -> Value {
    let mut params = queue_basis(view, session, request);
    params["inputId"] = input.into();
    params
}

fn steer(view: &Value, session: &str, request: &str, input: &str) -> Value {
    json!({"task":task_basis(view,session,request),"inputId":input})
}

fn goal_request(session: &str, id: &str) -> Value {
    json!({
        "sessionId":session,"inputId":id,"prompt":[{"type":"text","text":"Prepare the export."}],
        "goal":{"objective":{"description":"Prepare the export.","criteria":["The export opens."]},
        "allowance":{"work_turns":1,"inference_steps":4},"automatic":false}
    })
}

fn raster() -> String {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
    encoder.set_color(png::ColorType::Rgb);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&[3, 29, 217]).unwrap();
    writer.finish().unwrap();
    STANDARD.encode(bytes)
}

fn raster_prompt(session: &str, id: &str, text: &str, data: &str) -> Value {
    json!({"sessionId":session,"inputId":id,"prompt":[
        {"type":"text","text":text},{"type":"image","mimeType":"image/png","data":data}
    ]})
}

fn assert_uses_raster(request: &Value, text: &str, data: &str) {
    let items = request["input"].as_array().unwrap();
    let expected = json!([
        {"type":"input_text","text":text},
        {"type":"input_image","image_url":format!("data:image/png;base64,{data}"),"detail":"auto"},
    ]);
    assert_eq!(
        items
            .iter()
            .filter(|item| item["role"] == "user" && item["content"] == expected)
            .count(),
        1,
        "{request}"
    );
}

#[tokio::test]
async fn checkout_holds_a_slot_while_neighbors_run_and_saving_preserves_the_capture() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (finish_first, first_gate) = oneshot::channel();
    let (finish_a, a_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("First complete.", first_gate),
            Reply::Release("A complete.", a_gate),
            Reply::Finished("Edited image complete."),
            Reply::Finished("D complete."),
            Reply::Finished("C complete."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url).await;
    let session = new_session(&mut client, workspace.path()).await;
    call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "active", "First request."),
    )
    .await;
    endpoint.request().await;
    enqueue(&mut client, prompt_request(&session, "a", "Run A.")).await;
    let data = raster();
    let mut image = raster_prompt(&session, "b", "Original image caption.", &data);
    image["operatingRegime"] = "plan".into();
    enqueue(&mut client, image).await;
    enqueue(&mut client, prompt_request(&session, "c", "Run C.")).await;
    let original = input(&mut client, &session, "b").await;
    let before = snapshot(&mut client, &session).await;
    assert_eq!(queue_ids(&before), ["a", "b", "c"]);
    assert_eq!(before["queue"][1]["checkoutable"], true);
    assert_eq!(before["queue"][1]["steerable"], false);
    let request = checkout(&before, &session, "checkout-b", "b");
    let checked_out = call(&mut client, CHECKOUT, request.clone()).await;
    let token = checked_out["checkoutId"].as_str().unwrap();
    let editing = snapshot(&mut client, &session).await;
    assert_eq!(
        editing["queueCheckout"],
        json!({"checkoutId":token,"inputId":"b"})
    );
    assert_eq!(queue_ids(&editing), ["a", "c"]);
    let held = call(
        &mut client,
        "_co.grida/session/queued-message",
        json!({"sessionId":session,"inputId":"b","checkoutId":token}),
    )
    .await;
    let attachment = &held["prompt"][1]["uri"];
    assert!(attachment.is_string(), "{held}");
    let preview = call(
        &mut client,
        "_co.grida/session/read-queued-input-image-chunk",
        json!({"sessionId":session,"inputId":"b","checkoutId":token,"attachmentUri":attachment,"offset":0}),
    )
    .await;
    assert_eq!(preview["data"], data);
    assert_eq!(
        input(&mut client, &session, "b").await["receipt"]["disposition"],
        "checked_out"
    );
    assert_eq!(
        call(&mut client, CHECKOUT, request.clone()).await,
        checked_out
    );
    let second_checkout = client
        .request(CHECKOUT, checkout(&editing, &session, "checkout-c", "c"))
        .await;
    assert!(second_checkout["error"].is_object(), "{second_checkout}");

    enqueue(&mut client, prompt_request(&session, "d", "Run D.")).await;
    let editing = snapshot(&mut client, &session).await;
    call(
        &mut client,
        "_co.grida/session/reorder",
        json!({"queue":queue_basis(&editing,&session,"reorder"),"inputIds":["a","d","c"]}),
    )
    .await;
    finish_first.send(()).unwrap();
    assert!(endpoint.request().await.to_string().contains("Run A."));
    let editing = snapshot(&mut client, &session).await;
    assert_eq!(queue_ids(&editing), ["d", "c"]);
    let save = json!({
        "sessionId":session,"requestId":"save-b","checkoutId":token,"text":"Revised image caption.",
    });
    let saved = call(&mut client, REINSERT, save.clone()).await;
    let waiting = snapshot(&mut client, &session).await;
    assert!(waiting["queueCheckout"].is_null());
    let too_late = client
        .request(CHECKOUT, checkout(&waiting, &session, "checkout-a", "a"))
        .await;
    assert!(too_late["error"].is_object(), "{too_late}");
    assert_eq!(
        input(&mut client, &session, "a").await["receipt"]["disposition"],
        "claimed"
    );
    let replacement = waiting["queue"][0]["inputId"].as_str().unwrap();
    assert_ne!(replacement, "b");
    assert_eq!(queue_ids(&waiting), [replacement, "d", "c"]);
    let edited = input(&mut client, &session, replacement).await;
    assert_eq!(edited["settings"], original["settings"]);
    assert_eq!(edited["settings"]["operatingRegime"], "plan");
    assert_eq!(edited["settings"]["model"], MODEL);
    assert_eq!(edited["prompt"][0]["text"], "Revised image caption.");
    let edited_display = call(
        &mut client,
        "_co.grida/session/queued-message",
        json!({"sessionId":session,"inputId":replacement,"expectedSessionRevision":waiting["sessionRevision"]}),
    )
    .await;
    assert_eq!(edited_display["prompt"][1], held["prompt"][1]);
    let expired = client.request(
        "_co.grida/session/read-queued-input-image-chunk",
        json!({"sessionId":session,"inputId":"b","checkoutId":token,"attachmentUri":attachment,"offset":0}),
    ).await;
    assert!(expired["error"].is_object(), "{expired}");

    finish_a.send(()).unwrap();
    let request_for_image = endpoint.request().await;
    assert_eq!(request_for_image["model"], MODEL);
    assert_uses_raster(&request_for_image, "Revised image caption.", &data);
    assert!(endpoint.request().await.to_string().contains("Run D."));
    assert!(endpoint.request().await.to_string().contains("Run C."));
    wait_snapshot(&mut client, &session, |view| {
        view["current"].is_null() && queue_ids(view).is_empty()
    })
    .await;
    client.close().await;

    let mut restored = connect(&state, &endpoint.url).await;
    attach(&mut restored, workspace.path(), &session).await;
    assert_eq!(call(&mut restored, REINSERT, save.clone()).await, saved);
    let observed = receipt(&mut restored, &session, "save-b").await;
    assert_eq!(observed["action"], "reinsert");
    assert_eq!(observed["sessionRevision"], saved["sessionRevision"]);
    assert_eq!(call(&mut restored, CHECKOUT, request).await, checked_out);
    let mut changed = save;
    changed["text"] = "Different revision.".into();
    let conflict = restored.request(REINSERT, changed).await;
    assert!(conflict["error"].is_object(), "{conflict}");
    assert!(queue_ids(&snapshot(&mut restored, &session).await).is_empty());
    restored.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn reopening_discovers_an_unconfirmed_checkout_and_can_restore_the_exact_original() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::Hold("Holding queue admission.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url).await;
    let session = new_session(&mut client, workspace.path()).await;
    call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "active", "Wait."),
    )
    .await;
    endpoint.request().await;
    enqueue(&mut client, prompt_request(&session, "a", "Run A.")).await;
    enqueue(
        &mut client,
        raster_prompt(&session, "b", "Original.", &raster()),
    )
    .await;
    enqueue(&mut client, prompt_request(&session, "c", "Run C.")).await;
    let original = input(&mut client, &session, "b").await;
    let view = snapshot(&mut client, &session).await;
    call(
        &mut client,
        "_co.grida/session/stop",
        task_basis(&view, &session, "hold-queue"),
    )
    .await;
    let held = wait_snapshot(&mut client, &session, |view| view["current"].is_null()).await;
    let checkout_request = checkout(&held, &session, "unconfirmed-checkout", "b");
    let _ = client.send(CHECKOUT, checkout_request.clone()).await;
    let checked_out = wait_snapshot(&mut client, &session, |view| {
        view["queueCheckout"].is_object()
    })
    .await;
    assert_eq!(queue_ids(&checked_out), ["a", "c"]);
    client.close().await;

    let mut restored = connect(&state, &endpoint.url).await;
    let unattached = restored
        .request(
            "_co.grida/session/queue-action-receipt",
            json!({
                "sessionId":session,"requestId":"unconfirmed-checkout"
            }),
        )
        .await;
    assert!(unattached["error"].is_object(), "{unattached}");
    attach(&mut restored, workspace.path(), &session).await;
    let editing = snapshot(&mut restored, &session).await;
    assert_eq!(editing["queueCheckout"], checked_out["queueCheckout"]);
    assert_eq!(editing["admissionPaused"], true);
    let committed = receipt(&mut restored, &session, "unconfirmed-checkout").await;
    assert_eq!(committed["action"], "checkout");
    assert_eq!(committed["inputId"], "b");
    assert_eq!(
        committed["checkoutId"],
        editing["queueCheckout"]["checkoutId"]
    );
    let exact = call(&mut restored, CHECKOUT, checkout_request).await;
    assert_eq!(exact["sessionRevision"], committed["sessionRevision"]);
    call(
        &mut restored,
        REINSERT,
        json!({"sessionId":session,"requestId":"restore-unchanged","checkoutId":committed["checkoutId"]}),
    )
    .await;
    let waiting = snapshot(&mut restored, &session).await;
    assert_eq!(queue_ids(&waiting), ["a", "b", "c"]);
    assert!(waiting["queueCheckout"].is_null());
    assert_eq!(input(&mut restored, &session, "b").await, original);
    restored.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn queued_raster_steers_one_running_plan_turn_and_replays_once() {
    const CORRECTION: &str = "Use the attached raster in the plan.";
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (finish_first, first_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("A draft plan.", first_gate),
            Reply::Finished("Plan incorporates the image."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url).await;
    let session = new_session(&mut client, workspace.path()).await;
    let mut plan = prompt_request(&session, "plan", "Plan the illustration.");
    plan["operatingRegime"] = "plan".into();
    let active = call(&mut client, "_co.grida/session/submit", plan).await;
    let turn = active["turnId"].as_str().unwrap();
    let first = endpoint.request().await;
    let data = raster();
    enqueue(
        &mut client,
        raster_prompt(&session, "correction", CORRECTION, &data),
    )
    .await;
    let view = snapshot(&mut client, &session).await;
    assert_eq!(queue_ids(&view), ["correction"]);
    assert_eq!(view["queue"][0]["steerable"], true, "{view}");
    let request = steer(&view, &session, "apply-correction", "correction");
    let applied = call(&mut client, STEER, request.clone()).await;
    assert_eq!(applied["turnId"], turn);
    assert!(queue_ids(&snapshot(&mut client, &session).await).is_empty());
    let transferred = input(&mut client, &session, "correction").await;
    assert_eq!(transferred["receipt"]["disposition"], "transferred");
    assert_eq!(transferred["receipt"]["turnId"], turn);
    assert_eq!(call(&mut client, STEER, request.clone()).await, applied);

    finish_first.send(()).unwrap();
    let updated = endpoint.request().await;
    assert_eq!(updated["model"], first["model"]);
    assert_eq!(updated["tools"], first["tools"]);
    assert_uses_raster(&updated, CORRECTION, &data);
    let settled = wait_snapshot(&mut client, &session, |view| view["current"].is_null()).await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    client.close().await;

    let mut restored = connect(&state, &endpoint.url).await;
    attach(&mut restored, workspace.path(), &session).await;
    let history_request = restored
        .send(
            "session/load",
            json!({
                "sessionId":session,"cwd":workspace.path(),"mcpServers":[],
                "_meta":{WINDOW:{"kind":"read","requestId":"replay-correction"}},
            }),
        )
        .await;
    let mut correction_id = None;
    let mut image_id = None;
    loop {
        let frame = restored.read_frame().await;
        if frame["id"] == history_request {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let content = &frame["params"]["update"]["content"];
        let window = &frame["params"]["_meta"][WINDOW];
        if content["text"] == CORRECTION {
            assert_eq!(window["turnId"], turn, "{frame}");
            assert!(
                correction_id
                    .replace(frame["params"]["update"]["messageId"].clone())
                    .is_none()
            );
        }
        if content["mimeType"] == "image/png" && content["type"] == "resource_link" {
            assert_eq!(window["turnId"], turn, "{frame}");
            assert!(
                image_id
                    .replace(frame["params"]["update"]["messageId"].clone())
                    .is_none()
            );
        }
    }
    assert!(correction_id.as_ref().is_some_and(Value::is_string));
    assert_eq!(image_id, correction_id);
    let observed = receipt(&mut restored, &session, "apply-correction").await;
    assert_eq!(observed["action"], "steer");
    assert_eq!(observed["inputId"], "correction");
    assert_eq!(observed["turnId"], turn);
    assert_eq!(call(&mut restored, STEER, request).await, applied);
    restored.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn stale_or_unsupported_steers_leave_the_accepted_messages_waiting() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (finish_first, first_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("Old turn completes.", first_gate),
            Reply::Hold("New turn is running."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url).await;
    let session = new_session(&mut client, workspace.path()).await;
    let first = call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "first", "First request."),
    )
    .await;
    endpoint.request().await;
    enqueue(
        &mut client,
        prompt_request(&session, "next", "Next request."),
    )
    .await;
    enqueue(
        &mut client,
        prompt_request(&session, "waiting", "Keep me queued."),
    )
    .await;
    let mut plan = prompt_request(&session, "plan", "Start a new plan.");
    plan["operatingRegime"] = "plan".into();
    enqueue(&mut client, plan).await;
    enqueue(
        &mut client,
        raster_prompt(&session, "missing", "Keep my image.", &raster()),
    )
    .await;
    let mut ultra = prompt_request(&session, "ultra", "Run an independent review.");
    ultra["effort"] = "ultra".into();
    enqueue(&mut client, ultra).await;
    let goal = call(
        &mut client,
        "_co.grida/goal/start",
        goal_request(&session, "goal"),
    )
    .await;
    assert_eq!(goal["disposition"], "queued", "{goal}");

    let old_view = snapshot(&mut client, &session).await;
    let stale = steer(&old_view, &session, "old-target", "waiting");
    finish_first.send(()).unwrap();
    assert!(
        endpoint
            .request()
            .await
            .to_string()
            .contains("Next request.")
    );
    let next_view = snapshot(&mut client, &session).await;
    assert_ne!(next_view["current"]["turnId"], first["turnId"]);
    assert_eq!(
        queue_ids(&next_view),
        ["waiting", "plan", "missing", "ultra", "goal"]
    );
    assert_eq!(next_view["queue"][1]["steerable"], false);
    assert_eq!(next_view["queue"][3]["steerable"], false);
    assert_eq!(next_view["queue"][4]["steerable"], false);
    let mut wrong_turn = steer(&next_view, &session, "wrong-target", "waiting");
    wrong_turn["task"]["turnId"] = first["turnId"].clone();
    let mut future_session = steer(&next_view, &session, "future-session", "missing");
    future_session["task"]["expectedSessionRevision"] =
        (next_view["sessionRevision"].as_u64().unwrap() + 1).into();
    let mut future_control = steer(&next_view, &session, "future-control", "missing");
    future_control["task"]["expectedControlRevision"] =
        (next_view["current"]["controlRevision"].as_u64().unwrap() + 1).into();
    // Only one upload was accepted; remove its retained bytes from this test's private state.
    let scope = std::fs::read_dir(state.join("retained-inputs"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let asset = std::fs::read_dir(scope.join("sources"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    std::fs::remove_file(asset).unwrap();

    for (request, expected) in [
        (stale, "queue_steer_target_unavailable"),
        (wrong_turn, "queue_steer_target_unavailable"),
        (future_session, "stale_session_revision"),
        (future_control, "stale_control_revision"),
        (
            steer(&next_view, &session, "cannot-switch-plan", "plan"),
            "queued_input_not_steerable",
        ),
        (
            steer(&next_view, &session, "attachment-unavailable", "missing"),
            "retained_image_unavailable",
        ),
        (
            steer(&next_view, &session, "cannot-switch-effort", "ultra"),
            "queued_input_not_steerable",
        ),
        (
            steer(&next_view, &session, "cannot-switch-goal", "goal"),
            "queued_input_not_steerable",
        ),
    ] {
        let id = request["task"]["requestId"].as_str().unwrap().to_owned();
        let denied = client.request(STEER, request).await;
        assert_eq!(denied["error"]["data"], expected, "{denied}");
        assert!(receipt(&mut client, &session, &id).await.is_null());
        assert_eq!(
            queue_ids(&snapshot(&mut client, &session).await),
            ["waiting", "plan", "missing", "ultra", "goal"]
        );
    }
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn queued_guidance_steers_active_goal_without_replacing_its_objective() {
    const GUIDANCE: &str = "Keep the exported file at its existing size.";
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (finish_first, first_gate) = oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Release("The export is in progress.", first_gate),
            Reply::Hold("Continuing the original goal."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = connect(&state, &endpoint.url).await;
    let session = new_session(&mut client, workspace.path()).await;
    let accepted = call(
        &mut client,
        "_co.grida/goal/start",
        goal_request(&session, "goal"),
    )
    .await;
    assert_eq!(accepted["inputId"], "goal");
    let first_request = endpoint.request().await;
    assert!(first_request["tools"].to_string().contains("goal_report"));
    let scope = json!({"sessionId":session});
    let starting = call(&mut client, "_co.grida/goal/inspect", scope.clone()).await;
    let turn = starting["goal"]["reservation"]["turn"]
        .as_str()
        .unwrap_or_else(|| panic!("{starting}"));
    enqueue(&mut client, prompt_request(&session, "guidance", GUIDANCE)).await;
    let view = snapshot(&mut client, &session).await;
    assert_eq!(view["current"]["turnId"], turn);
    assert_eq!(view["queue"][0]["steerable"], true);
    let applied = call(
        &mut client,
        STEER,
        steer(&view, &session, "steer-goal", "guidance"),
    )
    .await;
    assert_eq!(applied["turnId"], turn);
    finish_first.send(()).unwrap();
    let updated = endpoint.request().await;
    assert!(updated.to_string().contains(GUIDANCE));
    assert_eq!(updated["model"], first_request["model"]);
    assert_eq!(updated["tools"], first_request["tools"]);
    let continued = call(&mut client, "_co.grida/goal/inspect", scope).await;
    for field in ["basis", "objective", "remaining", "reservation"] {
        assert_eq!(continued["goal"][field], starting["goal"][field], "{field}");
    }
    assert!(queue_ids(&snapshot(&mut client, &session).await).is_empty());
    client.close().await;
    endpoint.done().await;
}
