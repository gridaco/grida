/// Internal node identifier used throughout the rendering engine.
/// This is a counter-based u64 that is ephemeral (per-session) and not serialized.
pub type NodeId = u64;

/// External/user-provided node identifier used in public APIs.
/// This is a stable string identifier that can be user-defined and is serialized.
pub type UserNodeId = String;

/// Generator for creating unique internal node IDs.
/// Uses a simple counter strategy for O(1) generation.
#[derive(Debug, Clone)]
pub struct NodeIdGenerator {
    counter: u64,
}

impl NodeIdGenerator {
    /// Create a new ID generator starting from 0.
    pub fn new() -> Self {
        Self { counter: 0 }
    }

    /// Create a new ID generator starting from a specific value.
    /// Useful for testing or when resuming from a known state.
    pub fn with_start(start: u64) -> Self {
        Self { counter: start }
    }

    /// Generate the next unique node ID.
    pub fn next(&mut self) -> NodeId {
        let id = self.counter;
        self.counter += 1;
        id
    }

    /// Get the current counter value without incrementing.
    pub fn current(&self) -> u64 {
        self.counter
    }

    /// Reset the generator to start from 0.
    pub fn reset(&mut self) {
        self.counter = 0;
    }
}

impl Default for NodeIdGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generator_sequential() {
        let mut gen = NodeIdGenerator::new();
        assert_eq!(gen.next(), 0);
        assert_eq!(gen.next(), 1);
        assert_eq!(gen.next(), 2);
    }

    #[test]
    fn test_generator_with_start() {
        let mut gen = NodeIdGenerator::with_start(100);
        assert_eq!(gen.next(), 100);
        assert_eq!(gen.next(), 101);
    }

    #[test]
    fn test_generator_reset() {
        let mut gen = NodeIdGenerator::new();
        gen.next();
        gen.next();
        gen.reset();
        assert_eq!(gen.next(), 0);
    }
}
