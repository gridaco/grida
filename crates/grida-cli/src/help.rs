use crate::Failure;

macro_rules! topics {
    ($($variant:ident => ($name:literal, $file:literal, $page:literal)),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum Topic { $($variant),+ }

        impl Topic {
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
                match value {
                    $($name => Ok(Self::$variant)),+,
                    _ => {
                        // Provider-specific help describes the same credential command.
                        let mut words = value.split(' ');
                        match (words.next(), words.next(), words.next(), words.next()) {
                            (Some("providers"), Some(action), Some(provider), None)
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
    Models => ("models", "models", "/models"),
    ModelsList => ("models list", "models-list", "/models"),
    ModelsInspect => ("models inspect", "models-inspect", "/models"),
    Providers => ("providers", "providers", "/providers"),
    ProvidersConfigure => ("providers configure", "providers-configure", "/providers"),
    ProvidersRemove => ("providers remove", "providers-remove", "/providers"),
    ProvidersList => ("providers list", "providers-list", "/providers"),
    Generate => ("generate", "generate", "/generate"),
    Voices => ("voices", "voices", "/models"),
    VoicesList => ("voices list", "voices-list", "/models"),
    Rigging => ("rigging", "rigging", "/generate"),
    RiggingList => ("rigging list", "rigging-list", "/models"),
    RiggingInspect => ("rigging inspect", "rigging-inspect", "/models"),
    RiggingCheck => ("rigging check", "rigging-check", "/generate"),
    RiggingRun => ("rigging run", "rigging-run", "/generate"),
    Docs => ("docs", "docs", ""),
}
