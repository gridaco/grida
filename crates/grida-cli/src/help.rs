use crate::Failure;
use crate::grammar::AI_COMMANDS;

macro_rules! topics {
    ($($variant:ident => ($name:literal, $file:literal, $page:literal)),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum Topic { $($variant),+ }

        impl Topic {
            #[cfg(feature = "conformance")]
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];

            pub fn name(self) -> &'static str {
                match self { $(Self::$variant => $name),+ }
            }
            pub fn help(self) -> &'static str {
                match self { $(Self::$variant => include_str!(concat!("../assets/help/", $file, ".txt"))),+ }
            }
            pub fn docs_url(self) -> &'static str {
                match self { $(Self::$variant => concat!("https://grida.co/docs/cli", $page)),+ }
            }
            pub(crate) fn parse(value: &str) -> Result<Self, Failure> {
                // Legacy root spellings of grouped commands name the same topic.
                let grouped;
                let value = if value
                    .split(' ')
                    .next()
                    .is_some_and(|word| AI_COMMANDS.contains(&word))
                {
                    grouped = format!("ai {value}");
                    grouped.as_str()
                } else {
                    value
                };
                match value {
                    $($name => Ok(Self::$variant)),+,
                    _ => {
                        // Provider-specific help describes the same credential command.
                        let mut words = value.split(' ');
                        match (words.next(), words.next(), words.next(), words.next(), words.next()) {
                            (Some("ai"), Some("providers"), Some(action), Some(provider), None)
                                if ["openrouter", "vercel", "fal", "elevenlabs", "tripo"].contains(&provider) => {
                                    match action {
                                        "configure" => Ok(Self::ProvidersConfigure),
                                        "remove" => Ok(Self::ProvidersRemove),
                                        _ => Err(Failure::usage()),
                                    }
                                }
                            _ => Err(Failure::usage()),
                        }
                    }
                }
            }
        }
    };
}

topics! {
    Root => ("", "root", ""),
    Auth => ("auth", "auth", "/auth"),
    AuthLogin => ("auth login", "auth-login", "/auth"),
    AuthStatus => ("auth status", "auth-status", "/auth"),
    AuthLogout => ("auth logout", "auth-logout", "/auth"),
    AuthStorage => ("auth storage", "auth-storage", "/auth"),
    AuthStorageShow => ("auth storage show", "auth-storage-show", "/auth"),
    AuthStorageMigrate => ("auth storage migrate", "auth-storage-migrate", "/auth"),
    Account => ("account", "account", "/account"),
    AccountView => ("account view", "account-view", "/account"),
    AccountCredits => ("account credits", "account-credits", "/account"),
    Ai => ("ai", "ai", ""),
    Models => ("ai models", "models", "/models"),
    ModelsList => ("ai models list", "models-list", "/models"),
    ModelsInspect => ("ai models inspect", "models-inspect", "/models"),
    Providers => ("ai providers", "providers", "/providers"),
    ProvidersConfigure => ("ai providers configure", "providers-configure", "/providers"),
    ProvidersRemove => ("ai providers remove", "providers-remove", "/providers"),
    ProvidersList => ("ai providers list", "providers-list", "/providers"),
    Generate => ("ai generate", "generate", "/generate"),
    Voices => ("ai voices", "voices", "/models"),
    VoicesList => ("ai voices list", "voices-list", "/models"),
    Rigging => ("ai rigging", "rigging", "/generate"),
    RiggingList => ("ai rigging list", "rigging-list", "/models"),
    RiggingInspect => ("ai rigging inspect", "rigging-inspect", "/models"),
    RiggingCheck => ("ai rigging check", "rigging-check", "/generate"),
    RiggingRun => ("ai rigging run", "rigging-run", "/generate"),
    Docs => ("docs", "docs", ""),
}

#[cfg(all(test, feature = "conformance"))]
mod tests {
    use super::*;

    #[test]
    fn help_names_grouped_commands_by_their_canonical_path() {
        for topic in Topic::ALL {
            for word in AI_COMMANDS {
                assert!(
                    !topic.help().contains(&format!("grida {word}")),
                    "{} help shows a legacy path: grida {word}",
                    topic.name()
                );
            }
        }
    }

    #[test]
    fn legacy_topic_names_resolve_to_the_canonical_topic() {
        for topic in Topic::ALL {
            if let Some(legacy) = topic.name().strip_prefix("ai ") {
                assert_eq!(Topic::parse(legacy), Ok(*topic));
            }
        }
        assert_eq!(
            Topic::parse("providers configure fal"),
            Ok(Topic::ProvidersConfigure)
        );
        assert_eq!(
            Topic::parse("ai providers remove tripo"),
            Ok(Topic::ProvidersRemove)
        );
        assert!(Topic::parse("ai auth").is_err());
    }
}
