// hf-mount Playground - Chat with HF Models
// Uses Hugging Face Inference API with CORS workaround

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const PG_STATE = {
        isOpen: false,
        isSettingsOpen: false,
        apiKey: localStorage.getItem('hf_api_key') || '',
        selectedModel: localStorage.getItem('hf_selected_model') || null,
        modelList: [],
        chats: JSON.parse(localStorage.getItem('hf_chats') || '[]'),
        currentChatId: localStorage.getItem('hf_current_chat_id') || null,
        isStreaming: false,
        config: {
            temperature: parseFloat(localStorage.getItem('hf_temperature') || '0.7'),
            maxTokens: parseInt(localStorage.getItem('hf_max_tokens') || '512')
        }
    };

    // --- DOM Elements ---
    const PG_UI = {
        btn: document.getElementById('playground-btn'),
        panel: document.getElementById('playground-panel'),
        overlay: document.getElementById('playground-overlay'),
        closeBtn: document.getElementById('playground-close-btn'),
        settingsBtn: document.getElementById('playground-settings-btn'),
        settingsModal: document.getElementById('playground-settings-modal'),
        closeSettingsBtn: document.getElementById('close-playground-settings-btn'),
        chatContainer: document.getElementById('playground-chat'),
        input: document.getElementById('playground-chat-input'),
        sendBtn: document.getElementById('playground-send-btn'),
        modelStatus: document.getElementById('playground-model-status'),
        
        apiKeyInput: document.getElementById('hf-api-key'),
        modelSearch: document.getElementById('model-search'),
        modelList: document.getElementById('model-list'),
        loadModelsBtn: document.getElementById('load-models-btn'),
        temperature: document.getElementById('temperature'),
        temperatureVal: document.getElementById('temperature-val'),
        maxTokens: document.getElementById('max-tokens')
    };

    // --- Auto-expand textarea ---
    function adjustTextareaHeight() {
        if (!PG_UI.input) return;
        PG_UI.input.style.height = 'auto';
        const newHeight = Math.min(Math.max(PG_UI.input.scrollHeight, 48), 200);
        PG_UI.input.style.height = newHeight + 'px';
    }

    // --- Toast ---
    function showPGNotification(message, type = 'info') {
        const toast = document.getElementById('notification-toast');
        const msg = document.getElementById('notification-message');
        const icon = document.getElementById('notification-icon');
        
        if (!toast) return;
        
        msg.textContent = message;
        toast.classList.remove('hidden');
        void toast.offsetWidth;
        toast.classList.remove('translate-x-10', 'opacity-0');
        
        if (type === 'error') {
            icon.className = 'fas fa-exclamation-circle text-red-400';
        } else {
            icon.className = 'fas fa-info-circle text-purple-400';
        }

        setTimeout(() => {
            toast.classList.add('translate-x-10', 'opacity-0');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    }

    // --- Toggle Panel ---
    function togglePlayground() {
        PG_STATE.isOpen = !PG_STATE.isOpen;
        if (PG_STATE.isOpen) {
            PG_UI.panel.classList.remove('translate-y-full');
            PG_UI.overlay.classList.remove('hidden');
            PG_UI.btn.classList.add('scale-0');
            setTimeout(() => PG_UI.input && PG_UI.input.focus(), 300);
        } else {
            PG_UI.panel.classList.add('translate-y-full');
            PG_UI.overlay.classList.add('hidden');
            PG_UI.btn.classList.remove('scale-0');
        }
    }

    function toggleSettings() {
        PG_STATE.isSettingsOpen = !PG_STATE.isSettingsOpen;
        if (PG_STATE.isSettingsOpen) {
            PG_UI.settingsModal.classList.remove('hidden');
            PG_UI.settingsModal.classList.add('flex');
        } else {
            PG_UI.settingsModal.classList.add('hidden');
            PG_UI.settingsModal.classList.remove('flex');
        }
    }

    // --- Model Loading ---
    async function loadModels() {
        if (!PG_STATE.apiKey) {
            showPGNotification('Por favor configura tu API Key de Hugging Face', 'error');
            return;
        }

        PG_UI.loadModelsBtn.disabled = true;
        PG_UI.loadModelsBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Cargando...';
        
        try {
            const response = await fetch(
                'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=80',
                {
                    headers: { 'Authorization': `Bearer ${PG_STATE.apiKey}` }
                }
            );
            
            if (!response.ok) throw new Error('Error al cargar modelos');
            
            const models = await response.json();
            
            // Filter to only models that work well for chat
            const chatModels = models.filter(m => {
                const id = m.id.toLowerCase();
                return id.includes('chat') || id.includes('instruct') || id.includes('llama') || 
                       id.includes('mistral') || id.includes('qwen') || id.includes('gemma') ||
                       id.includes('phi') || id.includes('falcon') || id.includes('bloom') ||
                       id.includes('gpt') || id.includes('t5') || id.includes('flan');
            }).slice(0, 40);
            
            PG_STATE.modelList = chatModels;
            renderModelList(PG_STATE.modelList);
            showPGNotification(`Cargados ${chatModels.length} modelos`);
            
        } catch (error) {
            console.error('Error loading models:', error);
            showPGNotification('Error al cargar modelos. Verifica tu API Key.', 'error');
        } finally {
            PG_UI.loadModelsBtn.disabled = false;
            PG_UI.loadModelsBtn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Actualizar Modelos';
        }
    }

    function renderModelList(models) {
        const searchTerm = PG_UI.modelSearch.value.toLowerCase();
        const filtered = models.filter(m => m.id.toLowerCase().includes(searchTerm));
        
        PG_UI.modelList.innerHTML = '';
        
        if (filtered.length === 0) {
            PG_UI.modelList.innerHTML = '<div class="text-gray-500 text-sm p-2">No se encontraron modelos</div>';
            return;
        }
        
        filtered.forEach(model => {
            const div = document.createElement('div');
            div.className = `model-item p-2 rounded cursor-pointer flex justify-between items-center ${PG_STATE.selectedModel === model.id ? 'selected' : ''}`;
            div.innerHTML = `
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">${model.id}</div>
                    <div class="text-xs text-gray-500">${model.downloads?.toLocaleString() || 0} downloads</div>
                </div>
            `;
            div.addEventListener('click', () => selectModel(model.id));
            PG_UI.modelList.appendChild(div);
        });
    }

    function selectModel(modelId) {
        PG_STATE.selectedModel = modelId;
        localStorage.setItem('hf_selected_model', modelId);
        PG_UI.modelStatus.textContent = modelId;
        renderModelList(PG_STATE.modelList);
        showPGNotification(`Modelo: ${modelId}`);
        toggleSettings();
    }

    // --- Chat Functions ---
    function initPlaygroundChat() {
        if (!PG_STATE.chats || PG_STATE.chats.length === 0) {
            createNewChat();
        } else {
            const lastChatId = localStorage.getItem('hf_current_chat_id');
            const chatToLoad = PG_STATE.chats.find(c => c.id === lastChatId) ? lastChatId : PG_STATE.chats[0].id;
            loadChat(chatToLoad);
        }
    }

    function createNewChat() {
        const chatId = 'chat_' + Date.now();
        const newChat = {
            id: chatId,
            title: 'Nuevo Chat',
            messages: [],
            timestamp: Date.now()
        };
        PG_STATE.chats.unshift(newChat);
        PG_STATE.currentChatId = chatId;
        saveChats();
        renderChat();
    }

    function loadChat(chatId) {
        PG_STATE.currentChatId = chatId;
        localStorage.setItem('hf_current_chat_id', chatId);
        renderChat();
    }

    function saveChats() {
        localStorage.setItem('hf_chats', JSON.stringify(PG_STATE.chats));
    }

    function renderChat() {
        const chat = PG_STATE.chats.find(c => c.id === PG_STATE.currentChatId);
        
        if (!chat || chat.messages.length === 0) {
            PG_UI.chatContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full opacity-50">
                    <i class="fas fa-robot text-4xl text-gray-600 mb-4"></i>
                    <p class="text-gray-500 text-sm">${PG_STATE.selectedModel ? 'Envía un mensaje para comenzar' : 'Selecciona un modelo'}</p>
                </div>
            `;
            return;
        }
        
        PG_UI.chatContainer.innerHTML = '';
        
        chat.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`;
            
            const bubble = document.createElement('div');
            if (msg.role === 'user') {
                bubble.className = 'pg-user-message px-4 py-3 max-w-[85%] text-sm shadow-md';
            } else if (msg.role === 'system') {
                bubble.className = 'pg-system-message px-4 py-2 max-w-[85%] text-xs';
            } else {
                bubble.className = 'pg-bot-message px-4 py-3 max-w-[85%] text-sm shadow-md';
            }
            
            bubble.innerHTML = formatMessage(msg.content);
            div.appendChild(bubble);
            PG_UI.chatContainer.appendChild(div);
        });
        
        scrollToBottom();
    }

    function formatMessage(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded font-mono text-xs">$1</code>')
            .replace(/\n/g, '<br>');
    }

    function scrollToBottom() {
        if (PG_UI.chatContainer) {
            PG_UI.chatContainer.scrollTop = PG_UI.chatContainer.scrollHeight;
        }
    }

    // --- Send Message - Using Cloudflare Worker Proxy ---
    async function sendMessage() {
        if (!PG_UI.input) return;
        const text = PG_UI.input.value.trim();
        if (!text) return;
        
        if (!PG_STATE.selectedModel) {
            showPGNotification('Selecciona un modelo primero', 'error');
            return;
        }
        
        if (!PG_STATE.apiKey) {
            showPGNotification('Configura tu API Key de Hugging Face', 'error');
            return;
        }
        
        if (!PG_STATE.currentChatId) createNewChat();
        
        PG_UI.input.value = '';
        PG_UI.input.style.height = 'auto';
        
        const chat = PG_STATE.chats.find(c => c.id === PG_STATE.currentChatId);
        chat.messages.push({ role: 'user', content: text, timestamp: Date.now() });
        renderChat();
        
        const botMessageId = 'msg_' + Date.now();
        chat.messages.push({ role: 'bot', content: '', timestamp: Date.now(), streaming: true });
        
        const div = document.createElement('div');
        div.className = 'flex justify-start animate-fade-in';
        div.id = botMessageId;
        div.innerHTML = `
            <div class="pg-bot-message px-4 py-3 max-w-[85%] text-sm shadow-md">
                <span id="${botMessageId}-content"></span><span class="streaming-cursor"></span>
            </div>
        `;
        PG_UI.chatContainer.appendChild(div);
        
        PG_STATE.isStreaming = true;
        scrollToBottom();
        
        try {
            // Use Cloudflare Worker proxy
            const PROXY_URL = 'https://livehfmount.etheroi.com';
            
            let apiUrl, headers;
            
            if (PROXY_URL) {
                // Using proxy (Cloudflare Worker)
                apiUrl = `${PROXY_URL}/${PG_STATE.selectedModel}`;
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PG_STATE.apiKey}`
                };
            } else {
                // Direct call (will have CORS issues)
                apiUrl = `https://api-inference.huggingface.co/models/${PG_STATE.selectedModel}`;
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PG_STATE.apiKey}`
                };
            }
            
            const systemPrompt = "Eres un asistente útil. Responde en español.";
            const conversation = chat.messages
                .filter(m => !m.streaming)
                .map(m => m.role === 'user' ? `Usuario: ${m.content}` : `Asistente: ${m.content}`)
                .join('\n');
            
            const fullPrompt = `${systemPrompt}\n\n${conversation}\nAsistente:`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    inputs: fullPrompt,
                    parameters: {
                        temperature: PG_STATE.config.temperature,
                        max_new_tokens: PG_STATE.config.maxTokens,
                        return_full_text: false,
                        do_sample: true,
                        top_p: 0.95
                    }
                })
            });
            
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            processResponse(data, botMessageId, chat);
            
        } catch (error) {
            handleError(error, botMessageId, chat);
        }
    }

    function processResponse(data, botMessageId, chat) {
        let fullText = '';
        
        if (Array.isArray(data)) {
            fullText = data[0]?.generated_text || '';
        } else if (data.generated_text) {
            fullText = data.generated_text;
        } else if (data.error) {
            throw new Error(data.error);
        }
        
        // Clean up the response
        const userMsg = chat.messages.filter(m => m.role === 'user').pop()?.content || '';
        if (fullText.includes(userMsg)) {
            fullText = fullText.split(userMsg).pop().trim();
        }
        
        const contentEl = document.getElementById(`${botMessageId}-content`);
        const cursorEl = document.getElementById(botMessageId)?.querySelector('.streaming-cursor');
        if (cursorEl) cursorEl.remove();
        if (contentEl) contentEl.innerHTML = formatMessage(fullText || 'Sin respuesta del modelo');
        
        const msgIndex = chat.messages.findIndex(m => m.streaming);
        if (msgIndex !== -1) {
            chat.messages[msgIndex] = { role: 'bot', content: fullText, timestamp: Date.now() };
        }
        
        PG_STATE.isStreaming = false;
        saveChats();
        scrollToBottom();
    }

    function handleError(error, botMessageId, chat) {
        const failedDiv = document.getElementById(botMessageId);
        if (failedDiv) failedDiv.remove();
        
        let errorMsg = error.message;
        
        // Detect specific errors and provide solutions
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMsg = '❌ Error de CORS. La API de Hugging Face está bloqueada por el navegador.';
        } else if (error.message.includes('HTTP 403')) {
            errorMsg = 'Error 403: Tu API Key no tiene permisos o el modelo requiere acepta términos en huggingface.co';
        } else if (error.message.includes('HTTP 429')) {
            errorMsg = 'Error 429: Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
        } else if (error.message.includes('HTTP 422')) {
            errorMsg = 'Error 422: El modelo no acepta el formato. Prueba otro modelo.';
        } else if (error.message.includes('HTTP 410')) {
            errorMsg = 'Error 410 (Gone): El modelo puede haber cambiado de nombre. Prueba recargar la lista de modelos.';
        }
        
        const errDiv = document.createElement('div');
        errDiv.className = 'flex justify-start animate-fade-in';
        errDiv.innerHTML = `
            <div class="pg-system-message px-4 py-3 max-w-[85%] text-sm">
                ${errorMsg}
            </div>
        `;
        PG_UI.chatContainer.appendChild(errDiv);
        
        const msgIndex = chat.messages.findIndex(m => m.streaming);
        if (msgIndex !== -1) chat.messages.splice(msgIndex, 1);
        
        PG_STATE.isStreaming = false;
        scrollToBottom();
    }

    // --- Initialize ---
    function init() {
        if (PG_UI.apiKeyInput) PG_UI.apiKeyInput.value = PG_STATE.apiKey;
        if (PG_UI.temperature) {
            PG_UI.temperature.value = PG_STATE.config.temperature;
            if (PG_UI.temperatureVal) PG_UI.temperatureVal.textContent = PG_STATE.config.temperature;
        }
        if (PG_UI.maxTokens) PG_UI.maxTokens.value = PG_STATE.config.maxTokens;
        if (PG_STATE.selectedModel) PG_UI.modelStatus.textContent = PG_STATE.selectedModel;
        
        if (PG_UI.btn) PG_UI.btn.addEventListener('click', togglePlayground);
        if (PG_UI.closeBtn) PG_UI.closeBtn.addEventListener('click', togglePlayground);
        if (PG_UI.overlay) PG_UI.overlay.addEventListener('click', togglePlayground);
        if (PG_UI.settingsBtn) PG_UI.settingsBtn.addEventListener('click', toggleSettings);
        if (PG_UI.closeSettingsBtn) PG_UI.closeSettingsBtn.addEventListener('click', toggleSettings);
        
        if (PG_UI.sendBtn) PG_UI.sendBtn.addEventListener('click', sendMessage);
        
        if (PG_UI.input) {
            PG_UI.input.addEventListener('input', adjustTextareaHeight);
            PG_UI.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        
        if (PG_UI.loadModelsBtn) PG_UI.loadModelsBtn.addEventListener('click', loadModels);
        
        if (PG_UI.apiKeyInput) {
            PG_UI.apiKeyInput.addEventListener('change', (e) => {
                PG_STATE.apiKey = e.target.value;
                localStorage.setItem('hf_api_key', e.target.value);
                if (e.target.value) loadModels();
            });
        }
        
        if (PG_UI.modelSearch) {
            PG_UI.modelSearch.addEventListener('input', () => renderModelList(PG_STATE.modelList));
        }
        
        if (PG_UI.temperature) {
            PG_UI.temperature.addEventListener('input', (e) => {
                PG_STATE.config.temperature = parseFloat(e.target.value);
                localStorage.setItem('hf_temperature', e.target.value);
                if (PG_UI.temperatureVal) PG_UI.temperatureVal.textContent = e.target.value;
            });
        }
        
        if (PG_UI.maxTokens) {
            PG_UI.maxTokens.addEventListener('change', (e) => {
                PG_STATE.config.maxTokens = parseInt(e.target.value);
                localStorage.setItem('hf_max_tokens', e.target.value);
            });
        }
        
        initPlaygroundChat();
    }

    init();
});