/**
 * hf-mount Playground Proxy
 * Cloudflare Worker - API Proxy para Hugging Face
 * 
 * Instrucciones:
 * 1. Crea un Worker en Cloudflare Dashboard
 * 2. Copia este código
 * 3. Configura el namespace de Secrets con HF_TOKEN
 * 4. Actualiza la URL en playground.js
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Get model from URL path
    const modelId = url.pathname.replace(/^\//, '');
    
    if (!modelId) {
      return new Response(JSON.stringify({ 
        error: 'Missing model ID. Use /model-name endpoint' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API key from header or env
    const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '') || env.HF_TOKEN;
    
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: 'Missing API Key. Set HF_TOKEN secret or pass Authorization header' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      // Forward request to Hugging Face Inference API
      const hfResponse = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: request.body
      });

      // Get response data
      const data = await hfResponse.json();

      return new Response(JSON.stringify(data), {
        status: hfResponse.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: `Proxy error: ${error.message}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Cloudflare Worker configuration for wrangler.toml:
/*
name = "hf-mount-proxy"
main = "index.js"
compatibility_date = "2023-12-01"

[secrets]
HF_TOKEN = "hf_xxxxx"
*/