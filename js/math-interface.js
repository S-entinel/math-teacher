class MathInterface {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.sessionId = null;
        this.isLoading = false;
        this.sessionReady = false;
        this.chatManager = null; // Will be set by app.js
        
        this.conversationArea = document.getElementById('conversation');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.sessionDisplay = document.getElementById('session-display');
        
        this.artifactRenderer = window.artifactRenderer;
        
        this.initializeEventListeners();
        this.initializeSession();
    }
    
    async initializeSession(sessionId = null) {
        try {
            this.setConnectionStatus('connecting');
            
            // Use provided sessionId or get from chat manager
            let targetSessionId = sessionId;
            if (!targetSessionId && this.chatManager) {
                targetSessionId = this.chatManager.getCurrentSessionId();
            }
            
            if (targetSessionId) {
                const sessionStatus = await this.getSessionStatus(targetSessionId);
                
                if (!sessionStatus.exists) {
                    await this.ensureSession(targetSessionId);
                }
                
                this.sessionId = targetSessionId;
                this.updateSessionDisplay(targetSessionId);
                console.log(`✓ Using session: ${targetSessionId.slice(0, 8)}`);
            } else {
                const response = await fetch(`${this.apiUrl}/sessions/new`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to create session: ${response.statusText}`);
                }
                
                const data = await response.json();
                this.sessionId = data.session_id;
                
                saveToLocalStorage('current_session_id', this.sessionId);
                this.updateSessionDisplay(this.sessionId);
                console.log(`✓ Created new session: ${this.sessionId.slice(0, 8)}`);
            }
            
            this.sessionReady = true;
            this.setConnectionStatus('connected');
            this.enableInterface();
            
        } catch (error) {
            console.error('Failed to initialize session:', error);
            this.setConnectionStatus('error');
            showNotification('Failed to initialize session', 'error');
            this.enableInterface();
        }
    }
    
    async getSessionStatus(sessionId) {
        try {
            const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/status`);
            if (!response.ok) {
                throw new Error(`Session status check failed: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to get session status:', error);
            return { exists: false };
        }
    }
    
    async ensureSession(sessionId) {
        try {
            const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/ensure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to ensure session: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`✓ Ensured session exists: ${data.session_id.slice(0, 8)}`);
            return data;
        } catch (error) {
            console.error('Failed to ensure session:', error);
            throw error;
        }
    }
    
    enableInterface() {
        const clearButton = document.getElementById('clear-conversation');
        if (clearButton) clearButton.disabled = false;
        
        this.sendButton.disabled = false;
        this.messageInput.disabled = false;
        this.messageInput.placeholder = "enter query...";
    }
    
    updateSessionDisplay(sessionId) {
        if (this.sessionDisplay && sessionId) {
            this.sessionDisplay.innerHTML = `
                <div class="session-id">${sessionId.slice(0, 8).toUpperCase()}</div>
                <div class="session-time">ready</div>
            `;
        }
    }
    
    initializeEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;
        
        if (!this.sessionReady || !this.sessionId) {
            showNotification('Session not ready, please wait...', 'warning');
            return;
        }
        
        addToMessageHistory(message);
        
        // Add to chat manager first
        if (this.chatManager) {
            this.chatManager.addMessageToActiveChat('user', message);
            
            // Auto-generate title for first message
            const currentChat = this.chatManager.getCurrentChat();
            if (currentChat && currentChat.messages.length === 1) {
                const title = this.chatManager.generateChatTitle(message);
                this.chatManager.updateChatTitle(currentChat.id, title);
            }
        }
        
        this.addMessageGroup([{
            role: 'user',
            content: message,
            timestamp: new Date()
        }]);

        
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.setLoadingState(true);
        
        this.setConnectionStatus('connecting');
        showTypingIndicator();
        showLoadingState();
        
        try {
            const response = await fetch(`${this.apiUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    session_id: this.sessionId
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.details = errorData;
                throw error;
            }
            
            this.setConnectionStatus('connected');
            const data = await response.json();
            
            if (data.session_id && data.session_id !== this.sessionId) {
                this.sessionId = data.session_id;
                saveToLocalStorage('current_session_id', this.sessionId);
                this.updateSessionDisplay(this.sessionId);
                updateSessionTimestamp(new Date());
            }
            
        hideLoadingState();
        
        const responseGroup = this.createResponseGroup();
        await this.streamResponseWithArtifacts(responseGroup.querySelector('.content'), data.response);
        
        // Add response to chat manager
        if (this.chatManager) {
            this.chatManager.addMessageToActiveChat('assistant', data.response);
        }
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            this.setConnectionStatus('error');
            hideLoadingState();
            
            const responseGroup = this.createResponseGroup();
            const errorMessage = getErrorMessage(error);
            await this.streamResponse(
                responseGroup.querySelector('.content'), 
                errorMessage,
                true
            );
            
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                showNotification(`Debug: ${error.message}`, 'error');
            }
            
        } finally {
            this.setLoadingState(false);
            hideTypingIndicator();
            
            setTimeout(() => {
                this.setConnectionStatus('connected');
            }, 2000);
        }
    }
    
    async clearConversation() {
        if (!this.sessionId) {
            showNotification('No active session to clear', 'warning');
            return false;
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/sessions/${this.sessionId}/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                console.warn(`Clear session returned ${response.status}, but continuing...`);
            }
            
            this.resetConversationInterface();
            
            // Clear chat manager's active chat messages
            if (this.chatManager) {
                const currentChat = this.chatManager.getCurrentChat();
                if (currentChat) {
                    currentChat.messages = [];
                    this.chatManager.updateChatItemUI(currentChat.id);
                    this.chatManager.saveChats();
                }
            }
            
            showNotification('Conversation cleared', 'success');
            return true;
            
        } catch (error) {
            console.error('Error clearing conversation:', error);
            this.resetConversationInterface();
            showNotification('Conversation cleared locally', 'warning');
            return false;
        }
    }
    
    resetConversationInterface() {
        if (this.conversationArea) {
            this.conversationArea.innerHTML = `
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
    
    addMessageGroup(messages) {
        const groupElement = document.createElement('div');
        groupElement.className = 'message-group';
        
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message message-${message.role}`;
            
            const contentElement = document.createElement('div');
            contentElement.className = 'content';
            if (message.isError) {
                contentElement.classList.add('error');
            }
            contentElement.textContent = message.content;
            
            messageElement.appendChild(contentElement);
            groupElement.appendChild(messageElement);
        });
        
        this.conversationArea.appendChild(groupElement);
        
        if (window.conversationScrollManager) {
            window.conversationScrollManager.scrollToBottom();
        } else {
            scrollToBottom(this.conversationArea);
        }
        
        renderMath(groupElement);
        scheduleAutoSave();
    }
    
    createResponseGroup() {
        const groupElement = document.createElement('div');
        groupElement.className = 'message-group';
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message message-assistant';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'content';
        contentElement.innerHTML = '<span class="streaming-cursor">_</span>';
        
        messageElement.appendChild(contentElement);
        groupElement.appendChild(messageElement);
        this.conversationArea.appendChild(groupElement);
        
        if (window.conversationScrollManager) {
            window.conversationScrollManager.scrollToBottom();
        } else {
            scrollToBottom(this.conversationArea);
        }
        
        return groupElement;
    }
    
    async streamResponseWithArtifacts(element, text, isError = false) {
        if (isError) element.classList.add('error');
        
        const processedText = await this.artifactRenderer.processArtifacts(element, text, this.sessionId);
        
        element.innerHTML = '';
        const cursor = document.createElement('span');
        cursor.className = 'streaming-cursor';
        cursor.textContent = '_';
        element.appendChild(cursor);
        
        let currentContent = '';
        
        for (let i = 0; i < processedText.length; i++) {
            const char = processedText[i];
            currentContent += char;
            
            element.innerHTML = currentContent + '<span class="streaming-cursor">_</span>';
            
            renderMathLive(element);
            
            if (window.conversationScrollManager) {
                window.conversationScrollManager.scrollToBottom();
            } else {
                scrollToBottom(this.conversationArea);
            }
            
            await new Promise(resolve => setTimeout(resolve, getTypingDelay(char)));
        }
        
        element.innerHTML = currentContent;
        this.artifactRenderer.applyArtifacts(element);
        renderMath(element);
        scheduleAutoSave();
    }
    
    async streamResponse(element, text, isError = false) {
        if (isError) element.classList.add('error');
        
        element.innerHTML = '';
        const cursor = document.createElement('span');
        cursor.className = 'streaming-cursor';
        cursor.textContent = '_';
        element.appendChild(cursor);
        
        let currentContent = '';
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            currentContent += char;
            
            element.innerHTML = currentContent + '<span class="streaming-cursor">_</span>';
            
            renderMathLive(element);
            
            if (window.conversationScrollManager) {
                window.conversationScrollManager.scrollToBottom();
            } else {
                scrollToBottom(this.conversationArea);
            }
            
            await new Promise(resolve => setTimeout(resolve, getTypingDelay(char)));
        }
        
        element.innerHTML = currentContent;
        renderMath(element);
        scheduleAutoSave();
    }
    
    setLoadingState(loading) {
        this.isLoading = loading;
        this.sendButton.disabled = loading || !this.sessionReady;
        this.sendButton.innerHTML = loading ? '<span class="loading-dots">PROCESSING</span>' : 'EXECUTE';
    }
    
    setConnectionStatus(status) {
        updateConnectionStatus(status);
    }
}