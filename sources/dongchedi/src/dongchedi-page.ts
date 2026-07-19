import type { PublicHttpClassification } from "@sourceport/core";
import { humanVerificationRecovery, loginRecovery } from "@sourceport/core";

export interface DongchediNextData {
  page?: unknown;
  props?: { pageProps?: unknown };
}

export function extractDongchediNextData(html: string): DongchediNextData {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) {
    throw new Error("Dongchedi page did not contain __NEXT_DATA__");
  }
  return JSON.parse(match[1]) as DongchediNextData;
}

export function dongchediPageProps(nextData: DongchediNextData): Record<string, unknown> {
  const value = nextData.props?.pageProps;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Dongchedi page did not contain valid pageProps");
  }
  return value as Record<string, unknown>;
}

export function classifyDongchediBasePage(
  html: string,
): PublicHttpClassification | undefined {
  if (/captcha|安全验证|访问验证|verify/i.test(html) && !/__NEXT_DATA__/.test(html)) {
    return {
      status: "blocked",
      code: "human_verification_required",
      message: "Dongchedi requires interactive access verification",
      recoveryActions: [
        humanVerificationRecovery("Complete Dongchedi verification in the connected browser"),
      ],
    };
  }
  let nextData: DongchediNextData;
  try {
    nextData = extractDongchediNextData(html);
  } catch (error) {
    return {
      status: "failed",
      code: "source_drift",
      message: error instanceof Error ? error.message : "Dongchedi page shape changed",
    };
  }
  if (nextData.page === "/login-required") {
    return {
      status: "blocked",
      code: "auth_required",
      message: "Dongchedi requires a logged-in browser session",
      recoveryActions: [
        loginRecovery("Log in to Dongchedi in the connected Chrome profile", "dongchedi-browser"),
      ],
    };
  }
  return undefined;
}
