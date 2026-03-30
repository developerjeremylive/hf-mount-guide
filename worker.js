/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * Try HF Spaces Inference Endpoints
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
      return new Response(JSON.stringify({ status: 'alive' }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get API key
    const authHeader = request.headers.get('Authorization');
    let apiKey = authHeader || (env.HF_TOKEN ? `Bearer ${env.HF_TOKEN}` : '');

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
    
    const inputs = bodyObj.inputs || bodyObj.prompt || 'Hello';
    
    // Try the new HF Inference API format
    // According to HF docs, the new format is to use the /tasks/endpoint
    // Let's try the chat/completion format
    
    const hfUrl = 'https://api.openai.com/v1/chat/completions';
    
    // Actually, for HF models let's use the correct endpoint
    // The new HF Inference API uses this format:
    const hfEndpoint = `https://router.huggingface.co/${modelId}`;
    
    const hfBody = {
      inputs: inputs,
      parameters: {
        max_new_tokens: bodyObj.parameters?.max_new_tokens || 50,
        temperature: bodyObj.parameters?.temperature || 0.7,
        top_p: 0.95,
        do_sample: true
      }
    };

    try {
      const hfResponse = await fetch(hfEndpoint, {
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