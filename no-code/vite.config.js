import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createOpenAIAnswer, formatError, getAvailableModels } from './server/aiService.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: 'nexus-local-api',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: true, message: 'Метод не поддерживается. Используй POST.' }));
              return;
            }

            let body = '';

            req.on('data', (chunk) => {
              body += chunk;
            });

            req.on('end', async () => {
              try {
                const payload = body ? JSON.parse(body) : {};
                const result = await createOpenAIAnswer(payload);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (error) {
                const formattedError = formatError(error);

                res.statusCode = formattedError.status || 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(formattedError));
              }
            });
          });

          server.middlewares.use('/api/models', async (req, res) => {
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: true, message: 'Метод не поддерживается. Используй GET.' }));
              return;
            }

            try {
              const result = await getAvailableModels();

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (error) {
              const formattedError = formatError(error);

              res.statusCode = formattedError.status || 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(formattedError));
            }
          });
        },
      },
    ],
  };
});