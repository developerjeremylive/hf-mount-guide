// Voice Agent & AI Assistant Logic
// Integrates Gemini API, Web Speech API, and LocalStorage

document.addEventListener('DOMContentLoaded', () => {
    // Helper to safely parse JSON from localStorage
    const safeJSONParse = (key, fallback) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : fallback;
        } catch (e) {
            console.error(`Error parsing ${key} from localStorage`, e);
            return fallback;
        }
    };

    // --- Configuration & State ---
    const STATE = {
        isOpen: false,
        isListening: false,
        isSpeaking: false,
        isHistoryOpen: false,
        currentChatId: localStorage.getItem('gemini_last_chat_id') || null,
        chats: safeJSONParse('gemini_chats', []),
        config: {
            apiKey: localStorage.getItem('gemini_api_key') || '',
            model: localStorage.getItem('gemini_model') || 'custom',
            customModel: localStorage.getItem('gemini_custom_model') || 'gemini-3-flash-preview',
            useThinking: localStorage.getItem('gemini_thinking') !== 'false',
            useTTS: localStorage.getItem('gemini_tts') !== 'false',
            lang: localStorage.getItem('gemini_lang') || 'es',
            voiceURI: localStorage.getItem('gemini_voice_uri') || ''
        }
    };

    // --- DOM Elements ---
    const UI = {
        btn: document.getElementById('voice-agent-btn'),
        panel: document.getElementById('voice-agent-panel'),
        overlay: document.getElementById('voice-agent-overlay'),
        closeBtn: document.getElementById('voice-close-btn'),
        settingsBtn: document.getElementById('voice-settings-btn'),
        settingsModal: document.getElementById('voice-settings-modal'),
        closeSettingsBtn: document.getElementById('close-settings-btn'),
        chatContainer: document.getElementById('chat-messages'),
        input: document.getElementById('chat-input'),
        sendBtn: document.getElementById('send-btn'),
        micBtn: document.getElementById('mic-btn'),
        indicator: document.getElementById('voice-listening-indicator'),
        
        // Settings Inputs
        apiKeyInput: document.getElementById('api-key-input'),
        modelSelect: document.getElementById('model-select'),
        refreshModelsBtn: document.getElementById('refresh-models-btn'),
        customModelInput: document.getElementById('custom-model-input'),
        customModelContainer: document.getElementById('custom-model-container'),
        thinkingToggle: document.getElementById('thinking-mode-toggle'),
        ttsToggle: document.getElementById('tts-toggle'),
        langSelect: document.getElementById('voice-lang-select'),
        voiceSelect: document.getElementById('voice-select'),
        clearHistoryBtn: document.getElementById('clear-history-btn'),
        modelStatus: document.getElementById('model-status'),
        currentVoiceName: document.getElementById('current-voice-name'),
        currentLang: document.getElementById('current-lang'),

        // Player Controls
        playerControls: document.getElementById('audio-player-controls'),
        playerPlayPauseBtn: document.getElementById('player-play-pause-btn'),
        playerStopBtn: document.getElementById('player-stop-btn'),
        playerStatus: document.getElementById('player-status'),

        // Modals & Notifications
        confirmModal: document.getElementById('confirm-modal'),
        confirmMessage: document.getElementById('confirm-message'),
        confirmOkBtn: document.getElementById('confirm-ok-btn'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
        
        toast: document.getElementById('notification-toast'),
        toastMessage: document.getElementById('notification-message'),
        toastIcon: document.getElementById('notification-icon')
    };

    // --- Notifications & Modals ---

    function showNotification(message, type = 'info') {
        if (!UI.toast) return;
        UI.toastMessage.textContent = message;
        UI.toast.classList.remove('hidden');
        
        void UI.toast.offsetWidth;
        
        UI.toast.classList.remove('translate-x-10', 'opacity-0');
        
        if (type === 'error') {
            UI.toastIcon.className = 'fas fa-exclamation-circle text-red-400';
            UI.toast.firstElementChild.className = 'bg-dark-800 border border-red-500/20 text-light px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 backdrop-blur-xl';
        } else {
            UI.toastIcon.className = 'fas fa-info-circle text-amber-400';
            UI.toast.firstElementChild.className = 'bg-dark-800 border border-amber-500/20 text-light px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 backdrop-blur-xl';
        }

        setTimeout(() => {
            UI.toast.classList.add('translate-x-10', 'opacity-0');
            setTimeout(() => {
                UI.toast.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    function showConfirm(message, onConfirm) {
        if (!UI.confirmModal) return;
        UI.confirmMessage.textContent = message;
        UI.confirmModal.classList.remove('hidden');
        UI.confirmModal.classList.add('flex');
        
        const newOk = UI.confirmOkBtn.cloneNode(true);
        const newCancel = UI.confirmCancelBtn.cloneNode(true);
        
        UI.confirmOkBtn.parentNode.replaceChild(newOk, UI.confirmOkBtn);
        UI.confirmCancelBtn.parentNode.replaceChild(newCancel, UI.confirmCancelBtn);
        
        UI.confirmOkBtn = newOk;
        UI.confirmCancelBtn = newCancel;

        const cleanup = () => {
            UI.confirmModal.classList.add('hidden');
            UI.confirmModal.classList.remove('flex');
        };

        UI.confirmOkBtn.addEventListener('click', () => {
            onConfirm();
            cleanup();
        });

        UI.confirmCancelBtn.addEventListener('click', cleanup);
        
        UI.confirmModal.onclick = (e) => {
            if (e.target === UI.confirmModal) cleanup();
        };
    }

    // --- Empty State ---

    function showEmptyState() {
        STATE.currentChatId = null;
        localStorage.removeItem('gemini_last_chat_id');
        
        if (!UI.chatContainer) return;
        UI.chatContainer.innerHTML = '';
        
        const div = document.createElement('div');
        div.className = 'flex flex-col items-center justify-center h-full animate-fade-in opacity-50';
        div.innerHTML = `
            <button id="empty-state-btn" class="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-2xl hover:bg-amber-500/20 hover:scale-110 transition-all shadow-lg shadow-amber-500/10 mb-4">
                <i class="fas fa-plus"></i>
            </button>
            <p class="text-sm font-mono text-gray-500">Inicia un nuevo chat</p>
        `;
        
        UI.chatContainer.appendChild(div);
        
        const btn = document.getElementById('empty-state-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                createNewChat(true);
            });
        }
    }

    // --- Chat Management ---

    function createNewChat(isUserInitiated = false) {
        if (synthesis.speaking) {
            synthesis.cancel();
            STATE.isSpeaking = false;
            showPlayer(false);
        }

        if (isUserInitiated && STATE.currentChatId) {
            const currentChat = STATE.chats.find(c => c.id === STATE.currentChatId);
            const hasUserMessages = currentChat && currentChat.messages.some(m => m.role === 'user');
            
            if (currentChat && !hasUserMessages) {
                showNotification('¡Ya tienes un chat nuevo abierto! Envía un mensaje primero.', 'error');
                return;
            }
        }

        const chatId = Date.now().toString();
        const newChat = {
            id: chatId,
            title: 'Nuevo Chat',
            messages: [{
                role: 'bot',
                content: 'Hola, soy el asistente virtual de Jeremy. ¿En qué puedo ayudarte hoy?',
                timestamp: Date.now()
            }],
            timestamp: Date.now()
        };
        STATE.chats.unshift(newChat);
        STATE.currentChatId = chatId;
        saveChats();
        renderChatHistory();
        loadChat(chatId);
        
        if (UI.input) {
            UI.input.value = '';
            UI.input.focus();
        }
    }

    function loadChat(chatId) {
        if (synthesis.speaking) {
            synthesis.cancel();
            STATE.isSpeaking = false;
            showPlayer(false);
        }

        const chat = STATE.chats.find(c => c.id === chatId);
        if (!chat || !UI.chatContainer) return;

        STATE.currentChatId = chatId;
        localStorage.setItem('gemini_last_chat_id', chatId);
        
        UI.chatContainer.innerHTML = '';
        
        chat.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`;
            const bubble = document.createElement('div');
            bubble.className = msg.role === 'user' 
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-dark rounded-2xl rounded-tr-none px-4 py-3 max-w-[85%] text-sm shadow-md'
                : 'bg-white/10 text-light rounded-2xl rounded-tl-none px-4 py-3 max-w-[85%] text-sm shadow-md';
            bubble.innerHTML = formatText(msg.content);
            div.appendChild(bubble);
            UI.chatContainer.appendChild(div);
        });
        
        scrollToBottom();
        renderChatHistory();
    }

    function saveChats() {
        localStorage.setItem('gemini_chats', JSON.stringify(STATE.chats));
    }

    function updateChatTitle(chatId, firstMessage) {
        const chat = STATE.chats.find(c => c.id === chatId);
        if (chat && chat.title === 'Nuevo Chat') {
            let title = firstMessage.substring(0, 30);
            if (firstMessage.length > 30) title += '...';
            chat.title = title;
            saveChats();
            renderChatHistory();
        }
    }

    function deleteChat(chatId, event) {
        if (event) event.stopPropagation();
        
        showConfirm('¿Estás seguro de eliminar este chat?', () => {
            STATE.chats = STATE.chats.filter(c => c.id !== chatId);
            saveChats();
            renderChatHistory();
            
            if (STATE.currentChatId === chatId) {
                if (STATE.chats.length > 0) {
                    showEmptyState();
                } else {
                    showEmptyState();
                }
            }
            showNotification('Chat eliminado correctamente');
        });
    }

    function clearAllChats() {
        showConfirm('¿Estás seguro de borrar TODO el historial?', () => {
            STATE.chats = [];
            saveChats();
            showEmptyState();
            showNotification('Historial borrado completamente');
        });
    }

    function renderChatHistory() {
        // Simple version - no history sidebar in this implementation
    }

    // Expose for onclick events
    window.deleteChat = deleteChat;

    // --- Initialization ---

    function init() {
        // Event Listeners
        try {
            if (UI.btn) UI.btn.addEventListener('click', togglePanel);
            if (UI.closeBtn) UI.closeBtn.addEventListener('click', togglePanel);
            if (UI.overlay) UI.overlay.addEventListener('click', togglePanel);
            if (UI.settingsBtn) UI.settingsBtn.addEventListener('click', () => {
                const isHidden = UI.settingsModal.classList.contains('hidden');
                toggleSettings(isHidden);
            });
            if (UI.closeSettingsBtn) UI.closeSettingsBtn.addEventListener('click', () => toggleSettings(false));
            
            if (UI.sendBtn) UI.sendBtn.addEventListener('click', handleUserMessage);
            if (UI.input) {
                UI.input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') handleUserMessage();
                });
            }
            if (UI.micBtn) UI.micBtn.addEventListener('click', toggleVoiceRecognition);
            
            if (UI.refreshModelsBtn) UI.refreshModelsBtn.addEventListener('click', fetchAvailableModels);
            if (UI.apiKeyInput) UI.apiKeyInput.addEventListener('change', (e) => {
                updateConfig('apiKey', e.target.value);
                if (e.target.value) fetchAvailableModels();
            });
            if (UI.modelSelect) UI.modelSelect.addEventListener('change', (e) => {
                updateConfig('model', e.target.value);
                toggleCustomModelInput(e.target.value === 'custom');
            });
            if (UI.customModelInput) UI.customModelInput.addEventListener('change', (e) => updateConfig('customModel', e.target.value));
            if (UI.thinkingToggle) UI.thinkingToggle.addEventListener('change', (e) => updateConfig('useThinking', e.target.checked));
            if (UI.ttsToggle) UI.ttsToggle.addEventListener('change', (e) => updateConfig('useTTS', e.target.checked));
            if (UI.langSelect) UI.langSelect.addEventListener('change', (e) => {
                updateConfig('lang', e.target.value);
                loadVoices();
            });
            if (UI.voiceSelect) UI.voiceSelect.addEventListener('change', () => {
                updateConfig('voiceURI', UI.voiceSelect.value);
            });
            if (UI.clearHistoryBtn) UI.clearHistoryBtn.addEventListener('click', clearAllChats);
        } catch (e) {
            console.error("Error initializing event listeners:", e);
        }

        // Initialize settings and chat
        try {
            initSettings();
            
            if (!STATE.chats || !Array.isArray(STATE.chats) || STATE.chats.length === 0) {
                STATE.chats = [];
                showEmptyState();
            } else {
                const lastChatId = localStorage.getItem('gemini_last_chat_id');
                const chatToLoad = STATE.chats.find(c => c.id === lastChatId) ? lastChatId : STATE.chats[0].id;
                loadChat(chatToLoad);
            }
            
            if (STATE.config.apiKey) {
                fetchAvailableModels();
            }
        } catch (e) {
            console.error("Error initializing app state:", e);
            showEmptyState();
        }
    }

    // --- Core Functions ---

    function togglePanel() {
        STATE.isOpen = !STATE.isOpen;
        if (STATE.isOpen) {
            UI.panel.classList.remove('translate-x-full');
            UI.overlay.classList.remove('hidden');
            UI.btn.classList.add('scale-0');
            scrollToBottom();
            setTimeout(() => UI.input && UI.input.focus(), 300);
        } else {
            UI.panel.classList.add('translate-x-full');
            UI.overlay.classList.add('hidden');
            UI.btn.classList.remove('scale-0');
        }
    }

    function toggleSettings(show) {
        if (show) {
            UI.settingsModal.classList.remove('hidden');
            UI.settingsModal.classList.add('flex');
        } else {
            UI.settingsModal.classList.add('hidden');
            UI.settingsModal.classList.remove('flex');
        }
    }

    function initSettings() {
        if (UI.apiKeyInput) UI.apiKeyInput.value = STATE.config.apiKey;
        if (UI.modelSelect) UI.modelSelect.value = STATE.config.model;
        if (UI.customModelInput) UI.customModelInput.value = STATE.config.customModel;
        if (UI.thinkingToggle) UI.thinkingToggle.checked = STATE.config.useThinking;
        if (UI.ttsToggle) UI.ttsToggle.checked = STATE.config.useTTS;
        if (UI.langSelect) UI.langSelect.value = STATE.config.lang;
        
        toggleCustomModelInput(STATE.config.model === 'custom');
        updateModelStatus();
        updateLangDisplay();
    }

    function toggleCustomModelInput(show) {
        if (UI.customModelContainer) {
            if (show) {
                UI.customModelContainer.classList.remove('hidden');
            } else {
                UI.customModelContainer.classList.add('hidden');
            }
        }
    }

    function updateConfig(key, value) {
        STATE.config[key] = value;
        
        const storageKeys = {
            apiKey: 'gemini_api_key',
            model: 'gemini_model',
            customModel: 'gemini_custom_model',
            useThinking: 'gemini_thinking',
            useTTS: 'gemini_tts',
            lang: 'gemini_lang',
            voiceURI: 'gemini_voice_uri'
        };
        
        localStorage.setItem(storageKeys[key], value);
        updateModelStatus();
        updateLangDisplay();
    }

    function updateModelStatus() {
        if (UI.modelStatus) {
            const modelName = STATE.config.model === 'custom' ? STATE.config.customModel : STATE.config.model;
            UI.modelStatus.textContent = `Model: ${modelName} ${STATE.config.useThinking ? '(Thinking)' : ''}`;
        }
    }

    function updateLangDisplay() {
        if (UI.currentLang) {
            UI.currentLang.textContent = STATE.config.lang.toUpperCase();
        }
    }

    async function fetchAvailableModels() {
        if (!STATE.config.apiKey) return;

        const btn = UI.refreshModelsBtn;
        if (btn) {
            const icon = btn.querySelector('i');
            if (icon) icon.classList.add('animate-spin');
            btn.disabled = true;
        }

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${STATE.config.apiKey}`);
            if (!response.ok) throw new Error('Error al obtener modelos');
            
            const data = await response.json();
            let models = [];
            if (data.models) {
                models = data.models.filter(m => 
                    m.supportedGenerationMethods && 
                    m.supportedGenerationMethods.includes('generateContent') &&
                    m.name.includes('gemini')
                );
            }

            const customOption = document.createElement('option');
            customOption.value = 'custom';
            customOption.textContent = 'Custom Model ID';

            if (UI.modelSelect) {
                UI.modelSelect.innerHTML = '';
                
                models.sort((a, b) => b.displayName.localeCompare(a.displayName));

                models.forEach(model => {
                    const option = document.createElement('option');
                    const value = model.name.replace('models/', '');
                    option.value = value;
                    option.textContent = `${model.displayName} (${value})`;
                    UI.modelSelect.appendChild(option);
                });

                UI.modelSelect.appendChild(customOption);

                if (models.some(m => m.name.replace('models/', '') === STATE.config.model)) {
                    UI.modelSelect.value = STATE.config.model;
                } else if (models.length > 0) {
                    UI.modelSelect.value = models[0].name.replace('models/', '');
                    updateConfig('model', UI.modelSelect.value);
                } else {
                    UI.modelSelect.value = 'custom';
                }
            }

        } catch (error) {
            console.error('Failed to fetch models:', error);
        } finally {
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) icon.classList.remove('animate-spin');
                btn.disabled = false;
            }
        }
    }

    // --- Chat Logic ---

    async function handleUserMessage() {
        if (!UI.input) return;
        const text = UI.input.value.trim();
        if (!text) return;

        if (!STATE.currentChatId) {
            createNewChat();
        }

        UI.input.value = '';

        addMessage('user', text);

        if (!STATE.config.apiKey) {
            addMessage('system', '⚠️ Por favor configura tu API Key de Gemini en los ajustes (⚙️).');
            toggleSettings(true);
            return;
        }

        const loadingId = addLoadingIndicator();

        try {
            const context = getSystemPrompt();
            const response = await callGeminiAPI(text, context);
            
            removeMessage(loadingId);
            addMessage('bot', response);

            if (STATE.config.useTTS) {
                const speakText = response.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
                speak(speakText);
            }

        } catch (error) {
            removeMessage(loadingId);
            addMessage('system', `❌ Error: ${error.message}`);
            console.error(error);
        }
    }

    function addMessage(role, text) {
        if (!UI.chatContainer) return;
        
        const div = document.createElement('div');
        div.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`;
        
        const bubble = document.createElement('div');
        bubble.className = role === 'user' 
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-dark rounded-2xl rounded-tr-none px-4 py-3 max-w-[85%] text-sm shadow-md'
            : (role === 'system' ? 'bg-red-500/20 text-red-200 rounded-lg px-4 py-2 text-xs border border-red-500/30' 
            : 'bg-white/10 text-light rounded-2xl rounded-tl-none px-4 py-3 max-w-[85%] text-sm shadow-md');
        
        bubble.innerHTML = formatText(text);
        
        div.appendChild(bubble);
        UI.chatContainer.appendChild(div);
        
        scrollToBottom();

        if (role !== 'system') {
            saveMessageToHistory(role, text);
        }
        
        return div.id = 'msg-' + Date.now();
    }

    function addLoadingIndicator() {
        const id = 'loading-' + Date.now();
        if (!UI.chatContainer) return id;
        
        const div = document.createElement('div');
        div.id = id;
        div.className = 'flex justify-start animate-fade-in';
        div.innerHTML = `
            <div class="bg-white/10 text-light rounded-2xl rounded-tl-none px-4 py-3 text-sm flex gap-2 items-center">
                <div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            </div>
        `;
        UI.chatContainer.appendChild(div);
        scrollToBottom();
        return id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        if (UI.chatContainer) UI.chatContainer.scrollTop = UI.chatContainer.scrollHeight;
    }

    function formatText(text) {
        let formatted = text.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (match, content) => {
            return `
                <details class="mb-2 border-l-2 border-gray-600/30 pl-2">
                    <summary class="text-xs text-gray-500 cursor-pointer font-mono hover:text-amber-400">Thinking Process</summary>
                    <div class="text-xs text-gray-400/80 mt-1 italic">${content.replace(/\n/g, '<br>')}</div>
                </details>
            `;
        });

        formatted = formatted
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 rounded font-mono text-xs">$1</code>')
            .replace(/\n/g, '<br>');
            
        return formatted;
    }

    // --- History Management ---

    function saveMessageToHistory(role, text) {
        if (!STATE.currentChatId) return;

        const chat = STATE.chats.find(c => c.id === STATE.currentChatId);
        if (chat) {
            chat.messages.push({ 
                role: role, 
                content: text, 
                timestamp: Date.now() 
            });
            saveChats();
            
            if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
                 updateChatTitle(STATE.currentChatId, text);
            }
        }
    }

    // --- Gemini API Integration ---

    function extractPageContext() {
        const mainContent = document.body.innerText
            .replace(/\s+/g, ' ')
            .substring(0, 20000);
        return mainContent;
    }

    function getSystemPrompt() {
        const pageContent = extractPageContext();
        const thinkingInstruction = STATE.config.useThinking ? 
            "Thinking Process: Before answering, briefly analyze the user's intent and the relevant parts of the context." : "";

        return `
            You are an AI assistant for Jeremy Live's portfolio website about hf-mount.
            Your goal is to answer questions about hf-mount, Hugging Face, models, datasets, and related technical topics.
            
            Website Context:
            ${pageContent}

            Instructions:
            1. Be professional, concise, and helpful.
            2. If the answer is in the context, use it.
            3. If the answer is NOT in the context, politely say you don't have that information.
            4. Speak in the language the user initiated (Spanish or English).
            5. ${thinkingInstruction}
        `;
    }

    async function callGeminiAPI(prompt, systemContext) {
        const model = STATE.config.model === 'custom' ? STATE.config.customModel : STATE.config.model;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${STATE.config.apiKey}`;
        
        const payload = {
            contents: [
                {
                    parts: [
                        { text: systemContext + "\n\nUser Question: " + prompt }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'API Request Failed');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    // --- Voice Features (STT & TTS) ---

    let synthesis = window.speechSynthesis;
    let currentUtterance = null;
    let availableVoices = [];

    function loadVoices() {
        availableVoices = synthesis.getVoices();
        
        if (availableVoices.length === 0) {
            setTimeout(loadVoices, 100);
            return;
        }

        const langCode = STATE.config.lang;
        
        const filteredVoices = availableVoices.filter(v => 
            v.lang.startsWith(langCode) || 
            v.lang.toLowerCase().includes(langCode.toLowerCase())
        );

        filteredVoices.sort((a, b) => {
            const getScore = (name) => {
                if (name.includes('Google')) return 2;
                if (name.includes('Microsoft')) return 1;
                return 0;
            };
            return getScore(b.name) - getScore(a.name);
        });

        if (UI.voiceSelect) {
            UI.voiceSelect.innerHTML = '<option value="">Voz automática (Por defecto)</option>';
            
            filteredVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voiceURI;
                let displayName = voice.name.replace('Google', '').replace('Microsoft', '').replace('Desktop', '').trim();
                const region = voice.lang.split('-')[1] || voice.lang;
                
                option.textContent = `${displayName} (${region})`;
                
                if (voice.voiceURI === STATE.config.voiceURI) {
                    option.selected = true;
                }
                UI.voiceSelect.appendChild(option);
            });
            
            if (filteredVoices.length > 0 && STATE.config.voiceURI && !filteredVoices.find(v => v.voiceURI === STATE.config.voiceURI)) {
                UI.voiceSelect.value = "";
                updateConfig('voiceURI', '');
            }
        }
    }

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    loadVoices();
    setTimeout(loadVoices, 1000);
    setTimeout(loadVoices, 5000);

    function speak(text) {
        if (!STATE.config.useTTS) return;

        synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        if (STATE.config.voiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === STATE.config.voiceURI);
            if (voice) utterance.voice = voice;
        } 
        
        if (!utterance.voice) {
             const langCode = STATE.config.lang === 'es' ? 'es-ES' : 'en-US';
             utterance.lang = langCode;
        }

        showPlayer(true);
        STATE.isSpeaking = true;
        if (UI.playerStatus) UI.playerStatus.textContent = "Preparando audio...";
        if (UI.currentVoiceName) UI.currentVoiceName.textContent = utterance.voice ? utterance.voice.name : 'Voz Automática';
        if (UI.playerPlayPauseBtn) UI.playerPlayPauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i>';

        utterance.onstart = () => {
            STATE.isSpeaking = true;
            if (UI.playerStatus) UI.playerStatus.textContent = "Reproduciendo...";
            if (UI.playerPlayPauseBtn) UI.playerPlayPauseBtn.innerHTML = '<i class="fas fa-pause text-xs"></i>';
        };

        utterance.onend = () => {
            STATE.isSpeaking = false;
            showPlayer(false);
            if (UI.playerPlayPauseBtn) UI.playerPlayPauseBtn.innerHTML = '<i class="fas fa-play text-xs"></i>';
        };

        utterance.onerror = (e) => {
            if (e.error === 'interrupted' || e.error === 'canceled') {
                STATE.isSpeaking = false;
                showPlayer(false);
                return;
            }
            
            console.error('TTS Error:', e);
            STATE.isSpeaking = false;
            if (UI.playerStatus) UI.playerStatus.textContent = "Error al reproducir";
            setTimeout(() => showPlayer(false), 2000);
        };

        currentUtterance = utterance;
        
        if (synthesis.paused) synthesis.resume();

        setTimeout(() => {
            synthesis.speak(utterance);
            
            setTimeout(() => {
                if (STATE.isSpeaking && synthesis.paused) {
                    synthesis.resume();
                }
            }, 500);
        }, 50);
    }

    function showPlayer(show) {
        if (!UI.playerControls) return;
        
        if (show) {
            UI.playerControls.classList.remove('hidden');
        } else {
            setTimeout(() => {
                if (!synthesis.speaking) {
                    UI.playerControls.classList.add('hidden');
                }
            }, 2000);
        }
    }

    if (UI.playerStopBtn) {
        UI.playerStopBtn.addEventListener('click', () => {
            synthesis.cancel();
            STATE.isSpeaking = false;
            showPlayer(false);
        });
    }

    if (UI.playerPlayPauseBtn) {
        UI.playerPlayPauseBtn.addEventListener('click', () => {
            if (synthesis.paused) {
                synthesis.resume();
                UI.playerPlayPauseBtn.innerHTML = '<i class="fas fa-pause text-xs"></i>';
                if (UI.playerStatus) UI.playerStatus.textContent = "Reproduciendo...";
            } else if (synthesis.speaking) {
                synthesis.pause();
                UI.playerPlayPauseBtn.innerHTML = '<i class="fas fa-play text-xs"></i>';
                if (UI.playerStatus) UI.playerStatus.textContent = "Pausado";
            }
        });
    }

    // --- Speech Recognition ---

    let recognition;
    let autoSendTimer = null;
    
    function toggleVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            showNotification('Tu navegador no soporta reconocimiento de voz.', 'error');
            return;
        }

        if (STATE.isListening) {
            if (recognition) {
                if (autoSendTimer) clearTimeout(autoSendTimer);
                recognition.stop();
                STATE.isListening = false;
                if (UI.indicator) UI.indicator.classList.add('hidden');
                if (UI.micBtn) UI.micBtn.classList.remove('text-red-500', 'animate-pulse');
            }
            return;
        }

        if (!navigator.onLine) {
            showNotification('No tienes conexión a internet.', 'error');
            return;
        }

        if (!window.isSecureContext) {
            showNotification('El reconocimiento de voz requiere HTTPS o Localhost.', 'error');
            return;
        }

        if (recognition) {
            try {
                recognition.onend = null;
                recognition.onerror = null;
                recognition.abort();
            } catch (e) { /* ignore */ }
            recognition = null;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        recognition.lang = STATE.config.lang === 'es' ? 'es-ES' : 'en-US';
        recognition.interimResults = true; 
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        if (UI.input) UI.input.placeholder = "Inicializando micrófono...";

        recognition.onstart = () => {
            STATE.isListening = true;
            if (UI.indicator) UI.indicator.classList.remove('hidden');
            if (UI.micBtn) UI.micBtn.classList.add('text-red-500', 'animate-pulse');
            if (UI.input) UI.input.placeholder = recognition.lang.startsWith('es') ? "Escuchando... (habla ahora)" : "Listening... (speak now)";
        };

        recognition.onend = () => {
            STATE.isListening = false;
            if (UI.indicator) UI.indicator.classList.add('hidden');
            if (UI.micBtn) UI.micBtn.classList.remove('text-red-500', 'animate-pulse');
            if (UI.input) UI.input.placeholder = "Escribe o habla...";
        };

        let finalTranscript = '';

        recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            if (UI.input) UI.input.value = finalTranscript || interimTranscript;

            if (finalTranscript && STATE.isListening) {
                if (autoSendTimer) clearTimeout(autoSendTimer);
                autoSendTimer = setTimeout(() => handleUserMessage(), 800);
            }
        };

        recognition.onerror = (event) => {
            if (autoSendTimer) clearTimeout(autoSendTimer);
            console.error('Speech error:', event.error);
            STATE.isListening = false;
            if (UI.indicator) UI.indicator.classList.add('hidden');
            if (UI.micBtn) UI.micBtn.classList.remove('text-red-500', 'animate-pulse');
            
            if (event.error === 'no-speech') {
                showNotification('No se detectó voz. Intenta acercarte al micrófono.', 'info');
            } else if (event.error === 'not-allowed') {
                showConfirm('⚠️ Permiso Denegado\n\nEl navegador no tiene permiso para usar el micrófono.\n\nPor favor, permite el acceso al micrófono en la configuración del navegador.', () => {});
            } else if (event.error === 'network') {
                showNotification('Error de conexión con Google Speech API.', 'error');
            } else if (event.error === 'aborted') {
                // Ignore
            } else {
                showNotification(`Error: ${event.error}`, 'error');
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error("Error starting recognition:", e);
            showNotification("Error interno al iniciar micrófono.", 'error');
        }
    }

    // Initialize
    init();
});