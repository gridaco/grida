// GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014 — arguments cannot introduce implicit authority.
use std::collections::HashSet;

use clap::{Arg, ArgAction, ArgMatches, Command as ClapCommand, parser::ValueSource};
use unicode_general_category::{GeneralCategory, get_general_category};

use crate::{Failure, FailureCode, Topic};

macro_rules! choices {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum $name { $($variant),+ }
        impl $name {
            pub fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }
            fn parse(value: &str) -> Result<Self, Failure> {
                match value { $($text => Ok(Self::$variant)),+, _ => Err(Failure::usage()) }
            }
        }
    };
}
choices!(Provider { OpenRouter => "openrouter", Vercel => "vercel", Fal => "fal", ElevenLabs => "elevenlabs", Tripo => "tripo", Gg => "gg" });
choices!(MeshProvider { Tripo => "tripo", Gg => "gg" });
choices!(Kind { Image => "image", Video => "video", Music => "music", SoundEffect => "sound-effect", TextToSpeech => "text-to-speech", ThreeD => "three-d" });
choices!(Variant { Text => "text", References => "references", Image => "image", Multiview => "multiview" });
choices!(Modality { Image => "image", Video => "video", Audio => "audio", ThreeD => "3d" });
choices!(Storage { Keyring => "keyring", File => "file" });
choices!(MeshFeature { Check => "rig-check", Rig => "rigging" });

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Selector {
    Name(String),
    Id(u64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Options {
    pub json: bool,
    pub no_input: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub options: Options,
    pub command: Command,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelSelection {
    pub provider: Provider,
    pub model: String,
    pub kind: Option<Kind>,
    pub variant: Option<Variant>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parameter {
    pub field: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub prompt: Option<String>,
    pub prompt_file: Option<String>,
    pub text: Option<String>,
    pub text_file: Option<String>,
    pub references: Option<Vec<String>>,
    pub image: Option<String>,
    pub voice: Option<String>,
    pub parameters: Vec<Parameter>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GenerationSource {
    Json(String),
    Flags(Request),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MeshSource {
    Mesh(String),
    Json(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RiggingSource {
    Mesh {
        path: String,
        rig_type: String,
        spec: String,
    },
    Json(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MeshOperation {
    Check,
    Rig { model: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Help(Topic),
    Version,
    Docs(Topic),
    AuthLogin {
        storage: Option<Storage>,
        no_browser: bool,
    },
    AuthStatus,
    AuthLogout,
    AuthStorageShow,
    AuthStorageMigrate(Storage),
    AccountView,
    AccountCredits(Option<Selector>),
    ProvidersList,
    ProvidersConfigure {
        provider: Provider,
        key_stdin: bool,
    },
    ProvidersRemove(Provider),
    ModelsList {
        provider: Option<Provider>,
        kind: Option<Kind>,
        modality: Option<Modality>,
        available: bool,
        local_image: bool,
        selector: Option<Selector>,
    },
    ModelsInspect(ModelSelection),
    Generate {
        model: ModelSelection,
        source: GenerationSource,
        out: String,
        key_stdin: bool,
        selector: Option<Selector>,
    },
    VoicesList {
        key_stdin: bool,
    },
    RiggingList {
        provider: Option<MeshProvider>,
        feature: Option<MeshFeature>,
    },
    RiggingInspect {
        provider: MeshProvider,
        operation: MeshOperation,
    },
    RiggingCheck {
        provider: MeshProvider,
        source: MeshSource,
        key_stdin: bool,
        selector: Option<Selector>,
    },
    RiggingRun {
        provider: MeshProvider,
        model: String,
        source: RiggingSource,
        out: String,
        key_stdin: bool,
        selector: Option<Selector>,
    },
}

const BOOLEANS: &[&str] = &[
    "help",
    "version",
    "json",
    "no-input",
    "no-browser",
    "available",
    "local-image",
    "key-stdin",
];
const STRINGS: &[&str] = &[
    "storage",
    "org",
    "org-id",
    "provider",
    "model",
    "feature",
    "mesh",
    "rig-type",
    "spec",
    "kind",
    "modality",
    "variant",
    "input",
    "prompt",
    "prompt-file",
    "text",
    "text-file",
    "image",
    "voice",
    "out",
];
const REPEATED: &[&str] = &["reference", "param"];
const REQUEST_FLAGS: &[&str] = &[
    "prompt",
    "prompt-file",
    "text",
    "text-file",
    "reference",
    "image",
    "voice",
    "param",
];

struct Tokens(ArgMatches);
impl Tokens {
    fn parse(argv: &[String]) -> Result<Self, Failure> {
        let mut grammar = ClapCommand::new("grida")
            .disable_help_flag(true)
            .disable_version_flag(true)
            .no_binary_name(true)
            .arg(Arg::new("words").num_args(0..).action(ArgAction::Append));
        for &name in BOOLEANS {
            let mut arg = Arg::new(name).long(name).action(ArgAction::SetTrue);
            if name == "help" {
                arg = arg.short('h');
            }
            if name == "version" {
                arg = arg.short('v');
            }
            grammar = grammar.arg(arg);
        }
        for &name in STRINGS {
            grammar = grammar.arg(Arg::new(name).long(name).action(ArgAction::Set));
        }
        for &name in REPEATED {
            grammar = grammar.arg(Arg::new(name).long(name).action(ArgAction::Append));
        }
        // Clap diagnostics may contain a pasted credential; never expose them.
        grammar
            .try_get_matches_from(argv)
            .map(Self)
            .map_err(|_| Failure::usage())
    }
    fn value(&self, name: &str) -> Option<&str> {
        self.0.get_one::<String>(name).map(String::as_str)
    }
    fn values(&self, name: &str) -> Option<Vec<String>> {
        self.0
            .get_many::<String>(name)
            .map(|v| v.cloned().collect())
    }
    fn flag(&self, name: &str) -> bool {
        self.0.get_flag(name)
    }
    fn seen(&self, name: &str) -> bool {
        self.0.value_source(name) == Some(ValueSource::CommandLine)
    }
    fn allowed(&self, common: bool, names: &[&str]) -> Result<(), Failure> {
        if BOOLEANS.iter().chain(STRINGS).chain(REPEATED).any(|name| {
            self.seen(name)
                && !names.contains(name)
                && !(common && ["json", "no-input"].contains(name))
        }) {
            Err(Failure::usage())
        } else {
            Ok(())
        }
    }
    fn required(&self, name: &str) -> Result<&str, Failure> {
        self.value(name).ok_or_else(Failure::usage)
    }
    fn organization(&self) -> Result<Option<Selector>, Failure> {
        match (self.value("org"), self.value("org-id")) {
            (None, None) => Ok(None),
            (Some(name), None) => {
                let valid_letter = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit();
                if name.is_empty()
                    || name.len() > 39
                    || !name.bytes().enumerate().all(|(i, c)| {
                        valid_letter(c)
                            || (c == b'-'
                                && i > 0
                                && name
                                    .as_bytes()
                                    .get(i + 1)
                                    .is_some_and(|next| valid_letter(*next)))
                    })
                {
                    return Err(Failure::usage());
                }
                Ok(Some(Selector::Name(name.to_owned())))
            }
            (None, Some(value)) => {
                if !value.starts_with(|c: char| c.is_ascii_digit() && c != '0')
                    || !value.bytes().all(|c| c.is_ascii_digit())
                {
                    return Err(Failure::usage());
                }
                let id = value.parse::<u64>().map_err(|_| Failure::usage())?;
                if id > 9_007_199_254_740_991 {
                    return Err(Failure::usage());
                }
                Ok(Some(Selector::Id(id)))
            }
            _ => Err(Failure::usage()),
        }
    }
}

/// Commands grouped under `grida ai`. Their root spellings remain silent aliases.
pub(crate) const AI_COMMANDS: &[&str] = &["providers", "models", "voices", "generate", "rigging"];

/// Which spelling selected a command. Both spellings parse to the same invocation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandPath {
    Canonical,
    /// A grouped command spelled at the root, such as `grida generate`.
    Legacy,
}

/// Parse only syntax. This function never opens storage, browsers or connections.
pub fn parse(argv: &[String]) -> Result<Invocation, Failure> {
    parse_path(argv).map(|(invocation, _)| invocation)
}

/// [`parse`], also reporting whether a grouped command used its legacy root path.
pub fn parse_path(argv: &[String]) -> Result<(Invocation, CommandPath), Failure> {
    let tokens = Tokens::parse(argv)?;
    let mut words = tokens.values("words").unwrap_or_default();
    let grouped = words.first().is_some_and(|word| word == "ai");
    if grouped {
        words.remove(0);
        if words
            .first()
            .is_some_and(|word| !AI_COMMANDS.contains(&word.as_str()))
        {
            return Err(Failure::usage());
        }
    }
    let subject = match words.first().map(String::as_str) {
        Some("help" | "docs") => words.get(1),
        _ => words.first(),
    };
    let path = if !grouped && subject.is_some_and(|word| AI_COMMANDS.contains(&word.as_str())) {
        CommandPath::Legacy
    } else {
        CommandPath::Canonical
    };
    // Bare `grida ai` is the group's help topic; grouped words match without the prefix.
    let topic = if grouped && words.is_empty() {
        "ai".to_owned()
    } else {
        words.join(" ")
    };
    parse_words(&tokens, words, topic).map(|invocation| (invocation, path))
}

fn parse_words(tokens: &Tokens, words: Vec<String>, topic: String) -> Result<Invocation, Failure> {
    let options = Options {
        json: tokens.flag("json"),
        no_input: tokens.flag("no-input"),
    };
    let invocation = |command| Ok(Invocation { options, command });
    if words.first().is_some_and(|word| word == "help") {
        tokens.allowed(false, &["help"])?;
        return invocation(Command::Help(Topic::parse(&words[1..].join(" "))?));
    }
    if tokens.flag("help") || (topic.is_empty() && !tokens.flag("version")) {
        tokens.allowed(false, &["help"])?;
        return invocation(Command::Help(Topic::parse(&topic)?));
    }
    if tokens.flag("version") {
        tokens.allowed(false, &["version"])?;
        if !topic.is_empty() {
            return Err(Failure::usage());
        }
        return invocation(Command::Version);
    }
    if words.first().is_some_and(|word| word == "docs") {
        tokens.allowed(false, &[])?;
        return invocation(Command::Docs(Topic::parse(&words[1..].join(" "))?));
    }
    if [
        "auth",
        "account",
        "auth storage",
        "ai",
        "models",
        "providers",
        "voices",
        "rigging",
    ]
    .contains(&topic.as_str())
    {
        tokens.allowed(false, &[])?;
        return invocation(Command::Help(Topic::parse(&topic)?));
    }
    let command = match topic.as_str() {
        "rigging list" => {
            tokens.allowed(true, &["provider", "feature"])?;
            Command::RiggingList {
                provider: tokens
                    .value("provider")
                    .map(MeshProvider::parse)
                    .transpose()?,
                feature: tokens
                    .value("feature")
                    .map(MeshFeature::parse)
                    .transpose()?,
            }
        }
        "rigging inspect" => {
            tokens.allowed(true, &["provider", "feature", "model"])?;
            let provider = MeshProvider::parse(tokens.required("provider")?)?;
            let operation = match MeshFeature::parse(tokens.required("feature")?)? {
                MeshFeature::Check if tokens.value("model").is_none() => MeshOperation::Check,
                MeshFeature::Rig => MeshOperation::Rig {
                    model: rigging_value(tokens.required("model")?)?,
                },
                _ => return Err(Failure::usage()),
            };
            Command::RiggingInspect {
                provider,
                operation,
            }
        }
        "rigging check" | "rigging run" => parse_rigging(tokens, topic == "rigging run")?,
        "auth login" => {
            tokens.allowed(true, &["storage", "no-browser"])?;
            if options.json || options.no_input {
                return Err(Failure {
                    code: FailureCode::InteractionRequired,
                    message: "Login needs browser interaction. Run grida auth login without --json or --no-input.",
                });
            }
            Command::AuthLogin {
                storage: tokens.value("storage").map(Storage::parse).transpose()?,
                no_browser: tokens.flag("no-browser"),
            }
        }
        "account credits" => {
            tokens.allowed(true, &["org", "org-id"])?;
            Command::AccountCredits(tokens.organization()?)
        }
        "providers list" => {
            tokens.allowed(true, &[])?;
            Command::ProvidersList
        }
        "models list" => {
            tokens.allowed(
                true,
                &[
                    "provider",
                    "modality",
                    "kind",
                    "available",
                    "local-image",
                    "org",
                    "org-id",
                ],
            )?;
            let provider = tokens.value("provider").map(Provider::parse).transpose()?;
            let kind = tokens.value("kind").map(Kind::parse).transpose()?;
            let modality = tokens.value("modality").map(Modality::parse).transpose()?;
            let available = tokens.flag("available");
            let selector = tokens.organization()?;
            if (available && provider.is_none())
                || (selector.is_some() && (!available || provider != Some(Provider::Gg)))
            {
                return Err(Failure::usage());
            }
            Command::ModelsList {
                provider,
                kind,
                modality,
                available,
                local_image: tokens.flag("local-image"),
                selector,
            }
        }
        "voices list" => {
            tokens.allowed(true, &["provider", "key-stdin"])?;
            if tokens.value("provider") != Some("elevenlabs") {
                return Err(Failure::usage());
            }
            Command::VoicesList {
                key_stdin: tokens.flag("key-stdin"),
            }
        }
        "models inspect" | "generate" => parse_media(tokens, topic == "generate")?,
        "auth status" | "auth logout" | "auth storage show" | "account view" => {
            tokens.allowed(true, &[])?;
            match topic.as_str() {
                "auth status" => Command::AuthStatus,
                "auth logout" => Command::AuthLogout,
                "auth storage show" => Command::AuthStorageShow,
                _ => Command::AccountView,
            }
        }
        _ => match words
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice()
        {
            ["providers", action @ ("configure" | "remove"), provider] => {
                let configure = *action == "configure";
                tokens.allowed(true, if configure { &["key-stdin"] } else { &[] })?;
                let provider = Provider::parse(provider)?;
                if provider == Provider::Gg {
                    return Err(Failure::usage());
                }
                if configure {
                    let key_stdin = tokens.flag("key-stdin");
                    if !key_stdin && (options.json || options.no_input) {
                        return Err(Failure {
                            code: FailureCode::InteractionRequired,
                            message: "Use --key-stdin to configure a provider without terminal interaction.",
                        });
                    }
                    Command::ProvidersConfigure {
                        provider,
                        key_stdin,
                    }
                } else {
                    Command::ProvidersRemove(provider)
                }
            }
            ["auth", "storage", "migrate", backend] => {
                tokens.allowed(true, &[])?;
                Command::AuthStorageMigrate(Storage::parse(backend)?)
            }
            _ => return Err(Failure::usage()),
        },
    };
    invocation(command)
}

fn parse_rigging(tokens: &Tokens, run: bool) -> Result<Command, Failure> {
    let mut allowed = vec!["provider", "mesh", "input", "key-stdin", "org", "org-id"];
    if run {
        allowed.extend(["model", "out", "rig-type", "spec"]);
    }
    tokens.allowed(true, &allowed)?;
    let provider = MeshProvider::parse(tokens.required("provider")?)?;
    let mesh = tokens.value("mesh").map(rigging_value).transpose()?;
    let input = tokens.value("input").map(rigging_value).transpose()?;
    let key_stdin = tokens.flag("key-stdin");
    let selector = tokens.organization()?;
    if (key_stdin && provider == MeshProvider::Gg)
        || (selector.is_some() && provider != MeshProvider::Gg)
    {
        return Err(Failure::usage());
    }
    let source = match (mesh, input) {
        (Some(path), None) if path != "-" => MeshSource::Mesh(path),
        (None, Some(input)) if json_source(&input) && !(key_stdin && input == "-") => {
            MeshSource::Json(input)
        }
        _ => return Err(Failure::usage()),
    };
    if !run {
        return Ok(Command::RiggingCheck {
            provider,
            source,
            key_stdin,
            selector,
        });
    }
    if matches!(source, MeshSource::Json(_)) && (tokens.seen("rig-type") || tokens.seen("spec")) {
        return Err(Failure::usage());
    }
    let model = rigging_value(tokens.required("model")?)?;
    let out = rigging_value(tokens.required("out")?)?;
    let source = match source {
        MeshSource::Json(input) => RiggingSource::Json(input),
        MeshSource::Mesh(path) => RiggingSource::Mesh {
            path,
            rig_type: rigging_value(tokens.required("rig-type")?)?,
            spec: rigging_value(tokens.required("spec")?)?,
        },
    };
    Ok(Command::RiggingRun {
        provider,
        model,
        source,
        out,
        key_stdin,
        selector,
    })
}

fn parse_media(tokens: &Tokens, generate: bool) -> Result<Command, Failure> {
    let mut allowed = vec!["provider", "model", "kind", "variant"];
    if generate {
        allowed.extend(["input", "out", "key-stdin", "org", "org-id"]);
        allowed.extend(REQUEST_FLAGS);
    }
    tokens.allowed(true, &allowed)?;
    let provider = Provider::parse(tokens.required("provider")?)?;
    let model = tokens.required("model")?;
    if model.is_empty() || model.encode_utf16().count() > 256 || has_control_or_format(model) {
        return Err(Failure::usage());
    }
    let model = ModelSelection {
        provider,
        model: model.to_owned(),
        kind: tokens.value("kind").map(Kind::parse).transpose()?,
        variant: tokens.value("variant").map(Variant::parse).transpose()?,
    };
    if !generate {
        return Ok(Command::ModelsInspect(model));
    }
    let input = tokens.value("input");
    let out = tokens.required("out")?;
    let key_stdin = tokens.flag("key-stdin");
    let selector = tokens.organization()?;
    let has_request = REQUEST_FLAGS.iter().any(|name| tokens.seen(name));
    if input.is_some_and(|value| !json_source(value) || value.contains('\0'))
        || (input.is_none() && !has_request)
        || (input.is_some() && has_request)
        || out.is_empty()
        || out.contains('\0')
        || (key_stdin && (input == Some("-") || provider == Provider::Gg))
        || (selector.is_some() && provider != Provider::Gg)
    {
        return Err(Failure::usage());
    }
    let source = if let Some(input) = input {
        GenerationSource::Json(input.to_owned())
    } else {
        GenerationSource::Flags(request_values(tokens)?)
    };
    if let GenerationSource::Flags(request) = &source
        && key_stdin
        && (request.prompt_file.as_deref() == Some("-")
            || request.text_file.as_deref() == Some("-"))
    {
        return Err(Failure {
            code: FailureCode::InvalidUsage,
            message: "Only one input can read stdin; use a file for the other input.",
        });
    }
    Ok(Command::Generate {
        model,
        source,
        out: out.to_owned(),
        key_stdin,
        selector,
    })
}

fn request_values(tokens: &Tokens) -> Result<Request, Failure> {
    let source = |name| -> Result<Option<String>, Failure> {
        tokens
            .value(name)
            .map(|value| {
                if value.is_empty() || value.contains('\0') {
                    Err(Failure::usage())
                } else {
                    Ok(value.to_owned())
                }
            })
            .transpose()
    };
    let prompt = tokens.value("prompt").map(str::to_owned);
    let prompt_file = source("prompt-file")?;
    let text = tokens.value("text").map(str::to_owned);
    let text_file = source("text-file")?;
    let references = tokens.values("reference");
    let image = source("image")?;
    if (prompt.is_some() && prompt_file.is_some())
        || (text.is_some() && text_file.is_some())
        || ((prompt.is_some() || prompt_file.is_some()) && (text.is_some() || text_file.is_some()))
        || (references.is_some() && image.is_some())
        || image.as_deref() == Some("-")
        || references.as_ref().is_some_and(|items| {
            items
                .iter()
                .any(|v| v.is_empty() || v == "-" || v.contains('\0'))
        })
    {
        return Err(Failure::usage());
    }
    let mut fields = HashSet::new();
    let mut parameters = Vec::new();
    for entry in tokens.values("param").unwrap_or_default() {
        let invalid = || Failure {
            code: FailureCode::InvalidUsage,
            message: "Use --param FIELD=VALUE once per advertised scalar field.",
        };
        let (field, value) = entry.split_once('=').ok_or_else(invalid)?;
        if !field.starts_with(|c: char| c.is_ascii_lowercase())
            || !field
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
            || !fields.insert(field.to_owned())
        {
            return Err(invalid());
        }
        parameters.push(Parameter {
            field: field.to_owned(),
            value: value.to_owned(),
        });
    }
    Ok(Request {
        prompt,
        prompt_file,
        text,
        text_file,
        references,
        image,
        voice: tokens.value("voice").map(str::to_owned),
        parameters,
    })
}

fn json_source(value: &str) -> bool {
    value == "-" || (value.starts_with('@') && value.len() > 1)
}
fn rigging_value(value: &str) -> Result<String, Failure> {
    if value.is_empty() || has_control_or_format(value) {
        Err(Failure::usage())
    } else {
        Ok(value.to_owned())
    }
}
fn has_control_or_format(value: &str) -> bool {
    value.chars().any(|character| {
        matches!(
            get_general_category(character),
            GeneralCategory::Control | GeneralCategory::Format
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }
    fn parsed(values: &[&str]) -> Invocation {
        parse(&args(values)).unwrap()
    }

    #[test]
    fn options_can_precede_follow_and_interrupt_command_words() {
        let expected = parsed(&[
            "models",
            "inspect",
            "--provider",
            "fal",
            "--model",
            "model",
            "--json",
        ]);
        assert_eq!(
            parsed(&[
                "--json",
                "models",
                "--provider=fal",
                "inspect",
                "--model=model"
            ]),
            expected
        );
        assert_eq!(
            parsed(&[
                "--provider=fal",
                "--model=model",
                "models",
                "inspect",
                "--json"
            ]),
            expected
        );
        assert_eq!(
            parsed(&["help", "providers", "configure", "tripo"]).command,
            Command::Help(Topic::ProvidersConfigure)
        );
    }

    #[test]
    fn repeated_request_values_retain_order_and_values() {
        let invocation = parsed(&[
            "generate",
            "--provider=fal",
            "--model=model",
            "--out=./out",
            "--prompt=",
            "--reference=./a",
            "--reference=./b",
            "--param=size=3=4",
            "--param=count=",
        ]);
        let Command::Generate {
            source: GenerationSource::Flags(request),
            ..
        } = invocation.command
        else {
            panic!("Expected request-building flags")
        };
        assert_eq!(request.prompt.as_deref(), Some(""));
        assert_eq!(
            request.references,
            Some(vec!["./a".to_owned(), "./b".to_owned()])
        );
        assert_eq!(
            request.parameters,
            vec![
                Parameter {
                    field: "size".to_owned(),
                    value: "3=4".to_owned()
                },
                Parameter {
                    field: "count".to_owned(),
                    value: "".to_owned()
                }
            ]
        );
        for values in [
            vec!["--help", "-h"],
            vec!["auth", "status", "--json", "--json"],
            vec!["models", "list", "--provider=fal", "--provider=tripo"],
        ] {
            assert_eq!(parse(&args(&values)).unwrap_err(), Failure::usage());
        }
    }

    #[test]
    fn organization_names_and_ids_are_distinct_and_bounded() {
        assert_eq!(
            parsed(&["account", "credits", "--org=123"]).command,
            Command::AccountCredits(Some(Selector::Name("123".to_owned())))
        );
        assert_eq!(
            parsed(&["account", "credits", "--org-id=9007199254740991"]).command,
            Command::AccountCredits(Some(Selector::Id(9_007_199_254_740_991)))
        );
        for option in [
            "--org-id=9007199254740992",
            "--org-id=01",
            "--org-id=0",
            "--org-id=-1",
            "--org=a--b",
            "--org=-a",
            "--org=a-",
            "--org=À",
        ] {
            assert_eq!(
                parse(&args(&["account", "credits", option])).unwrap_err(),
                Failure::usage()
            );
        }
        assert!(parse(&args(&["account", "credits", "--org=a-b-2"])).is_ok());
        assert!(parse(&args(&["account", "credits", "--org=name", "--org-id=1"])).is_err());
    }

    #[test]
    fn model_bound_counts_utf16_and_rejects_unicode_control_categories() {
        let prefix = args(&["models", "inspect", "--provider=fal", "--model"]);
        for (model, accepted) in [
            ("雪".repeat(256), true),
            ("雪".repeat(257), false),
            ("😀".repeat(128), true),
            ("😀".repeat(129), false),
            ("a\u{200b}".to_owned(), false),
            ("a\u{85}".to_owned(), false),
            ("a\u{2028}".to_owned(), true),
        ] {
            let mut argv = prefix.clone();
            argv.push(model);
            assert_eq!(parse(&argv).is_ok(), accepted);
        }
    }

    #[test]
    fn stdin_and_input_alternatives_are_owned_by_one_source() {
        let prefix = [
            "generate",
            "--provider=tripo",
            "--model=model",
            "--out=./out",
        ];
        let with = |tail: &[&str]| args(&prefix.iter().chain(tail).copied().collect::<Vec<_>>());
        assert!(parse(&with(&["--input=-"])).is_ok());
        assert!(parse(&with(&["--input=@request.json", "--key-stdin"])).is_ok());
        assert!(parse(&with(&["--prompt-file=prompt.txt", "--key-stdin"])).is_ok());
        assert_eq!(
            parse(&with(&["--input=-", "--key-stdin"])).unwrap_err(),
            Failure::usage()
        );
        assert_eq!(
            parse(&with(&["--input=@request.json", "--prompt=hello"])).unwrap_err(),
            Failure::usage()
        );
        let error = parse(&with(&["--prompt-file=-", "--key-stdin"])).unwrap_err();
        assert_eq!(
            error.message,
            "Only one input can read stdin; use a file for the other input."
        );
        assert!(parse(&with(&["--prompt=hello", "--text=speech"])).is_err());
    }

    #[test]
    fn rigging_sources_and_provider_custody_are_explicit() {
        let check = parsed(&[
            "rigging",
            "check",
            "--provider=gg",
            "--mesh=./mesh.glb",
            "--org=studio",
        ]);
        assert!(matches!(
            check.command,
            Command::RiggingCheck {
                provider: MeshProvider::Gg,
                source: MeshSource::Mesh(_),
                selector: Some(_),
                ..
            }
        ));
        for argv in [
            vec![
                "rigging",
                "check",
                "--provider=gg",
                "--mesh=mesh.glb",
                "--key-stdin",
            ],
            vec![
                "rigging",
                "check",
                "--provider=tripo",
                "--mesh=mesh.glb",
                "--org=studio",
            ],
            vec!["rigging", "check", "--provider=tripo", "--mesh=-"],
            vec![
                "rigging",
                "run",
                "--provider=tripo",
                "--model=m",
                "--out=o",
                "--input=@i",
                "--spec=tripo",
            ],
            vec![
                "rigging",
                "inspect",
                "--provider=tripo",
                "--feature=rig-check",
                "--model=m",
            ],
        ] {
            assert_eq!(parse(&args(&argv)).unwrap_err(), Failure::usage());
        }
        assert!(matches!(
            parsed(&[
                "rigging",
                "run",
                "--provider=tripo",
                "--model=m",
                "--out=o",
                "--input=@i"
            ])
            .command,
            Command::RiggingRun {
                source: RiggingSource::Json(_),
                ..
            }
        ));
    }

    #[test]
    fn parser_failures_never_echo_untrusted_arguments() {
        for argv in [
            vec!["secret-token"],
            vec!["--secret-token"],
            vec!["auth", "status", "--provider=secret-token"],
            vec!["models", "inspect", "--provider=secret-token", "--model=m"],
        ] {
            let error = parse(&args(&argv)).unwrap_err();
            assert_eq!(error, Failure::usage());
            assert!(!error.to_string().contains("secret-token"));
        }
        assert_eq!(
            parse(&args(&["auth", "login", "--json", "--storage=invalid"]))
                .unwrap_err()
                .code,
            FailureCode::InteractionRequired
        );
    }

    #[test]
    fn grouped_commands_keep_their_legacy_root_spellings() {
        for canonical in [
            vec!["ai"],
            vec!["ai", "--help"],
            vec!["help", "ai"],
            vec!["docs", "ai"],
            vec!["ai", "providers"],
            vec!["ai", "providers", "list", "--json"],
            vec!["ai", "providers", "configure", "fal", "--key-stdin"],
            vec!["ai", "providers", "remove", "tripo"],
            vec!["ai", "providers", "configure", "tripo", "--help"],
            vec!["help", "ai", "providers", "configure", "tripo"],
            vec!["ai", "models"],
            vec!["ai", "models", "list", "--modality=image", "--local-image"],
            vec![
                "--json",
                "ai",
                "--provider=fal",
                "models",
                "inspect",
                "--model=m",
            ],
            vec!["ai", "voices", "list", "--provider=elevenlabs"],
            vec![
                "ai",
                "generate",
                "--provider=gg",
                "--model=m",
                "--prompt=p",
                "--out=o",
                "--org=studio",
            ],
            vec!["ai", "generate", "--help"],
            vec!["help", "ai", "generate"],
            vec!["docs", "ai", "generate"],
            vec!["ai", "rigging", "list", "--provider=tripo"],
            vec![
                "ai",
                "rigging",
                "inspect",
                "--provider=gg",
                "--feature=rig-check",
            ],
            vec!["ai", "rigging", "check", "--provider=tripo", "--mesh=m.glb"],
            vec![
                "ai",
                "rigging",
                "run",
                "--provider=tripo",
                "--model=m",
                "--out=o",
                "--input=@i",
            ],
        ] {
            let (invocation, path) = parse_path(&args(&canonical)).unwrap();
            assert_eq!(path, CommandPath::Canonical, "{canonical:?}");
            let mut legacy = canonical.clone();
            let Some(index) = legacy.iter().position(|word| *word == "ai") else {
                unreachable!()
            };
            legacy.remove(index);
            if legacy.iter().all(|word| word.starts_with('-'))
                || matches!(legacy.as_slice(), ["help" | "docs"])
            {
                // Bare `ai` has no legacy spelling.
                continue;
            }
            let (legacy_invocation, legacy_path) = parse_path(&args(&legacy)).unwrap();
            assert_eq!(legacy_invocation, invocation, "{legacy:?}");
            assert_eq!(legacy_path, CommandPath::Legacy, "{legacy:?}");
        }
        assert_eq!(parsed(&["ai"]).command, Command::Help(Topic::Ai));
        assert_eq!(
            parse_path(&args(&["auth", "status"])).unwrap().1,
            CommandPath::Canonical
        );
    }

    #[test]
    fn ai_admits_only_grouped_commands() {
        for argv in [
            vec!["ai", "auth", "login"],
            vec!["ai", "account", "view"],
            vec!["ai", "ai", "models", "list"],
            vec!["ai", "docs"],
            vec!["ai", "help"],
            vec!["ai", "--version"],
            vec!["ai", "--json"],
            vec!["help", "ai", "auth"],
        ] {
            assert_eq!(
                parse(&args(&argv)).unwrap_err(),
                Failure::usage(),
                "{argv:?}"
            );
        }
    }
}
