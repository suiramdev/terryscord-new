import type { CaptchaGenerator as CaptchaGeneratorType } from "captcha-canvas";

import type { GuildCaptchaSettings } from "@/integrations/captcha-settings";

const CAPTCHA_CASE_INSENSITIVE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CAPTCHA_CASE_SENSITIVE_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CAPTCHA_TEXT_FONT_FAMILY = "sans-serif";
const CAPTCHA_TEXT_COLORS = ["#0f172a", "#1e293b", "#334155", "#475569"];
const CAPTCHA_BACKGROUND_COLOR_START = "#f8fafc";
const CAPTCHA_BACKGROUND_COLOR_END = "#e2e8f0";
const CAPTCHA_BACKGROUND_ACCENT_COLOR = "#94a3b8";
const FALLBACK_CAPTCHA_CHARACTER = "A";
const UINT32_MAX_PLUS_ONE = 0x1_00_00_00_00;

export const CAPTCHA_IMAGE_HEIGHT = 140;
export const CAPTCHA_IMAGE_WIDTH = 360;

interface CaptchaCanvasModule {
  CaptchaGenerator: typeof CaptchaGeneratorType;
}

export interface GeneratedCaptchaImage {
  code: string;
  imageBuffer: Buffer;
}

let captchaCanvasModulePromise: Promise<CaptchaCanvasModule> | null = null;

const loadCaptchaCanvasModule = (): Promise<CaptchaCanvasModule> => {
  if (captchaCanvasModulePromise) {
    return captchaCanvasModulePromise;
  }

  captchaCanvasModulePromise = (async (): Promise<CaptchaCanvasModule> => {
    try {
      return await import("captcha-canvas");
    } catch (error: unknown) {
      captchaCanvasModulePromise = null;
      throw new Error(
        "Unable to load captcha-canvas. Ensure skia-canvas native binaries are installed for this runtime.",
        { cause: error }
      );
    }
  })();

  return captchaCanvasModulePromise;
};

const normalizeNoiseLevel = (noiseLevel: number): number =>
  Math.max(0, Math.min(100, noiseLevel)) / 100;

const getCaptchaCharacterSet = ({
  caseSensitive,
}: {
  caseSensitive: boolean;
}): string =>
  caseSensitive
    ? CAPTCHA_CASE_SENSITIVE_CHARACTERS
    : CAPTCHA_CASE_INSENSITIVE_CHARACTERS;

const secureRandomInteger = (maxExclusive: number): number => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive integer.");
  }

  const threshold = UINT32_MAX_PLUS_ONE - (UINT32_MAX_PLUS_ONE % maxExclusive);
  const randomBuffer = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(randomBuffer);
    const [randomValue] = randomBuffer;
    if (randomValue === undefined || randomValue >= threshold) {
      continue;
    }

    return randomValue % maxExclusive;
  }
};

const generateSecureCaptchaCode = ({
  caseSensitive,
  codeLength,
}: {
  caseSensitive: boolean;
  codeLength: number;
}): string => {
  const characters = getCaptchaCharacterSet({ caseSensitive });
  return Array.from({ length: codeLength }, () => {
    const randomCharacterIndex = secureRandomInteger(characters.length);
    return characters[randomCharacterIndex] ?? FALLBACK_CAPTCHA_CHARACTER;
  }).join("");
};

const createCaptchaBackgroundBuffer = (noiseLevelRatio: number): Buffer => {
  const accentOpacity = (0.08 + noiseLevelRatio * 0.14).toFixed(2);
  const stripeOpacity = (0.05 + noiseLevelRatio * 0.12).toFixed(2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_IMAGE_WIDTH}" height="${CAPTCHA_IMAGE_HEIGHT}" viewBox="0 0 ${CAPTCHA_IMAGE_WIDTH} ${CAPTCHA_IMAGE_HEIGHT}">
<defs>
<linearGradient id="captcha-gradient" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${CAPTCHA_BACKGROUND_COLOR_START}" />
<stop offset="100%" stop-color="${CAPTCHA_BACKGROUND_COLOR_END}" />
</linearGradient>
<pattern id="captcha-stripes" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(20)">
<line x1="0" y1="0" x2="0" y2="20" stroke="${CAPTCHA_BACKGROUND_ACCENT_COLOR}" stroke-width="1" />
</pattern>
</defs>
<rect width="100%" height="100%" fill="url(#captcha-gradient)" />
<rect width="100%" height="100%" fill="url(#captcha-stripes)" opacity="${stripeOpacity}" />
<circle cx="46" cy="36" r="28" fill="${CAPTCHA_BACKGROUND_ACCENT_COLOR}" opacity="${accentOpacity}" />
<circle cx="312" cy="104" r="36" fill="${CAPTCHA_BACKGROUND_ACCENT_COLOR}" opacity="${accentOpacity}" />
</svg>`;

  return Buffer.from(svg, "utf8");
};

export const generateCaptchaImage = async ({
  settings,
}: {
  settings: GuildCaptchaSettings;
}): Promise<GeneratedCaptchaImage> => {
  const { CaptchaGenerator } = await loadCaptchaCanvasModule();
  const code = generateSecureCaptchaCode({
    caseSensitive: settings.captchaCaseSensitive,
    codeLength: settings.codeLength,
  });
  const noiseLevelRatio = normalizeNoiseLevel(settings.captchaNoiseLevel);
  const textRotation = 6 + Math.round(10 * noiseLevelRatio);
  const textSize = Math.max(40, 50 - Math.round(6 * noiseLevelRatio));

  const captchaGenerator = new CaptchaGenerator({
    height: CAPTCHA_IMAGE_HEIGHT,
    width: CAPTCHA_IMAGE_WIDTH,
  })
    .setBackground(createCaptchaBackgroundBuffer(noiseLevelRatio))
    .setCaptcha({
      color: CAPTCHA_TEXT_COLORS[0],
      colors: CAPTCHA_TEXT_COLORS,
      font: CAPTCHA_TEXT_FONT_FAMILY,
      opacity: 1,
      rotate: textRotation,
      size: textSize,
      skew: noiseLevelRatio >= 0.7,
      text: code,
    })
    .setTrace({
      color: "#64748b",
      opacity: noiseLevelRatio === 0 ? 0 : 0.2 + noiseLevelRatio * 0.35,
      size: 1 + Math.round(2 * noiseLevelRatio),
    })
    .setDecoy({
      color: "#94a3b8",
      font: CAPTCHA_TEXT_FONT_FAMILY,
      opacity: noiseLevelRatio === 0 ? 0 : 0.1 + noiseLevelRatio * 0.22,
      size: 12 + Math.round(6 * noiseLevelRatio),
      total: Math.round(noiseLevelRatio * 48),
    });

  const imageBuffer = await captchaGenerator.generate();
  return {
    code,
    imageBuffer,
  };
};
