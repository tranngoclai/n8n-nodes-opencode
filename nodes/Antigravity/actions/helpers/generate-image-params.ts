export const IMAGE_SIZE_VALUES = ['1K', '2K'] as const;
export const IMAGE_ASPECT_RATIO_VALUES = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;
export const PERSON_GENERATION_VALUES = ['dont_allow', 'allow_adult', 'allow_all'] as const;

export type ImageSize = (typeof IMAGE_SIZE_VALUES)[number];
export type AspectRatio = (typeof IMAGE_ASPECT_RATIO_VALUES)[number];
export type PersonGeneration = (typeof PERSON_GENERATION_VALUES)[number];

export type ImageGenerationParams = {
  model: string;
  prompt: string;
  imageSize: ImageSize;
  aspectRatio: AspectRatio;
  personGeneration: PersonGeneration;
};

export type AnthropicImageRequest = {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
  response_modalities: ['IMAGE'];
  image_config: {
    image_size: ImageSize;
    aspect_ratio: AspectRatio;
    person_generation: PersonGeneration;
  };
};

export function buildImageGenerationRequest(params: ImageGenerationParams): AnthropicImageRequest {
  return {
    model: params.model,
    messages: [{ role: 'user', content: params.prompt }],
    response_modalities: ['IMAGE'],
    image_config: {
      image_size: params.imageSize,
      aspect_ratio: params.aspectRatio,
      person_generation: params.personGeneration,
    },
  };
}
