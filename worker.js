/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * 
 * Try multiple HF endpoints
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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/favicon.ico') {
      return new Response('Not Found', { status: 404 });
    }

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

    // Get API key
    const authHeader = request.headers.get('Authorization');
    let apiKey = authHeader ? authHeader.replace('Bearer ', '') : env.HF_TOKEN;
    
    if (apiKey && !apiKey.startsWith('hf_')) {
      apiKey = 'hf_' + apiKey;
    }
    
    const queryKey = url.searchParams.get('key');
    if (queryKey) {
      apiKey = queryKey.startsWith('hf_') ? queryKey : 'hf_' + queryKey;
    }
    
    if (!apiKey || apiKey === 'hf_') {
      return new Response(JSON.stringify({ error: 'API Key requerida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const requestBody = await request.text();
      let bodyObj = {};
      try {
        bodyObj = requestBody ? JSON.parse(requestBody) : {};
      } catch (e) {
        bodyObj = {};
      }
      
      const inputs = bodyObj.inputs || bodyObj.input || bodyObj.prompt || '';
      
      const hfBody = {
        inputs: inputs,
        parameters: {
          temperature: bodyObj.parameters?.temperature || 0.7,
          max_new_tokens: Math.min(bodyObj.parameters?.max_new_tokens || 128, 512),
          return_full_text: false,
          do_sample: true,
        }
      };

      // Try multiple HF endpoints
      const endpoints = [
        `https://router.huggingface.co/models/${modelId}`,
        `https://api-inference.huggingface.co/models/${modelId}`,
      ];
      
      let lastError = null;
      
      for (const hfUrl of endpoints) {
        try {
          const hfResponse = await fetch(hfUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(hfBody)
          });

          // If we get a response (not 404), return it
          if (hfResponse.status !== 404) {
            const responseText = await hfResponse.text();
            let responseData;
            try {
              responseData = JSON.parse(responseText);
            } catch (e) {
              responseData = { error: responseText };
            }
            
            return new Response(JSON.stringify(responseData), {
              status: hfResponse.status,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          
          lastError = { url: hfUrl, status: hfResponse.status };
        } catch (e) {
          lastError = { url: hfUrl, error: e.message };
        }
      }
      
      // All endpoints failed
      return new Response(JSON.stringify({ 
        error: `Model not found or access denied. Tried: ${endpoints.join(', ')}`,
        details: lastError
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};