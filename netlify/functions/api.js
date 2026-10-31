const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');

// Ensure NETLIFY runtime flag is set before loading the app
process.env.NETLIFY = 'true';

const app = require('../../server');

const expressHandler = serverless(app);

function getApiPath(event) {
  const requestPath = event.path || new URL(event.rawUrl).pathname;
  let apiPath = requestPath.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '') || '/';
  if (!apiPath.startsWith('/api/')) {
    apiPath = `/api${apiPath === '/' ? '' : apiPath}`;
  }
  return apiPath;
}

exports.handler = async (event, context) => {
  try {
    connectLambda(event);
  } catch (err) {
    console.warn('connectLambda warning:', err.message);
  }

  let normalizedEvent = { ...event };
  if (normalizedEvent.isBase64Encoded && typeof normalizedEvent.body === 'string') {
    try {
      normalizedEvent.body = Buffer.from(normalizedEvent.body, 'base64').toString('utf8');
      normalizedEvent.isBase64Encoded = false;
    } catch (e) {
      console.warn('Failed to decode base64 body:', e.message);
    }
  }

  const path = getApiPath(normalizedEvent);
  const rawUrl = new URL(
    normalizedEvent.rawUrl || `https://${normalizedEvent.headers?.host || 'localhost'}${normalizedEvent.path || '/'}`
  );
  rawUrl.pathname = path;

  return expressHandler({ ...normalizedEvent, path, rawUrl: rawUrl.toString() }, context);
};
