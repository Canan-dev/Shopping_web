const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
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
  if (process.env.NETLIFY === 'true') {
    connectLambda(event);
  }

  const path = getApiPath(event);
  const rawUrl = new URL(
    event.rawUrl || `https://${event.headers.host || 'localhost'}${event.path || '/'}`
  );
  rawUrl.pathname = path;

  return expressHandler({ ...event, path, rawUrl: rawUrl.toString() }, context);
};
