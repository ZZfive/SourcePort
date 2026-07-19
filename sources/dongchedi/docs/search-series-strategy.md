# Dongchedi `search-series` Strategy

Verified: 2026-07-18 (Asia/Shanghai)

## Bounded observations

1. A direct GET to `https://www.dongchedi.com/search?keyword=宝马X5` with a
   normal desktop user agent returned HTTP 302 to
   `/login-required?redirect=...`, followed by a 200 login page. Its
   `__NEXT_DATA__` declared `page: "/login-required"`; it did not contain
   `pageProps.searchData`.
2. OpenCLI 1.8.6 was inspected and then installed as a fixed development
   dependency. Its built-in Dongchedi search adapter expects public SSR
   `searchData`, but that public-fetch assumption does not match observation 1
   in this environment.
3. No signature cracking, captcha bypass, or repeated broad requests were
   attempted. The raw login response was not committed because it contained
   environment-specific response data; tests use a minimal sanitized shape.
4. On 2026-07-19, `opencli doctor` confirmed daemon `1.8.6`, Chrome extension
   `1.0.22`, and a connected browser profile. SourcePort then completed two
   consecutive live `search-series` runs through `dongchedi-browser`.
5. Both runs returned series `5273` (宝马X5), current price text, a Wuhan search
   evidence URL, and explicit diagnostics showing the public backend blocked by
   `auth_required` before the browser backend succeeded.

## Selected backend order

1. `dongchedi-public`: cheapest live SSR request; succeeds only when real
   `searchData` is present.
2. `dongchedi-browser`: logged-in browser/OpenCLI bridge. This is the verified
   live success path because the public path is currently login-gated.
3. `dongchedi-manual`: explicit user login or verification pause; never a
   bypass mechanism.

The operation classifies login, verification, fallback-shell, missing payload,
and malformed source shapes before accepting domain data. A documented or
fixture-only parser is not considered live success.
