import type { IDisplayOptions } from 'n8n-workflow';

export const SHOW_GENERATE_TEXT: IDisplayOptions = {
  show: { resource: ['text'], operation: ['generate'] },
};

export const SHOW_GENERATE_IMAGE: IDisplayOptions = {
  show: { resource: ['image'], operation: ['generateImage'] },
};
