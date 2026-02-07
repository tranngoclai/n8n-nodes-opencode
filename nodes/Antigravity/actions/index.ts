import * as generate from './generate.operation';
import * as generateImage from './generateImage.operation';
import * as listModels from './listModels.operation';

export const descriptions = [
  ...generate.description,
  ...generateImage.description,
  ...listModels.description,
];

export const operations = {
  generate,
  generateImage,
  listModels,
};
