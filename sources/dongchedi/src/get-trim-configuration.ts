import type { PublicHttpClassification } from "@sourceport/core";

import {
  classifyDongchediBasePage,
  dongchediPageProps,
  extractDongchediNextData,
} from "./dongchedi-page.js";

export type ConfigurationAvailability =
  | "value"
  | "standard"
  | "optional"
  | "unavailable"
  | "unknown";

export interface ConfigurationEvidence {
  key: string;
  label: string;
  value: string | null;
  availability: ConfigurationAvailability;
  configPrice: string;
}

export interface ConfigurationField extends ConfigurationEvidence {
  section: string;
  sourceType: number | null;
  options: ConfigurationEvidence[];
}

export interface DongchediTrimConfigurationData {
  identity: {
    seriesId: string;
    seriesName: string;
    trimId: string;
    trimName: string;
    year: string;
    brand: string;
    officialPrice: string;
    dealerPrice: string;
    sourceUrl: string;
  };
  configuration: ConfigurationField[];
  drivingAssistance: {
    claimedAutomationLevel: ConfigurationEvidence | null;
    operatingDomains: {
      highwayNavigation: ConfigurationEvidence | null;
      ramp: ConfigurationEvidence | null;
      urbanNavigation: ConfigurationEvidence | null;
      parking: ConfigurationEvidence | null;
    };
    capabilities: {
      longitudinal: ConfigurationEvidence[];
      lateral: ConfigurationEvidence[];
      activeSafety: ConfigurationEvidence[];
      parking: ConfigurationEvidence[];
      monitoring: ConfigurationEvidence[];
    };
    hardware: {
      exteriorCameras: number | null;
      interiorCameras: number | null;
      ultrasonicRadars: number | null;
      millimeterWaveRadars: number | null;
      lidars: number | null;
      cockpitChip: string | null;
      assistanceChip: string | null;
    };
    system: {
      vendor: string | null;
      name: string | null;
      version: string | null;
    };
    optionalEquipment: ConfigurationEvidence[];
    optionalPackages: ConfigurationEvidence[];
    subscription: string | null;
    ota: string | null;
    market: string | null;
  };
}

interface SourceValue {
  value?: unknown;
  icon_type?: unknown;
  config_price?: unknown;
}

interface SourceProperty {
  key?: unknown;
  text?: unknown;
  type?: unknown;
  sub_list?: unknown;
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableId(value: unknown, label: string): string {
  const id = clean(value);
  if (!/^\d+$/.test(id) || id === "0") {
    throw new Error(`${label} did not include a stable numeric id`);
  }
  return id;
}

function availability(iconType: unknown, value: unknown): ConfigurationAvailability {
  if (iconType === 1) return "standard";
  if (iconType === 2) return "optional";
  if (iconType === 3) return "unavailable";
  if (iconType === 0 || clean(value)) return "value";
  return "unknown";
}

function evidence(
  key: string,
  label: string,
  value: SourceValue | undefined,
): ConfigurationEvidence {
  const cleanedValue = clean(value?.value);
  return {
    key,
    label,
    value: cleanedValue || null,
    availability: availability(value?.icon_type, value?.value),
    configPrice: clean(value?.config_price),
  };
}

function numberValue(item: ConfigurationEvidence | undefined): number | null {
  if (!item?.value) return null;
  const value = Number(item.value);
  return Number.isFinite(value) ? value : null;
}

function select(
  map: ReadonlyMap<string, ConfigurationEvidence>,
  keys: readonly string[],
): ConfigurationEvidence[] {
  return keys.flatMap((key) => {
    const item = map.get(key);
    return item ? [item] : [];
  });
}

export function classifyDongchediTrimConfigurationPage(
  html: string,
): PublicHttpClassification | undefined {
  const base = classifyDongchediBasePage(html);
  if (base) return base;
  try {
    const props = dongchediPageProps(extractDongchediNextData(html));
    const rawData = props["rawData"] as { properties?: unknown; car_info?: unknown };
    if (!Array.isArray(rawData?.properties) || !Array.isArray(rawData?.car_info)) {
      return {
        status: "failed",
        code: "source_drift",
        message: "Dongchedi trim configuration page is missing rawData",
      };
    }
  } catch (error) {
    return {
      status: "failed",
      code: "source_drift",
      message: error instanceof Error ? error.message : "Dongchedi configuration shape changed",
    };
  }
  return undefined;
}

export function parseDongchediTrimConfiguration(
  html: string,
  expectedTrimId: string,
): DongchediTrimConfigurationData {
  const props = dongchediPageProps(extractDongchediNextData(html));
  const rawData = props["rawData"] as { properties?: unknown; car_info?: unknown };
  if (!Array.isArray(rawData?.properties) || !Array.isArray(rawData?.car_info)) {
    throw new Error("Dongchedi trim configuration page did not contain rawData");
  }
  const car = rawData.car_info[0] as Record<string, unknown> | undefined;
  if (!car) {
    throw new Error("Dongchedi trim configuration page did not contain car_info");
  }
  const trimId = stableId(car["car_id"], "Dongchedi trim identity");
  if (trimId !== expectedTrimId) {
    throw new Error(`Dongchedi trim identity '${trimId}' did not match '${expectedTrimId}'`);
  }
  const seriesId = stableId(car["series_id"], "Dongchedi series identity");
  const infoValue = car["info"];
  const info = infoValue && typeof infoValue === "object" && !Array.isArray(infoValue)
    ? (infoValue as Record<string, SourceValue>)
    : {};

  let section = "";
  const configuration: ConfigurationField[] = [];
  const flat = new Map<string, ConfigurationEvidence>();
  for (const rawProperty of rawData.properties) {
    const property = rawProperty as SourceProperty;
    const key = clean(property.key);
    const label = clean(property.text);
    const sourceType = Number.isInteger(property.type) ? Number(property.type) : null;
    if (property.type === 2 || key === "intelligent_config") {
      section = label;
      continue;
    }
    if (!key || !label) {
      continue;
    }
    const direct = evidence(key, label, info[key]);
    const options = Array.isArray(property.sub_list)
      ? property.sub_list.flatMap((rawOption) => {
          const option = rawOption as { key?: unknown; text?: unknown };
          const optionKey = clean(option.key);
          const optionLabel = clean(option.text);
          return optionKey && optionLabel
            ? [evidence(optionKey, optionLabel, info[optionKey])]
            : [];
        })
      : [];
    const aggregateAvailability = direct.availability === "unknown" && options.length > 0
      ? options.some((item) => item.availability === "standard")
        ? "standard"
        : options.some((item) => item.availability === "optional")
          ? "optional"
          : options.every((item) => item.availability === "unavailable")
            ? "unavailable"
            : "unknown"
      : direct.availability;
    const field: ConfigurationField = {
      ...direct,
      availability: aggregateAvailability,
      section,
      sourceType,
      options,
    };
    configuration.push(field);
    flat.set(key, field);
    options.forEach((item) => flat.set(item.key, item));
  }

  const cockpitChip = configuration
    .find((item) => item.key === "car_intelligent_chip")
    ?.options.find((item) => item.availability === "standard" || item.availability === "optional")
    ?.value ?? null;
  const capability = (key: string): ConfigurationEvidence | null => flat.get(key) ?? null;
  const optionalEquipment = [...flat.values()].filter(
    (item, index, all) =>
      item.availability === "optional" &&
      all.findIndex((candidate) => candidate.key === item.key) === index,
  );
  const optionalPackages = configuration.filter((item) => item.section === "选装包");

  return {
    identity: {
      seriesId,
      seriesName: clean(car["series_name"]),
      trimId,
      trimName: clean(car["car_name"]),
      year: clean(car["car_year"]),
      brand: clean(car["brand_name"]),
      officialPrice: clean(car["official_price"]),
      dealerPrice: clean(car["dealer_price"]),
      sourceUrl: `https://www.dongchedi.com/auto/params-carIds-${trimId}`,
    },
    configuration,
    drivingAssistance: {
      claimedAutomationLevel: capability("automatic_drive_level"),
      operatingDomains: {
        highwayNavigation: capability("navigation_assisted_driving"),
        ramp: capability("auto_road_out_in"),
        urbanNavigation: null,
        parking: capability("auto_park_entry"),
      },
      capabilities: {
        longitudinal: select(flat, [
          "cruise",
          "adaptive_cruise",
          "full_speed_adaptive_cruise",
          "active_brake",
          "forward_traffic_braking",
        ]),
        lateral: select(flat, [
          "lane_warning_system",
          "line_support",
          "lane_keeping_assist",
          "lane_center",
          "auto_road_change",
        ]),
        activeSafety: select(flat, [
          "front_collision_warning",
          "rear_traffic_warning",
          "reversing_warning_system",
          "dow_open_door_warning_system",
          "forward_traffic_warning",
          "forward_traffic_braking",
          "active_brake",
          "road_traffic_sign_recognition",
          "signal_recognition",
        ]),
        parking: select(flat, [
          "front_parking_radar",
          "rear_parking_radar",
          "reversing_camera",
          "panoramic_camera",
          "auto_park_entry",
          "track_reverse",
          "memory_parking",
          "reversing_warning_system",
        ]),
        monitoring: select(flat, [
          "fatigue_driving_warning",
          "active_dms_fatigue_detection",
          "vital_signs_detection",
        ]),
      },
      hardware: {
        exteriorCameras: numberValue(flat.get("camera_count")),
        interiorCameras: numberValue(flat.get("incar_camera_count")) ??
          numberValue(flat.get("incar_camera_count_1")),
        ultrasonicRadars: numberValue(flat.get("ultrasonic_radar")),
        millimeterWaveRadars: numberValue(flat.get("millimeter_wave_radar")),
        lidars: numberValue(flat.get("laser_radar")),
        cockpitChip,
        assistanceChip: null,
      },
      system: { vendor: null, name: null, version: null },
      optionalEquipment,
      optionalPackages,
      subscription: null,
      ota: null,
      market: null,
    },
  };
}
