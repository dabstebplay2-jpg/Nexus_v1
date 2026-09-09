const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TEXT_EXT = /\.(txt|md|json|csv|log|xml|yaml|yml|html|css|js|ts|tsx|jsx|py|rb|go|rs|java|kt|sql)$/i;

export const MAX_ATTACHMENTS = 8;
export const MAX_IMAGE_DIM = 2048;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_TEXT = 32000;

export function isImageMime(mime) {
  return IMAGE_MIMES.has((mime || '').toLowerCase());
}

export function isTextLikeFile(file) {
  const mime = (file?.type || '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  return TEXT_EXT.test(file?.name || '');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Не удалось прочитать «${file.name}»`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Не удалось прочитать «${file.name}»`));
    reader.readAsText(file);
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Некорректное изображение'));
    img.src = dataUrl;
  });
}

async function resizeImageDataUrl(dataUrl, maxDim = MAX_IMAGE_DIM) {
  const img = await loadImageElement(dataUrl);
  let { width, height } = img;
  if (width <= maxDim && height <= maxDim) return dataUrl;
  const scale = maxDim / Math.max(width, height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

function dataUrlByteSize(dataUrl) {
  const i = dataUrl.indexOf(',');
  if (i < 0) return dataUrl.length;
  const b64 = dataUrl.slice(i + 1);
  return Math.floor((b64.length * 3) / 4);
}

export async function processAttachmentFile(file) {
  if (!file) throw new Error('Пустой файл');
  const mime = file.type || 'application/octet-stream';
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isImageMime(mime) || (file.type || '').startsWith('image/')) {
    let dataUrl = await readFileAsDataUrl(file);
    dataUrl = await resizeImageDataUrl(dataUrl);
    if (dataUrlByteSize(dataUrl) > MAX_IMAGE_BYTES) {
      throw new Error(`«${file.name}» слишком большое после сжатия (макс. 4 МБ)`);
    }
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return {
      id,
      kind: 'image',
      name: file.name,
      mime: dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
      previewUrl: dataUrl,
      dataBase64: base64,
    };
  }

  if (isTextLikeFile(file)) {
    let text = await readFileAsText(file);
    if (text.length > MAX_FILE_TEXT) {
      text = `${text.slice(0, MAX_FILE_TEXT)}\n… (обрезано)`;
    }
    return {
      id,
      kind: 'file',
      name: file.name,
      mime,
      text,
      previewUrl: null,
    };
  }

  if (mime === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    throw new Error('PDF пока не поддерживается. Сохраните текст или вставьте содержимое вручную.');
  }

  throw new Error(`Формат «${file.name}» не поддерживается. Используйте фото или текстовый файл.`);
}

export async function processAttachmentFiles(fileList, existingCount = 0) {
  const files = Array.from(fileList || []);
  if (existingCount + files.length > MAX_ATTACHMENTS) {
    throw new Error(`Не более ${MAX_ATTACHMENTS} вложений`);
  }
  const out = [];
  for (const file of files) {
    out.push(await processAttachmentFile(file));
  }
  return out;
}

/** Payload для POST /ai/chat/simple/stream */
export function attachmentsToApi(attachments) {
  return (attachments || []).map((a) => {
    if (a.kind === 'image') {
      return {
        kind: 'image',
        name: a.name,
        mime: a.mime,
        data_base64: a.dataBase64,
      };
    }
    return {
      kind: 'file',
      name: a.name,
      mime: a.mime,
      text: a.text,
    };
  });
}

/** Сохранение в истории сообщения (облако — урезанные превью) */
export function attachmentsForStorage(attachments, { forCloud = false } = {}) {
  return (attachments || []).map((a) => {
    if (a.kind === 'image') {
      if (forCloud) {
        return {
          kind: 'image',
          name: a.name,
          mime: a.mime,
          previewUrl: a.previewUrl && a.previewUrl.length < 280_000 ? a.previewUrl : null,
        };
      }
      return {
        kind: 'image',
        name: a.name,
        mime: a.mime,
        previewUrl: a.previewUrl,
        dataBase64: a.dataBase64,
      };
    }
    return {
      kind: 'file',
      name: a.name,
      mime: a.mime,
      text: forCloud ? undefined : a.text,
      textPreview: a.text ? `${a.text.slice(0, 200)}…` : undefined,
    };
  });
}

export function modelAcceptsPhotos(model) {
  if (!model) return false;
  return Boolean(
    model.accepts_photo_analysis ||
      model.accepts_images ||
      model.supports_vision ||
      model.multimodal ||
      model.vision_tier === 'excellent' ||
      model.vision_tier === 'good' ||
      model.vision_tier === 'limited'
  );
}

export function isImageGenModel(model) {
  if (!model) return false;
  return (
    model.category === 'media' ||
    model.vision_tier === 'image_gen' ||
    model.supports_image_gen
  );
}

export function detectImageGenIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim();
  
  const simpleKeywords = ['нарисуй', 'сгенерируй', 'изобрази', 'draw', 'paint'];
  for (const kw of simpleKeywords) {
    if (t.startsWith(kw) || t.includes(' ' + kw)) {
      return true;
    }
  }
  
  const ruKeywords = ['создай', 'сделай'];
  const ruImageNouns = ['картинку', 'изображение', 'фото', 'рисунок', 'иллюстрацию'];
  for (const kw of ruKeywords) {
    for (const noun of ruImageNouns) {
      if (
        t.includes(`${kw} ${noun}`) ||
        t.includes(`${kw} новое ${noun}`) ||
        t.includes(`${kw} новую ${noun}`) ||
        t.includes(`${kw} красивую ${noun}`) ||
        t.includes(`${kw} красивое ${noun}`)
      ) {
        return true;
      }
    }
  }
  
  const enPhrases = [
    'generate image',
    'create image',
    'generate photo',
    'create photo',
    'generate picture',
    'create picture',
    'make a picture',
    'make a photo',
    'make an image',
    'generate art',
    'create art',
  ];
  for (const phrase of enPhrases) {
    if (t.includes(phrase)) {
      return true;
    }
  }

  return false;
}
