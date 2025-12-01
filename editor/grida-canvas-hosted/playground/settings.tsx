import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemedMonacoEditor } from "@/components/monaco";
import { useLocalStorage } from "@uidotdev/usehooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { keysymbols } from "@/grida-canvas-react/devtools/keysymbols";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";
import { keybindings_sheet } from "@/grida-canvas-react/viewport/hotkeys";
import { useCurrentEditor } from "@/grida-canvas-react";
import { Button } from "@/components/ui/button";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export function SettingsDialog(props: React.ComponentProps<typeof Dialog>) {
  const editor = useCurrentEditor();
  const [aiSettings, setAiSettings] = useLocalStorage<string | undefined>(
    CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY,
    undefined
  );

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Playground Settings</DialogTitle>
        </DialogHeader>
        <hr />
        <Tabs defaultValue="keybindings" className="min-h-96">
          <TabsList>
            <TabsTrigger value="keybindings">Keyboard Shortcuts</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <div className="py-4 space-y-2">
              <Label className="flex items-center justify-between">
                Debug Mode
                <Switch
                  checked={editor.debug}
                  onCheckedChange={(v) => {
                    editor.debug = v;
                  }}
                />
              </Label>
              <hr />
              <Label className="flex items-center justify-between">
                Rendering Backend
                <Link href="/canvas/experimental/dom" target="_blank">
                  <Button size="sm" variant="outline">
                    DOM
                    <OpenInNewWindowIcon />
                  </Button>
                </Link>
              </Label>
              <Label className="flex items-center justify-between">
                Rendering Backend
                <Link href="/canvas" target="_blank">
                  <Button size="sm" variant="outline">
                    CANVAS WASM
                    <OpenInNewWindowIcon />
                  </Button>
                </Link>
              </Label>

              {/* <label>
                Snap to geometry
                <Switch />
              </label>
              <label>
                Snap to objects
                <Switch />
              </label>
              <label>
                Snap to pixel grid
                <Switch />
              </label> */}
              {/* <label>Nudge Amount</label> */}
            </div>
          </TabsContent>
          <TabsContent value="keybindings">
            <ScrollArea className="h-96">
              <ScrollBar />
              <div>
                {keybindings_sheet.map((action) => {
                  return (
                    <div
                      key={action.name}
                      className="flex items-center justify-between p-2 border-b last:border-b-0"
                    >
                      <div className="grid gap-1">
                        <span className="font-medium text-sm text-gray-800">
                          {action.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {action.description}
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        {action.keys.map((key) => (
                          <span
                            key={key}
                            className="px-2 py-1 text-xs font-mono font-bold text-gray-700 bg-gray-200 rounded-md shadow"
                          >
                            {key
                              .split("+")
                              .map(
                                (part) =>
                                  keysymbols[part.toLowerCase()] ||
                                  part.toUpperCase()
                              )
                              .join(" + ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="ai">
            <div>
              <ThemedMonacoEditor
                value={aiSettings}
                onChange={setAiSettings}
                width="100%"
                height={400}
                language="txt"
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
