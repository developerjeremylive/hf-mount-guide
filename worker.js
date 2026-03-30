/**
 * hf-mount Guide - Cloudflare Worker Proxy
 * 
 * Este Worker actúa como proxy para la API de Hugging Face,
 * permitiendo que el frontend evite restricciones CORS.
 * 
 * CONFIGURACIÓN REQUERIDA:
 * 1. Ejecuta: wrangler secret put HF_TOKEN
 * 2. Ingresa tu API key de Hugging Face (hf_xxxxx)
 * 
 * USO:
 * POST https://tu-worker.tu-usuario.workers.dev/meta-llama/Llama-3.2-1B-Instruct
 * {
 *   "inputs": "Tu prompt aquí",
 *   "parameters": { "max_new_tokens": 100 }
 * }
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Solo procesar requests a la raíz o con path
    // Ignorar requests a /favicon, /robots.txt, etc.
    if (url.pathname === '/favicon.ico' || url.pathname === '/robots.txt') {
      return new Response('Not Found', { status: 404 });
    }

    // CORS headers para permitir requests desde cualquier origen
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Extraer el model ID del path
    // Ejemplo: /meta-llama/Llama-3.2-1B-Instruct -> meta-llama/Llama-3.2-1B-Instruct
    let modelId = url.pathname.replace(/^\//, '');
    
    // Si no hay model ID, mostrar info
    if (!modelId) {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'hf-mount Proxy Worker activo',
        usage: 'Haz POST a /[model-id] con {"inputs": "prompt"}',
        example: 'POST /meta-llama/Llama-3.2-1B-Instruct con {"inputs": "Hello"}'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Obtener API key del header o del secret
    const authHeader = request.headers.get('Authorization');
    const apiKey = authHeader ? authHeader.replace('Bearer ', '').replace('hf_', '') : env.HF_TOKEN;
    
    // Si no hay API key, intentar obtener del cuerpo de la request (para compatibilidad)
    if (!apiKey) {
      try {
        const body = await request.clone().json();
        if (body.apiKey) {
          // Usar apiKey del body si está presente
        } else {
          // Buscar en headers
        }
      } catch (e) {}
    }
    
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: 'API Key requerida. Configura HF_TOKEN como secret o pasa ?key=tu_api_key' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Support API key via query parameter for easier testing
    const queryKey = url.searchParams.get('key');
    const finalApiKey = queryKey || apiKey;

    try {
      // Forward request a Hugging Face Inference API
      // Using router.huggingface.co (api-inference is deprecated)
      // Format: https://router.huggingface.co/models/{model_id}
      const hfUrl = `https://router.huggingface.co/models/${modelId}`;
      
      // Get request body
      const requestBody = await request.text();
      
      // Parse y agregar parámetros por defecto si no existen
      let bodyObj = {};
      try {
        bodyObj = requestBody ? JSON.parse(requestBody) : {};
      } catch (e) {
        bodyObj = {};
      }
      
      // Agregar parámetros por defecto
      const hfBody = {
        inputs: bodyObj.inputs || bodyObj.input || '',
        parameters: {
          ...bodyObj.parameters,
          temperature: bodyObj.parameters?.temperature || 0.7,
          max_new_tokens: bodyObj.parameters?.max_new_tokens || bodyObj.parameters?.max_tokens || 256,
          return_full_text: false,
          do_sample: true,
        }
      };

      const hfResponse = await fetch(hfUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer hf_${finalApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(hfBody)
      });

      // Obtener respuesta
      const responseText = await hfResponse.text();
      
      // Intentar parsear como JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { error: responseText };
      }

      // Retornar con CORS headers
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
 * CONFIGURACIÓN EN CLOUDFLARE DASHBOARD:
 * 
 * 1. Ve a: Workers & Pages → Create Worker
 * 2. Nombre: hf-mount-proxy
 * 3. Editor: pega este código
 * 4. Settings → Variables → Add Secret:
 *    - Name: HF_TOKEN
 *    - Value: tu_api_key_de_huggingface (hf_xxxxx)
 * 5. Deploy
 * 
 * O usando CLI:
 * $ wrangler secret put HF_TOKEN
 * > Ingresa tu HF API key
 */