// Parallel route slot fallback. Returns null when no intercepting route matches
// (i.e., on the `/billing` page itself). Required by Next.js for parallel slots
// to render predictably during navigation.
export default function ModalDefault() {
  return null;
}
