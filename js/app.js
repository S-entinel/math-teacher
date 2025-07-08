// Application initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('🧮 Initializing AI Math Teacher Interface...');
    
    // Initialize core systems
    initializeTheme();
    console.log('✓ Theme system initialized');
    
    initializeSessionTimestamp();
    console.log('✓ Session timestamp initialized');
    
    initializeMessageHistory();
    console.log('✓ Message history navigation enabled');
    
    initializePalettes();
    console.log('✓ Math palettes initialized');
    
    // Initialize scroll manager
    const conversationArea = document.getElementById('conversation');
    if (conversationArea) {
        window.conversationScrollManager = new ScrollManager(conversationArea);
        console.log('✓ Smart scrolling initialized');
    }
    
    // Initialize chat manager FIRST
    if (!window.chatManager) {
        window.chatManager = new ChatManager();
        console.log('✓ Chat manager initialized');
    }
    
    // Initialize the main chat interface
    const mathInterface = new MathInterface();
    mathInterface.chatManager = window.chatManager; // Link them
    window.chatManager.mathInterface = mathInterface; // Bi-directional link
    console.log('✓ Chat interface initialized');
    
    // Make interface globally accessible
    window.mathInterface = mathInterface;
    
    // Initialize header controls
    initializeHeaderButtons();
    console.log('✓ Header controls initialized');
    
    // Setup keyboard shortcuts
    initializeKeyboardShortcuts();
    console.log('✓ Keyboard shortcuts registered');
    
    // Enable auto-save functionality
    enableAutoSave();
    console.log('✓ Auto-save enabled');
    
    // Initialize conversation persistence after session is ready
    initializeConversationPersistence();
    
    // Cleanup old data
    cleanupOldConversations();
    
    console.log('🎉 AI Math Teacher Interface ready!');
    logAvailableFeatures();
});

function initializeConversationPersistence() {
    // Wait for session to be ready before attempting restoration
    const checkSessionReady = () => {
        if (window.mathInterface && window.mathInterface.sessionReady) {
            const storedInfo = getStoredConversationInfo();
            
            if (storedInfo && storedInfo.hasData) {
                console.log(`📚 Found stored conversation with ${storedInfo.messageCount} messages`);
                console.log(`💾 Last saved: ${new Date(storedInfo.lastSaved).toLocaleString()}`);
                
                showNotification(`Found previous conversation with ${storedInfo.messageCount} messages. Restoring...`, 'info');
                
                setTimeout(() => {
                    const restored = loadConversationFromStorage();
                    if (!restored) {
                        console.log('❌ Failed to restore conversation');
                        showNotification('Failed to restore previous conversation', 'error');
                    }
                }, 500);
            } else {
                console.log('📝 No previous conversation found, starting fresh');
            }
        } else {
            setTimeout(checkSessionReady, 100);
        }
    };
    
    setTimeout(checkSessionReady, 500);
}

function initializeHeaderButtons() {
    const themeToggle = document.getElementById('theme-toggle');
    const copyButton = document.getElementById('copy-conversation');
    const clearButton = document.getElementById('clear-conversation');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    if (copyButton) {
        copyButton.addEventListener('click', copyConversation);
    }
    
    if (clearButton) {
        clearButton.addEventListener('click', clearConversation);
    }
    
    // Mobile sidebar toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            if (window.chatManager) {
                window.chatManager.toggleSidebar();
            }
        });
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (window.chatManager) {
                window.chatManager.toggleSidebar();
            }
        });
    }
}

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K to focus input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const input = document.getElementById('message-input');
            if (input) {
                input.focus();
                showNotification('Input focused', 'info');
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            if (window.chatManager) {
                window.chatManager.createNewChat();
                showNotification('New chat created', 'info');
            }
        }
        
        // Ctrl/Cmd + Shift + L to toggle sidebar
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            if (window.chatManager) {
                window.chatManager.toggleSidebar();
                showNotification('Sidebar toggled', 'info');
            }
        }
        
        // Ctrl/Cmd + Shift + D to toggle dark mode
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            toggleTheme();
        }
        
        // Ctrl/Cmd + Shift + C to copy conversation
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            copyConversation();
        }
        
        // Ctrl/Cmd + Shift + S to open symbols palette
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            const symbolsBtn = document.getElementById('symbols-btn');
            if (symbolsBtn) {
                symbolsBtn.click();
                showNotification('Symbol palette opened', 'info');
            }
        }
        
        // Ctrl/Cmd + Shift + T to open templates palette
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            const templatesBtn = document.getElementById('templates-btn');
            if (templatesBtn) {
                templatesBtn.click();
                showNotification('Template palette opened', 'info');
            }
        }
        
        // Ctrl/Cmd + Shift + H to show help
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
            e.preventDefault();
            showHelp();
            showNotification('Help suggestion added', 'info');
        }
        
        // Ctrl/Cmd + Shift + R to manually save conversation
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            const saved = saveConversationToStorage();
            if (saved) {
                showNotification('Conversation saved to local storage', 'success');
            } else {
                showNotification('Failed to save conversation', 'error');
            }
        }
        
        // Ctrl/Cmd + Enter to send message
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const input = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');
            if (input && input === document.activeElement && sendButton) {
                e.preventDefault();
                sendButton.click();
            }
        }
        
        // Escape key handling
        if (e.key === 'Escape') {
            handleEscapeKey();
        }
    });
}

function handleEscapeKey() {
    // Close any open palettes first
    const symbolPalette = document.getElementById('symbol-palette');
    const templatePalette = document.getElementById('template-palette');
    
    if (symbolPalette && !symbolPalette.classList.contains('hidden')) {
        symbolPalette.classList.add('hidden');
        return;
    }
    
    if (templatePalette && !templatePalette.classList.contains('hidden')) {
        templatePalette.classList.add('hidden');
        return;
    }
    
    // Exit fullscreen artifacts
    const fullscreenArtifact = document.querySelector('.artifact-container.fullscreen');
    if (fullscreenArtifact) {
        const exitBtn = fullscreenArtifact.querySelector('.fullscreen-btn');
        if (exitBtn) {
            exitBtn.click();
            return;
        }
    }
    
    // Clear input if it has content
    const input = document.getElementById('message-input');
    if (input && input.value.trim()) {
        input.value = '';
        input.style.height = 'auto';
        showNotification('Input cleared', 'info');
    }
}

function logAvailableFeatures() {
    const storageUsage = getStorageUsage();
    const storedInfo = getStoredConversationInfo();
    
    console.log('\n🎯 Available Features:');
    console.log('  📝 Problem Templates: Click template button or Ctrl+Shift+T');
    console.log('  ∑  Math Symbols: Click symbol button or Ctrl+Shift+S');  
    console.log('  🌙 Dark Theme: Click moon/sun or Ctrl+Shift+D');
    console.log('  📋 Copy Chat: Click copy button or Ctrl+Shift+C');
    console.log('  🗑️ Clear Chat: Click trash button');
    console.log('  ❓ Help: Ctrl+Shift+H');
    console.log('  💾 Auto-save: Conversations automatically saved to localStorage');
    console.log('  🔄 Status Indicators: Visual feedback for connection and loading states');
    console.log('  ⬆️ Message History: Navigate previous messages with arrow keys');
    console.log('  ⏱️ Session Timer: Shows active session duration');
    console.log('  🎯 Smart Scrolling: Respects user scroll position');
    console.log('  💬 Input Hints: Shows keyboard shortcuts when typing');
    console.log('  🎨 Button Feedback: Visual feedback on all interactions');
    console.log('  🌗 Dark Mode Graphs: Graphs adapt to current theme');
    console.log('  📱 Mobile Optimized: Touch-friendly symbols and templates');
    console.log('  🔧 Session Management: Robust session lifecycle with auto-recovery');
    console.log('  📊 Interactive Graphs: Full-featured mathematical function plotting');
    
    console.log('\n⌨️  Keyboard Shortcuts:');
    console.log('  Ctrl/Cmd + K: Focus input field');
    console.log('  Ctrl/Cmd + Enter: Send message');
    console.log('  ↑/↓ Arrow Keys: Navigate message history (when input focused)');
    console.log('  Ctrl/Cmd + Shift + D: Toggle dark/light theme');
    console.log('  Ctrl/Cmd + Shift + C: Copy conversation');
    console.log('  Ctrl/Cmd + Shift + S: Open symbol palette');
    console.log('  Ctrl/Cmd + Shift + T: Open template palette');
    console.log('  Ctrl/Cmd + Shift + H: Get help suggestion');
    console.log('  Ctrl/Cmd + Shift + R: Manually save conversation');
    console.log('  Ctrl/Cmd + Shift + N: Create new chat');
    console.log('  Ctrl/Cmd + Shift + L: Toggle chat sidebar');
    console.log('  Escape: Close palettes, exit fullscreen, or clear input');
    console.log('  Shift + Enter: New line in input (Enter alone sends message)');
    
    console.log('\n💾 Storage Information:');
    if (storageUsage) {
        console.log(`  Total localStorage usage: ${storageUsage.totalKB} KB`);
    }
    if (storedInfo && storedInfo.hasData) {
        console.log(`  Current conversation: ${storedInfo.messageCount} messages`);
        console.log(`  Last saved: ${new Date(storedInfo.lastSaved).toLocaleString()}`);
    } else {
        console.log('  No conversation currently stored');
    }
    
    if (messageHistory) {
        const historyStats = messageHistory.getHistoryStats();
        console.log(`  Message history: ${historyStats.totalMessages} previous messages`);
    }
    
    const sessionStartTime = loadFromLocalStorage('session_start_time', null);
    if (sessionStartTime) {
        const duration = new Date() - new Date(sessionStartTime);
        const minutes = Math.floor(duration / 60000);
        console.log(`  Current session: ${minutes > 0 ? minutes + 'm' : 'just started'}`);
    }
    
    console.log('\n🔧 Session Management:');
    console.log('  • Sessions are created immediately on page load');
    console.log('  • Session IDs persist across page refreshes');
    console.log('  • Backend sessions are automatically ensured to exist');
    console.log('  • Clear button works reliably across all browsers');
    console.log('  • Session state is synchronized between frontend and backend');
    console.log('  • Auto-recovery from session desync issues');
    
    console.log('\n📊 Graph Features:');
    console.log('  • Interactive function plotting with Plotly.js');
    console.log('  • Real-time function editing and updates');
    console.log('  • Fullscreen mode with Escape key support');
    console.log('  • Perfect fit within artifacts - no overlapping');
    console.log('  • Responsive design for all screen sizes');
    console.log('  • Terminal-style UI with monochrome theme');
    console.log('  • Support for mathematical functions: sin, cos, tan, log, etc.');
    console.log('  • Clean error handling with helpful messages');
    
    console.log('\n💡 Tips:');
    console.log('  • Conversations automatically save every 30 seconds');
    console.log('  • Your work is preserved when you refresh the page');
    console.log('  • Use ↑/↓ arrows to quickly reuse previous questions');
    console.log('  • Status indicator shows connection state (green=good, yellow=connecting, red=error)');
    console.log('  • Use templates to discover what the AI can help with');
    console.log('  • Symbol palette organizes math symbols by category');
    console.log('  • Dark theme preference is remembered between sessions');
    console.log('  • Graphs automatically adapt to your current theme');
    console.log('  • Input hints appear when you focus the text field');
    console.log('  • Smart scrolling won\'t interrupt you when reading old messages');
    console.log('  • Session timer shows how long you\'ve been working');
    console.log('  • All buttons give visual feedback when clicked');
    console.log('  • Mobile users get larger touch targets for easier use');
    console.log('  • Sessions are bulletproof across browser differences');
    console.log('  • Graph artifacts fit perfectly without formatting issues');
    console.log('  • Use fullscreen mode for detailed graph analysis');
    
    console.log('\n🔧 Developer Info:');
    console.log('  • Global access: window.mathInterface, window.conversationScrollManager');
    console.log('  • API endpoint: http://localhost:8000');
    console.log('  • Based on Google Gemini 1.5 Flash');
    console.log('  • Frontend: Vanilla JS with modern CSS');
    console.log('  • Backend: FastAPI with Python');
    console.log('  • Storage: localStorage with auto-cleanup');
    console.log('  • Accessibility: Full keyboard navigation and focus management');
    console.log('  • Error handling: Context-aware error messages');
    console.log('  • Performance: Smart scrolling and optimized rendering');
    console.log('  • Session lifecycle: Robust management with auto-recovery');
    console.log('  • Cross-browser compatibility: Works consistently in Chrome, Safari, Firefox');
    console.log('  • Graph rendering: Plotly.js with custom terminal styling');
    console.log('  • Artifact system: Clean, modular component architecture');
}