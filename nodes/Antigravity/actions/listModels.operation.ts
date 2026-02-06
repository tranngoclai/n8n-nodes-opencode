import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeProperties,
} from 'n8n-workflow';
import { fetchAvailableModels, getProjectId } from '../transport/antigravity.api';
import { getModelFamily } from '../constants';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

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
      const dataRecord = asRecord(data);
      const modelsRecord = isRecord(dataRecord.models) ? dataRecord.models : {};
      const models = Object.entries(modelsRecord)
        .filter(([id]) => getModelFamily(id) === 'gemini')
        .map(([id, model]) => {
          const modelRecord = asRecord(model);
          const family = getModelFamily(id);
          return {
            id,
            displayName: typeof modelRecord.displayName === 'string' ? modelRecord.displayName : id,
            family,
            quotaInfo: modelRecord.quotaInfo ?? null,
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
