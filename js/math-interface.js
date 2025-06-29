class EnhancedMathInterface {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.sessionId = null;
        this.isLoading = false;
        
        this.conversationArea = document.getElementById('conversation');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.sessionDisplay = document.getElementById('session-display');
        
        this.initializeEventListeners();
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
            
            // Update session ID if new
            if (data.session_id && data.session_id !== this.sessionId) {
                this.sessionId = data.session_id;
                this.sessionDisplay.textContent = this.sessionId.slice(0, 8).toUpperCase();
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
        this.sendButton.disabled = loading;
        this.sendButton.innerHTML = loading ? '<span class="loading-dots">processing</span>' : 'send';
    }
}