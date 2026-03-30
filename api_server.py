#!/usr/bin/env python3
"""
hf-mount API Server
Serve a locally mounted HF model via REST API

Requirements:
    pip install flask transformers torch

Usage:
    1. Mount a model: hf-mount start repo openai-community/gpt2 /tmp/gpt2
    2. Run server: python api_server.py
    3. Open http://localhost:5000
"""

import os
import sys
import json
from flask import Flask, request, jsonify, render_template_string

# Check if model path is mounted
MODEL_PATH = os.environ.get('MODEL_PATH', '/tmp/gpt2')

app = Flask(__name__)

# Model and tokenizer (lazy loaded)
model = None
tokenizer = None

def load_model():
    """Load model from mounted path"""
    global model, tokenizer
    
    if model is None:
        print(f"Loading model from {MODEL_PATH}...")
        from transformers import AutoModelForCausalLM, AutoTokenizer
        
        # Load from mounted path - reads on demand!
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForCausalLM.from_pretrained(MODEL_PATH)
        
        print("Model loaded successfully!")
    return model, tokenizer

# HTML Template for the chat interface
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>hf-mount Chat</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: #16213e;
            padding: 15px 20px;
            border-bottom: 1px solid #0f3460;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { font-size: 1.2rem; color: #e94560; }
        .header .model-badge {
            background: #0f3460;
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 0.85rem;
        }
        #chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 12px;
            line-height: 1.5;
        }
        .message.user {
            align-self: flex-end;
            background: #e94560;
            color: white;
        }
        .message.assistant {
            align-self: flex-start;
            background: #16213e;
            border: 1px solid #0f3460;
        }
        .message.system {
            align-self: center;
            background: #0f3460;
            font-size: 0.85rem;
            opacity: 0.8;
        }
        .typing {
            display: flex;
            gap: 4px;
            padding: 12px 16px;
        }
        .typing span {
            width: 8px;
            height: 8px;
            background: #e94560;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }
        .typing span:nth-child(1) { animation-delay: -0.32s; }
        .typing span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }
        .input-area {
            background: #16213e;
            padding: 15px 20px;
            border-top: 1px solid #0f3460;
            display: flex;
            gap: 10px;
        }
        #user-input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid #0f3460;
            border-radius: 8px;
            background: #1a1a2e;
            color: #eee;
            font-size: 1rem;
        }
        #user-input:focus {
            outline: none;
            border-color: #e94560;
        }
        #send-btn {
            padding: 12px 24px;
            background: #e94560;
            border: none;
            border-radius: 8px;
            color: white;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.2s;
        }
        #send-btn:hover { background: #d63447; }
        #send-btn:disabled { background: #555; cursor: not-allowed; }
        .error { color: #ff6b6b; }
        .success { color: #51cf66; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤗 hf-mount Chat</h1>
        <span class="model-badge">{{ model_path }}</span>
    </div>
    <div id="chat-container"></div>
    <div class="input-area">
        <input type="text" id="user-input" placeholder="Escribe tu mensaje..." autocomplete="off">
        <button id="send-btn">Enviar</button>
    </div>

    <script>
        const chatContainer = document.getElementById('chat-container');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');

        function addMessage(content, role) {
            const div = document.createElement('div');
            div.className = `message ${role}`;
            div.textContent = content;
            chatContainer.appendChild(div);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function showTyping() {
            const div = document.createElement('div');
            div.className = 'message assistant typing';
            div.id = 'typing-indicator';
            div.innerHTML = '<span></span><span></span><span></span>';
            chatContainer.appendChild(div);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function hideTyping() {
            const typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();
        }

        async function sendMessage() {
            const message = userInput.value.trim();
            if (!message) return;

            userInput.value = '';
            addMessage(message, 'user');
            sendBtn.disabled = true;

            showTyping();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: message,
                        max_tokens: 150,
                        temperature: 0.7
                    })
                });

                const data = await response.json();
                hideTyping();

                if (data.error) {
                    addMessage('Error: ' + data.error, 'system');
                } else {
                    addMessage(data.response, 'assistant');
                }
            } catch (error) {
                hideTyping();
                addMessage('Error de conexión: ' + error.message, 'system');
            }

            sendBtn.disabled = false;
            userInput.focus();
        }

        sendBtn.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        // Welcome message
        addMessage('¡Hola! Soy un modelo de lenguaje cargado vía hf-mount. Puedo responder preguntas, escribir código, o simplemente charlar.', 'assistant');
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    """Serve the chat interface"""
    return render_template_string(HTML_TEMPLATE, model_path=MODEL_PATH)

@app.route('/api/chat', methods=['POST'])
def chat():
    """Chat endpoint"""
    data = request.get_json()
    message = data.get('message', '')
    max_tokens = data.get('max_tokens', 150)
    temperature = data.get('temperature', 0.7)
    
    if not message:
        return jsonify({'error': 'Mensaje vacío'}), 400
    
    try:
        # Load model if not loaded
        m, t = load_model()
        
        # Generate response
        inputs = t(message, return_tensors='pt')
        
        outputs = m.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=True,
            pad_token_id=t.eos_token_id
        )
        
        response = t.decode(outputs[0], skip_special_tokens=True)
        
        # Remove input from response
        if response.startswith(message):
            response = response[len(message):].strip()
        
        return jsonify({'response': response})
    
    except FileNotFoundError:
        return jsonify({'error': f'Modelo no encontrado en {MODEL_PATH}. ¿Montaste el modelo con hf-mount?'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models', methods=['GET'])
def list_mounted_models():
    """List mounted models"""
    models = []
    if os.path.exists('/tmp'):
        for item in os.listdir('/tmp'):
            path = os.path.join('/tmp', item)
            if os.path.isdir(path):
                # Check if it looks like a HF model
                config_file = os.path.join(path, 'config.json')
                if os.path.exists(config_file):
                    models.append(item)
    
    return jsonify({'mounted': models, 'current': MODEL_PATH})

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    model_loaded = model is not None
    return jsonify({
        'status': 'ok' if model_loaded else 'loading',
        'model_path': MODEL_PATH,
        'model_loaded': model_loaded
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║              hf-mount API Server                          ║
╠═══════════════════════════════════════════════════════════╣
║  Model Path: {MODEL_PATH:<45}║
║  Server:     http://localhost:{port}{' ' * (30 - len(str(port)))}║
║                                                           ║
║  Instructions:                                           ║
║  1. Mount a model:                                       ║
║     hf-mount start repo openai-community/gpt2 /tmp/gpt2 ║
║  2. Run this server: python api_server.py                ║
║  3. Open http://localhost:{port} in browser              ║
╚═══════════════════════════════════════════════════════════╝
""")
    
    app.run(host='0.0.0.0', port=port, debug=True)
