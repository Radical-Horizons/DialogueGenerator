"""Mesure navigateur: toggle fiche + estimate-tokens."""
import json
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        estimates: list[dict] = []

        def on_response(res):
            if "/context/estimate-tokens" in res.url and res.request.method == "POST":
                estimates.append(
                    {
                        "status": res.status,
                        "ms": res.request.timing.get("responseEnd", 0) - res.request.timing.get("requestStart", 0)
                        if res.request.timing
                        else None,
                        "size": len(res.body()) if res.ok else 0,
                    }
                )

        page.on("response", on_response)
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.get_by_label("Nom d'utilisateur").fill("admin")
        page.get_by_label("Mot de passe").fill("admin123")
        page.get_by_role("button", name="Se connecter").click()
        page.wait_for_url(f"{BASE}/**", timeout=30000)

        # Ouvrir panneau contexte si replié
        toggle = page.get_by_test_id("selected-context-summary-toggle")
        if toggle.is_visible():
            toggle.click()

        checkboxes = page.locator('input[type="checkbox"]')
        n = checkboxes.count()
        print(f"checkboxes: {n}")

        # Cocher jusqu'à 4 fiches (personnages/lieux)
        checked = 0
        for i in range(min(n, 30)):
            cb = checkboxes.nth(i)
            if not cb.is_checked():
                estimates.clear()
                t0 = time.perf_counter()
                cb.click()
                page.wait_for_timeout(1200)  # debounce 500ms + marge
                elapsed = (time.perf_counter() - t0) * 1000
                checked += 1
                print(f"toggle #{checked}: wall {elapsed:.0f} ms, estimate calls: {len(estimates)}")
                if estimates:
                    e = estimates[-1]
                    print(f"  last estimate-tokens: {e.get('size',0)/1024:.0f} KB (network timing n/a in sync)")
                if checked >= 4:
                    break

        browser.close()


if __name__ == "__main__":
    main()
