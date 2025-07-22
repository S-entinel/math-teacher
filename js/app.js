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
    
    // Initialize header controls with database support
    initializeEnhancedHeaderButtons();
    console.log('✓ Header controls initialized');
    
    // Setup keyboard shortcuts (existing + database)
    initializeKeyboardShortcuts();
    console.log('✓ Keyboard shortcuts registered');
    
    // Initialize database integration
    initializeDatabaseIntegration();
    console.log('✓ Database integration initialized');
    
    // Enable enhanced auto-save with database sync
    enableEnhancedAutoSave();
    console.log('✓ Enhanced auto-save with database sync enabled');
    
    // Initialize conversation persistence with database support
    checkInitialServerHealth();
    
    // Cleanup old data
    cleanupOldConversations();
    
    console.log('🎉 AI Math Teacher Interface ready!');
    logAvailableFeatures();
    logDatabaseFeatures();
});

// Database integration functions
function initializeDatabaseIntegration() {
    console.log('🗄️  Initializing database integration...');
    
    // Ensure user token exists
    const userToken = window.dbUtils.ensureUserToken();
    console.log(`✓ User token: ${userToken.slice(0, 8)}...`);
    
    // Initialize enhanced shortcuts
    initializeEnhancedShortcuts();
    
    console.log('✓ Database integration ready');
}

function initializeEnhancedShortcuts() {
    // Add database-specific shortcuts to existing ones
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Shift + E to export data
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            window.dbUtils.exportConversationData();
            showNotification('Export started', 'info');
        }
        
        // Ctrl/Cmd + Shift + I to import data
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            input.onchange = () => {
                window.dbUtils.importConversationData(input);
                document.body.removeChild(input);
            };
            document.body.appendChild(input);
            input.click();
        }
        
        // Ctrl/Cmd + Shift + P to check server health
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            window.dbUtils.checkServerHealth().then(health => {
                if (health) {
                    const dbStatus = health.database === 'connected' ? '✅' : '❌';
                    showNotification(`Server: ${health.status} | DB: ${dbStatus}`, 'info');
                } else {
                    showNotification('Server health check failed', 'error');
                }
            });
        }
        
        // Ctrl/Cmd + Shift + M to migrate data
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            if (confirm('Migrate local data to server? This will sync localStorage with the database.')) {
                window.dbUtils.migrateLocalStorageToServer();
            }
        }
    });
}

function enableEnhancedAutoSave() {
    // Enhanced auto-save that includes database sync
    const conversationArea = document.getElementById('conversation');
    if (conversationArea) {
        const observer = new MutationObserver(() => {
            // Save to localStorage immediately (existing functionality)
            scheduleAutoSave();
            
            // Schedule database sync
            scheduleDatabaseSync();
        });
        
        observer.observe(conversationArea, {
            childList: true,
            subtree: true
        });
    }
    
    // Periodic database sync
    setInterval(() => {
        window.dbUtils.syncConversationToServer();
    }, 60000); // Every minute
    
    // Sync on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.dbUtils.syncConversationToServer();
        }
    });
}

let dbSyncTimeout = null;

function scheduleDatabaseSync() {
    if (dbSyncTimeout) {
        clearTimeout(dbSyncTimeout);
    }
    
    dbSyncTimeout = setTimeout(() => {
        window.dbUtils.syncConversationToServer();
    }, 5000); // Sync 5 seconds after last change
}

async function checkInitialServerHealth() {
    // Wait for auth manager to be ready before initializing conversations
    await waitForAuthManagerReady();
    
    try {
        const health = await window.dbUtils.checkServerHealth();
        if (health) {
            const dbStatus = health.database === 'connected' ? 'connected' : 'disconnected';
            console.log(`🔌 Server: ${health.status}, Database: ${dbStatus}`);
            
            if (health.database === 'connected') {
                // Server and database are available, try to restore from server
                setTimeout(() => {
                    initializeConversationPersistenceWithDatabase();
                }, 1000);
            } else {
                // Fallback to localStorage only
                console.log('📝 Database unavailable, using localStorage only');
                setTimeout(() => {
                    initializeConversationPersistence();
                }, 1000);
            }
        } else {
            console.log('🔌 Server unavailable, offline mode');
            setTimeout(() => {
                initializeConversationPersistence();
            }, 1000);
        }
    } catch (error) {
        console.error('Initial health check failed:', error);
        // Fallback to localStorage
        setTimeout(() => {
            initializeConversationPersistence();
        }, 1000);
    }
}

// Wait for auth manager to be fully initialized
async function waitForAuthManagerReady() {
    return new Promise((resolve) => {
        const checkAuthReady = () => {
            if (window.authManager && window.authManager.getCurrentUser !== undefined) {
                console.log('🔐 Auth manager ready, proceeding with conversation initialization');
                resolve();
            } else {
                setTimeout(checkAuthReady, 100);
            }
        };
        
        setTimeout(checkAuthReady, 100);
    });
}

async function initializeConversationPersistenceWithDatabase() {
    console.log('📚 Initializing conversation persistence with database...');
    
    // Check if session is ready
    const checkSessionReady = async () => {
        if (window.mathInterface && window.mathInterface.sessionReady) {
            try {
                // Try to load from server first
                const restored = await window.dbUtils.loadConversationWithFallback();
                
                if (!restored) {
                    // Check localStorage as backup
                    const storedInfo = getStoredConversationInfo();
                    if (storedInfo && storedInfo.hasData) {
                        console.log(`📚 Found localStorage backup: ${storedInfo.messageCount} messages`);
                        showNotification(`Found local backup with ${storedInfo.messageCount} messages`, 'info');
                        
                        // Load from localStorage and offer to sync to server
                        const localRestored = loadConversationFromStorage();
                        if (localRestored) {
                            setTimeout(() => {
                                if (confirm('Found local conversation data. Sync to server?')) {
                                    window.dbUtils.migrateLocalStorageToServer();
                                }
                            }, 2000);
                        }
                    } else {
                        console.log('📝 No previous conversation found, starting fresh');
                    }
                }
            } catch (error) {
                console.error('Database restore failed:', error);
                // Fallback to localStorage
                initializeConversationPersistence();
            }
        } else {
            setTimeout(checkSessionReady, 100);
        }
    };
    
    setTimeout(checkSessionReady, 500);
}

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

function initializeEnhancedHeaderButtons() {
    // Initialize existing buttons
    initializeHeaderButtons();
    
    // Add database info button
    const databaseBtn = document.getElementById('database-info');
    if (databaseBtn) {
        databaseBtn.addEventListener('click', async () => {
            try {
                const health = await window.dbUtils.checkServerHealth();
                const stats = await window.dbUtils.getDatabaseStats();
                
                if (health && stats) {
                    const dbStatus = health.database === 'connected' ? '✅ Connected' : '❌ Disconnected';
                    const message = `Database: ${dbStatus}\nSessions: ${stats.total_sessions}\nMessages: ${stats.total_messages}\nArtifacts: ${stats.total_artifacts}`;
                    
                    alert(message);
                } else {
                    alert('Database: ❌ Unavailable\nRunning in offline mode');
                }
            } catch (error) {
                alert('Database: ❌ Error\n' + error.message);
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
        
        // Ctrl/Cmd + Shift + B to show database info
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            window.dbUtils.showDatabaseInfo();
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

// Enhanced feature logging with database features
function logDatabaseFeatures() {
    console.log('\n🗄️  Database Features:');
    console.log('  💾 Persistent Storage: SQLite database with automatic backup');
    console.log('  🔄 Auto-Sync: Conversations automatically saved to server');
    console.log('  📤 Export/Import: Ctrl+Shift+E / Ctrl+Shift+I');
    console.log('  📊 Database Stats: Ctrl+Shift+B');
    console.log('  🔌 Health Check: Ctrl+Shift+P');
    console.log('  📡 Data Migration: Ctrl+Shift+M');
    console.log('  🌐 Offline Support: Falls back to localStorage when server unavailable');
    console.log('  👤 User Sessions: Persistent user identity across browser sessions');
    console.log('  🔍 Search Ready: Database structure supports future search features');
    
    console.log('\n🔑 Database Shortcuts:');
    console.log('  Ctrl/Cmd + Shift + E: Export all data to JSON file');
    console.log('  Ctrl/Cmd + Shift + I: Import data from JSON file');
    console.log('  Ctrl/Cmd + Shift + B: Show database statistics');
    console.log('  Ctrl/Cmd + Shift + P: Check server and database health');
    console.log('  Ctrl/Cmd + Shift + M: Migrate localStorage to server database');
    
    console.log('\n🛠️  Database Integration:');
    console.log('  • Dual storage: Memory + SQLite for reliability');
    console.log('  • Graceful degradation: Works offline with localStorage');
    console.log('  • User tokens: Persistent identity without accounts');
    console.log('  • Auto-migration: Seamlessly moves data from localStorage to database');
    console.log('  • Session restoration: Conversations persist across browser restarts');
    console.log('  • Performance optimized: Efficient queries with proper indexing');
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
    console.log('  • Based on Google Gemini 2.5 Flash');
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