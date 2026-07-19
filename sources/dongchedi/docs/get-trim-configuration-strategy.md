# Dongchedi Exact-Trim Configuration Strategy

Verified: 2026-07-19 (Asia/Shanghai)

## Exact identity used

- Series: 宝马X5 (`seriesId=5273`)
- Trim: 2026款 改款 xDrive30Li 尊享型M运动曜夜套装
  (`trimId=255925`)
- Source URL: `https://www.dongchedi.com/auto/params-carIds-255925`

## Bounded hypotheses and observations

1. The logged-in series page exposed `carModelsData.tab_list`, stable trim IDs,
   and visible links to `/auto/params-carIds-<trimId>`.
2. The exact-trim page returned SSR
   `__NEXT_DATA__.props.pageProps.rawData`, containing one matching `car_info`
   record and 292 source properties. No signed XHR or signature reconstruction
   was required.
3. Browser-visible legend text verified the source icon semantics:
   `icon_type=1` is standard, `2` is optional, `3` is unavailable, while plain
   scalar values use `0`.
4. The operation strips wiki media and session material, retains 278 actual
   configuration fields after section headers are removed, and preserves
   unknown future fields rather than guessing a mapping.

## Driving-assistance boundary

The operation records source-exposed facts independently:

- claimed level (`L2级` for the verified trim);
- longitudinal, lateral, active-safety, parking, and monitoring capabilities;
- highway/ramp/urban/parking operating-domain evidence;
- exterior/interior cameras, ultrasonic radar, millimeter-wave radar, lidar,
  cockpit chip, and unknown assistance-chip state;
- optional equipment versus explicit option packages;
- system vendor, system name, version, subscription, OTA, and market only when
  the source exposes them.

For the verified BMW trim, the source did not expose an assistance-system
vendor/name/version. Those fields remain `null`; SourcePort does not infer them
from the brand, capability list, or cockpit chip.

## Live gate result

Two live `get-trim-configuration` executions succeeded through
`dongchedi-browser`. The second result was runtime-validated against operation
schema `1.0.0` and returned:

- exact identity `5273/255925`;
- 278 configuration fields;
- 1 interior camera, 5 exterior cameras, 12 ultrasonic radars, and 5
  millimeter-wave radars;
- 13 optional-equipment entries;
- one distinct `user_custom_pkg` option-package field;
- evidence URL and retrieval time;
- no credentials, cookies, or account data in the result or repository.
