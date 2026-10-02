//! Test-only projection of the production parser into the shared contract DTO.
use serde_json::{Map, Value, json};

use crate::{
    Command, GenerationSource, Invocation, MeshOperation, MeshSource, ModelSelection, Request,
    RiggingSource, Selector,
};

type Object = Map<String, Value>;
fn put(object: &mut Object, name: &str, value: impl Into<Value>) {
    object.insert(name.to_owned(), value.into());
}
fn optional(object: &mut Object, name: &str, value: Option<impl Into<Value>>) {
    if let Some(value) = value {
        put(object, name, value);
    }
}
fn selector(object: &mut Object, value: &Option<Selector>) {
    if let Some(value) = value {
        put(
            object,
            "selector",
            match value {
                Selector::Name(name) => json!({"name": name}),
                Selector::Id(id) => json!({"id": id}),
            },
        );
    }
}
fn model(object: &mut Object, value: &ModelSelection) {
    put(object, "provider", value.provider.as_str());
    put(object, "model", value.model.as_str());
    optional(object, "kind", value.kind.map(|v| v.as_str()));
    optional(object, "variant", value.variant.map(|v| v.as_str()));
}
fn request(value: &Request) -> Value {
    let mut object = Object::new();
    optional(&mut object, "prompt", value.prompt.as_deref());
    optional(&mut object, "promptFile", value.prompt_file.as_deref());
    optional(&mut object, "text", value.text.as_deref());
    optional(&mut object, "textFile", value.text_file.as_deref());
    optional(
        &mut object,
        "references",
        value.references.as_ref().map(|items| json!(items)),
    );
    optional(&mut object, "image", value.image.as_deref());
    optional(&mut object, "voice", value.voice.as_deref());
    put(
        &mut object,
        "parameters",
        Value::Array(
            value
                .parameters
                .iter()
                .map(|v| json!({"field": v.field, "value": v.value}))
                .collect(),
        ),
    );
    object.into()
}

pub fn project(invocation: &Invocation) -> Value {
    let mut object = Object::new();
    put(&mut object, "json", invocation.options.json);
    put(&mut object, "noInput", invocation.options.no_input);
    let name = match &invocation.command {
        Command::Help(topic) => {
            put(&mut object, "topic", topic.name());
            "help"
        }
        Command::Version => "version",
        Command::Docs(topic) => {
            put(&mut object, "topic", topic.name());
            "docs"
        }
        Command::AuthLogin {
            storage,
            no_browser,
        } => {
            optional(&mut object, "storage", storage.map(|v| v.as_str()));
            put(&mut object, "noBrowser", *no_browser);
            "auth login"
        }
        Command::AuthStatus => "auth status",
        Command::AuthLogout => "auth logout",
        Command::AuthStorageShow => "auth storage show",
        Command::AuthStorageMigrate(backend) => {
            put(&mut object, "backend", backend.as_str());
            "auth storage migrate"
        }
        Command::AccountView => "account view",
        Command::AccountCredits(value) => {
            selector(&mut object, value);
            "account credits"
        }
        Command::ProvidersList => "providers list",
        Command::ProvidersConfigure {
            provider,
            key_stdin,
        } => {
            put(&mut object, "provider", provider.as_str());
            put(&mut object, "keyStdin", *key_stdin);
            "providers configure"
        }
        Command::ProvidersRemove(provider) => {
            put(&mut object, "provider", provider.as_str());
            "providers remove"
        }
        Command::ModelsList {
            provider,
            kind,
            modality,
            available,
            local_image,
            selector: value,
        } => {
            optional(&mut object, "provider", provider.map(|v| v.as_str()));
            optional(&mut object, "kind", kind.map(|v| v.as_str()));
            optional(&mut object, "modality", modality.map(|v| v.as_str()));
            put(&mut object, "available", *available);
            put(&mut object, "localImage", *local_image);
            selector(&mut object, value);
            "models list"
        }
        Command::ModelsInspect(value) => {
            model(&mut object, value);
            "models inspect"
        }
        Command::Generate {
            model: value,
            source,
            out,
            key_stdin,
            selector: selected,
        } => {
            model(&mut object, value);
            match source {
                GenerationSource::Json(input) => put(&mut object, "input", input.as_str()),
                GenerationSource::Flags(value) => put(&mut object, "request", request(value)),
            }
            put(&mut object, "out", out.as_str());
            put(&mut object, "keyStdin", *key_stdin);
            selector(&mut object, selected);
            "generate"
        }
        Command::VoicesList { key_stdin } => {
            put(&mut object, "provider", "elevenlabs");
            put(&mut object, "keyStdin", *key_stdin);
            "voices list"
        }
        Command::RiggingList { provider, feature } => {
            optional(&mut object, "provider", provider.map(|v| v.as_str()));
            optional(&mut object, "feature", feature.map(|v| v.as_str()));
            "rigging list"
        }
        Command::RiggingInspect {
            provider,
            operation,
        } => {
            put(&mut object, "provider", provider.as_str());
            match operation {
                MeshOperation::Check => put(&mut object, "feature", "rig-check"),
                MeshOperation::Rig { model } => {
                    put(&mut object, "feature", "rigging");
                    put(&mut object, "model", model.as_str());
                }
            }
            "rigging inspect"
        }
        Command::RiggingCheck {
            provider,
            source,
            key_stdin,
            selector: value,
        } => {
            put(&mut object, "provider", provider.as_str());
            put(&mut object, "keyStdin", *key_stdin);
            selector(&mut object, value);
            match source {
                MeshSource::Mesh(path) => put(&mut object, "mesh", path.as_str()),
                MeshSource::Json(input) => put(&mut object, "input", input.as_str()),
            }
            "rigging check"
        }
        Command::RiggingRun {
            provider,
            model,
            source,
            out,
            key_stdin,
            selector: value,
        } => {
            put(&mut object, "provider", provider.as_str());
            put(&mut object, "model", model.as_str());
            put(&mut object, "out", out.as_str());
            put(&mut object, "keyStdin", *key_stdin);
            selector(&mut object, value);
            match source {
                RiggingSource::Mesh {
                    path,
                    rig_type,
                    spec,
                } => {
                    put(&mut object, "mesh", path.as_str());
                    put(&mut object, "rigType", rig_type.as_str());
                    put(&mut object, "spec", spec.as_str());
                }
                RiggingSource::Json(input) => put(&mut object, "input", input.as_str()),
            }
            "rigging run"
        }
    };
    put(&mut object, "command", name);
    object.into()
}
