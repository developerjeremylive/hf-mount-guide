# hf-mount Guide - Cloudflare Worker

Este repositorio incluye un **Cloudflare Worker** que funciona como proxy para evitar restricciones CORS al usar la API de Hugging Face desde el navegador.

## 🚀 Deployment rápido

### Opción 1: Cloudflare Dashboard (Recomendado)

1. Ve a https://dash.cloudflare.com → **Workers & Pages**
2. Click en **Create application** → **Create Worker**
3. Nombre: `hf-mount-guide-proxy`
4. Editor: Copia el contenido de `worker.js` y pégalo
5. Click **Save and Deploy**

### Opción 2: Wrangler CLI

```bash
# Instala wrangler
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler deploy
```

## 🔐 Configurar API Key

### Desde Dashboard:
1. Ve a **Workers** → Tu Worker → **Settings**
2. **Variables** → **Add variable**
3. Name: `HF_TOKEN`
4. Value: Tu API key de Hugging Face (hf_xxxxx)

### Desde CLI:
```bash
wrangler secret put HF_TOKEN
# Ingresa tu API key cuando te lo pida
```

## 📡 Uso del Proxy

**URL base:** `https://tu-worker.tu-usuario.workers.dev`

**Ejemplo:**
```
POST https://tu-worker.tu-usuario.workers.dev/meta-llama/Llama-3.2-1B-Instruct
Headers: Authorization: Bearer hf_tu_api_key
Body: {
  "inputs": "Hola, ¿cómo estás?",
  "parameters": {
    "max_new_tokens": 256,
    "temperature": 0.7
  }
}
```

## 🔗 Integrar con el Frontend

1. Edita `js/playground.js`
2. Busca la línea: `const PROXY_URL = null;`
3. Cambia a tu URL del worker:
   ```javascript
   const PROXY_URL = 'https://hf-mount-guide-proxy.tu-usuario.workers.dev';
   ```

## 📁 Archivos

- `worker.js` - Código del Cloudflare Worker
- `wrangler.toml` - Configuración de Wrangler
- `package.json` - Dependencias del proyecto
- `index.html` - Landing page con Playground
- `js/` - Scripts del frontend

## ⚠️ Notas

- El Worker permite requests CORS desde cualquier origen (`*`)
- La API key se guarda como **secret** (no expuesta en código)
- El proxy reenvía requests a `api-inference.huggingface.co`
- Los parámetros se sanean y agregan valores por defecto

## 📄 License

MIT - Jeremy Live