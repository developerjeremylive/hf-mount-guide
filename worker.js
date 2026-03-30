/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * Debug version - try all HF endpoints
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
      return new Response(JSON.stringify({ 
        status: 'alive',
        message: 'hf-mount worker running'
      }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API key - keep full Bearer format
    const authHeader = request.headers.get('Authorization');
    let apiKey = authHeader || (env.HF_TOKEN ? `Bearer ${env.HF_TOKEN}` : '');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No API key provided' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const requestBody = await request.text();
    let bodyObj = {};
    try {
      bodyObj = requestBody ? JSON.parse(requestBody) : {};
    } catch (e) {
      bodyObj = {};
    }
    
    const inputs = bodyObj.inputs || bodyObj.prompt || 'Hello';
    
    // Try multiple HF endpoints
    const endpoints = [
      `https://router.huggingface.co/models/${modelId}`,
      `https://api-inference.huggingface.co/models/${modelId}`,
      `https://${modelId.replace('/', '-')}.safetensors-infer.hf.space/api/infer`,
    ];
    
    let lastResponse = null;
    let lastError = null;
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: inputs,
            parameters: {
              max_new_tokens: 50,
              temperature: 0.7
            }
          })
        });

        const responseText = await response.text();
        
        // If we get something other than "Not Found" or "Model not found", use it
        if (response.status !== 404 && !responseText.includes('Not Found')) {
          return new Response(responseText, {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        lastResponse = { status: response.status, body: responseText.substring(0, 200) };
      } catch (e) {
        lastError = e.message;
      }
    }
    
    // All endpoints failed - return debug info
    return new Response(JSON.stringify({
      error: 'Model not found or access denied',
      model: modelId,
      triedEndpoints: endpoints,
      lastResponse: lastResponse,
      lastError: lastError,
      hint: 'Make sure: 1) Model name is correct 2) You have access to the model on HF 3) Your API key is valid'
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};