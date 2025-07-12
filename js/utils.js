

// ===== LOCAL STORAGE CONVERSATION MANAGEMENT =====
function saveConversationToStorage() {
    try {
        const currentUser = window.authManager ? window.authManager.getCurrentUser() : null;
        const isAuthenticated = currentUser && currentUser.account_type !== 'anonymous';
        
        // Use different storage keys for authenticated vs anonymous users
        const storageKey = isAuthenticated ? `math_conversation_${currentUser.id}` : 'math_conversation_anonymous';
        
        const messages = [];
        const messageElements = document.querySelectorAll('.message');
        
        messageElements.forEach(messageEl => {
            const isUser = messageEl.classList.contains('message-user');
            const content = messageEl.querySelector('.content');
            if (content) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    content: content.textContent.trim(),
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        const conversationData = {
            messages: messages,
            sessionId: window.mathInterface ? window.mathInterface.sessionId : null,
            lastSaved: new Date().toISOString(),
            userId: isAuthenticated ? currentUser.id : null
        };
        
        saveToLocalStorage(storageKey, conversationData);
        return true;
    } catch (error) {
        console.error('Failed to save conversation:', error);
        return false;
    }
}

function loadConversationFromStorage() {
    try {
        const currentUser = window.authManager ? window.authManager.getCurrentUser() : null;
        const isAuthenticated = currentUser && currentUser.account_type !== 'anonymous';
        
        // Use different storage keys for authenticated vs anonymous users
        const storageKey = isAuthenticated ? `math_conversation_${currentUser.id}` : 'math_conversation_anonymous';
        
        const conversationData = loadFromLocalStorage(storageKey, null);
        
        if (!conversationData || !conversationData.messages || conversationData.messages.length === 0) {
            return false;
        }
        
        // Verify the data belongs to the current user context
        if (isAuthenticated && conversationData.userId !== currentUser.id) {
            console.log('Conversation data belongs to different user, not loading');
            return false;
        }
        
        if (!isAuthenticated && conversationData.userId !== null) {
            console.log('Conversation data belongs to authenticated user, not loading for anonymous');
            return false;
        }
        
        const conversationArea = document.getElementById('conversation');
        if (!conversationArea) return false;
        
        // Clear existing conversation
        conversationArea.innerHTML = '';
        
        // Restore messages
        conversationData.messages.forEach(message => {
            addMessageToUI(message.role, message.content);
        });
        
        // Restore session ID if available
        if (window.mathInterface && conversationData.sessionId) {
            window.mathInterface.sessionId = conversationData.sessionId;
            saveToLocalStorage('current_session_id', conversationData.sessionId);
            updateSessionDisplay(conversationData.sessionId);
        }
        
        console.log(`✓ Restored conversation with ${conversationData.messages.length} messages`);
        showNotification(`Restored ${conversationData.messages.length} messages`, 'success');
        
        return true;
    } catch (error) {
        console.error('Failed to load conversation:', error);
        return false;
    }
}

function addMessageToUI(role, content) {
    const conversationArea = document.getElementById('conversation');
    if (!conversationArea) return;
    
    const messageGroup = document.createElement('div');
    messageGroup.className = 'message-group';
    
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${role}`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'content';
    contentElement.textContent = content;
    
    messageElement.appendChild(contentElement);
    messageGroup.appendChild(messageElement);
    conversationArea.appendChild(messageGroup);
    
    // Render math if present
    renderMath(messageGroup);
    
    // Smart scroll to bottom
    if (window.conversationScrollManager) {
        window.conversationScrollManager.scrollToBottom();
    } else {
        scrollToBottom(conversationArea);
    }
}

function updateSessionDisplay(sessionId) {
    const sessionDisplay = document.getElementById('session-display');
    if (sessionDisplay && sessionId) {
        sessionDisplay.innerHTML = `
            <div class="session-id">${sessionId.slice(0, 8).toUpperCase()}</div>
            <div class="session-time">restored</div>
        `;
    }
}

function clearStoredConversation() {
    try {
        const currentUser = window.authManager ? window.authManager.getCurrentUser() : null;
        const isAuthenticated = currentUser && currentUser.account_type !== 'anonymous';
        
        // Use different storage keys for authenticated vs anonymous users
        const storageKey = isAuthenticated ? `math_conversation_${currentUser.id}` : 'math_conversation_anonymous';
        
        localStorage.removeItem(storageKey);
        console.log('✓ Stored conversation cleared for current user context');
        return true;
    } catch (error) {
        console.error('Failed to clear stored conversation:', error);
        return false;
    }
}

function getStoredConversationInfo() {
    const conversationData = loadFromLocalStorage('math_conversation', null);
    if (!conversationData) return null;
    
    return {
        messageCount: conversationData.messages ? conversationData.messages.length : 0,
        lastSaved: conversationData.lastSaved,
        sessionId: conversationData.sessionId,
        hasData: conversationData.messages && conversationData.messages.length > 0
    };
}

// ===== AUTO-SAVE FUNCTIONALITY =====
let autoSaveTimeout = null;

function scheduleAutoSave() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    autoSaveTimeout = setTimeout(() => {
        saveConversationToStorage();
    }, 2000);
}

function enableAutoSave() {
    const conversationArea = document.getElementById('conversation');
    if (conversationArea) {
        const observer = new MutationObserver(() => {
            scheduleAutoSave();
        });
        
        observer.observe(conversationArea, {
            childList: true,
            subtree: true
        });
    }
    
    window.addEventListener('beforeunload', () => {
        saveConversationToStorage();
    });
    
    setInterval(() => {
        saveConversationToStorage();
    }, 30000);
}

// ===== THEME MANAGEMENT =====
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = newTheme === 'dark' ? 'LIGHT' : 'DARK';
    }
    
    saveToLocalStorage('theme', newTheme);
}

function initializeTheme() {
    const savedTheme = loadFromLocalStorage('theme', 'dark'); // Default to dark for 8-bit theme
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = savedTheme === 'dark' ? 'LIGHT' : 'DARK';
    }
}

// ===== SESSION TIMESTAMP =====
function updateSessionTimestamp(timestamp = new Date()) {
    const sessionDisplay = document.getElementById('session-display');
    if (!sessionDisplay) return;
    
    saveToLocalStorage('session_start_time', timestamp.toISOString());
    updateSessionDisplayWithTime();
}

function updateSessionDisplayWithTime() {
    const sessionDisplay = document.getElementById('session-display');
    if (!sessionDisplay) return;
    
    const sessionStartTime = loadFromLocalStorage('session_start_time', null);
    if (!sessionStartTime) {
        sessionDisplay.innerHTML = '<div class="session-id">ACTIVE</div><div class="session-time">ready</div>';
        return;
    }
    
    const startTime = new Date(sessionStartTime);
    const now = new Date();
    const duration = now - startTime;
    
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    
    let timeText;
    if (hours > 0) {
        timeText = `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        timeText = `${minutes}m`;
    } else {
        timeText = 'now';
    }
    
    const sessionId = window.mathInterface ? window.mathInterface.sessionId : null;
    const sessionText = sessionId ? sessionId.slice(0, 8).toUpperCase() : 'ACTIVE';
    
    sessionDisplay.innerHTML = `
        <div class="session-id">${sessionText}</div>
        <div class="session-time">${timeText}</div>
    `;
}

function initializeSessionTimestamp() {
    const sessionStartTime = loadFromLocalStorage('session_start_time', null);
    if (!sessionStartTime) {
        updateSessionTimestamp();
    } else {
        updateSessionDisplayWithTime();
    }
    
    setInterval(updateSessionDisplayWithTime, 60000);
}

// ===== CONVERSATION MANAGEMENT =====
function copyConversation() {
    const messages = document.querySelectorAll('.message');
    let conversationText = 'AI MATH TEACHER - CONVERSATION LOG\n';
    conversationText += '=====================================\n\n';
    
    messages.forEach(message => {
        const isUser = message.classList.contains('message-user');
        const content = message.querySelector('.content');
        if (content) {
            const role = isUser ? 'USER' : 'AI';
            const text = content.textContent.trim();
            conversationText += `[${role}]: ${text}\n\n`;
        }
    });
    
    copyToClipboard(conversationText).then(success => {
        if (success) {
            showNotification('Conversation copied to clipboard', 'success');
        } else {
            showNotification('Failed to copy conversation', 'error');
        }
    });
}

function clearConversation() {
    if (confirm('CLEAR CONVERSATION? THIS ACTION CANNOT BE UNDONE.')) {
        if (window.mathInterface && typeof window.mathInterface.clearConversation === 'function') {
            window.mathInterface.clearConversation();
        } else {
            resetConversationUI();
            showNotification('Conversation cleared', 'success');
        }
    }
}

function resetConversationUI() {
    const conversationArea = document.getElementById('conversation');
    if (conversationArea) {
        conversationArea.innerHTML = `
            <div class="message-group">
                <div class="message message-assistant">
                    <div class="content">
                        Right, I'm your AI math teacher. Ask me whatever mathematical questions you have - I'll give you clear, direct explanations. Try to keep up.
                    </div>
                </div>
            </div>
        `;
    }
    
    clearStoredConversation();
    updateSessionTimestamp();
}

// ===== PALETTE MANAGEMENT =====
function initializePalettes() {
    const symbolsBtn = document.getElementById('symbols-btn');
    const templatesBtn = document.getElementById('templates-btn');
    const symbolPalette = document.getElementById('symbol-palette');
    const templatePalette = document.getElementById('template-palette');
    const closeSymbols = document.getElementById('close-symbols');
    const closeTemplates = document.getElementById('close-templates');
    
    if (symbolsBtn && symbolPalette) {
        symbolsBtn.addEventListener('click', () => {
            templatePalette.classList.add('hidden');
            symbolPalette.classList.toggle('hidden');
        });
    }
    
    if (templatesBtn && templatePalette) {
        templatesBtn.addEventListener('click', () => {
            symbolPalette.classList.add('hidden');
            templatePalette.classList.toggle('hidden');
        });
    }
    
    if (closeSymbols) {
        closeSymbols.addEventListener('click', () => {
            symbolPalette.classList.add('hidden');
        });
    }
    
    if (closeTemplates) {
        closeTemplates.addEventListener('click', () => {
            templatePalette.classList.add('hidden');
        });
    }
    
    // Symbol button handlers
    const symbolBtns = document.querySelectorAll('.symbol-btn');
    symbolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const symbol = btn.getAttribute('data-symbol');
            insertSymbolAtCursor(symbol);
            symbolPalette.classList.add('hidden');
        });
    });
    
    // Template button handlers
    const templateBtns = document.querySelectorAll('.template-btn');
    templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const template = btn.getAttribute('data-template');
            insertTemplateText(template);
            templatePalette.classList.add('hidden');
        });
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!symbolPalette.contains(e.target) && !symbolsBtn.contains(e.target)) {
            symbolPalette.classList.add('hidden');
        }
        if (!templatePalette.contains(e.target) && !templatesBtn.contains(e.target)) {
            templatePalette.classList.add('hidden');
        }
    });
}

function insertSymbolAtCursor(symbol) {
    const input = document.getElementById('message-input');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    
    input.value = text.substring(0, start) + symbol + text.substring(end);
    input.focus();
    input.setSelectionRange(start + symbol.length, start + symbol.length);
    input.dispatchEvent(new Event('input'));
}

function insertTemplateText(template) {
    const input = document.getElementById('message-input');
    input.value = template;
    input.focus();
    input.setSelectionRange(template.length, template.length);
    input.dispatchEvent(new Event('input'));
}

// ===== MESSAGE HISTORY NAVIGATION =====
class MessageHistory {
    constructor() {
        this.history = this.loadHistory();
        this.currentIndex = -1;
        this.tempMessage = '';
    }

    addMessage(message) {
        if (message && message.trim()) {
            const existingIndex = this.history.indexOf(message);
            if (existingIndex !== -1) {
                this.history.splice(existingIndex, 1);
            }
            
            this.history.unshift(message);
            
            if (this.history.length > 100) {
                this.history = this.history.slice(0, 100);
            }
            
            this.currentIndex = -1;
            this.tempMessage = '';
            this.saveHistory();
        }
    }

    navigateUp(currentInputValue = '') {
        const input = document.getElementById('message-input');
        if (!input) return;

        if (this.currentIndex === -1) {
            this.tempMessage = currentInputValue;
        }

        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            input.value = this.history[this.currentIndex];
            input.dispatchEvent(new Event('input'));
            
            setTimeout(() => {
                input.setSelectionRange(input.value.length, input.value.length);
            }, 0);
        }
    }

    navigateDown() {
        const input = document.getElementById('message-input');
        if (!input) return;

        if (this.currentIndex > 0) {
            this.currentIndex--;
            input.value = this.history[this.currentIndex];
        } else if (this.currentIndex === 0) {
            this.currentIndex = -1;
            input.value = this.tempMessage;
        }

        input.dispatchEvent(new Event('input'));
        
        setTimeout(() => {
            input.setSelectionRange(input.value.length, input.value.length);
        }, 0);
    }

    resetNavigation() {
        this.currentIndex = -1;
        this.tempMessage = '';
    }

    loadHistory() {
        return loadFromLocalStorage('message_history', []);
    }

    saveHistory() {
        saveToLocalStorage('message_history', this.history);
    }

    getHistoryStats() {
        return {
            totalMessages: this.history.length,
            currentIndex: this.currentIndex
        };
    }
}

let messageHistory = null;

function initializeMessageHistory() {
    messageHistory = new MessageHistory();
    
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            messageHistory.navigateUp(messageInput.value);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            messageHistory.navigateDown();
        } else if (e.key === 'Escape') {
            messageHistory.resetNavigation();
            messageInput.value = '';
            messageInput.style.height = 'auto';
        }
    });

    messageInput.addEventListener('input', (e) => {
        if (messageHistory.currentIndex !== -1 && e.inputType) {
            messageHistory.resetNavigation();
        }
    });
}

function addToMessageHistory(message) {
    if (messageHistory && message) {
        messageHistory.addMessage(message);
    }
}

// ===== ERROR HANDLING =====
function getErrorMessage(error, context = '') {
    const errorMsg = error.message || error.toString();
    
    if (error.name === 'TypeError' && errorMsg.includes('fetch')) {
        return "CONNECTION ERROR: Can't reach server. Check network.";
    }
    
    if (errorMsg.includes('404')) {
        return "SERVER ERROR: Service unavailable. Try again.";
    }
    
    if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
        return "SERVER ERROR: Internal failure. Retry in a moment.";
    }
    
    if (errorMsg.includes('timeout')) {
        return "TIMEOUT ERROR: Request took too long. Try again.";
    }
    
    if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit')) {
        return "API LIMIT: Service overloaded. Wait before retrying.";
    }
    
    if (errorMsg.includes('SAFETY')) {
        return "SAFETY FILTER: Question triggered content filter. Rephrase.";
    }
    
    if (errorMsg.includes('RECITATION')) {
        return "RECITATION FILTER: Cannot answer specific query. Try different approach.";
    }
    
    return "SYSTEM ERROR: Unknown failure. Retry operation.";
}

// ===== NOTIFICATION SYSTEM =====
function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message.toUpperCase();
    
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        zIndex: '1000',
        border: '2px solid var(--accent)',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });
    
    switch (type) {
        case 'success':
            notification.style.background = 'var(--success)';
            notification.style.color = 'var(--bg-primary)';
            notification.style.borderColor = 'var(--success)';
            break;
        case 'error':
            notification.style.background = 'var(--error)';
            notification.style.color = 'var(--white)';
            notification.style.borderColor = 'var(--error)';
            break;
        default:
            notification.style.background = 'var(--bg-primary)';
            notification.style.color = 'var(--accent)';
            notification.style.borderColor = 'var(--accent)';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

function showHelp() {
    const helpMessages = [
        "Explain quadratic equations step by step",
        "Help me solve x² + 5x + 6 = 0",
        "Graph f(x) = x² - 4x + 3 from -5 to 5",
        "Give me practice problems for derivatives",
        "What's the difference between mean and median?",
        "How do I find the limit of sin(x)/x as x approaches 0?",
        "Show me how to integrate by parts with examples",
        "Explain the chain rule with step-by-step examples"
    ];
    
    const randomMessage = helpMessages[Math.floor(Math.random() * helpMessages.length)];
    document.getElementById('message-input').value = randomMessage;
}

// ===== STATUS INDICATORS =====
function updateConnectionStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    if (!indicator) return;
    
    indicator.classList.remove('connected', 'connecting', 'disconnected', 'error');
    indicator.classList.add(status);
}

function showTypingIndicator() {
    const conversationArea = document.getElementById('conversation');
    if (!conversationArea || document.querySelector('.typing-indicator')) return;
    
    const typingGroup = document.createElement('div');
    typingGroup.className = 'message-group typing-indicator';
    
    const typingMessage = document.createElement('div');
    typingMessage.className = 'message message-assistant';
    
    const typingContent = document.createElement('div');
    typingContent.className = 'content';
    typingContent.innerHTML = `
        <span class="loading-text">processing</span>
        <span class="thinking-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        </span>
    `;
    
    typingMessage.appendChild(typingContent);
    typingGroup.appendChild(typingMessage);
    conversationArea.appendChild(typingGroup);
    
    if (window.conversationScrollManager) {
        window.conversationScrollManager.scrollToBottom();
    } else {
        scrollToBottom(conversationArea);
    }
}

function hideTypingIndicator() {
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function showLoadingState() {
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.disabled = true;
        sendButton.innerHTML = 'PROCESSING';
    }
    
    return showTypingIndicator;
}

function hideLoadingState() {
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.disabled = false;
        sendButton.innerHTML = 'EXECUTE';
    }
    
    hideTypingIndicator();
}

// ===== SCROLL MANAGEMENT =====
class ScrollManager {
    constructor(container) {
        this.container = container;
        this.userScrolling = false;
        this.autoScrolling = false;
        this.scrollTimeout = null;
        
        if (container) {
            this.initializeScrollTracking();
        }
    }
    
    initializeScrollTracking() {
        this.container.addEventListener('scroll', () => {
            if (!this.autoScrolling) {
                this.userScrolling = true;
                clearTimeout(this.scrollTimeout);
                
                this.scrollTimeout = setTimeout(() => {
                    this.userScrolling = false;
                }, 1000);
            }
        });
        
        this.container.addEventListener('scroll', () => {
            const isAtBottom = this.container.scrollTop + this.container.clientHeight >= this.container.scrollHeight - 50;
            if (isAtBottom) {
                this.userScrolling = false;
            }
        });
    }
    
    scrollToBottom(force = false) {
        if (!this.container) return;
        
        if (this.userScrolling && !force) return;
        
        this.autoScrolling = true;
        
        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: 'auto' // Remove smooth scrolling for 8-bit feel
        });
        
        setTimeout(() => {
            this.autoScrolling = false;
        }, 100);
    }
}

// ===== MATH RENDERING =====
function renderMath(element) {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([element]).catch(console.warn);
    }
}

function renderMathLive(element) {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([element]).catch(() => {
            // Silently handle errors during live rendering
        });
    }
}

// ===== UTILITY FUNCTIONS =====
function scrollToBottom(container, smooth = false) {
    if (!container) return;
    
    const scrollOptions = {
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto' // Instant for 8-bit feel
    };
    
    container.scrollTo(scrollOptions);
}

function getTypingDelay(char) {
    // Faster, more consistent typing for retro feel
    let delay = 15;
    if (char === '.' || char === '?' || char === '!') {
        delay = 100;
    } else if (char === ',' || char === ';') {
        delay = 50;
    } else if (char === ' ') {
        delay = 20;
    } else if (char === '\n') {
        delay = 30;
    }
    
    return delay + Math.random() * 5; // Less randomness for consistent feel
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            textArea.remove();
            return true;
        } catch (err) {
            textArea.remove();
            return false;
        }
    }
}

function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.warn('Failed to save to localStorage:', error);
        return false;
    }
}

function loadFromLocalStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        console.warn('Failed to load from localStorage:', error);
        return defaultValue;
    }
}

function getStorageUsage() {
    try {
        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
            }
        }
        return {
            totalBytes: totalSize,
            totalKB: Math.round(totalSize / 1024 * 100) / 100,
            totalMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
        };
    } catch (error) {
        return null;
    }
}

function cleanupOldConversations() {
    try {
        const conversationData = loadFromLocalStorage('math_conversation', null);
        if (conversationData && conversationData.lastSaved) {
            const lastSaved = new Date(conversationData.lastSaved);
            const daysSinceLastSave = (Date.now() - lastSaved.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceLastSave > 30) {
                clearStoredConversation();
                console.log('✓ Cleaned up old conversation data');
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Failed to cleanup old conversations:', error);
        return false;
    }
}