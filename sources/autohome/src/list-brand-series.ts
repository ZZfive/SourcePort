/**
 * Autohome brand-catalog parser.
 *
 * The catalog selection and row extraction approach was adapted from OpenCLI
 * 1.8.6's Apache-2.0 Autohome adapter, then changed to SourcePort field names
 * and fail-closed contracts. See NOTICE.
 */

const AUTOHOME_BASE = "https://www.autohome.com.cn";

const BRAND_INITIALS: Readonly<Record<string, string>> = {
  奥迪: "A",
  阿维塔: "A",
  埃安: "A",
  宝马: "B",
  奔驰: "B",
  比亚迪: "B",
  别克: "B",
  本田: "B",
  保时捷: "B",
  长安: "C",
  长安启源: "C",
  大众: "D",
  丰田: "F",
  福特: "F",
  方程豹: "F",
  广汽传祺: "G",
  哈弗: "H",
  红旗: "H",
  吉利: "J",
  极氪: "J",
  捷途: "J",
  凯迪拉克: "K",
  理想: "L",
  领克: "L",
  零跑: "L",
  岚图: "L",
  马自达: "M",
  奇瑞: "Q",
  日产: "R",
  荣威: "R",
  特斯拉: "T",
  腾势: "T",
  坦克: "T",
  沃尔沃: "W",
  五菱: "W",
  蔚来: "W",
  问界: "W",
  小米: "X",
  小鹏: "X",
  星途: "X",
  智己: "Z",
};

export interface AutohomeBrandSeriesItem {
  seriesId: string;
  name: string;
  guidePrice: string;
  sourceUrl: string;
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableId(value: unknown, label: string): string {
  const id = clean(value);
  if (!/^\d+$/.test(id)) {
    throw new Error(`${label} did not include a stable numeric id`);
  }
  return id;
}

function requiredText(value: unknown, label: string): string {
  const text = clean(value);
  if (!text) {
    throw new Error(`${label} did not include stable text`);
  }
  return text;
}

export function resolveBrandInitial(brandInput: string): string {
  const raw = clean(brandInput);
  if (!raw) {
    throw new Error("brand must be non-empty");
  }
  if (/^[A-Za-z]$/.test(raw)) {
    return raw.toUpperCase();
  }
  const key = raw.replace(/[·\s]/g, "");
  const initial = BRAND_INITIALS[key] ?? BRAND_INITIALS[raw];
  if (!initial) {
    throw new Error(`unknown brand '${brandInput}'`);
  }
  return initial;
}

export function parseAutohomeBrandSeries(
  html: string,
  brandName: string,
  limit: number,
): AutohomeBrandSeriesItem[] {
  const blocks = html.match(/<dl[^>]*>[\s\S]*?<\/dl>/g);
  if (!blocks) {
    throw new Error("Autohome catalog returned an unexpected shape; expected brand blocks");
  }
  const wanted = clean(brandName).replace(/[·\s]/g, "");
  let selected = "";
  for (const block of blocks) {
    const brandMatch = block.match(/<dt>[\s\S]*?<div>\s*<a[^>]*>([^<]+)<\/a>/);
    const candidate = clean(brandMatch?.[1]).replace(/[·\s]/g, "");
    if (candidate && (candidate === wanted || candidate.startsWith(wanted) || wanted.startsWith(candidate))) {
      selected = block;
      break;
    }
  }
  if (!selected) {
    return [];
  }

  const rows: AutohomeBrandSeriesItem[] = [];
  const rowPattern = /<li id="s(\d+)">([\s\S]*?)<\/li>/g;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(selected)) !== null) {
    const seriesId = stableId(match[1], `Autohome brand row ${rows.length + 1}`);
    const row = match[2] ?? "";
    const nameMatch = row.match(/<h4>\s*<a[^>]*>([^<]+)<\/a>/) ?? row.match(/<a[^>]*>([^<]+)<\/a>/);
    const name = requiredText(nameMatch?.[1], `Autohome brand row ${rows.length + 1} name`);
    const priceMatch = row.match(/指导价[：:]\s*<[^>]*>([^<]+)</) ?? row.match(/指导价[：:]\s*([^<]+)</);
    let guidePrice = clean(priceMatch?.[1]);
    if (/暂无|未上市|停售/.test(guidePrice)) {
      guidePrice = "";
    }
    rows.push({
      seriesId,
      name,
      guidePrice,
      sourceUrl: `${AUTOHOME_BASE}/${seriesId}/`,
    });
    if (rows.length >= limit) {
      break;
    }
  }
  return rows;
}
