import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { BuiltIn_GettingStarted } from "../getting-started/getting-started";
import { useApplicationState } from "@core/app-state";

export function CurrentPage() {
  const [state] = useApplicationState();
  const page = state.selectedPage;

  // region - temporary static prebuilt-pages router
  if (page == "getting-started") {
    return <BuiltIn_GettingStarted />;
  }
  // endregion - temporary static prebuilt-pages router

  return <BoringScaffold extensions={[]} />;
}
