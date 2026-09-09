import { getAvailableModels, formatError } from '../server/aiService.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({
      error: true,
      message: 'Метод не поддерживается. Используй GET.',
    });
  }

  try {
    const result = await getAvailableModels();
    return response.status(200).json(result);
  } catch (error) {
    const formattedError = formatError(error);
    return response.status(formattedError.status || 500).json(formattedError);
  }
}