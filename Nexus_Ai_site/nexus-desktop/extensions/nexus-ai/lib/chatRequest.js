/** sync with frontend/src/lib/chatApi.js stream body */
const { collectConversationSources } = require('./collectConversationSources');

function buildStreamBody({
  model,
  messages,
  attachments,
  useWebSearch = false,
  webSearchDepth = 'standard',
  enableThinking = false,
  agentId,
  conversationSources,
}) {
  const body = {
    model,
    messages,
    use_web_search: Boolean(useWebSearch),
    web_search_depth: useWebSearch ? webSearchDepth || 'standard' : 'standard',
    enable_thinking: Boolean(enableThinking),
  };
  if (attachments?.length) body.attachments = attachments;
  if (agentId) body.agent_id = agentId;
  if (conversationSources?.length) body.conversation_sources = conversationSources;
  return body;
}

module.exports = { buildStreamBody, collectConversationSources };
