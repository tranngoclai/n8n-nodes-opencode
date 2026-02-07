import type { IDataObject } from 'n8n-workflow';
import {
  getArray,
  getNestedRecord,
  getStringProp,
  isRecord,
  type UnknownRecord,
} from './object';

type OutputValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | IDataObject
  | Array<string | number | boolean | null | undefined | object>
  | IDataObject[];

export type ExtractedImage = {
  data: string;
  mimeType: string;
};

export function extractFirstResponseText(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;

  const content = getArray(response.content);
  if (!content.length) return undefined;

  const textParts = content
    .map((block) => {
      if (!isRecord(block)) return undefined;
      const type = getStringProp(block as UnknownRecord, 'type');
      if (type !== 'text') return undefined;
      return getStringProp(block as UnknownRecord, 'text');
    })
    .filter((value): value is string => typeof value === 'string');

  if (!textParts.length) return undefined;
  return textParts.join('');
}

export function extractImagesFromResponse(response: unknown): ExtractedImage[] {
  if (!isRecord(response)) return [];

  return getArray(response.content)
    .map((block) => {
      if (!isRecord(block)) return undefined;
      if (getStringProp(block as UnknownRecord, 'type') !== 'image') return undefined;

      const source = getNestedRecord(block as UnknownRecord, 'source');
      if (getStringProp(source, 'type') !== 'base64') return undefined;

      const data = getStringProp(source, 'data');
      if (!data) return undefined;

      const mimeType = getStringProp(source, 'media_type') ?? 'application/octet-stream';

      return { data, mimeType };
    })
    .filter((image): image is ExtractedImage => image !== undefined);
}

export function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/tiff') return 'tiff';

  const [, subtype] = normalized.split('/');
  if (!subtype) return 'bin';
  return subtype.split('+')[0] || 'bin';
}

export function stripJsonCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!match) {
    return text;
  }
  return match[1].trim();
}

export function buildOutput(
  response: unknown,
  simplifyOutput: boolean,
  outputContentAsJson: boolean,
): IDataObject {
  let parsedContent: OutputValue | undefined;
  let jsonParseStatus: 'success' | 'failed' | 'disabled' = 'disabled';

  if (outputContentAsJson) {
    const text = stripJsonCodeFences(extractFirstResponseText(response) ?? '');
    try {
      parsedContent = JSON.parse(text) as OutputValue;
      jsonParseStatus = 'success';
    } catch {
      jsonParseStatus = 'failed';
    }
  }

  if (simplifyOutput) {
    if (outputContentAsJson) {
      return { response: parsedContent, jsonParseStatus };
    }

    const text = extractFirstResponseText(response) ?? '';
    return { response: text, jsonParseStatus };
  }

  if (isRecord(response)) {
    if (outputContentAsJson) {
      return { ...(response as IDataObject), content: parsedContent, jsonParseStatus };
    }
    return { ...(response as IDataObject), jsonParseStatus };
  }

  let responseValue: OutputValue;
  if (response === null || response === undefined) {
    responseValue = response;
  } else if (Array.isArray(response)) {
    responseValue = response as Array<string | number | boolean | null | undefined | object>;
  } else {
    const primitive = typeof response;
    if (primitive === 'string' || primitive === 'number' || primitive === 'boolean') {
      responseValue = response;
    } else if (primitive === 'object') {
      responseValue = response as object;
    } else {
      responseValue = String(response);
    }
  }

  return { response: responseValue, jsonParseStatus };
}
