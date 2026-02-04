import type { INodeProperties } from 'n8n-workflow';
import { SHOW_GENERATE_OR_LIST } from './constants';

export const commonProperties: INodeProperties[] = [
  {
    displayName: 'Endpoint',
    name: 'endpoint',
    type: 'options',
    options: [
      { name: 'Auto (Prod → Daily)', value: 'auto' },
      { name: 'Prod', value: 'prod' },
      { name: 'Daily', value: 'daily' },
    ],
    default: 'auto',
    displayOptions: SHOW_GENERATE_OR_LIST,
  },
];
