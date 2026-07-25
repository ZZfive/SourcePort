# Driving-Assistance Evidence

Treat ADAS as a generic category and HUAWEI ADS as one vendor product. Never use
a single `hasADAS` field.

Evaluate the exact trim across independent dimensions:

1. claimed automation level, including the source's wording;
2. operating domains such as highway navigation, ramps, urban navigation, and
   parking;
3. longitudinal, lateral, active-safety, parking, and monitoring capabilities;
4. cameras, ultrasonic radar, millimeter-wave radar, lidar, cockpit chip, and
   assistance chip;
5. system vendor, product name, software/version, and market;
6. standard, optional, unavailable, value-only, or unknown availability;
7. optional packages, configuration price, subscription, and OTA conditions;
8. exact model year and trim identity.

Interpret availability conservatively:

- `standard` and `value` support a positive claim when the value is clear;
- `optional` must be described as optional and may change on-road cost;
- `unavailable` supports a negative claim for that exact trim;
- `unknown` is missing evidence, not a negative claim.

Do not transfer a capability from a higher trim, a different model year, a
vendor marketing page, or the series as a whole to the selected trim. If a
feature depends on a package, subscription, regional rollout, or OTA version,
state that dependency next to the claim.
