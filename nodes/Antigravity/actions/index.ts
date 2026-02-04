import * as generate from './generate.operation';
import * as listModels from './listModels.operation';
import { commonProperties } from './common.description';

export const descriptions = [
  ...generate.description,
  ...listModels.description,
  ...commonProperties,
];

export const operations = {
  generate,
  listModels,
};
