import { apiFetch } from './apiClient';
import {
  demoReadFile,
  demoWriteFile,
  demoPatchFile,
  demoListDirectory,
  getDemoRootPath,
  runDemoTerminalCommand,
} from './demoWorkspace';

const IDE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Lists files and folders in a directory relative to workspace root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: "Use '.' for root." } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Reads file content from the demo workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Creates or overwrites a file in the demo workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description: 'Replace a code block in an existing file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          search_block: { type: 'string' },
          replace_block: { type: 'string' },
        },
        required: ['path', 'search_block', 'replace_block'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Runs a shell command in the demo terminal (mock output).',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_file_in_editor',
      description: 'Open a file in the IDE editor tabs.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
];

function resolveDemoPath(rel) {
  const root = getDemoRootPath();
  const norm = String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  if (!norm || norm === '.') return root;
  if (norm.startsWith(`${root}/`)) return norm;
  return `${root}/${norm}`;
}

async function executeDemoTool(name, args) {
  try {
    if (name === 'list_directory') {
      return await demoListDirectory(args.path || '.');
    }
    if (name === 'read_file') {
      const data = await demoReadFile(resolveDemoPath(args.path));
      return data.content;
    }
    if (name === 'write_file') {
      await demoWriteFile(resolveDemoPath(args.path), args.content || '');
      return `Success: wrote ${args.path}`;
    }
    if (name === 'patch_file') {
      return await demoPatchFile(
        resolveDemoPath(args.path),
        args.search_block,
        args.replace_block
      );
    }
    if (name === 'execute_command') {
      const out = runDemoTerminalCommand(args.command || '');
      return `Exit Code: 0\nSTDOUT:\n${out}\nSTDERR:\n`;
    }
    if (name === 'open_file_in_editor') {
      return `Success: will open ${args.path} in editor.`;
    }
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

function buildDemoSystemPrompt(workspacePath) {
  return (
    'You are an autonomous software engineering agent inside Nexus IDE Web (demo mode).\n' +
    'Files live in the browser (IndexedDB) — use tools to read, patch, and write them.\n' +
    `Demo workspace root: ${workspacePath}\n\n` +
    'INSTRUCTIONS:\n' +
    '1. Use tools to modify the demo project; do not only describe changes.\n' +
    "2. Prefer patch_file for edits; write_file for new files.\n" +
    '3. After creating or editing a file, call open_file_in_editor.\n' +
    '4. Terminal output is simulated (ls, cat, npm test).'
  );
}

/**
 * Client-side agent loop for Vercel demo workspace (cloud inference + local tools).
 */
export async function runDemoIdeAgent({
  model,
  workspacePath,
  directoryContext,
  fileContext,
  chatHistory,
  userPrompt,
}) {
  const messages = [{ role: 'system', content: buildDemoSystemPrompt(workspacePath) }];

  if (directoryContext) {
    messages.push({
      role: 'system',
      content: `Workspace tree and file contents:\n${directoryContext}`,
    });
  }
  if (fileContext) {
    messages.push({ role: 'system', content: `Active open file:\n${fileContext}` });
  }

  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userPrompt });

  const frontendActions = [];
  let billing = null;

  for (let step = 0; step < 12; step += 1) {
    const res = await apiFetch('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        tools: IDE_TOOLS,
        tool_choice: 'auto',
      }),
    });

    if (res.status === 402 || res.status === 429) {
      return { status: 'quota', reply: null, actions: frontendActions, billing };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'AI Agent request failed');
    }

    const data = await res.json();
    if (data.billing) billing = data.billing;

    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('Invalid AI response');

    messages.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls?.length) {
      return {
        status: 'success',
        reply: message.content || '',
        actions: frontendActions,
        billing,
      };
    }

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      let toolArgs = {};
      try {
        toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
      } catch {
        toolArgs = {};
      }

      if (toolName === 'open_file_in_editor' && toolArgs.path) {
        frontendActions.push({ type: 'open_file', path: resolveDemoPath(toolArgs.path) });
      }

      const toolResult = await executeDemoTool(toolName, toolArgs);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
        content: toolResult,
      });
    }
  }

  return {
    status: 'success',
    reply: 'Достигнут лимит шагов агента. Проверьте изменённые файлы в Explorer.',
    actions: frontendActions,
    billing,
  };
}
