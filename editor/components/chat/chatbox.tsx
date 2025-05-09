import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpIcon, ImageUpIcon } from "lucide-react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useFilePicker } from "use-file-picker";
import { cn } from "@/components/lib/utils";
import TextareaAutoResize from "react-textarea-autosize";
import toast from "react-hot-toast";
import Image from "next/image";
import type { FileIO } from "@/lib/file";

export type Attachment = {
  type: "file" | "image";
  filename?: string;
  mimeType: string;
  url: string;
};

export type ChatBoxContextValue = {
  disabled?: boolean;
  onValueCommit?: (value: { text: string; attachments: Attachment[] }) => void;
  uploader?: FileIO.BucketFileUploaderFn;
  placeholder?: string;
  accept?: string;
  text: string;
  setText: (text: string) => void;
  attachment?: Attachment;
  setAttachment: (attachment?: Attachment) => void;
  onSubmit: () => void;
  clear: () => void;
  openFilePicker: () => void;
  acceptsImage: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const ChatBoxContext = React.createContext<ChatBoxContextValue | null>(null);

const useChatBox = () => {
  const context = React.useContext(ChatBoxContext);
  if (!context) {
    throw new Error("useChatBox must be used within a ChatBoxProvider");
  }
  return context;
};

/**
 * @param value - The value to commit.
 * @returns A boolean indicating whether the value was committed.
 *
 * Return `false` to not clear the input after the commit button press. return anything else (void / numbers, ....) for normal flow.
 */
type OnValueCommit = (value: {
  text: string;
  attachments: Attachment[];
}) => void | false | Promise<void> | Promise<false>;

interface ChatBoxProps {
  disabled?: boolean;
  /**
   * Return `false` to not clear the input after the commit button press. return anything else (void / numbers, ....) for normal flow.
   */
  onValueCommit?: OnValueCommit;
  uploader?: FileIO.BucketFileUploaderFn;
  placeholder?: string;
  accept?: string;
}

function ChatBox({
  children,
  disabled,
  onValueCommit,
  uploader,
  placeholder = "Chat with your prompt...",
  accept,
  className,
}: ChatBoxProps & {
  children: React.ReactNode;
  className?: string;
}) {
  const [attachment, setAttachment] = React.useState<Attachment>();
  const [text, setText] = React.useState<string>("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const { plainFiles, openFilePicker } = useFilePicker({
    accept: accept,
    multiple: false,
  });

  const acceptsImage = accept?.includes("image/") ?? false;

  useEffect(() => {
    if (plainFiles.length === 1) {
      const file = plainFiles[0];
      const task = uploader?.(file).then((result) => {
        setAttachment({
          type: "image",
          filename: file.name,
          mimeType: file.type,
          url: result.publicUrl,
        });
      });

      if (task) {
        toast.promise(task, {
          loading: "Uploading...",
          success: "Uploaded",
          error: "Failed to upload",
        });
      }
    }
  }, [plainFiles, uploader]);

  const clear = () => {
    setText("");
    setAttachment(undefined);
  };

  const onSubmit = async () => {
    if (disabled) return;
    const result = await onValueCommit?.({
      text,
      attachments: attachment ? [attachment] : [],
    });
    if (result === false) return;
    clear();
  };

  const handleContainerClick = () => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  };

  const value = {
    disabled,
    onValueCommit,
    uploader,
    placeholder,
    accept,
    text,
    setText,
    attachment,
    setAttachment,
    onSubmit,
    clear,
    openFilePicker,
    acceptsImage,
    textareaRef,
  };

  return (
    <ChatBoxContext.Provider value={value}>
      <div
        className={cn(
          "w-full flex flex-col rounded-xl border border-input bg-muted cursor-text",
          className
        )}
        onClick={handleContainerClick}
      >
        {children}
      </div>
    </ChatBoxContext.Provider>
  );
}

const ChatBoxHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4 pb-0", className)}
    {...props}
  />
));
ChatBoxHeader.displayName = "ChatBoxHeader";

const ChatBoxFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-between p-4 pt-0", className)}
    {...props}
  />
));
ChatBoxFooter.displayName = "ChatBoxFooter";

function ChatBoxTextArea() {
  const { text, setText, onSubmit, placeholder, textareaRef } = useChatBox();

  return (
    <TextareaAutoResize
      ref={textareaRef}
      placeholder={placeholder}
      maxRows={10}
      className="resize-none border-none outline-none bg-transparent text-sm p-4"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
    />
  );
}

function ChatBoxAttachmentPreview() {
  const { attachment, setAttachment } = useChatBox();

  if (!attachment) return null;

  return (
    <div className="relative">
      <Image
        src={attachment.url}
        alt={attachment.filename ?? ""}
        width={256}
        height={256}
        className="max-h-32 aspect-square w-auto object-cover border rounded-md"
      />
      <Button
        variant="outline"
        size="icon"
        onClick={() => setAttachment(undefined)}
        className="absolute top-1 right-1 rounded-full p-1 w-auto h-auto"
      >
        <Cross2Icon className="size-3" />
      </Button>
    </div>
  );
}

function ChatBoxAttachmentUploader() {
  const { acceptsImage, openFilePicker } = useChatBox();
  if (!acceptsImage) return null;

  return (
    <Button type="button" variant="ghost" size="icon" onClick={openFilePicker}>
      <ImageUpIcon className="size-4" />
    </Button>
  );
}

function ChatBoxSubmit() {
  const { disabled, onSubmit } = useChatBox();

  return (
    <Button
      disabled={disabled}
      onClick={onSubmit}
      variant="default"
      size="icon"
      className="rounded-full"
    >
      <ArrowUpIcon className="size-5" />
    </Button>
  );
}

export {
  useChatBox,
  ChatBox,
  ChatBoxHeader,
  ChatBoxFooter,
  ChatBoxTextArea,
  ChatBoxAttachmentUploader,
  ChatBoxAttachmentPreview,
  ChatBoxSubmit,
};
