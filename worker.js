/**
 * Cloudflare Worker: Reverse Proxy & Shield for Google Apps Script Scheduler
 * Endpoint: https://ward-scheduler-proxy.forsberginventor.workers.dev
 * Target Website: https://129thbookings.pages.dev
 *
 * NOTE: The backend Google Apps Script URL is stored securely as an encrypted secret
 * in Cloudflare Worker Settings (Variables & Secrets -> APPS_SCRIPT_URL).
 * No secret URLs are stored in this file.
 */

// Allowed origins for CORS (your Pages site + localhost for testing)
const ALLOWED_ORIGINS = [
  'https://129thbookings.pages.dev',
  'http://localhost',
  'http://127.0.0.1'
];

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    return origin;
  }
  // Default to primary site origin
  return 'https://129thbookings.pages.dev';
}

export default {
  async fetch(request, env) {
    const corsOrigin = getCorsOrigin(request);

    // Handle CORS preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Google Apps Script Web App URL from encrypted Worker Secret
    const TARGET_URL = env.APPS_SCRIPT_URL;

    if (!TARGET_URL) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Configuration Error: Missing APPS_SCRIPT_URL secret in Cloudflare Worker settings.'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': corsOrigin
          }
        }
      );
    }

    const url = new URL(request.url);
    const forwardUrl = new URL(TARGET_URL);
    forwardUrl.search = url.search;

    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    try {
      let response;

      if (request.method === 'GET') {
        forwardUrl.searchParams.set('ip', clientIP);
        response = await fetch(forwardUrl.toString(), {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Cloudflare-Worker-Scheduler-Proxy'
          }
        });
      } else if (request.method === 'POST') {
        const bodyText = await request.text();
        forwardUrl.searchParams.set('ip', clientIP);

        response = await fetch(forwardUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
            'User-Agent': 'Cloudflare-Worker-Scheduler-Proxy'
          },
          body: bodyText,
          redirect: 'follow'
        });
      } else {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const responseData = await response.text();

      return new Response(responseData, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Cache-Control': 'no-store'
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: 'Proxy Gateway Error: ' + err.message }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': corsOrigin
          }
        }
      );
    }
  }
};
