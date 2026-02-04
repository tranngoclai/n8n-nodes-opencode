import type { IDisplayOptions } from 'n8n-workflow';

export const SHOW_GENERATE: IDisplayOptions = { show: { resource: ['text'], operation: ['generate'] } };
export const SHOW_GENERATE_WEB_SEARCH: IDisplayOptions = {
  show: { resource: ['text'], operation: ['generate'] },
};
export const SHOW_GENERATE_OR_LIST: IDisplayOptions = { show: { operation: ['generate', 'listModels'] } };
