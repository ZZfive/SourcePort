# Wuhan official housing live probe

The adapter intentionally supports one narrow, read-only operation first:

```bash
sourceport capabilities wuhan-housing
sourceport doctor wuhan-housing --json --timeout-ms 15000
sourceport run wuhan-housing get-official-page \
  --input '{"url":"https://gjj.wuhan.gov.cn/bsfw/ywzl/ywzn/dkyw/202412/t20241219_2504837.html","topic":"mortgage"}'
```

Allowlisted hosts are Wuhan housing and urban-renewal, Wuhan provident-fund,
the Wuhan government portal, and the official project query host linked by the
housing bureau. A page from a listing site cannot satisfy this operation.
Public HTTP is attempted first, followed by a browser read and a manual
recovery step. Captcha, access verification, source drift, and parser failures
remain in the SourcePort result.

The adapter retrieves official policy or explanatory pages. It does not infer
that a specific project has a permit, that a property is unencumbered, or that
a buyer qualifies for a loan. Those claims require a document tied to the exact
project/property and buyer facts.
