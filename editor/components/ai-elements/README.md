# AI Elements Components

These components are from [AI Elements](https://ai-sdk.dev/elements), a component library built by Vercel specifically for AI applications.

## Installed Components

### 1. Context Component (`context.tsx`) ✨ NEW

**Purpose:** Display AI model context window usage with cost estimation

**From:** https://ai-sdk.dev/elements/components/context

**Features:**

- 🎯 Circular progress icon showing % used
- 📊 HoverCard with token breakdown
- 💰 Real-time cost via `tokenlens`
- 📈 Input/Output token details
- 💵 Total cost estimation

**Usage:**

```tsx
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextInputUsage,
  ContextOutputUsage,
  ContextContentFooter,
} from "@/components/ai-elements/context";

<Context
  maxTokens={128000}
  modelId="openai:gpt-4o-mini"
  usage={{
    inputTokens: 1234,
    outputTokens: 567,
    totalTokens: 1801,
  }}
  usedTokens={1801}
>
  <ContextTrigger /> {/* Hover button */}
  <ContextContent>
    <ContextContentHeader /> {/* Progress bar */}
    <ContextContentBody>
      <ContextInputUsage /> {/* Input tokens + cost */}
      <ContextOutputUsage /> {/* Output tokens + cost */}
    </ContextContentBody>
    <ContextContentFooter /> {/* Total cost */}
  </ContextContent>
</Context>;
```

**Integration:** Currently used in `AgentPanel` to track conversation token usage and costs.

---

### 2. Conversation Component (`conversation.tsx`) ✨ NEW

**Purpose:** Stick-to-bottom conversation container with empty state and scroll button

**From:** https://ai-sdk.dev/elements/components/conversation

**Features:**

- 📜 Automatically scrolls to newest message
- 🪄 `ConversationEmptyState` for initial UI
- 🧲 `ConversationScrollButton` appears when user scrolls up
- ♿ Accessible via `role="log"`
- 🔧 Supports render-prop children for custom layouts

**Usage:**

```tsx
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

<Conversation className="relative h-full">
  <ConversationContent className="flex flex-col gap-4 p-4">
    {messages.length === 0 ? (
      <ConversationEmptyState
        title="AI Assistant"
        description="Ask me to create images, add text, or generate UI components."
      />
    ) : (
      messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))
    )}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>;
```

**Integration:** Used in `MessageList` to manage auto-scrolling and empty state UX.

---

### 3. Tool Component (`tool.tsx`)

**Purpose:** Display tool invocations with collapsible details

**Features:**

- Shows tool name with icon
- Status badges (Pending, Running, Completed, Error)
- Collapsible parameters and results
- Error handling
- Animated states

**Usage:**

```tsx
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolParameter,
  ToolResult,
} from "@/components/ai-elements/tool";

<Tool>
  <ToolHeader
    title="create_image"
    type="tool-call"
    state="input-available" // or "output-available", "output-error"
  />
  <ToolContent>
    <ToolParameter name="prompt" value="sunset at beach" />
    <ToolParameter name="width" value={1024} />
    <ToolResult value={{ imageUrl: "..." }} />
  </ToolContent>
</Tool>;
```

---

### 4. Message Component (`message.tsx`)

**Purpose:** Professional message display for user/assistant chat

**Features:**

- User/Assistant role styling
- Avatar support
- Variants: `contained` (chat bubbles) or `flat` (full-width)
- Responsive layout
- Proper spacing

**Usage:**

```tsx
import { Message, MessageContent } from "@/components/ai-elements/message";

<Message from="assistant">
  <MessageContent variant="flat">Hello! How can I help you?</MessageContent>
</Message>;
```

---

### 5. Actions Component (`actions.tsx`)

**Purpose:** Quick action buttons for AI interactions

**Features:**

- Icon buttons with tooltips
- Consistent sizing
- Accessibility support
- Flexible layout

**Usage:**

```tsx
import { Actions, Action } from "@/components/ai-elements/actions";
import { UndoIcon, RefreshIcon } from "lucide-react";

<Actions>
  <Action tooltip="Undo" onClick={undo}>
    <UndoIcon />
  </Action>
  <Action tooltip="Retry" onClick={retry}>
    <RefreshIcon />
  </Action>
</Actions>;
```

---

### 6. CodeBlock Component (`code-block.tsx`)

**Purpose:** Syntax-highlighted code display with copy button

**Features:**

- Shiki-based syntax highlighting
- Copy to clipboard
- Line numbers
- Multiple language support

**Usage:**

```tsx
import { CodeBlock } from "@/components/ai-elements/code-block";

<CodeBlock code="const x = 1;" language="typescript" />;
```

---

### 7. Prompt Input Component (`prompt-input.tsx`)

**Purpose:** Professional input component with file attachments, submit states, and extensibility

**Features:**

- Auto-resizing textarea
- File attachment support (drag & drop, paste)
- Submit button with proper loading states
- Model selection dropdown
- Speech input support
- Customizable tools/actions
- Provider-based state management

**Usage:**

```tsx
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

<PromptInputProvider>
  <PromptInput onSubmit={handleSubmit}>
    <PromptInputHeader>{/* Optional header content */}</PromptInputHeader>
    <PromptInputBody>
      <PromptInputTextarea placeholder="Type a message..." />
    </PromptInputBody>
    <PromptInputFooter>
      <PromptInputTools>{/* Optional tool buttons */}</PromptInputTools>
      <PromptInputSubmit status={status} />
    </PromptInputFooter>
  </PromptInput>
</PromptInputProvider>;
```

---

### 8. Reasoning Component (`reasoning.tsx`)

**Purpose:** Collapsible component for displaying AI reasoning/thinking process

**Features:**

- Auto-opens when streaming starts
- Auto-closes when streaming finishes (with delay)
- Shows "Thinking..." shimmer during streaming
- Displays duration after completion
- Collapsible trigger with chevron icon
- Markdown rendering via Response component

**Usage:**

```tsx
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

<Reasoning isStreaming={isStreaming}>
  <ReasoningTrigger />
  <ReasoningContent>{reasoningText}</ReasoningContent>
</Reasoning>;
```

**Use case:** Display chain-of-thought or reasoning steps from models that support it (e.g., OpenAI o1, Anthropic Claude with extended thinking).

---

### 9. Shimmer Component (`shimmer.tsx`)

**Purpose:** Animated shimmer effect for loading states

**Features:**

- Smooth gradient animation
- Customizable duration
- Works as text wrapper or standalone

**Usage:**

```tsx
import { Shimmer } from "@/components/ai-elements/shimmer";

<Shimmer duration={1}>Loading...</Shimmer>;
```

---

### 10. Response Component (`response.tsx`)

**Purpose:** Renders Markdown responses from LLMs with smart streaming support

**Features:**

- Markdown rendering with [Streamdown](https://github.com/vercel/streamdown)
- Smart streaming - automatically completes incomplete formatting during real-time streaming
- Support for tables, blockquotes, code blocks, inline code
- Math equation support (LaTeX)
- Syntax highlighting for code blocks
- Copy-to-clipboard for code blocks
- GFM features (tables, task lists, strikethrough)
- Dark/light theme support
- Accessible

**Usage:**

```tsx
import { Response } from "@/components/ai-elements/response";

// Simple usage
<Response>**Hello!** This is a markdown response.</Response>

// With streaming text
<Response>{streamingText}</Response>
```

**Important:** The Response component requires adding this to `globals.css`:

```css
@source "../node_modules/streamdown/dist/index.js";
```

(This has already been added to `app/globals.css`)

**Usage with AI SDK:**

```tsx
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";

{
  messages.map((message) => (
    <Message from={message.role} key={message.id}>
      <MessageContent>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return <Response key={`${message.id}-${i}`}>{part.text}</Response>;
          }
          return null;
        })}
      </MessageContent>
    </Message>
  ));
}
```

---

## Integration with Current Agent

### Current Implementation

- `components/ai-agent/message-item.tsx` - Basic message display
- `components/ai-agent/message-list.tsx` - Simple list of messages
- `components/ai-agent/agent-input.tsx` - Input field

### Migration Plan

#### Phase 1: Replace Message Display with Response Component

Replace `message-item.tsx` with AI Elements Message and Response components:

```tsx
// Before
<div className="message">
  <Avatar />
  <div>{message.content}</div>
</div>

// After - with markdown support
<Message from={message.role}>
  <MessageContent>
    <Response>{message.content}</Response>
  </MessageContent>
</Message>
```

**Benefits:**

- ✅ Markdown formatting (bold, italic, code, lists)
- ✅ Smart streaming - handles incomplete markdown during streaming
- ✅ Code blocks with syntax highlighting
- ✅ Tables, blockquotes, math equations
- ✅ Much better UX than plain text

#### Phase 2: Add Tool Visualization

When message has tool calls, show them properly:

```tsx
<Message from="assistant">
  <MessageContent>{message.content}</MessageContent>

  {message.toolCalls?.map((tool) => (
    <Tool key={tool.id}>
      <ToolHeader
        title={tool.name}
        state="output-available" // or "input-available", "output-error"
      />
      <ToolContent>
        {Object.entries(tool.arguments).map(([key, value]) => (
          <ToolParameter key={key} name={key} value={value} />
        ))}
        {toolResult && <ToolResult value={toolResult} />}
      </ToolContent>
    </Tool>
  ))}
</Message>
```

#### Phase 3: Add Quick Actions

After assistant messages:

```tsx
<Actions>
  <Action tooltip="Undo last action" onClick={() => editor.undo()}>
    <UndoIcon />
  </Action>
  <Action tooltip="Regenerate" onClick={retry}>
    <RefreshIcon />
  </Action>
</Actions>
```

---

## Benefits

✅ **Professional UI**: Production-ready components  
✅ **Better UX**: Users see exactly what's happening  
✅ **Less Code**: Replace custom implementations  
✅ **Maintained**: Updates from Vercel team  
✅ **Accessible**: ARIA support built-in

---

## Current Status

✅ **Installed Components:**

1. Tool - For tool execution visualization ✅
2. Message - For professional message display ✅
3. Actions - For quick action buttons ✅
4. CodeBlock - For syntax highlighting ✅
5. PromptInput - For professional input (currently used!) ✅
6. Reasoning - For displaying AI thinking process ✅
7. Shimmer - For loading animations ✅
8. Response - For markdown rendering (currently used!) ✅

## Next Steps

1. **Add Reasoning component** to show AI thinking when using chain-of-thought models
2. Integrate Tool component to show detailed tool execution (parameters, results)
3. Migrate message container to use Message component wrapper
4. Add Actions for undo/retry/variations after messages
5. Test with all tool types

---

**Documentation:** https://ai-sdk.dev/elements
