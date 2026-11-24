# Composer playground

Start the editor development server and open
[Composer playground](http://localhost:3000/ui/components/composer).
Each Desktop chat example mounts `NativeAgentPane` with a local
`DesktopNativeChat` fixture. The production pane owns transcript scrolling,
question placement, the composer, and its focus behavior. The fixture supplies
chat data, events, and acknowledgements, so the page runs without Electron,
an account, or a model.

Dictation uses the microphone for the waveform and the browser’s speech
recognition throughout the playground. The browser may send audio to its speech
service. If recognition is unavailable, the playground inserts a labeled
sample transcript.

## Examples

- **Question batch** opens a three-question request. Pick an option to
  advance, skip or revisit an item, then submit on the last question.
  Use Left and Right to change questions, and Up and Down to select an
  answer or reach the write-in. Enter confirms the answer. **Reset** brings
  back the batch.
- **Question** shows the production prompt above the composer. Select a
  choice or type a custom answer. **Streaming** replays local commentary so
  you can test typing while the transcript updates. Close the question to
  reopen it from the transcript. After submission, the answer appears with
  the original question. **Compact pane** constrains the actual Desktop pane
  to a short, narrow frame for checking scroll and clipping. **Hold answer**
  lets you accept or refuse a pending answer. **Expire question** ends the
  turn while the prompt is open. **Reset** brings back the prompt.
- **Blocking question** shows a text-only prompt with **Skip**. **Long choices
  and multiple questions** starts in a compact pane with six wrapped choices
  and two other questions you can open from the transcript.
- **Chat composer** exercises the + menu, slash commands, Goal and
  Plan, model and effort, and inline message edits. **Hold submission** lets
  you exercise pending, accepted, and refused sends or edits.
- **Transcript time dividers** shows a quick follow-up after a long reply,
  a same-day idle gap, and a new local calendar day.
- **Suggested prompt** opens with a sample suggestion. Focus the composer,
  press **Tab**, then clear the draft to see it return.
- **Dictate** uses the production Desktop composer with browser speech
  recognition. Start with an empty or existing draft to see both recording
  layouts. **Cancel dictation** keeps the draft in place. **Stop dictation** or
  **Esc** inserts the transcript. **Send** while recording transcribes and
  submits the draft to the local preview.
- **Links** uses the production composer and transcript components with local
  sample messages. Compare ordinary web links and the recognized site icons in
  the draft, the user bubble, and the agent response. Edit a draft link and send
  it to see the result. Hover **Grida docs** for a favicon and preview image,
  **CSS Grid guide** for a text preview, or **Linear** for the domain-only
  fallback.
- **Markdown comparison** shows the same paragraphs, inline formatting, lists,
  quote, and code block in the draft, sent message, and agent response. Send an
  edited draft to update both transcript examples. **Extended Markdown** adds
  six heading levels, a table, task list, image, footnote, math, Mermaid,
  and highlighted code. User bubbles show unsupported formats as source text.
- **Web preview** shows the gallery's title, favicon, and description. Scroll up
  and hover **workflow viewer** to see the FX Viewer label shared with its
  response card. The transcript also includes an unavailable preview and replies
  with ambiguous local links. Click **Finish reply** to reveal the print
  preview and see its details arrive after a short delay. Click the card, an
  inline link, or **Open in default browser** to see the request in the demo
  controls.
  **Copy link** copies the card's URL.
- **Web preview refresh** shows two cards for the same local address. Start
  the sample server and hover **workflow viewer** to update both cards and
  the inline favicon from one check. Stop the server and hover again to see
  the shared fallback.
- **Message queue** shows previews, dragging and keyboard reordering,
  editing in the composer, and Steer. Edit the image caption or add a caption
  to the queued `README.md` attachment. Opening a message takes it out of
  the mock queue. **Send** or Enter reinserts the revision. Escape or undoing
  entry into the edit restores the original at the same position among the
  remaining messages. Add a batch or remove individual cards in the same
  composer used by Desktop. Press ↑ in the empty composer to take out the
  last queued message. Move the sample image to the first row and choose
  **Steer** to see it appear in the conversation. Turn off **Running turn**
  and choose **Resume queue** to start the next waiting message. After using
  **Remove from queue**, press **⌘Z** in the composer to restore the message.
- **Attachments** shows image captions, image-only messages, file and folder
  cards, and an unavailable preview. The + menu and file drops stage local
  attachments. Use **Hold submission** to delay a send, then accept it or
  refuse it and retry from the message. Type another draft while the first
  send waits. After accepting or refusing, add another attachment to that
  draft. **Reopen chat** reattaches the same
  chat with its accepted messages and current draft. Image previews and
  fullscreen use the production interaction.
- **Long pasted text** opens with a sample card and accepts text pastes of at
  least 1,000 characters or 12 lines. **Show in text field** moves the whole
  passage to the end of the editable draft. Undo returns the card, and redo
  puts its text back in the draft. Use **Add sample paste** to try
  another card. The demo keeps the cards in local UI state with sending disabled.
- **Slide selection** shows the selected text in the composer and a selection
  marker on eligible sent messages. Toggle the selection to check that sent
  context stays put.
- **Tool activity**, **Streaming**, and **Empty conversation** show recorded
  work, a partial reply, and an empty chat with a working composer. Scroll up
  during **Streaming** to see the animated scroll-to-bottom button. Turn
  **Streaming** off to see the arrow.
- **Compaction** shows the production transcript rows for a saved summary
  and compaction in progress on load. Send `/compact` in the example below.
  The command clears at Send. Send a follow-up while compaction runs, then
  select **Finish compaction** to start the queued message.
- **Pause and resume** opens on a paused reply. Use **Resume** and **Pause**
  in the composer to switch states.
- **Subagents** shows overlapping work with finished, failed, and stopped
  outcomes. Expand **Worked for 12s** to see the events in the parent’s chat.
- **Model and access loading** holds the first reads. Complete or fail each
  one, then use the composer’s retry actions. The saved access mode is Full access.
- **Reconnection** lets you disconnect a loaded chat, hold or fail its
  reconnect, and recover the same chat with the composer draft intact.
- **Permission approval** and **Library request** use the same floating cards
  above the composer as questions. The Library picker uses one local image that
  you can select or skip.
- **Kit and files** uses the same composer cards as Desktop. It starts with
  a compact folder, a square image, a sample PDF thumbnail, and a file
  without a preview. Add more files to scroll the attachment strip, or
  change the drop mode to insert inline references.

Examples are independent. The local bridge lives in `desktop-chat-fixture.ts`.
Its example records live in `desktop-conversation-fixtures.ts` and
`desktop-fixtures.ts`.

## Browser checks

```sh
pnpm --filter editor exec vitest run --config 'app/(dev)/ui/components/composer/vitest.browser.config.ts'
```
