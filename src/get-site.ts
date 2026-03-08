// Get NTMPI site — hostname-based routing for get.clawpurse.ai
// Serves static files from get/dist/ when the request hostname is get.clawpurse.ai
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GET_ROOT = join(__dirname, '..', 'get', 'dist');

const GET_HOSTNAMES = ['get.clawpurse.ai', 'get.localhost'];

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function isGetHost(request: FastifyRequest): boolean {
  const host = (request.hostname || '').toLowerCase().replace(/:\d+$/, '');
  return GET_HOSTNAMES.includes(host) || host.startsWith('get.');
}

function serveGetFile(filePath: string, reply: FastifyReply): void {
  const fullPath = join(GET_ROOT, filePath);
  
  // Prevent directory traversal
  if (!fullPath.startsWith(GET_ROOT)) {
    reply.code(403).send('Forbidden');
    return;
  }

  if (existsSync(fullPath)) {
    // If it's a directory, look for index.html inside it
    if (statSync(fullPath).isDirectory()) {
      const indexPath = join(fullPath, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        reply.header('Content-Type', 'text/html; charset=utf-8').send(content);
      } else {
        serve404(reply);
      }
      return;
    }

    const ext = extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = readFileSync(fullPath);
    reply.header('Content-Type', contentType).send(content);
  } else {
    // Try adding index.html for paths like /en → /en/index.html
    const indexPath = join(fullPath, 'index.html');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath);
      reply.header('Content-Type', 'text/html; charset=utf-8').send(content);
    } else {
      serve404(reply);
    }
  }
}

function serve404(reply: FastifyReply): void {
  const notFoundPath = join(GET_ROOT, '404.html');
  if (existsSync(notFoundPath)) {
    const content = readFileSync(notFoundPath);
    reply.code(404).header('Content-Type', 'text/html; charset=utf-8').send(content);
  } else {
    reply.code(404).send('Not Found');
  }
}

export async function registerGetSite(server: FastifyInstance): Promise<void> {
  // Check that get/dist exists
  if (!existsSync(GET_ROOT)) {
    console.warn(`[get-site] Warning: ${GET_ROOT} not found. Get site disabled.`);
    console.warn('[get-site] Run "cd get && node build.cjs" to generate it.');
    return;
  }

  console.log(`[get-site] Serving get.clawpurse.ai from ${GET_ROOT}`);

  // Hook into every request — if hostname matches get site, handle it and short-circuit
  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isGetHost(request)) return; // Not a get site request, continue to drip

    // Normalize path
    let urlPath = request.url.split('?')[0]; // strip query string
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    if (urlPath === '') urlPath = '/index.html';

    serveGetFile(urlPath, reply);
  });
}
