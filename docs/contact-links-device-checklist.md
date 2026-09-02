# Hero contact links — manual device QA checklist

Automated coverage lives in `src/lib/__tests__/contact-links.test.ts`
(pure unit tests for E.164 normalization + link building). This
checklist verifies the OS-level handoff we cannot unit-test.

## What we're verifying

1. `wa.me/<digits>?text=...` opens WhatsApp with the prefilled message.
2. `sms:+<digits>` opens the native messaging app with the recipient
   pre-populated.
3. Both buttons expose a clear accessible name (screen reader) and a
   visible tooltip / title on hover & long-press.
4. The buttons never overlap the vehicles or tagline on any viewport.

## Device / browser matrix

| # | Device                | Browser         | WhatsApp opens with prefill | SMS opens with recipient | aria-label announced | Tooltip visible on hover / long-press |
| - | --------------------- | --------------- | :-------------------------: | :----------------------: | :------------------: | :-----------------------------------: |
| 1 | iPhone (iOS 17+)      | Safari          |                             |                          |                      |                                       |
| 2 | iPhone (iOS 17+)      | Chrome iOS      |                             |                          |                      |                                       |
| 3 | Android 13+ (Pixel)   | Chrome          |                             |                          |                      |                                       |
| 4 | Android 13+ (Samsung) | Samsung Internet|                             |                          |                      |                                       |
| 5 | macOS                 | Safari          |                             |                          |                      |                                       |
| 6 | macOS / Windows       | Chrome          |                             |                          |                      |                                       |
| 7 | Windows               | Edge            |                             |                          |                      |                                       |

## Per-device steps

1. Open the published landing page: <https://rentmaikar.lovable.app>.
2. Confirm the WhatsApp and Text us buttons render on the left/right
   edges, above the vehicles, with no overlap on the vehicle hero image
   or the tagline. Rotate to landscape and re-check.
3. Tap **WhatsApp**. Expected: WhatsApp app (mobile) or WhatsApp Web
   (desktop) opens with the region number selected and the message
   `Hi Rentmaikar, I'd like to learn more about renting or listing a
   vehicle.` pre-filled in the composer.
4. Tap **Text us**. Expected: the native SMS composer opens with the
   region SMS number pre-filled as the recipient. On desktop Safari /
   Chrome without a paired phone the OS may prompt to choose an app —
   that is expected, not a failure.
5. With VoiceOver / TalkBack enabled, focus each button and verify the
   announcement matches the `aria-label` (e.g. "Chat with Rentmaikar
   on WhatsApp, opens in a new window").
6. Hover (desktop) or long-press (mobile) each button and confirm the
   tooltip / native `title` describes the action.

## Regression guardrails

- `src/lib/contact-links.ts` is the single source of truth — the hero
  never inlines its own `wa.me` / `sms:` string construction.
- Invalid / missing numbers render a disabled button with a toast
  fallback instead of a broken link, so an incomplete region config
  cannot silently regress to the old design.
- CI runs `vitest` on every push; the contact-links suite must stay
  green.
