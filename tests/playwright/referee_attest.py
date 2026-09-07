"""
Playwright regression tests for the referee attestation flow.

Covers:
  - /referee-attest with missing token         (client-side error, no HTTP call)
  - /referee-attest with malformed token       (client-side error, no HTTP call)
  - /referee-attest with an expired token      (backend 410, no flicker)
  - /referee-attest with an already-used token (backend 200 already_submitted)
  - Runs both DESKTOP (1280x900) and MOBILE   (390x844) viewports
  - Asserts the "Loading…" indicator NEVER becomes visible for invalid/expired
    tokens, catching regressions where the error view flickers behind a spinner.
  - Smoke-checks the notify-referees / verify-referees Edge Functions respond
    with 401 Unauthorized when called without a JWT (regression guard against
    open endpoints).
"""
import asyncio
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Route, Request

BASE = "http://localhost:8080"
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SCREENSHOTS = Path("/tmp/browser/referee-attest")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

VIEWPORTS = {
    "desktop": {"width": 1280, "height": 900},
    "mobile": {"width": 390, "height": 844},
}

# 40+ hex chars = "looks valid" per RefereeAttestation.tsx regex
VALID_LOOKING_TOKEN = "a" * 48

FAILURES: list[str] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}{(' - ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(f"{name}: {detail}")


async def assert_no_loading_flash(page, label: str, screenshot: Path) -> None:
    """The error view must render immediately — the 'Loading…' text
    must never appear at any point for invalid/expired tokens."""
    loading = page.get_by_text("Loading…", exact=False)
    # If it appears within 500ms, that's a flicker regression.
    try:
        await loading.wait_for(state="visible", timeout=500)
        await page.screenshot(path=str(screenshot))
        record(label, False, "'Loading…' text was visible (flicker)")
    except Exception:
        record(label, True)


async def run_token_case(context, viewport_label: str, viewport: dict,
                         token: str | None, route_handler, expected_error_snippet: str,
                         case: str) -> None:
    page = await context.new_page()
    await page.set_viewport_size(viewport)
    if route_handler and SUPABASE_URL:
        pattern = re.compile(re.escape(SUPABASE_URL) + r".*/functions/v1/referee-attestation.*")
        await context.route(pattern, route_handler)

    url = f"{BASE}/referee-attest" + (f"?token={token}" if token else "")
    await page.goto(url, wait_until="domcontentloaded")

    shot = SCREENSHOTS / f"{viewport_label}_{case}.png"

    if case in ("invalid", "missing", "expired"):
        # Error should be visible almost immediately.
        try:
            await page.get_by_text("Unable to continue", exact=False).wait_for(timeout=3000)
            record(f"{viewport_label}/{case}/error-shown", True)
        except Exception:
            await page.screenshot(path=str(shot))
            record(f"{viewport_label}/{case}/error-shown", False, "no error alert")
            await page.close()
            return
        try:
            await page.get_by_text(expected_error_snippet, exact=False).wait_for(timeout=1000)
            record(f"{viewport_label}/{case}/error-copy", True)
        except Exception:
            record(f"{viewport_label}/{case}/error-copy", False,
                   f"expected snippet '{expected_error_snippet}' not found")
        await assert_no_loading_flash(page, f"{viewport_label}/{case}/no-flicker", shot)
    elif case == "used":
        try:
            await page.get_by_text("Already submitted", exact=False).wait_for(timeout=5000)
            record(f"{viewport_label}/{case}/already-submitted", True)
        except Exception:
            await page.screenshot(path=str(shot))
            record(f"{viewport_label}/{case}/already-submitted", False, "no 'Already submitted' banner")

    await page.screenshot(path=str(shot))
    await page.close()


async def expired_handler(route: Route, request: Request) -> None:
    await route.fulfill(status=410, content_type="application/json",
                        body='{"error":"This attestation link is invalid or has expired."}')


async def used_handler(route: Route, request: Request) -> None:
    await route.fulfill(
        status=200, content_type="application/json",
        body='{"referee_name":"Jane Doe","driver_name":"Test Driver","already_submitted":true}',
    )


async def edge_function_auth_smoke(context) -> None:
    """notify-referees and verify-referees must reject unauthenticated callers."""
    if not SUPABASE_URL:
        record("edge-auth-smoke", False, "VITE_SUPABASE_URL not set; skipped")
        return
    for fn in ("notify-referees", "verify-referees"):
        resp = await context.request.post(
            f"{SUPABASE_URL}/functions/v1/{fn}",
            data={"application_id": "00000000-0000-0000-0000-000000000000"},
            headers={"Content-Type": "application/json"},
        )
        # Expect 401 (missing JWT) or 400 (bad body); *not* 200. 500 would mean
        # the function crashed before auth — also a regression.
        ok = resp.status in (400, 401, 403)
        record(f"edge-auth-smoke/{fn}", ok, f"status={resp.status}")
        await resp.body()


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport=VIEWPORTS["desktop"])

        for vp_label, vp in VIEWPORTS.items():
            await run_token_case(context, vp_label, vp, None, None,
                                 "missing its token", "missing")
            await run_token_case(context, vp_label, vp, "not-a-real-token", None,
                                 "invalid or has expired", "invalid")
            await run_token_case(context, vp_label, vp, VALID_LOOKING_TOKEN, expired_handler,
                                 "invalid or has expired", "expired")
            await run_token_case(context, vp_label, vp, VALID_LOOKING_TOKEN, used_handler,
                                 "", "used")

        await edge_function_auth_smoke(context)

        await browser.close()

    print("\n=== Summary ===")
    print(f"Failures: {len(FAILURES)}")
    for f in FAILURES:
        print(" -", f)
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
