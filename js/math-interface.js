class EnhancedMathInterface {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.sessionId = null;
        this.isLoading = false;
        this.sessionReady = false;
        
        this.conversationArea = document.getElementById('conversation');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.sessionDisplay = document.getElementById('session-display');
        
        this.initializeEventListeners();
        this.initializeSession();
    }
    
    async initializeSession() {
        try {
            updateConnectionStatus('connecting');
            
            // Check if we have a stored session ID
            const storedSessionId = loadFromLocalStorage('current_session_id', null);
            
            if (storedSessionId) {
                // Verify stored session exists and ensure it's created on backend
                const sessionStatus = await this.getSessionStatus(storedSessionId);
                
                if (!sessionStatus.exists) {
                    // Session doesn't exist on backend, ensure it exists
                    await this.ensureSession(storedSessionId);
                }
                
                this.sessionId = storedSessionId;
                this.updateSessionDisplay(storedSessionId);
                console.log(`✓ Restored session: ${storedSessionId.slice(0, 8)}`);
            } else {
                // Create new session
                const response = await fetch(`${this.apiUrl}/sessions/new`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to create session: ${response.statusText}`);
                }
                
                const data = await response.json();
                this.sessionId = data.session_id;
                
                // Store session ID for persistence
                saveToLocalStorage('current_session_id', this.sessionId);
                this.updateSessionDisplay(this.sessionId);
                console.log(`✓ Created new session: ${this.sessionId.slice(0, 8)}`);
            }
            
            this.sessionReady = true;
            updateConnectionStatus('connected');
            this.enableUI();
            
        } catch (error) {
            console.error('Failed to initialize session:', error);
            updateConnectionStatus('error');
            showNotification('Failed to initialize session', 'error');
            
            // Fallback: still enable UI but warn user
            this.enableUI();
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
                headers: {
                    'Content-Type': 'application/json',
                }
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
    
    enableUI() {
        // Enable buttons that require session
        const clearButton = document.getElementById('clear-conversation');
        if (clearButton) {
            clearButton.disabled = false;
        }
        
        // Enable send functionality
        this.sendButton.disabled = false;
        this.messageInput.disabled = false;
        
        // Update UI state
        this.messageInput.placeholder = "enter mathematical query...";
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
        
        // Ensure session is ready
        if (!this.sessionReady || !this.sessionId) {
            showNotification('Session not ready, please wait...', 'warning');
            return;
        }
        
        // Add to message history
        addToMessageHistory(message);
        
        // Add user message
        this.addMessageGroup([{
            role: 'user',
            content: message,
            timestamp: new Date()
        }]);
        
        // Clear input and show loading
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.setLoadingState(true);
        
        // Show status indicators
        updateConnectionStatus('connecting');
        showTypingIndicator();
        const loadingIndicator = showLoadingState();
        
        try {
            const response = await fetch(`${this.apiUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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
            
            // Update status to connected
            updateConnectionStatus('connected');
            
            const data = await response.json();
            
            // Update session ID if changed (shouldn't happen with proper session management)
            if (data.session_id && data.session_id !== this.sessionId) {
                this.sessionId = data.session_id;
                saveToLocalStorage('current_session_id', this.sessionId);
                this.updateSessionDisplay(this.sessionId);
                updateSessionTimestamp(new Date());
            }
            
            // Hide loading indicator before streaming
            hideLoadingState();
            
            // Create response group and start streaming
            const responseGroup = this.createResponseGroup();
            await this.streamResponse(responseGroup.querySelector('.content'), data.response);
            
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Update status to error
            updateConnectionStatus('error');
            
            // Hide loading and show error
            hideLoadingState();
            
            const responseGroup = this.createResponseGroup();
            const errorMessage = getErrorMessage(error);
            await this.streamResponse(
                responseGroup.querySelector('.content'), 
                errorMessage,
                true
            );
            
            // Show notification with error details for debugging
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                showNotification(`Debug: ${error.message}`, 'error');
            }
            
        } finally {
            this.setLoadingState(false);
            hideTypingIndicator();
            
            // Return to normal status after a delay
            setTimeout(() => {
                updateConnectionStatus('connected');
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
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                // Log the error but don't fail - backend might handle this gracefully
                console.warn(`Clear session returned ${response.status}, but continuing...`);
            }
            
            // Clear frontend conversation regardless of backend response
            this.resetConversationUI();
            showNotification('Conversation cleared', 'success');
            return true;
            
        } catch (error) {
            console.error('Error clearing conversation:', error);
            
            // Still clear frontend even if backend fails
            this.resetConversationUI();
            showNotification('Conversation cleared locally', 'warning');
            return false;
        }
    }
    
    resetConversationUI() {
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
        
        // Clear stored conversation but keep session
        clearStoredConversation();
        
        // Reset session timestamp but keep the session ID
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
        
        // Smart scroll to bottom
        if (window.conversationScrollManager) {
            window.conversationScrollManager.scrollToBottom();
        } else {
            scrollToBottom(this.conversationArea);
        }
        
        // Render math for the group
        renderMath(groupElement);
        
        // Auto-save conversation after new message
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
    
    async streamResponse(element, text, isError = false) {
        if (isError) element.classList.add('error');
        
        element.innerHTML = '';
        const cursor = document.createElement('span');
        cursor.className = 'streaming-cursor';
        cursor.textContent = '_';
        element.appendChild(cursor);
        
        let currentContent = '';
        
        // Stream each character with natural timing
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            currentContent += char;
            
            element.innerHTML = currentContent + '<span class="streaming-cursor">_</span>';
            
            // Handle special commands during streaming
            if (currentContent.includes('[GRAPH:') && currentContent.includes(']')) {
                await this.handleGraphCommand(element, currentContent);
            }
            if (currentContent.includes('[PRACTICE:') && currentContent.includes(']')) {
                await this.handlePracticeCommand(element, currentContent);
            }
            
            renderMathLive(element);
            
            // Smart scroll during streaming
            if (window.conversationScrollManager) {
                window.conversationScrollManager.scrollToBottom();
            } else {
                scrollToBottom(this.conversationArea);
            }
            
            await new Promise(resolve => setTimeout(resolve, getTypingDelay(char)));
        }
        
        // Final render
        element.innerHTML = currentContent;
        renderMath(element);
        this.handleAllCommands(element, currentContent);
        
        // Auto-save after streaming is complete
        scheduleAutoSave();
    }
    
    async handleAllCommands(element, content) {
        // Process all remaining commands
        if (content.includes('[GRAPH:')) await this.handleGraphCommand(element, content);
        if (content.includes('[PRACTICE:')) await this.handlePracticeCommand(element, content);
    }
    
    setLoadingState(loading) {
        this.isLoading = loading;
        this.sendButton.disabled = loading || !this.sessionReady;
        this.sendButton.innerHTML = loading ? '<span class="loading-dots">processing</span>' : 'execute';
    }
}