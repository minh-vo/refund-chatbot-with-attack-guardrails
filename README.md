# The Refund Desk

A customer-support chatbot that helps with order questions, returns, and refunds — built with
safety guardrails baked into *how it works*, not just asked for nicely in a prompt.

This project is an extension of a coursework project on building responsible, safety-conscious AI
agents. It's been rebuilt from scratch as a single, shareable page that anyone can open and try —
no install, no account setup beyond signing in to Claude.

## 🔗 Try it

**[Open the live demo](https://claude.ai/code/artifact/9b636b5c-0cd0-4f28-8375-cb6b420c3d58)**

1. Open the link.
2. Sign in with your Claude account if you're asked to, and allow the page to use Claude when it
   prompts you (this happens once, on your first message).
3. Ask about an order, or click one of the suggested prompts on the page to see a specific safety
   feature in action, with a short explanation of what you're about to see.

That's it — everything runs in your browser. There's no backend server and nothing to set up.

## ✅ What it can do

- Blocks messages that try to trick the bot into ignoring its rules
- Notices when a customer sounds frustrated and hands off to a person with empathy, instead of
  shutting them down
- Politely declines questions outside order and refund support, instead of answering just anything
- Refuses refunds over $50 automatically — always sends big refunds to a human
- Never refunds the same claim twice, even if asked repeatedly
- Hides sensitive info like card numbers and SSNs, in both your messages and its replies
- Never shares a customer's private details like email or phone, even if asked directly
- Treats information found in an order's notes as background info only, never as commands to follow
- Double-checks its own answer for safety before sending it, catching problems after the fact too
- Remembers your conversation, so you don't have to repeat your order number

You can see all of this live in the app's **Thinking Box**, which narrates every safety check as it
happens, step by step.

## 🧭 What's next

This is a prototype, and a few things are intentionally left for later:

- A real hand-off queue, so escalated chats reach an actual support agent
- A shared activity view, so a team can see patterns across every conversation
- Real order and account data, instead of this demo's sample dataset

## 🛠 How it's built

The whole app is a single HTML file (`index.html`) — no server, no build step, no dependencies to
install. It runs entirely in your browser and talks to Claude directly through a built-in browser
capability, which is also why there's no API key to manage: the page simply asks Claude a question
when it needs to, using your own Claude access.

Every message you send passes through a series of checks *before* the chatbot is allowed to answer
it (checking for tricks, checking tone, checking it's on-topic), and the reply passes through more
checks *after* it's written, before you see it. Those checks are enforced by the app's structure —
the chatbot has no way to skip them, the same way a form can't submit without passing validation.

The core logic (the checks, the sample data, the refund rules) lives in its own file, `logic.js`,
separate from the page's visual code — that's what makes it possible to test automatically (see
below) without needing a browser or a live Claude connection.

## 📂 What's in this repo

| File | What it is |
|---|---|
| `index.html` | The whole app — open the live link above rather than this file directly (see note below) |
| `logic.js` | The core rules: refund limits, privacy protections, sample data |
| `prompts.js` | The exact wording used to ask Claude to check for tricks, tone, and safety |
| `logic.test.js` | Automated tests for `logic.js` — see **Testing** below |
| `prompt_validation.js` | A script that checks the prompts in `prompts.js` against the real Claude model |

**Note:** `index.html` only fully works when opened through the live link above. Downloading and
opening the file directly won't work, because the browser capability it depends on only exists
inside that hosted page.

## 🧪 Testing

This project has two layers of automated tests, so its safety logic is checked by machines, not
just by eye:

**Layer 1 — fast, free, no setup:**
```
node --test logic.test.js
```
Runs 22 tests covering the refund rules, the privacy protections, and every safety-check outcome —
all pure logic, no live model, no cost.

**Layer 2 — checks the prompts against the real Claude model** (needs your own Anthropic API key):
```
ANTHROPIC_API_KEY=sk-... node prompt_validation.js
```
This sends the actual safety-check wording to Claude with known test messages, and confirms it
classifies them the way the app expects.

## ⚠️ Known limitations

Worth knowing before you rely on this for anything beyond a demo:

- Every safety check runs in your own browser. A technically determined person could inspect or
  bypass them — this is fine for a demo, but is not how a production system should enforce rules.
- Your conversation and refund history are stored only in your own browser. They aren't shared
  with other visitors, and they disappear if you clear your browser data.
- The safety checks ask Claude to judge each message, rather than using a dedicated detection
  model — this is a bit slower per message, and less exact than a purpose-built classifier would be.
