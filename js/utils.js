// Local Storage Conversation Management
function saveConversationToStorage() {
    try {
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
            lastSaved: new Date().toISOString()
        };
        
        saveToLocalStorage('math_conversation', conversationData);
        return true;
    } catch (error) {
        console.error('Failed to save conversation:', error);
        return false;
    }
}

function loadConversationFromStorage() {
    try {
        const conversationData = loadFromLocalStorage('math_conversation', null);
        
        if (!conversationData || !conversationData.messages || conversationData.messages.length === 0) {
            return false;
        }
        
        const conversationArea = document.getElementById('conversation');
        if (!conversationArea) {
            return false;
        }
        
        // Clear existing conversation
        conversationArea.innerHTML = '';
        
        // Restore messages
        conversationData.messages.forEach(message => {
            addMessageToUI(message.role, message.content);
        });
        
        // Restore session ID if available
        if (window.mathInterface && conversationData.sessionId) {
            window.mathInterface.sessionId = conversationData.sessionId;
            // Also save it as current session
            saveToLocalStorage('current_session_id', conversationData.sessionId);
            updateSessionDisplay(conversationData.sessionId);
        }
        
        console.log(`✓ Restored conversation with ${conversationData.messages.length} messages`);
        showNotification(`Restored ${conversationData.messages.length} messages from previous session`, 'success');
        
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
        localStorage.removeItem('math_conversation');
        // Don't clear session_start_time or current_session_id here
        // Those should persist across conversation clears
        console.log('✓ Stored conversation cleared');
        return true;
    } catch (error) {
        console.error('Failed to clear stored conversation:', error);
        return false;
    }
}

function clearAllStoredData() {
    try {
        localStorage.removeItem('math_conversation');
        localStorage.removeItem('session_start_time');
        localStorage.removeItem('current_session_id');
        console.log('✓ All stored data cleared');
        return true;
    } catch (error) {
        console.error('Failed to clear all stored data:', error);
        return false;
    }
}

function getStoredConversationInfo() {
    const conversationData = loadFromLocalStorage('math_conversation', null);
    if (!conversationData) {
        return null;
    }
    
    return {
        messageCount: conversationData.messages ? conversationData.messages.length : 0,
        lastSaved: conversationData.lastSaved,
        sessionId: conversationData.sessionId,
        hasData: conversationData.messages && conversationData.messages.length > 0
    };
}

// Auto-save functionality
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

// Storage management utilities
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

// Theme management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    
    saveToLocalStorage('theme', newTheme);
}

function initializeTheme() {
    const savedTheme = loadFromLocalStorage('theme', 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Session Timestamp Functionality
function updateSessionTimestamp(timestamp = new Date()) {
    const sessionDisplay = document.getElementById('session-display');
    if (!sessionDisplay) return;
    
    // Store the session start time
    saveToLocalStorage('session_start_time', timestamp.toISOString());
    
    // Update the display
    updateSessionDisplayWithTime();
}

function updateSessionDisplayWithTime() {
    const sessionDisplay = document.getElementById('session-display');
    if (!sessionDisplay) return;
    
    const sessionStartTime = loadFromLocalStorage('session_start_time', null);
    if (!sessionStartTime) {
        sessionDisplay.textContent = 'ACTIVE';
        return;
    }
    
    const startTime = new Date(sessionStartTime);
    const now = new Date();
    const duration = now - startTime;
    
    // Format duration
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
    
    // Get session ID if available
    const sessionId = window.mathInterface ? window.mathInterface.sessionId : null;
    const sessionText = sessionId ? sessionId.slice(0, 8).toUpperCase() : 'ACTIVE';
    
    sessionDisplay.innerHTML = `
        <div class="session-id">${sessionText}</div>
        <div class="session-time" title="Session started ${startTime.toLocaleString()}">${timeText}</div>
    `;
}

function initializeSessionTimestamp() {
    // Set initial timestamp if not exists
    const sessionStartTime = loadFromLocalStorage('session_start_time', null);
    if (!sessionStartTime) {
        updateSessionTimestamp();
    } else {
        updateSessionDisplayWithTime();
    }
    
    // Update every minute
    setInterval(updateSessionDisplayWithTime, 60000);
}

// Conversation management
function copyConversation() {
    const messages = document.querySelectorAll('.message');
    let conversationText = 'Mathematical Conversation\n\n';
    
    messages.forEach(message => {
        const isUser = message.classList.contains('message-user');
        const content = message.querySelector('.content');
        if (content) {
            const role = isUser ? 'Student' : 'Teacher';
            const text = content.textContent.trim();
            conversationText += `${role}: ${text}\n\n`;
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
    if (confirm('Clear this conversation? This action cannot be undone.')) {
        if (window.mathInterface && typeof window.mathInterface.clearConversation === 'function') {
            // Use the enhanced interface method
            window.mathInterface.clearConversation();
        } else {
            // Fallback to manual clearing
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
    
    // Clear stored conversation but keep session info
    clearStoredConversation();
    
    // Reset session timestamp
    updateSessionTimestamp();
}

// Button Feedback Functions
function addButtonFeedback(button, callback) {
    button.addEventListener('click', (e) => {
        // Add clicked state
        button.classList.add('clicked');
        
        // Create ripple effect
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.className = 'btn-ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        button.appendChild(ripple);
        
        // Execute callback
        if (callback) callback();
        
        // Remove effects after animation
        setTimeout(() => {
            button.classList.remove('clicked');
            if (ripple.parentNode) {
                ripple.remove();
            }
        }, 300);
    });
}

// Symbol and Template Palette Management
function initializePalettes() {
    const symbolsBtn = document.getElementById('symbols-btn');
    const templatesBtn = document.getElementById('templates-btn');
    const symbolPalette = document.getElementById('symbol-palette');
    const templatePalette = document.getElementById('template-palette');
    const closeSymbols = document.getElementById('close-symbols');
    const closeTemplates = document.getElementById('close-templates');
    
    if (symbolsBtn && symbolPalette) {
        addButtonFeedback(symbolsBtn, () => {
            templatePalette.classList.add('hidden');
            symbolPalette.classList.toggle('hidden');
        });
    }
    
    if (templatesBtn && templatePalette) {
        addButtonFeedback(templatesBtn, () => {
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
    
    const symbolBtns = document.querySelectorAll('.symbol-btn');
    symbolBtns.forEach(btn => {
        addButtonFeedback(btn, () => {
            const symbol = btn.getAttribute('data-symbol');
            insertSymbolAtCursor(symbol);
            symbolPalette.classList.add('hidden');
        });
    });
    
    const templateBtns = document.querySelectorAll('.template-btn');
    templateBtns.forEach(btn => {
        addButtonFeedback(btn, () => {
            const template = btn.getAttribute('data-template');
            insertTemplateText(template);
            templatePalette.classList.add('hidden');
        });
    });
    
    document.addEventListener('click', (e) => {
        if (!symbolPalette.contains(e.target) && !symbolsBtn.contains(e.target)) {
            symbolPalette.classList.add('hidden');
        }
        if (!templatePalette.contains(e.target) && !templatesBtn.contains(e.target)) {
            templatePalette.classList.add('hidden');
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            symbolPalette.classList.add('hidden');
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

// Message History Navigation System
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

    navigateDown(currentInputValue = '') {
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

    clearHistory() {
        this.history = [];
        this.currentIndex = -1;
        this.tempMessage = '';
        localStorage.removeItem('message_history');
    }
}

let messageHistory = null;

function initializeMessageHistory() {
    messageHistory = new MessageHistory();
    
    const messageInput = document.getElementById('message-input');
    if (!messageInput) {
        console.warn('Message input not found for history initialization');
        return;
    }

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            messageHistory.navigateUp(messageInput.value);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            messageHistory.navigateDown(messageInput.value);
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

    console.log('✓ Message history navigation initialized');
}

function addToMessageHistory(message) {
    if (messageHistory && message) {
        messageHistory.addMessage(message);
    }
}

//Error Messages
function getErrorMessage(error, context = '') {
    const errorMsg = error.message || error.toString();
    
    // Network-related errors
    if (error.name === 'TypeError' && errorMsg.includes('fetch')) {
        return "Can't connect to the server right now. Check your internet connection.";
    }
    
    if (errorMsg.includes('404')) {
        return "Server's not responding. Try again in a moment.";
    }
    
    if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
        return "Server's having issues. Give it a minute and try again.";
    }
    
    if (errorMsg.includes('timeout')) {
        return "That's taking too long. Try asking your question again.";
    }
    
    // API quota/rate limiting
    if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit')) {
        return "API is overloaded right now. Wait a few minutes before trying again.";
    }
    
    // Gemini-specific errors
    if (errorMsg.includes('SAFETY')) {
        return "Your question triggered a safety filter. Try rephrasing it.";
    }
    
    if (errorMsg.includes('RECITATION')) {
        return "Can't answer that specific question. Try asking it differently.";
    }
    
    // Generic fallback
    return "Something went wrong. Try your question again.";
}

// Notification system
function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '6px',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        zIndex: '1000',
        boxShadow: '0 4px 12px var(--shadow)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border-bright)',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });
    
    switch (type) {
        case 'success':
            notification.style.background = 'var(--success)';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.background = 'var(--error)';
            notification.style.color = 'white';
            break;
        default:
            notification.style.background = 'var(--card-bg)';
            notification.style.color = 'var(--text-primary)';
    }
    
    document.body.appendChild(notification);
    
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'transform 0.3s ease';
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function showHelp() {
    const helpMessages = [
        "Explain quadratic equations",
        "Help me solve x² + 5x + 6 = 0",
        "Graph f(x) = x² - 4x + 3",
        "Give me practice problems for derivatives",
        "What's the difference between mean and median?",
        "How do I find the limit of this function?",
        "Show me how to integrate by parts",
        "Explain the chain rule with examples"
    ];
    
    const randomMessage = helpMessages[Math.floor(Math.random() * helpMessages.length)];
    document.getElementById('message-input').value = randomMessage;
}

// Status Indicator Functions
function updateConnectionStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    if (!indicator) return;
    
    indicator.classList.remove('connected', 'connecting', 'disconnected', 'error');
    indicator.classList.add(status);
}

function showTypingIndicator() {
    const conversationArea = document.getElementById('conversation');
    if (!conversationArea) return;
    
    if (document.querySelector('.typing-indicator')) {
        return;
    }
    
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
        sendButton.classList.add('loading');
        sendButton.disabled = true;
    }
    
    return showTypingIndicator;
}

function hideLoadingState() {
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.classList.remove('loading');
        sendButton.disabled = false;
        sendButton.innerHTML = 'execute';
    }
    
    hideTypingIndicator();
}

// Enhanced scroll utility with user scroll detection
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
            // User initiated scroll
            if (!this.autoScrolling) {
                this.userScrolling = true;
                clearTimeout(this.scrollTimeout);
                
                this.scrollTimeout = setTimeout(() => {
                    this.userScrolling = false;
                }, 1000); // Reset after 1 second of no scrolling
            }
        });
        
        // Reset user scrolling when they reach the bottom
        this.container.addEventListener('scroll', () => {
            const isAtBottom = this.container.scrollTop + this.container.clientHeight >= this.container.scrollHeight - 50;
            if (isAtBottom) {
                this.userScrolling = false;
            }
        });
    }
    
    scrollToBottom(force = false) {
        if (!this.container) return;
        
        // Don't auto-scroll if user is actively scrolling (unless forced)
        if (this.userScrolling && !force) {
            return;
        }
        
        this.autoScrolling = true;
        
        this.container.scrollTo({
            top: this.container.scrollHeight,
            behavior: 'smooth'
        });
        
        setTimeout(() => {
            this.autoScrolling = false;
        }, 500);
    }
    
    ensureVisible(element) {
        if (!element || !this.container) return;
        
        const containerRect = this.container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        const isVisible = (
            elementRect.top >= containerRect.top &&
            elementRect.bottom <= containerRect.bottom
        );
        
        if (!isVisible) {
            this.autoScrolling = true;
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
            
            setTimeout(() => {
                this.autoScrolling = false;
            }, 500);
        }
    }
}

// Math rendering utilities
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

// Scroll utilities
function scrollToBottom(container, smooth = true) {
    if (!container) return;
    
    const scrollOptions = {
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
    };
    
    container.scrollTo(scrollOptions);
}

// Delay utility for typing animation
function getTypingDelay(char) {
    let delay = 25;
    if (char === '.' || char === '?' || char === '!') {
        delay = 400;
    } else if (char === ',' || char === ';') {
        delay = 200;
    } else if (char === ' ') {
        delay = 50;
    } else if (char === '\n') {
        delay = 100;
    }
    
    return delay + Math.random() * 15;
}

// Parse mathematical expressions for graphing
function parseMathExpression(expression, xVal) {
    let expr = expression.replace(/f\(x\)\s*=\s*/, '');
    
    expr = expr.replace(/\^/g, '**');
    expr = expr.replace(/(\d+)\s*\*\s*\*/g, 'Math.pow($1,');
    expr = expr.replace(/x\*\*(\d+)/g, 'Math.pow(x, $1)');
    expr = expr.replace(/x\^(\d+)/g, 'Math.pow(x, $1)');
    expr = expr.replace(/\bx\b/g, `(${xVal})`);
    
    expr = expr.replace(/\bsin\b/g, 'Math.sin');
    expr = expr.replace(/\bcos\b/g, 'Math.cos');
    expr = expr.replace(/\btan\b/g, 'Math.tan');
    expr = expr.replace(/\blog\b/g, 'Math.log10');
    expr = expr.replace(/\bln\b/g, 'Math.log');
    expr = expr.replace(/\bsqrt\b/g, 'Math.sqrt');
    expr = expr.replace(/\babs\b/g, 'Math.abs');
    expr = expr.replace(/\bexp\b/g, 'Math.exp');
    
    expr = expr.replace(/\bpi\b/g, 'Math.PI');
    expr = expr.replace(/\be\b/g, 'Math.E');
    
    return expr;
}

// Copy text to clipboard
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

// Local storage helpers
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