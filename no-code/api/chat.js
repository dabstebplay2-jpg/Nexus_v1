import { createOpenAIAnswer, formatError } from '../server/aiService.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({
      error: true,
      message: 'Метод не поддерживается. Используй POST.',
    });
  }

  try {
    const result = await createOpenAIAnswer(request.body);
    return response.status(200).json(result);
  } catch (error) {
    const formattedError = formatError(error);
    return response.status(formattedError.status || 500).json(formattedError);
  }
}