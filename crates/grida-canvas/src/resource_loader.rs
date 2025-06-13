use async_trait::async_trait;

/// Generic asynchronous resource loader trait.
#[async_trait]
pub trait ResourceLoader {
    type Output;

    /// Load a resource identified by `key` from `src`.
    async fn load(&mut self, key: &str, src: &str) -> Option<Self::Output>;

    /// Unload or remove a cached resource identified by `key`.
    async fn unload(&mut self, key: &str);
}
