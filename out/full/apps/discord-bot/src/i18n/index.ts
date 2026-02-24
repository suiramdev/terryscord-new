import { env } from "@terryscord/env/bot";

import { frTranslations } from "./fr";

const translations = {
  fr: frTranslations,
} as const;

export type BotLocale = keyof typeof translations;

type InterpolationValue = boolean | number | string;
type InterpolationValues = Record<string, InterpolationValue>;

const TEMPLATE_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const normalizeLocale = (locale: string): string => locale.toLowerCase();

export const DEFAULT_BOT_LOCALE: BotLocale = "fr";

const resolveConfiguredLocale = (): BotLocale => env.DISCORD_BOT_LOCALE;

export const resolveBotLocale = (
  preferredLocale?: string | null
): BotLocale => {
  const configuredLocale = resolveConfiguredLocale();

  if (!preferredLocale) {
    return configuredLocale;
  }

  const normalizedPreferredLocale = normalizeLocale(preferredLocale);
  for (const locale of Object.keys(translations) as BotLocale[]) {
    if (normalizedPreferredLocale === locale) {
      return locale;
    }

    if (normalizedPreferredLocale.startsWith(`${locale}-`)) {
      return locale;
    }
  }

  return configuredLocale;
};

const interpolate = (
  template: string,
  values?: InterpolationValues
): string => {
  if (!values) {
    return template;
  }

  return template.replaceAll(TEMPLATE_PATTERN, (fullMatch, token: string) => {
    const replacement = values[token];
    if (replacement === undefined) {
      return fullMatch;
    }

    return String(replacement);
  });
};

export const t = (
  key: keyof typeof frTranslations,
  values?: InterpolationValues,
  preferredLocale?: string | null
): string => {
  const locale = resolveBotLocale(preferredLocale);
  const template =
    translations[locale][key] ?? translations[DEFAULT_BOT_LOCALE][key] ?? key;

  return interpolate(template, values);
};
