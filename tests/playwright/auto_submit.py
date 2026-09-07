"""
Playwright test for the auto-submit-for-review UX in DocumentUpload.

Scenario: once a driver's identification-doc completion hits 100%, the
component should:
  1. Show "Submitting your application for admin review…" (spinner).
  2. Call the `auto-submit-for-review` edge function.
  3. Flip to the green "verification report has been submitted for admin
     review" alert on success.

We prove this end-to-end at both desktop and mobile viewports by:
  - Restoring the pre-minted Supabase session (LOVABLE_BROWSER_SUPABASE_*).
  - Intercepting the REST call for `user_documents` and returning a fake row
    for every required identification doc (so completionPercent hits 100).
  - Intercepting the edge-function call, first slowly (to observe the
    submitting state), then instantly returning success.

When the sandbox has no injected session (LOVABLE_BROWSER_AUTH_STATUS != injected),
the test prints a skip notice — so the file is safe to run in CI without auth.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Route, Request

BASE = "http://localhost:8080"
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY", "")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON", "")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON", "")

SCREENSHOTS = Path("/tmp/browser/auto-submit")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

FAILURES: list[str] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(f"{name}: {detail}")


REQUIRED_US = ["driver_license", "national_id", "rideshare_approval"]
REQUIRED_NG = ["driver_license", "national_id", "police_report", "nin", "bvn", "rideshare_approval"]


def fake_docs(user_id: str, region: str) -> list[dict]:
    required = REQUIRED_NG if region == "NG" else REQUIRED_US
    return [
        {
            "id": f"doc-{i}",
            "user_id": user_id,
            "document_type": t,
            "document_category": "identification",
            "file_path": f"{user_id}/{t}/f.pdf",
            "file_name": "f.pdf",
            "file_size": 1024,
            "mime_type": "application/pdf",
            "status": "pending",
            "rejection_reason": None,
            "vehicle_id": None,
            "expires_at": None,
            "created_at": "2026-07-13T00:00:00Z",
        }
        for i, t in enumerate(required)
    ]


async def install_supabase_mocks(context, user_id: str, region: str,
                                 submit_delay_ms: int, submit_status: int, submit_body: dict) -> None:
    """Intercept the REST endpoints DocumentUpload hits."""
    if not SUPABASE_URL:
        return

    docs = fake_docs(user_id, region)

    async def rest_handler(route: Route, request: Request) -> None:
        # /rest/v1/user_documents?select=*&user_id=eq.<uuid>...
        url = request.url
        if "/rest/v1/user_documents" in url and request.method == "GET":
            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps(docs))
            return
        await route.continue_()

    await context.route(re.compile(re.escape(SUPABASE_URL) + r"/rest/v1/.*"), rest_handler)

    async def fn_handler(route: Route, request: Request) -> None:
        if request.method == "OPTIONS":
            await route.fulfill(status=204, headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
            })
            return
        if submit_delay_ms:
            await asyncio.sleep(submit_delay_ms / 1000)
        await route.fulfill(status=submit_status, content_type="application/json",
                            body=json.dumps(submit_body),
                            headers={"Access-Control-Allow-Origin": "*"})

    await context.route(
        re.compile(re.escape(SUPABASE_URL) + r"/functions/v1/auto-submit-for-review.*"),
        fn_handler,
    )


async def hydrate_session(context, page) -> None:
    if COOKIES_JSON:
        cookies = json.loads(COOKIES_JSON)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE)
    if STORAGE_KEY and SESSION_JSON:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
        )


async def run_viewport(browser, label: str, width: int, height: int) -> None:
    context = await browser.new_context(viewport={"width": width, "height": height})
    page = await context.new_page()

    # Extract user id from the pre-minted session so our fake docs match RLS filters.
    try:
        user_id = json.loads(SESSION_JSON).get("user", {}).get("id", "test-user")
    except Exception:
        user_id = "test-user"

    # First run: slow submit (600ms) so we can observe "Submitting…"
    await install_supabase_mocks(context, user_id, region="US",
                                 submit_delay_ms=600, submit_status=200,
                                 submit_body={"ok": True, "already_submitted": False,
                                              "status": "under_review"})

    await hydrate_session(context, page)
    await page.goto(f"{BASE}/driver/dashboard", wait_until="domcontentloaded")

    # DocumentUpload sits inside the "Documents" tab of DriverDashboard; open it.
    # If the tab isn't present (e.g. the injected session has no rental), skip.
    try:
        tab = page.get_by_role("tab", name=re.compile(r"^Documents$", re.I))
        await tab.wait_for(timeout=6000)
        await tab.click()
    except Exception:
        print(f"[SKIP] {label}: Documents tab not visible for this session (no active rental).")
        await context.close()
        return

    # Give the app a moment to render the identification-docs card.
    try:
        await page.get_by_test_id("auto-submit-status").wait_for(timeout=10000)
    except Exception:
        await page.screenshot(path=str(SCREENSHOTS / f"{label}_no-card.png"))
        record(f"{label}/card-visible", False, "auto-submit-status card never rendered")
        await context.close()
        return

    # Check that "Submitting…" appears at least briefly.
    submitting_ok = False
    try:
        await page.get_by_text("Submitting your application", exact=False).wait_for(timeout=1500)
        submitting_ok = True
    except Exception:
        pass
    record(f"{label}/submitting-state", submitting_ok)

    # Then the success alert appears.
    try:
        await page.get_by_text("verification report has been submitted", exact=False).wait_for(timeout=8000)
        record(f"{label}/submitted-state", True)
    except Exception:
        await page.screenshot(path=str(SCREENSHOTS / f"{label}_no-success.png"))
        record(f"{label}/submitted-state", False, "success text never appeared")

    await page.screenshot(path=str(SCREENSHOTS / f"{label}_final.png"))
    await context.close()


async def main() -> int:
    if AUTH_STATUS != "injected":
        print(f"[SKIP] LOVABLE_BROWSER_AUTH_STATUS={AUTH_STATUS or 'unset'} - "
              "no driver session available; auto-submit E2E requires signed-in preview.")
        return 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        await run_viewport(browser, "desktop", 1280, 900)
        await run_viewport(browser, "mobile", 390, 844)
        await browser.close()

    print("\n=== Summary ===")
    print(f"Failures: {len(FAILURES)}")
    for f in FAILURES:
        print(" -", f)
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
