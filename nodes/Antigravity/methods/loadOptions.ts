import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { fetchAvailableModels, getModelFamily } from '../transport/antigravity.api';

type UnknownRecord = Record<string, unknown>;

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

function readModalities(model: UnknownRecord): string[] {
  const capabilities = isRecord(model.capabilities) ? model.capabilities : {};
  const candidates: unknown[] = [
    model.modalities,
    model.inputModalities,
    model.supportedInputModalities,
    model.supportedInputTypes,
    model.inputTypes,
    model.supportedInputs,
    model.supportedInput,
    capabilities.input,
    capabilities.inputModalities,
  ];

  for (const entry of candidates) {
    if (!entry) continue;
    if (Array.isArray(entry)) {
      return entry.map(value => String(value).toLowerCase());
    }
    if (typeof entry === 'string') {
      return [entry.toLowerCase()];
    }
    if (typeof entry === 'object') {
      return Object.entries(entry)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => String(key).toLowerCase());
    }
  }

  return [];
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

export async function getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const endpointPreference = (this.getCurrentNodeParameter('endpoint') as string) || 'auto';
  const resource = this.getCurrentNodeParameter('resource') as string | undefined;
  const textOnly = resource === 'text';
  const data = await fetchAvailableModels(this, endpointPreference, undefined);
  const dataRecord = asRecord(data);
  const modelsRecord = isRecord(dataRecord.models) ? dataRecord.models : {};
  const models = Object.entries(modelsRecord)
    .filter(([, model]) => !textOnly || isTextModel(asRecord(model)))
    .filter(([id]) => getModelFamily(id) === 'gemini')
    .map(([id]) => ({ name: id, value: id }));
  return models;
}
