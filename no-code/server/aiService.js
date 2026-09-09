const DEFAULT_BASE_URL = 'https://polza.ai/api/v1';

const PRESETS = {
  website: {
    title: 'Структура сайта',
    instructions:
      'Ты senior UX strategist и no-code product designer. Помогай проектировать понятные сайты и лендинги. Давай конкретную структуру блоков, CTA, смыслы, тексты, UX-логику и рекомендации по no-code реализации. Отвечай на русском, без воды, с практическими шагами.',
  },
  uxAudit: {
    title: 'UX-аудит',
    instructions:
      'Ты UX/UI-аудитор. Анализируй интерфейсы, лендинги и пользовательские сценарии. Находи проблемы в структуре, визуальной иерархии, доверии, CTA, адаптиве и конверсии. Давай список проблем, почему это важно и как исправить.',
  },
  copy: {
    title: 'Тексты для лендинга',
    instructions:
      'Ты UX-copywriter и маркетолог. Пиши ясные тексты для сайтов, лендингов, портфолио и услуг. Делай сильные заголовки, подзаголовки, преимущества, CTA и блоки доверия. Стиль: понятно, современно, без канцелярита.',
  },
  caseStudy: {
    title: 'Оформление кейса',
    instructions:
      'Ты product designer и редактор портфолио. Помогай превращать проект в сильный кейс: задача, контекст, роль, процесс, решения, результат, выводы. Структурируй так, чтобы кейс можно было показать работодателю, клиенту или на Behance.',
  },
  nocode: {
    title: 'No-code план',
    instructions:
      'Ты no-code архитектор. Помогай выбирать инструменты, проектировать функционал, строить MVP, описывать данные, интеграции, формы, CMS, аналитику и деплой. Учитывай, что пользователь может быть новичком.',
  },
  marketplace: {
    title: 'Marketplace / WB',
    instructions:
      'Ты маркетплейс-аналитик и специалист по Wildberries/Ozon. Помогай анализировать карточки, конкурентов, SEO, визуал, рекламу, конверсию, юнит-экономику и план роста. Отвечай структурно и практически.',
  },
};

function createHttpError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function safeString(value, maxLength = 4000) {
  return String(value || '').trim().slice(0, maxLength);
}

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}${path}`;
}

function getApiKey() {
  return process.env.OPENAI_API_KEY;
}

function getBaseUrl() {
  return process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
}

function buildInstructions({ presetId, outputFormat, tone }) {
  const preset = PRESETS[presetId] || PRESETS.website;
  const format = safeString(outputFormat, 200) || 'структурированный ответ';
  const selectedTone = safeString(tone, 200) || 'профессиональный и понятный';

  return [
    preset.instructions,
    `Режим работы: ${preset.title}.`,
    `Формат результата: ${format}.`,
    `Тон: ${selectedTone}.`,
    'Не придумывай несуществующие факты о пользователе. Если данных не хватает, явно напиши, какие данные нужно уточнить.',
    'Пиши так, чтобы результат можно было сразу использовать в проекте Nexus.',
  ].join('\n');
}

function buildInput({ prompt, context }) {
  const userPrompt = safeString(prompt, 8000);
  const userContext = safeString(context, 6000);

  if (!userPrompt) {
    throw createHttpError(400, 'Напиши запрос для нейросети. Поле запроса пустое.');
  }

  return [
    userContext ? `Контекст проекта:\n${userContext}` : '',
    `Запрос пользователя:\n${userPrompt}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function extractTextFromChatCompletion(data) {
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

function normalizeModel(model) {
  const id = model?.id || model?.name || model?.model || '';

  if (!id) return null;

  return {
    id,
    name: model?.name || model?.display_name || model?.title || id,
    owner: model?.owned_by || model?.provider || '',
    created: model?.created || null,
  };
}

export async function getAvailableModels() {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw createHttpError(
      500,
      'OPENAI_API_KEY не найден. В .env добавь OPENAI_API_KEY=твой_ключ от PolzaAI.'
    );
  }

  const response = await fetch(joinUrl(getBaseUrl(), '/models'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const rawText = await response.text();
  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || rawText || 'Не удалось получить список моделей.';
    throw createHttpError(response.status, message, data?.error || data || null);
  }

  const rawModels = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : [];

  const models = rawModels
    .map(normalizeModel)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    provider: 'polzaai',
    models,
  };
}

export async function createOpenAIAnswer(payload = {}) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw createHttpError(
      500,
      'OPENAI_API_KEY не найден. В .env добавь OPENAI_API_KEY=твой_ключ от PolzaAI.'
    );
  }

  const model = safeString(payload.model, 160);

  if (!model) {
    throw createHttpError(400, 'Выбери модель перед отправкой запроса.');
  }

  const instructions = buildInstructions(payload);
  const input = buildInput(payload);
  const maxOutputTokens = Number(payload.maxOutputTokens || process.env.OPENAI_MAX_OUTPUT_TOKENS || 1600);

  const requestBody = {
    model,
    messages: [
      {
        role: 'system',
        content: instructions,
      },
      {
        role: 'user',
        content: input,
      },
    ],
    max_tokens: Number.isFinite(maxOutputTokens)
      ? Math.min(Math.max(maxOutputTokens, 300), 5000)
      : 1600,
    temperature: 0.7,
  };

  const response = await fetch(joinUrl(getBaseUrl(), '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const rawText = await response.text();
  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || rawText || 'PolzaAI API вернул ошибку.';
    throw createHttpError(response.status, message, data?.error || data || null);
  }

  const answer = extractTextFromChatCompletion(data);

  if (!answer) {
    throw createHttpError(
      502,
      'Ответ получен, но текст результата не найден. Попробуй другую модель или запрос.',
      data
    );
  }

  return {
    answer,
    provider: 'polzaai',
    model: data?.model || model,
    responseId: data?.id || null,
    usage: data?.usage || null,
  };
}

export function formatError(error) {
  return {
    error: true,
    message: error?.message || 'Неизвестная ошибка сервера.',
    status: error?.status || 500,
    details: error?.details || null,
  };
}