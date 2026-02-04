import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { fetchAvailableModels, getModelFamily } from '../transport/antigravity.api';

function normalizeToken(value: unknown): string | null {
  if (typeof value === 'string') return value.toLowerCase();
  return null;
}

function readModalities(model: any): string[] {
  const candidates: unknown[] = [
    model?.modalities,
    model?.inputModalities,
    model?.supportedInputModalities,
    model?.supportedInputTypes,
    model?.inputTypes,
    model?.supportedInputs,
    model?.supportedInput,
    model?.capabilities?.input,
    model?.capabilities?.inputModalities,
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

function isTextModel(id: string, model: any): boolean {
  const modalities = readModalities(model);
  if (modalities.length) {
    return modalities.includes('text');
  }

  const typeToken = normalizeToken(model?.type) || normalizeToken(model?.inputType);
  if (typeToken) {
    return typeToken.includes('text');
  }

  const modelToken =
    normalizeToken(model?.modelType) ||
    normalizeToken(model?.capabilities?.type) ||
    normalizeToken(model?.capabilities?.modelType);
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
  const models = Object.entries((data as any)?.models || {})
    .filter(([id, model]: [string, any]) => !textOnly || isTextModel(id, model))
    .filter(([id]) => getModelFamily(id) === 'gemini')
    .map(([id]: [string, any]) => ({ name: id, value: id }));
  return models;
}
