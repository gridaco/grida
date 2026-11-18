//! Caption replacement preserves captured resources and authority across restart.

use super::*;
use sha2::{Digest, Sha256};

const REPLACE_TEXT: &str = "co.grida/session/replace-text";
const QUEUED: &str = "co.grida/session/queued-input-image-chunks";
const EDITOR_CONTEXT: &str = "co.grida/session/editor-context";

fn initialize() -> Value {
    let mut value = input_image_initialize();
    for key in [
        REPLACE_TEXT,
        QUEUED,
        EDITOR_CONTEXT,
        "co.grida/session/selected-image",
        "co.grida/session/file-reference",
        "co.grida/goal/start",
    ] {
        value["clientCapabilities"]["_meta"][key] = 1.into();
    }
    value
}

async fn queued(client: &mut StdioClient, session: &str, input: &str, view: &Value) -> Value {
    let response = client.request("_co.grida/session/queued-message", json!({
        "sessionId":session,"inputId":input,"expectedSessionRevision":view["sessionRevision"]
    })).await;
    assert!(response["result"].is_object(), "{response}");
    response["result"].clone()
}

fn edit(
    view: &Value,
    session: &str,
    request: &str,
    input: &str,
    replacement: &str,
    text: &str,
) -> Value {
    json!({"queue":queue_basis(view,session,request),"inputId":input,"replacementInputId":replacement,"text":text})
}

#[tokio::test]
async fn editor_context_keeps_the_accepted_sample_through_retry_edit_and_restart() {
    let workspace = TempDir::new().unwrap();
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::Hold("Existing work."), Reply::Finished("Reviewed.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let ready = client.request("initialize", initialize()).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"][EDITOR_CONTEXT],
        1
    );
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    client
        .request(
            "_co.grida/session/submit",
            super::super::lifecycle::prompt_request(session, "active", "Wait."),
        )
        .await;
    endpoint.request().await;

    let observation = json!({
        "kind":"selection","surface":"workflow-viewer","sampledAt":1700000000123_u64,
        "payload":{"subject":"run-abcd","selection":"node-original"}
    });
    let submission = json!({
        "sessionId":session,"inputId":"observed","editorContext":observation,
        "prompt":[{"type":"text","text":"Explain the selected node."}]
    });
    let accepted = client
        .request("_co.grida/session/enqueue", submission.clone())
        .await;
    assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
    let mut changed = submission.clone();
    changed["editorContext"]["payload"]["selection"] = "node-new".into();
    let conflict = client.request("_co.grida/session/enqueue", changed).await;
    assert_eq!(
        conflict["error"]["data"], "submission_input_changed",
        "{conflict}"
    );
    let view = snapshot(&mut client, session).await;
    let empty = client
        .request(
            "_co.grida/session/replace-text",
            edit(&view, session, "clear", "observed", "cleared", " "),
        )
        .await;
    assert_eq!(
        empty["error"]["data"], "editor_context_requires_text",
        "{empty}"
    );
    let revised = client
        .request(
            "_co.grida/session/replace-text",
            edit(
                &view,
                session,
                "change",
                "observed",
                "edited",
                "Explain the earlier selection.",
            ),
        )
        .await;
    assert!(revised["result"].is_object(), "{revised}");
    let view = snapshot(&mut client, session).await;
    let projected = queued(&mut client, session, "edited", &view).await;
    assert_eq!(projected["prompt"][1]["name"], "Editor context");
    assert!(
        !projected.to_string().contains("node-original"),
        "{projected}"
    );
    client
        .request("_co.grida/session/stop", task_basis(&view, session, "hold"))
        .await;
    settled(&mut client, session).await;
    client.close().await;

    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    client.request("initialize", initialize()).await;
    client
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let view = snapshot(&mut client, session).await;
    assert_eq!(
        queued(&mut client, session, "edited", &view).await,
        projected
    );
    let resumed = client
        .request(
            "_co.grida/session/resume-queue",
            queue_basis(&view, session, "continue"),
        )
        .await;
    assert!(resumed["result"].is_object(), "{resumed}");
    let input = endpoint.request().await["input"].to_string();
    assert!(input.contains("Explain the earlier selection."), "{input}");
    assert!(input.contains("node-original"), "{input}");
    assert!(input.contains("1700000000123"), "{input}");
    assert!(!input.contains("node-new"), "{input}");
    let settled = settled(&mut client, session).await;
    assert!(settled["current"].is_null(), "{settled}");
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn caption_edits_preserve_retained_raster_file_references_and_settings_with_exact_restart_receipts()
 {
    let workspace = TempDir::new().unwrap();
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::Hold("Existing work.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let ready = client.request("initialize", initialize()).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"][REPLACE_TEXT],
        1
    );
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    client
        .request(
            "_co.grida/session/submit",
            super::super::lifecycle::prompt_request(session, "active", "Wait."),
        )
        .await;
    endpoint.request().await;
    let bytes = png([3, 29, 217]);
    let path = workspace.path().join("selected.png");
    std::fs::write(&path, &bytes).unwrap();
    let digest: [u8; 32] = Sha256::digest(&bytes).into();
    let accepted = client.request("_co.grida/session/enqueue", json!({
        "sessionId":session,"inputId":"image","prompt":[{"type":"text","text":"Original caption."}],
        "selectedImage":{"path":path,"sha256":digest,"name":"selected.png","source":"disk"},
        "operatingRegime":"plan"
    })).await;
    assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
    std::fs::remove_file(&path).unwrap();
    let file = workspace.path().join("selected.txt");
    std::fs::write(&file, "Referenced bytes.").unwrap();
    let accepted = client.request("_co.grida/session/enqueue", json!({
        "sessionId":session,"inputId":"file","prompt":[{"type":"text","text":"File caption."},
        {"type":"resource_link","name":"selected.txt","uri":reqwest::Url::from_file_path(&file).unwrap(),"mimeType":"text/plain"}]
    })).await;
    assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
    client
        .request(
            "_co.grida/session/enqueue",
            super::super::lifecycle::prompt_request(session, "plain", "Plain text."),
        )
        .await;
    let before = snapshot(&mut client, session).await;
    let image = queued(&mut client, session, "image", &before).await;
    let file = queued(&mut client, session, "file", &before).await;
    assert_eq!(image["textOnly"], false);
    assert_eq!(image["textEditable"], true);
    let request = edit(
        &before,
        session,
        "caption",
        "image",
        "edited-image",
        "New\ncaption.",
    );
    let receipt = client
        .request("_co.grida/session/replace-text", request.clone())
        .await;
    assert!(receipt["result"].is_object(), "{receipt}");
    assert_eq!(
        client
            .request("_co.grida/session/replace-text", request.clone())
            .await["result"],
        receipt["result"]
    );
    let view = snapshot(&mut client, session).await;
    assert_eq!(
        super::super::lifecycle::queue_ids(&view),
        ["edited-image", "file", "plain"]
    );
    let edited = queued(&mut client, session, "edited-image", &view).await;
    assert_eq!(edited["prompt"][0]["text"], "New\ncaption.");
    assert_eq!(edited["prompt"][1], image["prompt"][1]);
    assert_eq!(view["queue"][0]["settings"], before["queue"][0]["settings"]);
    let stale = client
        .request(
            "_co.grida/session/replace-text",
            edit(&before, session, "stale", "file", "stale-file", "Wrong."),
        )
        .await;
    assert!(stale["error"].is_object(), "{stale}");
    let empty = client
        .request(
            "_co.grida/session/replace-text",
            edit(&view, session, "empty-plain", "plain", "empty-plain", ""),
        )
        .await;
    assert!(empty["error"].is_object(), "{empty}");
    let changed = client
        .request(
            "_co.grida/session/replace-text",
            edit(
                &before,
                session,
                "caption",
                "image",
                "edited-image",
                "Different.",
            ),
        )
        .await;
    assert!(changed["error"].is_object(), "{changed}");
    assert_eq!(snapshot(&mut client, session).await, view);
    client
        .request(
            "_co.grida/session/stop",
            task_basis(&view, session, "hold-queue"),
        )
        .await;
    settled(&mut client, session).await;
    client.close().await;

    // Inspect the producer's complete retained records, not a display projection.
    let store = grida_agent::host::open_store(&state.join("agent.sqlite")).unwrap();
    let sid = SessionId::new(session).unwrap();
    let original = store
        .input(sid.clone(), ChangeId::new("image").unwrap())
        .await
        .unwrap()
        .unwrap();
    let replacement = store
        .input(sid, ChangeId::new("edited-image").unwrap())
        .await
        .unwrap()
        .unwrap();
    let mut original: Value = serde_json::from_slice(original.input.payload.bytes()).unwrap();
    let mut replacement: Value = serde_json::from_slice(replacement.input.payload.bytes()).unwrap();
    let original_parts = original.as_object_mut().unwrap().remove("parts").unwrap();
    let replacement_parts = replacement
        .as_object_mut()
        .unwrap()
        .remove("parts")
        .unwrap();
    assert_eq!(original, replacement);
    assert_eq!(original_parts[1], replacement_parts[1]);
    drop(store);

    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    client.request("initialize", initialize()).await;
    client
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert_eq!(
        client
            .request("_co.grida/session/replace-text", request)
            .await["result"],
        receipt["result"]
    );
    let view = snapshot(&mut client, session).await;
    let restored = queued(&mut client, session, "edited-image", &view).await;
    assert_eq!(restored, edited);
    let read = client.request("_co.grida/session/read-queued-input-image-chunk",json!({
        "sessionId":session,"inputId":"edited-image","expectedSessionRevision":view["sessionRevision"],
        "attachmentUri":image["prompt"][1]["uri"],"offset":0
    })).await;
    assert_eq!(
        STANDARD
            .decode(read["result"]["data"].as_str().unwrap())
            .unwrap(),
        bytes
    );
    let clear = client
        .request(
            "_co.grida/session/replace-text",
            edit(
                &view,
                session,
                "clear-image",
                "edited-image",
                "cleared-image",
                "",
            ),
        )
        .await;
    assert!(clear["result"].is_object(), "{clear}");
    let view = snapshot(&mut client, session).await;
    let cleared = queued(&mut client, session, "cleared-image", &view).await;
    assert_eq!(cleared["prompt"], json!([image["prompt"][1]]));
    assert_eq!(cleared["textOnly"], false);
    assert_eq!(cleared["textEditable"], true);
    let replaced = client
        .request(
            "_co.grida/session/replace-text",
            edit(&view, session, "late", "image", "too-late", "Late."),
        )
        .await;
    assert_eq!(replaced["error"]["data"], "queued_text_not_editable");
    let reference = client
        .request(
            "_co.grida/session/replace-text",
            edit(&view, session, "edit-file", "file", "edited-file", ""),
        )
        .await;
    assert!(reference["result"].is_object(), "{reference}");
    let view = snapshot(&mut client, session).await;
    assert_eq!(
        queued(&mut client, session, "edited-file", &view).await["prompt"],
        json!([file["prompt"][1]])
    );
    assert_eq!(
        super::super::lifecycle::queue_ids(&view),
        ["cleared-image", "edited-file", "plain"]
    );
    client
        .request(
            "_co.grida/session/withdraw",
            json!({"queue":queue_basis(&view,session,"withdraw-file"),"inputId":"edited-file"}),
        )
        .await;
    let view = snapshot(&mut client, session).await;
    let withdrawn = client
        .request(
            "_co.grida/session/replace-text",
            edit(&view, session, "withdrawn", "edited-file", "revived", "No."),
        )
        .await;
    assert_eq!(withdrawn["error"]["data"], "queued_text_not_editable");
    let claimed = client
        .request(
            "_co.grida/session/replace-text",
            edit(
                &view,
                session,
                "consumed",
                "active",
                "revived-active",
                "No.",
            ),
        )
        .await;
    assert_eq!(claimed["error"]["data"], "queued_text_not_editable");
    assert_eq!(snapshot(&mut client, session).await, view);
    let goal = client.request("_co.grida/goal/start",json!({
        "sessionId":session,"inputId":"queued-goal","prompt":[{"type":"text","text":"Prepare the export"}],
        "goal":{"objective":{"description":"Prepare the export","criteria":["The exported file opens"]},
        "allowance":{"work_turns":1,"inference_steps":2},"automatic":false}
    })).await;
    assert_eq!(goal["result"]["disposition"], "queued", "{goal}");
    let view = snapshot(&mut client, session).await;
    let goal = queued(&mut client, session, "queued-goal", &view).await;
    assert_eq!(goal["textOnly"], true);
    assert_eq!(goal["textEditable"], false);
    let refused = client
        .request(
            "_co.grida/session/replace-text",
            edit(
                &view,
                session,
                "edit-goal",
                "queued-goal",
                "changed-goal",
                "Changed.",
            ),
        )
        .await;
    assert_eq!(refused["error"]["data"], "queued_text_not_editable");
    assert_eq!(snapshot(&mut client, session).await, view);
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}
