import { describe, expect, it } from "vitest";

import { parseDongchediTrimConfiguration } from "./get-trim-configuration.js";

const property = (
  key: string,
  text: string,
  type = 1,
  subList: Array<{ key: string; text: string }> | null = null,
) => ({ key, text, type, sub_list: subList, context: "" });

const html = `<script id="__NEXT_DATA__">${JSON.stringify({
  page: "/auto/new_params",
  props: {
    pageProps: {
      rawData: {
        properties: [
          property("", "主动安全", 2),
          property("active_brake", "主动刹车"),
          property("lane_center", "车道居中保持"),
          property("navigation_assistance_control", "辅助/操控配置", 2),
          property("cruise_system", "巡航系统", 3, [
            { key: "adaptive_cruise", text: "自适应巡航" },
            { key: "full_speed_adaptive_cruise", text: "全速自适应巡航" },
          ]),
          property("automatic_drive_level", "辅助驾驶级别"),
          property("navigation_assisted_driving", "导航辅助驾驶"),
          property("auto_park_entry", "自动泊车入位"),
          property("air_suspension", "空气悬挂"),
          property("intelligent_config", "智能化配置", 0),
          property("camera_count", "车外摄像头数量(个)"),
          property("ultrasonic_radar", "超声波雷达数量(个)"),
          property("millimeter_wave_radar", "毫米波雷达数量(个)"),
          property("car_intelligent_chip", "车载智能芯片", 3, [
            { key: "car_intelligent_chip_高通骁龙8155", text: "高通骁龙8155" },
          ]),
          property("future_unknown_field", "未来新增字段"),
        ],
        car_info: [
          {
            car_name: "改款 xDrive30Li 尊享型M运动曜夜套装",
            series_name: "宝马X5",
            official_price: "59.8万",
            series_id: "5273",
            dealer_price: "52.80万",
            car_year: "2026",
            car_id: "255925",
            brand_name: "宝马",
            info: {
              active_brake: { value: "标配", icon_type: 1, config_price: "" },
              lane_center: { value: "标配", icon_type: 1, config_price: "" },
              adaptive_cruise: { value: "自适应巡航", icon_type: 1, config_price: "" },
              full_speed_adaptive_cruise: {
                value: "全速自适应巡航",
                icon_type: 1,
                config_price: "",
              },
              automatic_drive_level: { value: "L2级", icon_type: 1, config_price: "" },
              navigation_assisted_driving: { value: "", icon_type: 3, config_price: "" },
              auto_park_entry: { value: "标配", icon_type: 1, config_price: "" },
              air_suspension: { value: "选配", icon_type: 2, config_price: "21000元" },
              camera_count: { value: "5", icon_type: 1, config_price: "" },
              ultrasonic_radar: { value: "12", icon_type: 1, config_price: "" },
              millimeter_wave_radar: { value: "5", icon_type: 1, config_price: "" },
              car_intelligent_chip_高通骁龙8155: {
                value: "高通骁龙8155",
                icon_type: 1,
                config_price: "",
              },
              future_unknown_field: { value: "原样保留", icon_type: 0, config_price: "" },
            },
          },
        ],
      },
    },
  },
})}</script>`;

describe("Dongchedi get-trim-configuration", () => {
  it("keeps exact identity, full fields, and structured assistance evidence", () => {
    const data = parseDongchediTrimConfiguration(html, "255925");

    expect(data.identity).toEqual(
      expect.objectContaining({
        seriesId: "5273",
        trimId: "255925",
        year: "2026",
        brand: "宝马",
      }),
    );
    expect(data.configuration).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "air_suspension",
          availability: "optional",
          configPrice: "21000元",
        }),
        expect.objectContaining({
          key: "future_unknown_field",
          value: "原样保留",
        }),
      ]),
    );
    expect(data.drivingAssistance.claimedAutomationLevel?.value).toBe("L2级");
    expect(data.drivingAssistance.capabilities.longitudinal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "adaptive_cruise", availability: "standard" }),
        expect.objectContaining({ key: "active_brake", availability: "standard" }),
      ]),
    );
    expect(data.drivingAssistance.capabilities.parking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "auto_park_entry", availability: "standard" }),
      ]),
    );
    expect(data.drivingAssistance.hardware).toEqual(
      expect.objectContaining({
        exteriorCameras: 5,
        ultrasonicRadars: 12,
        millimeterWaveRadars: 5,
        cockpitChip: "高通骁龙8155",
      }),
    );
    expect(data.drivingAssistance.system).toEqual({
      vendor: null,
      name: null,
      version: null,
    });
  });

  it("does not accept a different exact trim", () => {
    expect(() => parseDongchediTrimConfiguration(html, "1")).toThrow(/trim identity/);
  });
});
