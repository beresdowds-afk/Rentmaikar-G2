"""
Playwright test: credential/document validation failure & retry.

Verifies that when auto-submit-for-review fails validation server-side, the
DocumentUpload component:
  1. Shows the red "Auto-submit failed" error state (no manual re-entry needed).
  2. Exposes a Retry button that re-invokes the edge function.
  3. Recovers to the green "verification report has been submitted" state
     when the retry succeeds.

Runs at desktop + mobile viewports. Skips gracefully when the sandbox has
no injected Supabase session (LOVABLE_BROWSER_AUTH_STATUS != injected) or
when the signed-in preview session has no rental context.
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

SCREENSHOTS = Path("/tmp/browser/document-validation")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

FAILURES: list[str] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(f"{name}: {detail}")


REQUIRED_US = ["driver_license", "national_id", "rideshare_approval"]


def fake_docs(user_id: str) -> list[dict]:
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
        for i, t in enumerate(REQUIRED_US)
    ]


async def install_mocks(context, user_id: str, submit_scripts: list[dict]):
    """
    submit_scripts is a mutable queue: each item = {status, body, delay_ms}.
    Consumed in order for each POST to auto-submit-for-review.
    """
    if not SUPABASE_URL:
        return

    docs = fake_docs(user_id)

    async def rest_handler(route: Route, request: Request):
        if "/rest/v1/user_documents" in request.url and request.method == "GET":
            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps(docs))
            return
        await route.continue_()

    await context.route(re.compile(re.escape(SUPABASE_URL) + r"/rest/v1/.*"), rest_handler)

    async def fn_handler(route: Route, request: Request):
        if request.method == "OPTIONS":
            await route.fulfill(status=204, headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
            })
            return
        script = submit_scripts.pop(0) if submit_scripts else {
            "status": 200, "body": {"ok": True, "already_submitted": True}, "delay_ms": 0,
        }
        if script.get("delay_ms"):
            await asyncio.sleep(script["delay_ms"] / 1000)
        await route.fulfill(
            status=script["status"],
            content_type="application/json",
            body=json.dumps(script["body"]),
            headers={"Access-Control-Allow-Origin": "*"},
        )

    await context.route(
        re.compile(re.escape(SUPABASE_URL) + r"/functions/v1/auto-submit-for-review.*"),
        fn_handler,
    )


async def hydrate_session(context, page):
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


async def run_viewport(browser, label: str, width: int, height: int):
    context = await browser.new_context(viewport={"width": width, "height": height})
    page = await context.new_page()

    try:
        user_id = json.loads(SESSION_JSON).get("user", {}).get("id", "test-user")
    except Exception:
        user_id = "test-user"

    # Script: first call fails validation, second call (retry) succeeds.
    scripts = [
        {"status": 400, "delay_ms": 200,
         "body": {"error": "Missing required documents", "missing": ["rideshare_approval"]}},
        {"status": 200, "delay_ms": 200,
         "body": {"ok": True, "already_submitted": False, "status": "under_review"}},
    ]
    submit_calls: list[str] = []

    async def count_calls(request: Request):
        if "/functions/v1/auto-submit-for-review" in request.url and request.method == "POST":
            submit_calls.append(request.url)
    page.on("request", count_calls)

    await install_mocks(context, user_id, scripts)
    await hydrate_session(context, page)
    await page.goto(f"{BASE}/driver/dashboard", wait_until="domcontentloaded")

    try:
        tab = page.get_by_role("tab", name=re.compile(r"^Documents$", re.I))
        await tab.wait_for(timeout=6000)
        await tab.click()
    except Exception:
        print(f"[SKIP] {label}: Documents tab not visible for this session.")
        await context.close()
        return

    # Error state must appear from the first (failing) call.
    try:
        await page.get_by_test_id("auto-submit-error").wait_for(timeout=10000)
        record(f"{label}/error-state", True)
    except Exception:
        await page.screenshot(path=str(SCREENSHOTS / f"{label}_no-error.png"))
        record(f"{label}/error-state", False, "error text never appeared")
        await context.close()
        return

    # Confirm the error message names the validation problem (no manual re-entry expected).
    err_text = await page.get_by_test_id("auto-submit-error").text_content() or ""
    record(f"{label}/error-mentions-missing",
           "rideshare_approval" in err_text or "Missing" in err_text,
           err_text.strip())

    await page.screenshot(path=str(SCREENSHOTS / f"{label}_1_error.png"))

    # Click Retry — should re-invoke the function without user re-uploading anything.
    await page.get_by_test_id("auto-submit-retry").click()

    try:
        await page.get_by_text("verification report has been submitted", exact=False).wait_for(timeout=8000)
        record(f"{label}/retry-success", True)
    except Exception:
        await page.screenshot(path=str(SCREENSHOTS / f"{label}_no-success.png"))
        record(f"{label}/retry-success", False, "success text did not appear after retry")

    record(f"{label}/retry-invoked-again", len(submit_calls) >= 2,
           f"observed {len(submit_calls)} POST(s)")

    await page.screenshot(path=str(SCREENSHOTS / f"{label}_2_success.png"))
    await context.close()


async def main() -> int:
    if AUTH_STATUS != "injected":
        print(f"[SKIP] LOVABLE_BROWSER_AUTH_STATUS={AUTH_STATUS or 'unset'} - "
              "no driver session available; document-validation E2E requires signed-in preview.")
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
