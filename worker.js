/**
 * hf-mount Guide - Cloudflare Worker Proxy
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
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
        message: 'hf-mount Proxy Worker'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API key - clean it up
    const authHeader = request.headers.get('Authorization');
    let apiKey = null;
    
    // From Authorization header (remove Bearer if present)
    if (authHeader) {
      apiKey = authHeader.replace('Bearer ', '').replace('Bearer', '').trim();
    }
    
    // Fallback to environment
    if (!apiKey && env.HF_TOKEN) {
      apiKey = env.HF_TOKEN;
    }
    
    // From query
    if (!apiKey && url.searchParams.get('key')) {
      apiKey = url.searchParams.get('key');
    }
    
    // Clean up and ensure hf_ prefix
    if (apiKey) {
      apiKey = apiKey.replace('hf_', '').trim();
      apiKey = 'hf_' + apiKey;
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

      // Try router endpoint
      const hfUrl = `https://router.huggingface.co/models/${modelId}`;
      
      const hfResponse = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hfBody)
      });

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

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};