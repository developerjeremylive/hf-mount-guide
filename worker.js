/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * Simple debug version
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

    // Get API key - from header only for now
    const authHeader = request.headers.get('Authorization');
    let apiKey = '';
    
    if (authHeader) {
      // Extract the key after "Bearer "
      const parts = authHeader.split('Bearer ');
      apiKey = parts.length > 1 ? parts[1].trim() : authHeader;
    }
    
    // If no header, try environment
    if (!apiKey && env.HF_TOKEN) {
      apiKey = env.HF_TOKEN;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: 'No API key provided',
        hasAuthHeader: !!authHeader,
        hasEnvKey: !!env.HF_TOKEN
      }), {
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
    
    const inputs = bodyObj.inputs || 'Hello';
    
    // Make request to HF Inference API directly (not router)
    // Using the official inference endpoint
    const hfUrl = `https://api-inference.huggingface.co/models/${modelId}`;
    
    try {
      const hfResponse = await fetch(hfUrl, {
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

      const responseText = await hfResponse.text();
      
      return new Response(responseText, {
        status: hfResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        hfUrl: hfUrl
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/*
 * This version:
 * 1. Uses api-inference.huggingface.co directly
 * 2. Passes Authorization header as-is (without Bearer)
 * 3. Has debug output
 */