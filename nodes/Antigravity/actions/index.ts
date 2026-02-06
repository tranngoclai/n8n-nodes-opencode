import * as generate from './generate.operation';
import * as listModels from './listModels.operation';

export const descriptions = [
  ...generate.description,
  ...listModels.description,
];

export const operations = {
  generate,
  listModels,
};
