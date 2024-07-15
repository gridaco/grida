import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorState } from "../editor";
import { LaptopMinimalIcon, SmartphoneIcon } from "lucide-react";

export function CanvasFloatingToolbar() {
  return (
    <div className="h-10 rounded-full bg-background shadow-lg border flex items-center justify-center p-2 px-4">
      <ViewportToggle />
      <SamplesSelect />
    </div>
  );
}

export function SamplesSelect() {
  const [state, dispatch] = useEditorState();

  return (
    <Select
      value={state.document.templatesample}
      onValueChange={(value) => {
        dispatch({
          type: "editor/document/sampledata",
          sampledata: value,
        });
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="formcollection_sample_001_the_bundle">
          The Bundle
        </SelectItem>
        <SelectItem value="formcollection_sample_002_endura_sports">
          Endura Sports
        </SelectItem>
        <SelectItem value="formcollection_sample_003_prism">Prism</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ViewportToggle() {
  return (
    <ToggleGroup type="single">
      <ToggleGroupItem value="lg">
        <LaptopMinimalIcon className="w-5 h-5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="sm">
        <SmartphoneIcon className="w-5 h-5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
