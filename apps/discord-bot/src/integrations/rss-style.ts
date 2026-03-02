/* eslint-disable max-statements */

export const RSS_MESSAGE_FORMAT_VALUES = [
  "embed",
  "title",
  "description",
  "content",
] as const;

export type RssMessageFormat = (typeof RSS_MESSAGE_FORMAT_VALUES)[number];

type TemplatePlaceholder =
  | "author"
  | "content"
  | "description"
  | "link"
  | "pubDate"
  | "title";

const SUPPORTED_TEMPLATE_PLACEHOLDERS = new Set<TemplatePlaceholder>([
  "author",
  "content",
  "description",
  "link",
  "pubDate",
  "title",
]);

const TEMPLATE_TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_-]+)\s*}}/g;
const HEX_COLOR_PATTERN = /^#?([a-fA-F0-9]{6})$/;
const MAX_TEMPLATE_LENGTH = 1800;
const MAX_EMBED_FIELDS = 10;

export interface RssTemplateValues {
  author: string;
  content: string;
  description: string;
  link: string;
  pubDate: string;
  title: string;
}

export interface RssEmbedFieldStyle {
  inline: boolean;
  name: string;
  value: string;
}

export interface RssEmbedStyle {
  author: string | null;
  authorIconUrl: string | null;
  authorUrl: string | null;
  color: string | null;
  description: string | null;
  fields: RssEmbedFieldStyle[];
  footer: string | null;
  footerIconUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  timestamp: boolean;
  title: string | null;
  url: string | null;
}

export interface RssMessageStyle {
  embed: RssEmbedStyle | null;
  format: RssMessageFormat;
  template: string | null;
}

interface ParseError {
  message: string;
  type: "error";
}

interface ParseSuccess<T> {
  type: "success";
  value: T;
}

type ParseResult<T> = ParseError | ParseSuccess<T>;

export type ParseRssMessageStyleResult = ParseResult<RssMessageStyle>;

interface RssEmbedFieldStyleInput {
  inline?: unknown;
  name?: unknown;
  value?: unknown;
}

interface RssEmbedStyleInput {
  author?: unknown;
  authorIconUrl?: unknown;
  authorUrl?: unknown;
  color?: unknown;
  description?: unknown;
  fields?: unknown;
  footer?: unknown;
  footerIconUrl?: unknown;
  imageUrl?: unknown;
  thumbnailUrl?: unknown;
  timestamp?: unknown;
  title?: unknown;
  url?: unknown;
}

interface RssMessageStyleInput {
  embed?: unknown;
  format?: unknown;
  template?: unknown;
}

const DEFAULT_MESSAGE_TEMPLATES: Record<
  Exclude<RssMessageFormat, "embed">,
  string
> = {
  content: "{{content}}\n{{link}}",
  description: "{{description}}\n{{link}}",
  title: "{{title}}\n{{link}}",
};

const DEFAULT_EMBED_STYLE: RssEmbedStyle = {
  author: "{{author}}",
  authorIconUrl: null,
  authorUrl: null,
  color: "#3f8cff",
  description: "{{description}}",
  fields: [],
  footer: "{{pubDate}}",
  footerIconUrl: null,
  imageUrl: null,
  thumbnailUrl: null,
  timestamp: false,
  title: "{{title}}",
  url: "{{link}}",
};

const DEFAULT_STYLE_BY_FORMAT: Record<RssMessageFormat, RssMessageStyle> = {
  content: {
    embed: null,
    format: "content",
    template: DEFAULT_MESSAGE_TEMPLATES.content,
  },
  description: {
    embed: null,
    format: "description",
    template: DEFAULT_MESSAGE_TEMPLATES.description,
  },
  embed: {
    embed: DEFAULT_EMBED_STYLE,
    format: "embed",
    template: null,
  },
  title: {
    embed: null,
    format: "title",
    template: DEFAULT_MESSAGE_TEMPLATES.title,
  },
};

const toError = (message: string): ParseError => ({
  message,
  type: "error",
});

const toSuccess = <T>(value: T): ParseSuccess<T> => ({
  type: "success",
  value,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const resolveUnknownTemplateVariables = (template: string): string[] => {
  const unknownVariables = new Set<string>();

  for (const match of template.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const variableName = match[1]?.trim();
    if (!variableName) {
      continue;
    }

    if (
      !SUPPORTED_TEMPLATE_PLACEHOLDERS.has(variableName as TemplatePlaceholder)
    ) {
      unknownVariables.add(variableName);
    }
  }

  return [...unknownVariables];
};

const resolveTemplate = ({
  fieldName,
  required,
  value,
}: {
  fieldName: string;
  required: boolean;
  value: unknown;
}): ParseResult<string | null> => {
  if (value === undefined || value === null) {
    return required
      ? toError(`${fieldName} is required.`)
      : toSuccess<string | null>(null);
  }

  if (typeof value !== "string") {
    return toError(`${fieldName} must be a string.`);
  }

  const template = value.trim();
  if (!template) {
    return required
      ? toError(`${fieldName} cannot be empty.`)
      : toSuccess<string | null>(null);
  }

  if (template.length > MAX_TEMPLATE_LENGTH) {
    return toError(
      `${fieldName} cannot be longer than ${MAX_TEMPLATE_LENGTH} characters.`
    );
  }

  const unsupportedVariables = resolveUnknownTemplateVariables(template);
  if (unsupportedVariables.length > 0) {
    return toError(
      `${fieldName} contains unsupported placeholders: ${unsupportedVariables.join(", ")}.`
    );
  }

  return toSuccess(template);
};

const resolveRequiredTemplate = ({
  fieldName,
  value,
}: {
  fieldName: string;
  value: unknown;
}): ParseResult<string> => {
  const result = resolveTemplate({
    fieldName,
    required: true,
    value,
  });

  if (result.type === "error") {
    return result;
  }

  if (!result.value) {
    return toError(`${fieldName} cannot be empty.`);
  }

  return toSuccess(result.value);
};

const resolveEmbedField = ({
  index,
  value,
}: {
  index: number;
  value: unknown;
}): ParseResult<RssEmbedFieldStyle> => {
  if (!isRecord(value)) {
    return toError(`embed.fields[${index}] must be an object.`);
  }

  const fieldInput = value as RssEmbedFieldStyleInput;

  const nameTemplate = resolveRequiredTemplate({
    fieldName: `embed.fields[${index}].name`,
    value: fieldInput.name,
  });
  if (nameTemplate.type === "error") {
    return nameTemplate;
  }

  const valueTemplate = resolveRequiredTemplate({
    fieldName: `embed.fields[${index}].value`,
    value: fieldInput.value,
  });
  if (valueTemplate.type === "error") {
    return valueTemplate;
  }

  if (
    fieldInput.inline !== undefined &&
    typeof fieldInput.inline !== "boolean"
  ) {
    return toError(`embed.fields[${index}].inline must be a boolean.`);
  }

  return toSuccess({
    inline: fieldInput.inline ?? false,
    name: nameTemplate.value,
    value: valueTemplate.value,
  });
};

const resolveEmbedFields = (
  value: unknown
): ParseResult<RssEmbedFieldStyle[]> => {
  if (value === undefined || value === null) {
    return toSuccess([]);
  }

  if (!Array.isArray(value)) {
    return toError("embed.fields must be an array.");
  }

  if (value.length > MAX_EMBED_FIELDS) {
    return toError(
      `embed.fields cannot contain more than ${MAX_EMBED_FIELDS} fields.`
    );
  }

  const fields: RssEmbedFieldStyle[] = [];
  for (const [index, item] of value.entries()) {
    const field = resolveEmbedField({
      index,
      value: item,
    });

    if (field.type === "error") {
      return field;
    }

    fields.push(field.value);
  }

  return toSuccess(fields);
};

const resolveHexColor = (color: string | null): ParseResult<string | null> => {
  if (!color) {
    return toSuccess<string | null>(null);
  }

  const match = HEX_COLOR_PATTERN.exec(color);
  if (!match?.[1]) {
    return toError("embed.color must be a valid 6-digit hex color.");
  }

  return toSuccess(`#${match[1]}`);
};

const resolveFormat = (value: unknown): ParseResult<RssMessageFormat> => {
  if (value === undefined || value === null) {
    return toSuccess("embed");
  }

  if (typeof value !== "string") {
    return toError("format must be a string.");
  }

  const normalized = value.trim() as RssMessageFormat;
  if (!RSS_MESSAGE_FORMAT_VALUES.includes(normalized)) {
    return toError(
      `format must be one of: ${RSS_MESSAGE_FORMAT_VALUES.join(", ")}.`
    );
  }

  return toSuccess(normalized);
};

const resolveEmbedStyle = (value: unknown): ParseResult<RssEmbedStyle> => {
  if (value === undefined || value === null) {
    return toSuccess(DEFAULT_EMBED_STYLE);
  }

  if (!isRecord(value)) {
    return toError("embed must be an object.");
  }

  const input = value as RssEmbedStyleInput;

  const title = resolveTemplate({
    fieldName: "embed.title",
    required: false,
    value: input.title,
  });
  if (title.type === "error") {
    return title;
  }

  const description = resolveTemplate({
    fieldName: "embed.description",
    required: false,
    value: input.description,
  });
  if (description.type === "error") {
    return description;
  }

  const url = resolveTemplate({
    fieldName: "embed.url",
    required: false,
    value: input.url,
  });
  if (url.type === "error") {
    return url;
  }

  const author = resolveTemplate({
    fieldName: "embed.author",
    required: false,
    value: input.author,
  });
  if (author.type === "error") {
    return author;
  }

  const authorIconUrl = resolveTemplate({
    fieldName: "embed.authorIconUrl",
    required: false,
    value: input.authorIconUrl,
  });
  if (authorIconUrl.type === "error") {
    return authorIconUrl;
  }

  const authorUrl = resolveTemplate({
    fieldName: "embed.authorUrl",
    required: false,
    value: input.authorUrl,
  });
  if (authorUrl.type === "error") {
    return authorUrl;
  }

  const thumbnailUrl = resolveTemplate({
    fieldName: "embed.thumbnailUrl",
    required: false,
    value: input.thumbnailUrl,
  });
  if (thumbnailUrl.type === "error") {
    return thumbnailUrl;
  }

  const imageUrl = resolveTemplate({
    fieldName: "embed.imageUrl",
    required: false,
    value: input.imageUrl,
  });
  if (imageUrl.type === "error") {
    return imageUrl;
  }

  const footer = resolveTemplate({
    fieldName: "embed.footer",
    required: false,
    value: input.footer,
  });
  if (footer.type === "error") {
    return footer;
  }

  const footerIconUrl = resolveTemplate({
    fieldName: "embed.footerIconUrl",
    required: false,
    value: input.footerIconUrl,
  });
  if (footerIconUrl.type === "error") {
    return footerIconUrl;
  }

  const fields = resolveEmbedFields(input.fields);
  if (fields.type === "error") {
    return fields;
  }

  const colorTemplate = resolveTemplate({
    fieldName: "embed.color",
    required: false,
    value: input.color,
  });
  if (colorTemplate.type === "error") {
    return colorTemplate;
  }

  const color = resolveHexColor(colorTemplate.value);
  if (color.type === "error") {
    return color;
  }

  if (input.timestamp !== undefined && typeof input.timestamp !== "boolean") {
    return toError("embed.timestamp must be a boolean.");
  }

  return toSuccess({
    author: author.value,
    authorIconUrl: authorIconUrl.value,
    authorUrl: authorUrl.value,
    color: color.value,
    description: description.value,
    fields: fields.value,
    footer: footer.value,
    footerIconUrl: footerIconUrl.value,
    imageUrl: imageUrl.value,
    thumbnailUrl: thumbnailUrl.value,
    timestamp: input.timestamp ?? DEFAULT_EMBED_STYLE.timestamp,
    title: title.value,
    url: url.value,
  });
};

const cloneStyle = (style: RssMessageStyle): RssMessageStyle => ({
  embed: style.embed
    ? {
        ...style.embed,
        fields: style.embed.fields.map((field) => ({ ...field })),
      }
    : null,
  format: style.format,
  template: style.template,
});

export const resolveDefaultStyle = (
  format: RssMessageFormat
): RssMessageStyle => cloneStyle(DEFAULT_STYLE_BY_FORMAT[format]);

const resolveStyleFromInput = ({
  formatOverride,
  parsed,
}: {
  formatOverride?: RssMessageFormat | null;
  parsed: RssMessageStyleInput;
}): ParseRssMessageStyleResult => {
  const resolvedFormat = resolveFormat(parsed.format);
  if (resolvedFormat.type === "error") {
    return resolvedFormat;
  }

  const format = formatOverride ?? resolvedFormat.value;
  const template = resolveTemplate({
    fieldName: "template",
    required: false,
    value: parsed.template,
  });
  if (template.type === "error") {
    return template;
  }

  if (format === "embed") {
    const embed = resolveEmbedStyle(parsed.embed);
    if (embed.type === "error") {
      return embed;
    }

    return toSuccess({
      embed: embed.value,
      format,
      template: template.value,
    });
  }

  return toSuccess({
    embed: null,
    format,
    template: template.value ?? DEFAULT_MESSAGE_TEMPLATES[format],
  });
};

export const parseRssMessageStyle = ({
  formatOverride,
  styleJson,
}: {
  formatOverride?: RssMessageFormat | null;
  styleJson?: string | null;
}): ParseRssMessageStyleResult => {
  const trimmedStyleJson = styleJson?.trim();
  if (!trimmedStyleJson) {
    const fallbackFormat = formatOverride ?? "embed";
    return toSuccess(resolveDefaultStyle(fallbackFormat));
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(trimmedStyleJson);
  } catch {
    return toError("style must be valid JSON.");
  }

  if (!isRecord(parsedJson)) {
    return toError("style must be a JSON object.");
  }

  return resolveStyleFromInput({
    formatOverride,
    parsed: parsedJson,
  });
};

export const parseStoredRssMessageStyle = (
  styleJson: string
): ParseRssMessageStyleResult =>
  parseRssMessageStyle({
    styleJson,
  });

export const serializeRssMessageStyle = (style: RssMessageStyle): string =>
  JSON.stringify(style);

export const resolveDefaultTemplateForFormat = (
  format: Exclude<RssMessageFormat, "embed">
): string => DEFAULT_MESSAGE_TEMPLATES[format];

export const renderRssTemplate = (
  template: string,
  values: RssTemplateValues
): string =>
  template.replaceAll(
    TEMPLATE_TOKEN_PATTERN,
    (_match: string, key: string): string => {
      if (!SUPPORTED_TEMPLATE_PLACEHOLDERS.has(key as TemplatePlaceholder)) {
        return "";
      }

      return values[key as TemplatePlaceholder] ?? "";
    }
  );
