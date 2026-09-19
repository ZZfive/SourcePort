# Wuhan listing lead live probe

The adapter deliberately reports listing pages as `lead-only` observations.
They can suggest a project or house, price, area, and layout, but they do not
prove a transaction price, ownership, encumbrance, permit, or availability.

```bash
sourceport capabilities wuhan-listings
sourceport doctor wuhan-listings --json --timeout-ms 15000
sourceport run wuhan-listings search-listings \
  --input '{"url":"https://wuhan.fang.com/","query":"property listings","kind":"new","city":"<source market>","limit":5}'
```

The `city` parameter is supplied by the caller and must match the market
represented by the requested source URL. It is not a user profile default.

The current public routes include the Wuhan Fang.com portal and Beike's
`m.ke.com/wh/ershoufang` and `wh.fang.ke.com` pages. Lianjia/Beike hosts are
allowlisted for explicitly supplied listing URLs, but their access state is
reported independently. Beike pages may return captcha or navigation-only HTML
in automated HTTP sessions; the parser therefore accepts only structured detail
links and reports source drift instead of promoting navigation links to leads.
`get-listing` remains explicitly drifted/blocked when the public detail response
does not expose a stable exact property identity. Browser and manual recovery
paths stay visible when a site returns captcha, login, or a shape different from
the operation schema.
