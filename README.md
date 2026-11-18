# Auto insurance referral page

Responsive static landing page with linked privacy/terms pages and `contact@saveautoinfo.com` as its support and privacy contact.

The root `/` shows only “Happy World!” with no scripts or tracking. The insurance landing page is at `/getoffer/`. Policy pages remain at `/privacy-policy.html` and `/terms.html`, with return links to `/getoffer/`.

Serve locally with `python3 -m http.server 8080` and open `http://localhost:8080/getoffer/`. Pixel measurement requires HTTP(S); opening a file directly does not activate it.

## Meta measurement

- Pixel `2214758409422215` is enabled in the inline `window.AUTOQUOTE_CONFIG` block and sends one PageView automatically on each HTTP(S) page load of `/getoffer/`, `/privacy-policy.html` and `/terms.html`. The root homepage has no scripts.
- All scripts are inlined directly in the HTML (no separate `.js` files) so updates are not held back by cached scripts. When changing the config or tracking code, update it in all three pages.
- There is no consent popup, preference panel, or consent-grant event. Each YES/NO click sends one Meta `Lead` event (no answer or personal data); a duplicate click is blocked. Automatic event configuration is disabled.
- Global Privacy Control, Do Not Track, ad blockers, and network restrictions can prevent loading. URL parameters do not affect loading, so any ClickFlare or ad parameters (`lptoken`, `cep`, `cpid`, `ad_name`, etc.) work. Never put personal information in URLs.
- The site does not read or write the former consent preference. Existing stored choices do not gate initialization.
- This configuration does not guarantee legal/platform compliance; consent obligations depend on the audience and applicable requirements.
- The YES/NO links continue using ClickFlare independently. They require a valid campaign visit/session.

## Remaining launch checks

The `quoteUrl` is `https://trk.viewapproval.com/cf/click/1` for both buttons. The owner-supplied tag is inlined at the end of `getoffer/index.html` and loads on the landing page. Markdown escapes were removed from the supplied JavaScript. The tag reads `cftmid` and `cpid` from the landing URL, or the campaign from `cf_cpid`. Without these values it retains the supplied `__CONTAINER_ID__` and `__CAMPAIGN_ID__` placeholders; supply the real identifiers through your campaign URL or replace the placeholders for a working campaign. External tag behavior and attribution must be verified in ClickFlare. This tag is independent of the automatic Meta PageView integration.

No legal operator name has been provided. The contact email is published, but this is not a legal or platform compliance certification. Review the operator disclosures and obligations relevant to your business and audience. No approval or absence of future flags is guaranteed.

At the owner’s request, the original flag, savings claims, customer count, review logos, static “Real-Time Quotes” table, and supplied testimonials have been restored on `/getoffer/`. These figures and testimonials have not been independently verified. The table is static, and the Terms disclose that it is not a live insurer feed. Substantiate the claims and review permissions before advertising.

After hosting on HTTPS, verify the domain and Pixel in your Meta account as applicable. Use Events Manager Test Events with a browser that permits measurement: confirm automatic PageView, click YES or NO, and confirm that one Lead event is sent. Test browser privacy signals separately: no Pixel should load, and the CTA should still work. Review any extra events configured remotely in your account. Live Meta receipt has not been verified from this workspace.

## Automated checks

`tests/tracking.cjs` starts an ephemeral local server and intercepts Meta requests, so tests do not pollute real campaign data. Install/use Playwright outside the deployed static assets and run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node tests/tracking.cjs
```

Tests cover both ClickFlare-managed CTA links, simulated tag failure fallback, campaign parameters, duplicate prevention, back-navigation reset, disabled Meta despite saved consent, responsive layouts, and the root page. The external tag is simulated; these tests do not verify a live ClickFlare campaign.

## ClickFlare CTA integration

YES and NO are real anchors, styled as buttons. The inline main script initializes their href from `AUTOQUOTE_CONFIG.quoteUrl` before the ClickFlare tag (inlined after it) rewrites links. The click handler leaves native navigation intact, so the vendor’s rewritten handler runs. On tag load failure, the supplied vendor script restores the direct click URL. That fallback still requires a valid ClickFlare visitor/campaign session; it cannot fix missing campaign IDs or blocked cookies.

### Verified redirect campaign

Campaign ID: `6ae32805a09e8bf230a30fb5`. Entry URL (old `globalvisitlog.com` tracker; replace with the `trk.viewapproval.com` entry URL from ClickFlare): `https://globalvisitlog.com/cf/r/6ae32805a09e8bf230a30fb5`. In a fresh browser, enter through this URL before using the CTA. The campaign supplies `cpid`, `cep`, and `lptoken` to the landing page. Direct entry to the bare landing page has no campaign session and can return “Could not find cookie for cta click.” Both CTA answers use the same offer URL; there is no separate answer attribution configured.

## `/quote/` eligibility page

A second, self-contained landing page (inline CSS and JS, shared `assets/` and policy pages) at `/quote/`. It has a "How many vehicles?" card (1 / 2 / 3+), a main CTA, a loyalty-band CTA, and a mobile sticky CTA. Every element with `data-cta` is a CTA.

To change them, edit only two marked spots in `quote/index.html`:

1. **CTA URL** (currently `https://trk.viewapproval.com/cf/click/1`): set `ctaUrl` in the `QUOTE_PAGE_CONFIG` block (section 1). While it is empty, CTAs do nothing and no Lead is sent (a console warning is logged).
2. **Tracking tag** (currently the same trk.viewapproval.com ClickFlare tag as `/getoffer/`): paste the full `<script>…</script>` in section 3, between `TRACKING TAG` and `/TRACKING TAG`. Keep it after the page logic so the CTA hrefs are set before the tag rewrites them. Paste from a code block so the backticks survive.

Meta behavior matches `/getoffer/`: PageView on load, and one `Lead` per CTA click with duplicates blocked. Both are skipped under GPC/DNT. It uses the same Pixel ID by default (`metaPixelId` in the config).

## `/getyours/` advertorial page

A layout and copy clone of the supplied gutter-replacement advertorial reference (same CSS, fonts, structure and text), at `/getyours/`. The banner title, headline, button and right-hand image all link to `ctaUrl` (`https://trk.viewapproval.com/cf/click/1`), followed by the trk.viewapproval.com ClickFlare tag. Meta: PageView on load, one Lead per CTA click (Pixel `2214758409422215`).

The roof photo and the "as seen in" news-logo image are hotlinked from the reference's image host (convertri.imgix.net) and can change or vanish; replace them with your own copies for production. The Google reviews strip is HTML so the numbers can be edited: update `data-rating` and `data-review-count` in `getyours/index.html` with your real figures (it ships with the reference's 4.9 / 1,152). Privacy/Terms link to this site's real policy pages. Note the gutter topic differs from this site's auto-insurance Privacy/Terms pages.

## Policy page return links

On `/privacy-policy.html` and `/terms.html`, the return links (`data-return-link`: logo, "← Back to quotes", "Return to insurance options", footer "Home") send visitors back to the landing page they came from on this site, including its URL parameters (`cpid`, `cftmid`, etc.). The origin page is remembered for the browser session, so going Privacy → Terms still returns to the original lander. If the visitor arrived directly or from another site, the links fall back to `/getoffer/`.
