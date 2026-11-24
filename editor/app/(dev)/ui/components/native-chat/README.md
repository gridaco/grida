# Native Chat playground

Open [Native Chat](http://localhost:3000/ui/components/native-chat) from the
editor dev server or the **UI Components** sidebar. The playground mounts the
Desktop chat pane with its production controller. The fixture supplies local
chat data, replies, model and access settings, attachments, and dictation.
It needs no account, provider, microphone, or native process.

Choose a scenario to start from a known state. **Reset** recreates that scenario.
**Reopen chat** reconnects to the current fixture so its accepted messages and
draft can be checked after detaching. The fixture lives for the page session.

- **Conversation** lets you start another chat, switch through the chat list,
  fork with `/fork`, or open a temporary side chat with `/side`. Start a reply
  with **Hold replies** enabled to try Pause, Resume, queueing, and delivery
  after **Finish reply** or **Fail reply**. **Hold submission** lets you
  check the composer and next draft while an acknowledgement is pending.
- **Message queue** starts with text, image, and file messages already waiting.
  Edit one in the composer, save with Send or restore with Escape, reorder,
  steer an eligible item, or resume the queue after making the chat idle.
- **Question batch**, **Blocking question**, **Permission approval**, and
  **Library request** start with an open prompt. In question scenarios you
  can also hold or refuse the answer.
- **Compaction** holds a submitted `/compact` command. Send a follow-up, then
  finish compaction to watch the waiting message enter the transcript.
- **Transcript history** starts on the latest page. Scroll up to load earlier
  turns. **Subagent activity** includes recorded child conversations.
- **Model and access loading** and **Reconnection** let you decide when the
  local bridge responds. Model, access, plan, and Goal controls use the same
  components as Desktop.

The [Composer playground](http://localhost:3000/ui/components/composer) keeps
the individual component examples. Both pages use the same scripted chat
fixtures.
