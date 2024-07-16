import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEditorState } from "../editor";
import {
  LaptopMinimalIcon,
  MousePointer2Icon,
  SmartphoneIcon,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

export function CanvasFloatingToolbar() {
  return (
    <div className="min-h-10 rounded-full bg-background shadow-lg border flex items-center justify-center py-1 px-2 gap-2">
      <CursorToggle />
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
      <SelectTrigger className="border-none focus:ring-0">
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

export function CursorToggle() {
  return (
    <Toggle className="rounded-full">
      <MousePointer2Icon className="w-5 h-5" />
    </Toggle>
  );
}

export function ViewportToggle() {
  return (
    <ToggleGroup type="single">
      <ToggleGroupItem value="lg" className="rounded-full">
        <LaptopMinimalIcon className="w-5 h-5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="sm" className="rounded-full">
        <SmartphoneIcon className="w-5 h-5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
