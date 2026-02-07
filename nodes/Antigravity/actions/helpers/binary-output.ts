import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { extensionForMimeType, type ExtractedImage } from './generate-output';

export async function prepareGeneratedImagesBinary(
  ctx: IExecuteFunctions,
  images: ExtractedImage[],
): Promise<INodeExecutionData['binary'] | undefined> {
  if (images.length === 0) {
    return undefined;
  }

  const binary: INodeExecutionData['binary'] = {};

  for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
    const image = images[imageIndex];
    const propertyName = images.length === 1 ? 'image' : `image_${imageIndex + 1}`;
    const extension = extensionForMimeType(image.mimeType);
    const fileName = `generated_${imageIndex + 1}.${extension}`;

    binary[propertyName] = await ctx.helpers.prepareBinaryData(
      Buffer.from(image.data, 'base64'),
      fileName,
      image.mimeType,
    );
  }

  return binary;
}
