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
4. `opencli doctor` confirmed the local daemon on port 19825. The Browser
   Bridge extension was not connected at the latest check, so logged-in live
   success remains externally blocked until the user enables the extension.

## Selected backend order

1. `dongchedi-public`: cheapest live SSR request; succeeds only when real
   `searchData` is present.
2. `dongchedi-browser`: logged-in browser/OpenCLI bridge. This is the next
   implementation target because the public path is currently login-gated.
3. `dongchedi-manual`: explicit user login or verification pause; never a
   bypass mechanism.

The operation classifies login, verification, fallback-shell, missing payload,
and malformed source shapes before accepting domain data. A documented or
fixture-only parser is not considered live success.
