import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeProperties,
} from 'n8n-workflow';
import { fetchAvailableModels, getModelFamily, getProjectId } from '../transport/antigravity.api';

export const description: INodeProperties[] = [];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const getParam = <T,>(name: string, fallback: T) => this.getNodeParameter(name, i, fallback) as T;

    try {
      const endpointPreference = getParam<string>('endpoint', 'auto');
      const projectId = await getProjectId(this, endpointPreference);
      const data = await fetchAvailableModels(this, endpointPreference, projectId);
      const models = Object.entries((data as any)?.models || {}).map(([id, model]: [string, any]) => {
        const family = getModelFamily(id);
        return {
          id,
          displayName: model?.displayName || id,
          family,
          quotaInfo: model?.quotaInfo || null,
        };
      });

      for (const model of models) {
        returnData.push({ json: model });
      }
    } catch (error) {
      if (error instanceof NodeApiError || error instanceof NodeOperationError) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      throw new NodeOperationError(this.getNode(), err);
    }
  }

  return [returnData];
}
