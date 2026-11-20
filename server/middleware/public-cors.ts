/// CORS para la API pública que consume cowhub-book (otro origen/puerto).
/// Solo aplica a /api/public/**; el resto de la API sigue igual.
export default defineEventHandler((event) => {
  const path = event.path ?? '';
  if (!path.startsWith('/api/public/')) return;

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });

  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204;
    return '';
  }
});
