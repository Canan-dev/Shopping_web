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

  const path = getApiPath(event);
  const rawUrl = new URL(
    event.rawUrl || `https://${event.headers.host || 'localhost'}${event.path || '/'}`
  );
  rawUrl.pathname = path;

  return expressHandler({ ...event, path, rawUrl: rawUrl.toString() }, context);
};
