/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * Direct HF Inference API
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

    // Normalize model ID - add org prefix for common models
    const modelMap = {
      'gpt2': 'openai-community/gpt2',
      'gpt2-medium': 'gpt2-medium',
      'gpt2-large': 'gpt2-large',
      'llama-3.2-1b': 'meta-llama/Llama-3.2-1B',
      'llama-3.2-1b-instruct': 'meta-llama/Llama-3.2-1B-Instruct',
      'llama-3.1-8b': 'meta-llama/Llama-3.1-8B',
      'llama-3.1-8b-instruct': 'meta-llama/Llama-3.1-8B-Instruct',
    };
    
    // Check if model needs normalization
    if (modelMap[modelId.toLowerCase()]) {
      modelId = modelMap[modelId.toLowerCase()];
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

    // Parse request body
    const requestBody = await request.text();
    let bodyObj = {};
    try {
      bodyObj = requestBody ? JSON.parse(requestBody) : {};
    } catch (e) {
      bodyObj = {};
    }
    
    const inputs = bodyObj.inputs || bodyObj.prompt || 'Hello';
    
    // Use the serverless inference API
    const hfUrl = `https://router.huggingface.co/models/${modelId}`;
    
    const hfBody = {
      inputs: inputs,
      parameters: {
        max_new_tokens: bodyObj.parameters?.max_new_tokens || 100,
        temperature: bodyObj.parameters?.temperature || 0.7,
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
      
      // Return the response with CORS headers
      return new Response(responseText, {
        status: hfResponse.status,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Length': responseText.length
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};