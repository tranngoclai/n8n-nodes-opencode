import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { fetchAvailableModels } from '../transport/antigravity.api';
import { getModelFamily } from '../constants';

type UnknownRecord = Record<string, unknown>;
type ImageCapability = 'supported' | 'unsupported' | 'unknown';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function normalizeToken(value: unknown): string | null {
  if (typeof value === 'string') return value.toLowerCase();
  return null;
}

function toTokens(entry: unknown): string[] {
  if (!entry) return [];
  if (Array.isArray(entry)) {
    return entry.map(value => String(value).toLowerCase());
  }
  if (typeof entry === 'string') {
    return [entry.toLowerCase()];
  }
  if (isRecord(entry)) {
    return Object.entries(entry)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => String(key).toLowerCase());
  }
  return [];
}

function readFirstTokens(candidates: unknown[]): string[] {
  for (const candidate of candidates) {
    const tokens = toTokens(candidate);
    if (tokens.length > 0) return tokens;
  }
  return [];
}

function readModalities(model: UnknownRecord): string[] {
  const capabilities = isRecord(model.capabilities) ? model.capabilities : {};
  return readFirstTokens([
    model.modalities,
    model.inputModalities,
    model.supportedInputModalities,
    model.supportedInputTypes,
    model.inputTypes,
    model.supportedInputs,
    model.supportedInput,
    capabilities.input,
    capabilities.inputModalities,
  ]);
}

function isTextModel(model: UnknownRecord): boolean {
  const modalities = readModalities(model);
  if (modalities.length) {
    return modalities.includes('text');
  }

  const typeToken = normalizeToken(model.type) || normalizeToken(model.inputType);
  if (typeToken) {
    return typeToken.includes('text');
  }

  const modelToken =
    normalizeToken(model.modelType) ||
    normalizeToken((model.capabilities as UnknownRecord | undefined)?.type) ||
    normalizeToken((model.capabilities as UnknownRecord | undefined)?.modelType);
  if (modelToken) {
    return modelToken.includes('text');
  }

  return true;
}

function detectImageCapability(modelId: string, model: UnknownRecord): ImageCapability {
  const capabilities = isRecord(model.capabilities) ? model.capabilities : {};
  const outputTokens = readFirstTokens([
    model.outputModalities,
    model.supportedOutputModalities,
    model.supportedOutputTypes,
    model.outputTypes,
    model.supportedOutputs,
    model.supportedOutput,
    capabilities.output,
    capabilities.outputModalities,
    capabilities.imageGeneration,
  ]);

  if (outputTokens.length > 0) {
    return outputTokens.some(token => token.includes('image')) ? 'supported' : 'unsupported';
  }

  const typeTokens = [
    normalizeToken(model.type),
    normalizeToken(model.modelType),
    normalizeToken(model.outputType),
    normalizeToken(capabilities.type),
    normalizeToken(capabilities.modelType),
  ].filter((token): token is string => typeof token === 'string');

  if (typeTokens.some(token => token.includes('image'))) {
    return 'supported';
  }

  if (typeTokens.some(token => token.includes('text'))) {
    return 'unsupported';
  }

  if (modelId.toLowerCase().includes('image')) {
    return 'supported';
  }

  return 'unknown';
}

export async function getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const resource = this.getCurrentNodeParameter('resource') as string | undefined;
  const textOnly = resource === 'text';
  const imageOnly = resource === 'image';
  const data = await fetchAvailableModels(this);
  const dataRecord = asRecord(data);
  const modelsRecord = isRecord(dataRecord.models) ? dataRecord.models : {};
  const models = Object.entries(modelsRecord)
    .filter(([, model]) => !textOnly || isTextModel(asRecord(model)))
    .filter(([id, model]) => {
      if (!imageOnly) return true;
      return detectImageCapability(id, asRecord(model)) !== 'unsupported';
    })
    .filter(([id]) => getModelFamily(id) === 'gemini')
    .map(([id]) => ({ name: id, value: id }));
  return models;
}
