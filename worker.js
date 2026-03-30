/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * Using HF Router API with correct format
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

    let modelId = url.pathname.replace(/^\//, '');
    
    if (!modelId || modelId === 'favicon.ico') {
      return new Response('OK', { status: 200 });
    }

    // Get API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    let apiKey = '';
    
    if (authHeader) {
      // Keep full Bearer format
      apiKey = authHeader;
    } else if (env.HF_TOKEN) {
      apiKey = `Bearer ${env.HF_TOKEN}`;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get request body
    const requestBody = await request.text();
    let bodyObj = {};
    try {
      bodyObj = requestBody ? JSON.parse(requestBody) : {};
    } catch (e) {
      bodyObj = {};
    }
    
    const inputs = bodyObj.inputs || bodyObj.input || 'Hello';
    
    // Use HF Router API - CORRECT FORMAT with /models/ prefix
    // https://router.huggingface.co/models/{model_id}
    const hfUrl = `https://router.huggingface.co/models/${modelId}`;
    
    const hfBody = {
      inputs: inputs,
      parameters: {
        max_new_tokens: 50,
        temperature: 0.7,
        return_full_text: false
      }
    };

    try {
      const hfResponse = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hfBody)
      });

      const responseText = await hfResponse.text();
      
      return new Response(responseText, {
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