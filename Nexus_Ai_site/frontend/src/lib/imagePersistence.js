const MAX_FETCH_BYTES = 4_500_000;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Стабильный src для чата и артефактов (внешние URL Polza.ai часто протухают). */
export function hasPersistedImageData(img) {
  const d = img?.dataUrl || img?.data_url;
  if (typeof d === 'string' && d.startsWith('data:')) return true;
  return typeof img?.url === 'string' && img.url.startsWith('data:');
}

export async function persistImageRef(img) {
  if (!img) return null;
  const existing = img.dataUrl || img.data_url;
  if (typeof existing === 'string' && existing.startsWith('data:')) {
    return { ...img, dataUrl: existing, url: existing };
  }
  const url = img.url;
  if (!url) return img;
  if (url.startsWith('data:')) {
    return { ...img, dataUrl: url, url };
  }
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return { ...img, url };
    const blob = await res.blob();
    if (blob.size > MAX_FETCH_BYTES) return { ...img, url };
    const dataUrl = await blobToDataUrl(blob);
    return {
      ...img,
      dataUrl,
      url: dataUrl,
      mime: blob.type || img.mime,
    };
  } catch {
    return { ...img, url };
  }
}

export async function persistImageList(images) {
  const list = images || [];
  const out = [];
  for (const img of list) {
    if (hasPersistedImageData(img)) {
      const d = img.dataUrl || img.data_url || img.url;
      out.push({ ...img, dataUrl: d, url: d });
      continue;
    }
    const persisted = await persistImageRef(img);
    if (persisted) out.push(persisted);
  }
  return out;
}

export function imageDisplaySrc(img) {
  if (!img) return '';
  return img.dataUrl || img.url || '';
}
