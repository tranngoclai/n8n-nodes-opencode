import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { fetchAvailableModels } from '../transport/antigravity.api';

export async function getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const endpointPreference = (this.getCurrentNodeParameter('endpoint') as string) || 'auto';
  const data = await fetchAvailableModels(this, endpointPreference, undefined);
  const models = Object.entries((data as any)?.models || {}).map(([id, model]: [string, any]) => {
    const name = model?.displayName ? `${model.displayName} (${id})` : id;
    return { name, value: id };
  });
  return models;
}
