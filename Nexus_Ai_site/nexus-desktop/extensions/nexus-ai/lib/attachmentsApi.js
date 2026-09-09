/** Преобразование вложений из webview → тело POST /ai/chat/simple/stream */
function attachmentsToApi(attachments) {
  return (attachments || []).map((a) => {
    if (a.kind === 'image') {
      return {
        kind: 'image',
        name: a.name,
        mime: a.mime || 'image/jpeg',
        data_base64: a.dataBase64,
      };
    }
    return {
      kind: 'file',
      name: a.name,
      mime: a.mime || 'text/plain',
      text: a.text,
    };
  });
}

module.exports = { attachmentsToApi };
