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
  editing in the composer, and Steer. **Running turn** controls whether a send
  enters the queue and whether queued messages can be steered.
- **Attachments** shows image captions, image-only messages, file and folder
  cards, and an unavailable preview. The + menu and file drops stage local
  attachments. Image previews and fullscreen use the production interaction.
- **Long pasted text** opens with a sample card and accepts text pastes of at
  least 1,000 characters or 12 lines. **Show in text field** moves the whole
  passage to the end of the editable draft. Use **Add sample paste** to try
  another card. The demo keeps the cards in local UI state with sending disabled.
- **Slide selection** shows the selected text in the composer and a selection
  marker on eligible sent messages. Toggle the selection to check that sent
  context stays put.
- **Tool activity**, **Streaming**, and **Empty conversation** show recorded
  work, a partial reply, and an empty chat with a working composer. Scroll up
  during **Streaming** to see the animated scroll-to-bottom button. Turn
  **Streaming** off to see the arrow.
- **Compaction** shows the production transcript rows for a saved summary
  and compaction in progress on load. To try the full flow, send `/compact`
  in the example below and select **Finish compaction**.
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
- **Kit and files** exercises the reusable composer kit with file references
  and drop modes.

Examples are independent. The local bridge lives in `desktop-chat-fixture.ts`.
Its example records live in `desktop-conversation-fixtures.ts` and
`desktop-fixtures.ts`.

## Browser checks

```sh
pnpm --filter editor exec vitest run --config 'app/(dev)/ui/components/composer/vitest.browser.config.ts'
```
