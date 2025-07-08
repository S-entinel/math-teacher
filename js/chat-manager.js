// js/chat-manager.js
class ChatManager {
    constructor() {
        this.chats = new Map();
        this.activeChat = null;
        this.chatCounter = 0;
        this.mathInterface = null;
        
        this.initializeUI();
        this.loadChats();
    }

    initializeUI() {
        this.createChatSidebar();
        this.setupEventListeners();
    }

    createChatSidebar() {
        const container = document.querySelector('.container');
        
        // Update container grid to include sidebar
        container.style.gridTemplateColumns = '280px 1fr';
        container.style.gridTemplateAreas = `
            "sidebar header"
            "sidebar main"
            "sidebar input"
        `;

        // Create sidebar
        const sidebar = document.createElement('div');
        sidebar.className = 'chat-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <button id="new-chat-btn" class="sidebar-btn primary">
                    <span>+ NEW CHAT</span>
                </button>
            </div>
            <div class="chat-list-container">
                <div id="chat-list" class="chat-list"></div>
            </div>
            <div class="sidebar-footer">
                <button id="clear-all-chats-btn" class="sidebar-btn danger">
                    <span>CLEAR ALL</span>
                </button>
            </div>
        `;

        // Insert sidebar at the beginning
        container.insertBefore(sidebar, container.firstChild);

        // Update header grid area
        const header = document.querySelector('.header');
        header.style.gridArea = 'header';
    }

    setupEventListeners() {
        document.getElementById('new-chat-btn').addEventListener('click', () => {
            this.createNewChat();
        });

        document.getElementById('clear-all-chats-btn').addEventListener('click', () => {
            this.clearAllChats();
        });

        // Handle window resize for responsive design
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    async createNewChat(title = null) {
        const chatId = `chat_${Date.now()}_${++this.chatCounter}`;
        const defaultTitle = `Math Session ${this.chatCounter}`;
        
        const chat = {
            id: chatId,
            title: title || defaultTitle,
            sessionId: null,
            messages: [],
            createdAt: new Date(),
            lastActive: new Date()
        };

        // Create new session
        try {
            const response = await fetch('http://localhost:8000/sessions/new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                chat.sessionId = data.session_id;
            }
        } catch (error) {
            console.error('Failed to create session for new chat:', error);
        }

        this.chats.set(chatId, chat);
        this.addChatToUI(chat);
        this.switchToChat(chatId);
        this.saveChats();
        
        return chatId;
    }

    addChatToUI(chat) {
        const chatList = document.getElementById('chat-list');
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat.id;
        
        chatItem.innerHTML = `
            <div class="chat-item-content">
                <div class="chat-title">${chat.title}</div>
                <div class="chat-meta">
                    <span class="chat-time">${this.formatTime(chat.lastActive)}</span>
                    <span class="chat-message-count">${chat.messages.length} msgs</span>
                </div>
            </div>
            <div class="chat-item-actions">
                <button class="chat-action-btn rename-btn" title="Rename">
                    <span>✎</span>
                </button>
                <button class="chat-action-btn delete-btn" title="Delete">
                    <span>×</span>
                </button>
            </div>
        `;

        // Add event listeners
        chatItem.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-item-actions')) {
                this.switchToChat(chat.id);
            }
        });

        chatItem.querySelector('.rename-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.renameChatDialog(chat.id);
        });

        chatItem.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteChatDialog(chat.id);
        });

        chatList.appendChild(chatItem);
    }

    async switchToChat(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) return;

        // Update active chat
        this.activeChat = chatId;
        chat.lastActive = new Date();

        // Update UI
        this.updateActiveChatUI();
        await this.loadChatMessages(chat);
        this.updateHeaderInfo(chat);
        
        // Update math interface session
        if (window.mathInterface && chat.sessionId) {
            window.mathInterface.sessionId = chat.sessionId;
            window.mathInterface.updateSessionDisplay(chat.sessionId);
        }

        this.saveChats();
    }

    updateActiveChatUI() {
        // Remove active class from all chat items
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to current chat
        const activeItem = document.querySelector(`[data-chat-id="${this.activeChat}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    async loadChatMessages(chat) {
        const conversationArea = document.getElementById('conversation');
        conversationArea.innerHTML = `
            <div class="message-group">
                <div class="message message-assistant">
                    <div class="content">
                        Right, I'm your AI math teacher. Ask me whatever mathematical questions you have - I'll give you clear, direct explanations. Try to keep up.
                    </div>
                </div>
            </div>
        `;

        // Load stored messages
        for (const message of chat.messages) {
            this.addMessageToConversation(message.role, message.content, false);
        }

        // Scroll to bottom
        if (window.conversationScrollManager) {
            window.conversationScrollManager.scrollToBottom();
        }
    }

    addMessageToConversation(role, content, shouldRender = true) {
        const conversationArea = document.getElementById('conversation');
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
        
        if (shouldRender) {
            renderMath(messageGroup);
        }
    }

    updateHeaderInfo(chat) {
        // Update session display to show chat info
        const sessionDisplay = document.getElementById('session-display');
        if (sessionDisplay) {
            const duration = this.getSessionDuration(chat.createdAt);
            sessionDisplay.innerHTML = `
                <div class="session-id">${chat.title.toUpperCase()}</div>
                <div class="session-time">${duration}</div>
            `;
        }
    }

    getSessionDuration(startTime) {
        const now = new Date();
        const duration = now - new Date(startTime);
        const minutes = Math.floor(duration / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return 'now';
        }
    }

    addMessageToActiveChat(role, content) {
        if (!this.activeChat) return;
        
        const chat = this.chats.get(this.activeChat);
        if (chat) {
            chat.messages.push({
                role,
                content,
                timestamp: new Date()
            });
            chat.lastActive = new Date();
            
            this.updateChatItemUI(this.activeChat);
            this.saveChats();
        }
    }

    updateChatItemUI(chatId) {
        const chat = this.chats.get(chatId);
        const chatItem = document.querySelector(`[data-chat-id="${chatId}"]`);
        
        if (chat && chatItem) {
            const titleElement = chatItem.querySelector('.chat-title');
            const timeElement = chatItem.querySelector('.chat-time');
            const countElement = chatItem.querySelector('.chat-message-count');
            
            titleElement.textContent = chat.title;
            timeElement.textContent = this.formatTime(chat.lastActive);
            countElement.textContent = `${chat.messages.length} msgs`;
        }
    }

    formatTime(date) {
        const now = new Date();
        const diff = now - new Date(date);
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'now';
    }

    renameChatDialog(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) return;

        const newTitle = prompt('Enter new chat title:', chat.title);
        if (newTitle && newTitle.trim() && newTitle !== chat.title) {
            chat.title = newTitle.trim();
            this.updateChatItemUI(chatId);
            this.updateHeaderInfo(chat);
            this.saveChats();
        }
    }

    deleteChatDialog(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) return;

        if (confirm(`Delete "${chat.title}"? This action cannot be undone.`)) {
            this.deleteChat(chatId);
        }
    }

    async deleteChat(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) return;

        // Delete session on server
        if (chat.sessionId) {
            try {
                await fetch(`http://localhost:8000/sessions/${chat.sessionId}`, {
                    method: 'DELETE'
                });
            } catch (error) {
                console.error('Failed to delete session:', error);
            }
        }

        // Remove from UI
        const chatItem = document.querySelector(`[data-chat-id="${chatId}"]`);
        if (chatItem) {
            chatItem.remove();
        }

        // Remove from memory
        this.chats.delete(chatId);

        // Switch to another chat or create new one
        if (this.activeChat === chatId) {
            const remainingChats = Array.from(this.chats.keys());
            if (remainingChats.length > 0) {
                this.switchToChat(remainingChats[0]);
            } else {
                this.createNewChat();
            }
        }

        this.saveChats();
    }

    clearAllChats() {
        if (this.chats.size === 0) return;

        if (confirm('Clear all chats? This action cannot be undone.')) {
            // Clear UI
            document.getElementById('chat-list').innerHTML = '';
            
            // Clear memory
            this.chats.clear();
            this.activeChat = null;
            
            // Create new chat
            this.createNewChat();
            
            this.saveChats();
        }
    }

    handleResize() {
        const container = document.querySelector('.container');
        const sidebar = document.querySelector('.chat-sidebar');
        
        if (window.innerWidth <= 768) {
            // Mobile: hide sidebar by default
            container.style.gridTemplateColumns = '1fr';
            container.style.gridTemplateAreas = `
                "header"
                "main"
                "input"
            `;
            sidebar.style.display = 'none';
        } else {
            // Desktop: show sidebar
            container.style.gridTemplateColumns = '280px 1fr';
            container.style.gridTemplateAreas = `
                "sidebar header"
                "sidebar main"
                "sidebar input"
            `;
            sidebar.style.display = 'flex';
        }
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.chat-sidebar');
        const container = document.querySelector('.container');
        
        if (sidebar.style.display === 'none') {
            sidebar.style.display = 'flex';
            container.style.gridTemplateColumns = '280px 1fr';
            container.style.gridTemplateAreas = `
                "sidebar header"
                "sidebar main"
                "sidebar input"
            `;
        } else {
            sidebar.style.display = 'none';
            container.style.gridTemplateColumns = '1fr';
            container.style.gridTemplateAreas = `
                "header"
                "main"
                "input"
            `;
        }
    }

    saveChats() {
        try {
            const chatsData = {
                chats: Array.from(this.chats.entries()).map(([id, chat]) => [id, {
                    ...chat,
                    createdAt: chat.createdAt.toISOString(),
                    lastActive: chat.lastActive.toISOString(),
                    messages: chat.messages.map(msg => ({
                        ...msg,
                        timestamp: msg.timestamp.toISOString()
                    }))
                }]),
                activeChat: this.activeChat,
                chatCounter: this.chatCounter
            };
            
            localStorage.setItem('math_teacher_chats', JSON.stringify(chatsData));
        } catch (error) {
            console.error('Failed to save chats:', error);
        }
    }

    loadChats() {
        try {
            const stored = localStorage.getItem('math_teacher_chats');
            if (stored) {
                const chatsData = JSON.parse(stored);
                
                // Restore chats
                this.chats = new Map(chatsData.chats.map(([id, chat]) => [id, {
                    ...chat,
                    createdAt: new Date(chat.createdAt),
                    lastActive: new Date(chat.lastActive),
                    messages: chat.messages.map(msg => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    }))
                }]));
                
                this.chatCounter = chatsData.chatCounter || 0;
                
                // Add chats to UI
                Array.from(this.chats.values())
                    .sort((a, b) => b.lastActive - a.lastActive)
                    .forEach(chat => this.addChatToUI(chat));
                
                // Restore active chat
                if (chatsData.activeChat && this.chats.has(chatsData.activeChat)) {
                    this.switchToChat(chatsData.activeChat);
                } else if (this.chats.size > 0) {
                    const firstChat = Array.from(this.chats.keys())[0];
                    this.switchToChat(firstChat);
                }
            }
            
            // Create first chat if none exist
            if (this.chats.size === 0) {
                this.createNewChat('Welcome');
            }
            
        } catch (error) {
            console.error('Failed to load chats:', error);
            this.createNewChat('Welcome');
        }
    }

    // Auto-generate chat titles based on first message
    generateChatTitle(firstMessage) {
        const words = firstMessage.split(' ').slice(0, 4).join(' ');
        return words.length > 30 ? words.substring(0, 30) + '...' : words;
    }

    updateChatTitle(chatId, title) {
        const chat = this.chats.get(chatId);
        if (chat && title && title.trim()) {
            chat.title = title.trim();
            this.updateChatItemUI(chatId);
            if (this.activeChat === chatId) {
                this.updateHeaderInfo(chat);
            }
            this.saveChats();
        }
    }

    // Public methods for integration
    getCurrentChat() {
        return this.chats.get(this.activeChat);
    }

    getCurrentSessionId() {
        const chat = this.getCurrentChat();
        return chat ? chat.sessionId : null;
    }
}

// Initialize chat manager
window.chatManager = new ChatManager();