# Sprint Assistant for Azure DevOps (v0.6, for trial)

## What's new in v0.6

- **Walkthrough.** The ? button opens a step-by-step walkthrough with play/pause, back/next and three chapters:
  Install the extension, Sprint Readiness and Feature Coverage. It opens at the chapter for the screen you're on.
  The welcome screen links to it too. Files are in `guide/`.
- Fixed: on tall screens the panel scrolls instead of squashing its buttons and lists.


Check your work before sprint planning, with the AI assistant you already use.

- **Sprint Readiness**: are the stories in a sprint ready for developers to pick up?
- **Feature Coverage**: does a Feature have every story it needs, across all components?

## What's new in v0.5

- **Stays open.** Sprint Assistant now lives in the browser's side panel instead of a popup.
  Popups close the moment you click elsewhere; the side panel stays open while you switch to your AI tab and back.
- **Your assistant, your choice.** First run asks which assistant you use (ChatGPT, Gemini, Copilot, Claude,
  or your own link). Change it any time from the Ask AI step or Settings. There is no default.
- **Guided flow.** A welcome screen, two plain-language choices, and a 3-step guide: Select → Ask AI → Result.
  The AI's answer is pasted right in the panel; the full visual opens in a tab.
- **Connects by itself.** Works from any tab as long as Azure DevOps is open somewhere. Open a Feature in
  Azure DevOps and the panel offers to check it.
- **Recent checks** on the home screen: come back later to paste an answer or reopen a result.

## Install / update (Chrome 114+ or Edge)

1. Unzip; replace the previous `sprint-readiness` folder if you have one.
2. `chrome://extensions` (or `edge://extensions`) → Developer mode on → **Load unpacked**
   (or click the reload icon on the existing card).
3. Pin the extension. Clicking its icon opens the side panel.

## Use

1. **Select**: choose Sprint Readiness (area + sprint → Find stories) or Feature Coverage (open the Feature, or type its ID).
2. **Ask AI**: Copy prompt → Open your assistant → paste and send in a new chat.
3. **Paste the answer** back in the panel → Show result → Open full result for the visual, links and learnings.

## Team context page

- Lives in the project wiki under `Sprint Assistant`, one sub-page per area (e.g. `Firmware`, `Squad 2`).
- Matched to the area automatically (`75F Firmware` → `Firmware`). If none matches, the panel offers to create one.
- Approved learnings from the full result are added to it after you confirm.
- Settings → Team context lets you change the parent page or force a specific page.

## Refining

| What | Where |
|---|---|
| Review rules and output formats | `prompt.js` |
| Work item type, excluded / finished states | top of `panel.js` |
| Length limits | `LIMITS` at the top of `format.js` |

After editing, click reload on the extension card.

## Good to know

- Everything runs through your open Azure DevOps tab with your signed-in session. No tokens.
- The extension only writes to Azure DevOps when you create a team context page or approve a learning, always after you confirm.
- Feature Coverage only uses work items linked to the Feature; it never searches the project.
- Images become `[image]`; diagrams in a Feature are counted and reported as unread.
