/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * 
 * Updated for Hugging Face Router API
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Skip static files
    if (url.pathname === '/favicon.ico' || url.pathname === '/robots.txt') {
      return new Response('Not Found', { status: 404 });
    }

    // Get model ID from path (remove leading slash)
    let modelId = url.pathname.replace(/^\//, '').replace(/^models\//, '');
    
    if (!modelId) {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'hf-mount Proxy Worker',
        usage: 'POST /model-name with {"inputs": "prompt"}'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API key from header or env
    const authHeader = request.headers.get('Authorization');
    let apiKey = authHeader ? authHeader.replace('Bearer ', '') : env.HF_TOKEN;
    
    // Clean up - ensure it has hf_ prefix
    if (apiKey && !apiKey.startsWith('hf_')) {
      apiKey = 'hf_' + apiKey;
    }
    
    // Also check query param
    const queryKey = url.searchParams.get('key');
    if (queryKey) {
      apiKey = queryKey.startsWith('hf_') ? queryKey : 'hf_' + queryKey;
    }
    
    if (!apiKey || apiKey === 'hf_') {
      return new Response(JSON.stringify({ 
        error: 'API Key requerida. Configura HF_TOKEN como secret o pasa ?key=tu_api_key' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      // Get request body
      const requestBody = await request.text();
      
      // Parse body
      let bodyObj = {};
      try {
        bodyObj = requestBody ? JSON.parse(requestBody) : {};
      } catch (e) {
        bodyObj = {};
      }
      
      // Ensure inputs exists
      const inputs = bodyObj.inputs || bodyObj.input || bodyObj.prompt || '';
      
      // Build HF request - use the Inference API format
      // Try router.huggingface.co first
      const hfUrl = `https://router.huggingface.co/models/${modelId}`;
      
      const hfBody = {
        inputs: inputs,
        parameters: {
          temperature: bodyObj.parameters?.temperature || 0.7,
          max_new_tokens: bodyObj.parameters?.max_new_tokens || bodyObj.parameters?.max_tokens || 256,
          return_full_text: false,
          do_sample: bodyObj.parameters?.do_sample ?? true,
        }
      };

      // Make request to HF
      const hfResponse = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(hfBody)
      });

      const responseText = await hfResponse.text();
      
      // Try to parse JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { error: responseText };
      }

      return new Response(JSON.stringify(responseData), {
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

/*
 * CONFIGURATION:
 * 1. Set HF_TOKEN secret in Cloudflare Worker settings
 * 2. Deploy and use
 * 
 * Usage:
 * curl -X POST https://your-worker.workers.dev/gpt2 \
 *   -H "Authorization: Bearer hf_yourkey" \
 *   -d '{"inputs": "Hello"}'
 */