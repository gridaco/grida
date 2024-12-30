import { IAddPageAction } from "../../../core-state";
import { useDispatch } from "../use-dispatch";

export function useAddPage() {
  const dispatch = useDispatch();
  return (p: IAddPageAction) =>
    dispatch({
      type: "add-page",
      ...p,
    });
}
