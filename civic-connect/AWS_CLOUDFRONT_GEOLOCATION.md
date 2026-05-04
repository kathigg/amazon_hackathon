# AWS CloudFront Geolocation Setup

## How to use this guide

This guide configures **CloudFront in front of your ECS Express service** so the website receives the viewer's **country and U.S. state** on every request. The bill page's Action Card uses these to pre-load the user's federal representatives without asking for a ZIP code.

### What this guide does

- Adds CloudFront in front of the ECS service (if not already there)
- Tells CloudFront to inject `CloudFront-Viewer-Country`, `CloudFront-Viewer-Country-Region`, and `CloudFront-Viewer-Postal-Code` into every origin request
- Verifies the headers arrive at your Next.js server
- Confirms what to add to your privacy notice

### What you need before starting

- An AWS account with permissions for **CloudFront**, **ACM** (certificates), and **Route 53** (DNS) — or whatever DNS provider you use if your domain isn't on Route 53
- The **public DNS name** of your ECS Express service (e.g., `civic-connect.us-east-1.elb.amazonaws.com` or whatever `aws ecs describe-services` shows)
- Your **production domain** (e.g., `civicconnect.app`) — optional for the hackathon; CloudFront also works fine on its own `*.cloudfront.net` subdomain

### Pick the right path

- **Path A — No CloudFront yet (most likely your case):** Follow Section 1, then Section 2, then Section 3.
- **Path B — You already have CloudFront in front of ECS:** Skip to Section 2.

### How long this takes

- Path A: ~30 minutes (most of which is waiting for the distribution to deploy)
- Path B: ~10 minutes
- DNS / certificate steps add 5–15 minutes if you want a custom domain

### Cost

CloudFront's free tier covers 1 TB out and 10M HTTPS requests per month indefinitely — well above hackathon usage. Geolocation headers themselves are free.

### Safety / rollback

Every step in this guide is reversible from the AWS Console. The riskiest single change is **switching DNS to point at CloudFront** — keep the old DNS record handy and you can flip back in minutes (or set a low TTL of 60s before you switch).

---

## Section 1 — Create the CloudFront distribution

Skip this section if you already have CloudFront in front of your ECS service.

### 1.1 — Open CloudFront

1. Go to <https://console.aws.amazon.com/cloudfront/v4/home>
2. Click **Create distribution**

### 1.2 — Configure the origin

| Field | Value |
|---|---|
| Origin domain | Paste your ECS service's public DNS name (the ALB or service URL) |
| Origin path | Leave blank |
| Name | `civic-connect-ecs-origin` |
| Protocol | **HTTPS only** if your ECS service serves HTTPS, otherwise **HTTP only** |
| HTTP port | `80` (only if HTTP only) |
| HTTPS port | `443` |
| Minimum origin SSL protocol | TLSv1.2 |
| Add custom header | (skip for now) |
| Enable Origin Shield | No |

### 1.3 — Default cache behavior

| Field | Value |
|---|---|
| Path pattern | `Default (*)` |
| Compress objects automatically | Yes |
| Viewer protocol policy | **Redirect HTTP to HTTPS** |
| Allowed HTTP methods | **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE** (Next.js needs all of these) |
| Restrict viewer access | No |
| Cache policy | **CachingDisabled** (managed) — we want every request to hit Next.js |
| Origin request policy | *Leave blank for now — we'll create our own in Section 2* |
| Response headers policy | (none) |

> **Why CachingDisabled?** Next.js handles its own caching, and bill pages contain user-specific data (cookies, location). Caching at CloudFront would serve one user's view to another. We're using CloudFront purely as a TLS terminator + geo-injector, not as a cache.

### 1.4 — Settings

| Field | Value |
|---|---|
| Price class | **Use only North America and Europe** (cheapest, fine for a US-focused civic app) |
| Alternate domain name (CNAME) | Your custom domain (e.g., `civicconnect.app`) — or leave blank to use `*.cloudfront.net` |
| Custom SSL certificate | Pick or create one in ACM (us-east-1 region required) — only if using a custom domain |
| Default root object | Leave blank |
| Standard logging | Off (for now) |

### 1.5 — Create

Click **Create distribution**. The distribution takes **5–10 minutes** to deploy. The status will move from "Deploying" to "Enabled."

While it deploys, **note the distribution domain name** (e.g., `d1234abcdef.cloudfront.net`) — you'll use it in Section 3.

---

## Section 2 — Attach geolocation headers

This is the actual geolocation setup. It works the same whether you just created the distribution or already had one.

### 2.1 — Create an origin request policy

1. In the CloudFront console, left sidebar → **Policies**
2. Tab → **Origin request**
3. Click **Create origin request policy**

| Field | Value |
|---|---|
| Name | `civic-connect-geo` |
| Comment | `Forwards CloudFront viewer country and state to the origin` |
| Headers | **Include the following headers** |
| Add header → CloudFront headers | Tick **`CloudFront-Viewer-Country`**, **`CloudFront-Viewer-Country-Region`**, and **`CloudFront-Viewer-Postal-Code`** |
| Add header → Standard headers | Add `Host`, `Origin`, `Referer`, `User-Agent`, `Accept-Language`, `Cookie` (Next.js needs these) |
| Query strings | **All** |
| Cookies | **All** |

> **About the postal code:** US ZIP codes average ~90 sq mi (>10,000-foot radius) — well above CCPA's 1,850-foot "precise geolocation" threshold (Cal. Civ. Code §1798.140). Postal code is therefore **not** precise geolocation and not sensitive personal information under CCPA, VCDPA, CPA, TDPSA, or CTDPA. We use it to narrow the viewer's House district from "all 52 California reps" to "your 1 rep."
>
> **Do not add `CloudFront-Viewer-City`, `CloudFront-Viewer-Latitude`, or `CloudFront-Viewer-Longitude`.** Those *can* fall inside the 1,850-foot radius and trigger extra disclosure and retention rules. We don't need them.

4. Click **Create**.

### 2.2 — Attach the policy to your distribution

1. CloudFront → **Distributions** → click your distribution
2. **Behaviors** tab → select the **Default (\*)** behavior → **Edit**
3. Scroll to **Cache key and origin requests**
4. **Origin request policy** → select **`civic-connect-geo`** (the one you just made)
5. Click **Save changes**

The change deploys in ~3–5 minutes. The distribution status will briefly show "Deploying."

---

## Section 3 — Point traffic at CloudFront

Skip this if you already had CloudFront in production. Otherwise, you need to direct visitors to the new CloudFront distribution instead of hitting ECS directly.

### Option A — Custom domain (production)

1. Go to **Route 53** (or your DNS provider)
2. Find the A or CNAME record for your domain (e.g., `civicconnect.app`)
3. Lower the TTL to **60 seconds** and save. **Wait one full TTL cycle** before changing the value (so a rollback would propagate fast).
4. Edit the record:
   - On Route 53: change to **Alias → CloudFront distribution → pick yours**
   - On other DNS providers: change to **CNAME → `d1234abcdef.cloudfront.net`** (your distribution domain)
5. Save. Propagation takes 1–5 minutes with a 60s TTL.

### Option B — Just test on the CloudFront URL (hackathon)

Visit `https://d1234abcdef.cloudfront.net` (your distribution domain) directly. No DNS work needed. Skip to Section 4.

---

## Section 4 — Verify the headers arrive

### 4.1 — Quick browser test

1. Visit any bill page through CloudFront, e.g., `https://<your-cloudfront-or-domain>/bill/hr-111-119`
2. Open DevTools → Network → click the document request → **Headers** tab → **Request Headers**
3. You will *not* see the geo headers here (they're added between CloudFront and the origin, not visible to your browser)

So the browser can't directly verify it. Instead:

### 4.2 — Verify at the Next.js server

Add a temporary log line to confirm the headers arrive. In `app/bill/[id]/page.tsx` near the top of `BillDetailPage`:

```ts
const viewerLocation = getViewerLocation();
console.log("[geo]", viewerLocation);
```

Then check your ECS service logs (CloudWatch → Log groups → `/ecs/civic-connect-web` or whatever yours is named). You should see:

```
[geo] { country: 'US', stateCode: 'DE', stateName: 'Delaware', postalCode: '19716' }
```

If `country` and `stateCode` are `null`, the headers aren't reaching the origin — see **Troubleshooting** below.

Once verified, **remove the `console.log`** — it's only for setup.

### 4.3 — Visible UI check

Visit a bill page (e.g., `/bill/hr-111-119`). The Action Card on the right should now show a **"Your Senators And House Member"** section at the top, with photos and contact info, before you've entered any ZIP code. The CTA button should offer a way to update the ZIP code or saved members.

If the section doesn't appear but the log shows the headers arriving, check that the `Representative` table in your database has rows for that state.

---

## Section 5 — Privacy notice update

State, country, and ZIP-level geolocation derived from IP at the CDN layer is **not "precise geolocation"** under CCPA (Cal. Civ. Code §1798.140 sets the threshold at ≤ 1,850 ft; US ZIPs average >10,000 ft radius), **not "sensitive personal information"** under any US state privacy law (VCDPA, CPA, TDPSA, CTDPA all use the same threshold), and is allowed under GDPR's **legitimate interest** basis without a consent banner.

You only need a one-line disclosure. Add this to your About / Privacy page (whatever you have):

> **Location.** We use approximate state-level and ZIP-level location, derived from your network connection by Amazon CloudFront, to suggest your federal representatives. We do not store this information, and you can override it by entering a different ZIP code on the contact page.

That's the only privacy work required.

---

## Troubleshooting

### Headers are `null` at the Next.js server

- Did the origin request policy save? Re-open it in CloudFront → Policies and confirm `CloudFront-Viewer-Country` and `CloudFront-Viewer-Country-Region` are in the list.
- Is the policy attached to the right behavior? Distributions → your distro → Behaviors → check the policy column.
- Did the distribution finish deploying? Status must be "Enabled," not "Deploying."
- Are you actually hitting the CloudFront URL? If your DNS hasn't been switched and you're loading the ECS URL directly, CloudFront isn't in the path.

### `country` is `'US'` but `stateCode` is `null`

CloudFront occasionally can't resolve a region (mostly for IPs in unusual ranges — VPN exit nodes, satellite). The code already handles this — Action Card just falls back to the "Contact Your Representatives" CTA. Nothing to fix.

### Wrong state for some users

VPNs, mobile carriers, and corporate proxies can geolocate inaccurately. The "Not in {state}? Enter your ZIP" link in the Action Card is the user's correction path. This is expected behavior.

### Need to roll back

- **Disable headers but keep CloudFront:** Distribution → Behaviors → Edit → set Origin request policy to `(none)` → Save. Headers stop arriving in ~3 min; Action Card silently falls back.
- **Bypass CloudFront entirely:** Repoint DNS back to the ECS URL. Propagates within one TTL.
- **Delete the distribution:** Distribution → Disable, wait for it to fully disable, then Delete. Costs nothing while disabled.

---

## What's already done in the codebase

You don't need to write any code — these files were added in the same change as this guide:

- `lib/viewer-location.ts` — reads CloudFront country/region/postal-code headers; returns nulls if absent (safe in dev/local)
- `lib/us-states.ts` — state code → name lookup
- `lib/getRepsByState.ts` — fetches representatives from the DB by state name (fallback when no ZIP)
- `lib/getRepsByZip.ts` — fetches 2 senators + matching House rep(s) for a given ZIP via the `ZipDistrict` table
- `scripts/import-zip-districts.ts` — one-shot importer for the Census ZCTA→119th-Congress-District relationship file (re-run after redistricting)
- `app/bill/[id]/page.tsx` — prefers ZIP lookup, falls back to state
- `components/ActionCard.tsx` — renders the "Your Representatives in {state}" section when location is detected

Until you complete the CloudFront setup above, the headers are absent, `viewerReps` is empty, and the Action Card renders exactly as it did before — **so this code is safe to deploy ahead of the AWS work.**
