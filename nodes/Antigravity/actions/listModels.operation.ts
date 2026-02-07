import {
  NodeApiError,
  NodeOperationError,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeProperties,
} from 'n8n-workflow';
import { fetchAvailableModels, getProjectId } from '../transport/antigravity.api';
import { getModelFamily } from '../constants';
import { asRecord, isRecord } from './helpers/object';

export const description: INodeProperties[] = [];

export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const projectId = await getProjectId(this);
      const data = await fetchAvailableModels(this, projectId);
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
