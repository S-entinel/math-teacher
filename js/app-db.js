// Database integration updates for app.js
// This extends the existing app.js with database functionality

// Enhanced initialization with database support
function initializeDatabaseIntegration() {
    console.log('🗄️  Initializing database integration...');
    
    // Ensure user token exists
    const userToken = window.dbUtils.ensureUserToken();
    console.log(`✓ User token: ${userToken.slice(0, 8)}...`);
    
    // Initialize database shortcuts
    initializeEnhancedShortcuts();
    
    // Setup database sync
    enableEnhancedAutoSave();
    
    // Check server health on startup
    checkInitialServerHealth();
    
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
        
        // Ctrl/Cmd + Shift + B to show database info
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            window.dbUtils.showDatabaseInfo();
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
    
    console.log('✓ Enhanced auto-save with database sync enabled');
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

// Enhanced feature logging
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

// Update the main initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('🧮 Initializing AI Math Teacher Interface with Database...');
    
    // Initialize core systems (existing)
    initializeTheme();
    console.log('✓ Theme system initialized');
    
    initializeSessionTimestamp();
    console.log('✓ Session timestamp initialized');
    
    initializeMessageHistory();
    console.log('✓ Message history navigation enabled');
    
    initializePalettes();
    console.log('✓ Math palettes initialized');
    
    // Initialize scroll manager (existing)
    const conversationArea = document.getElementById('conversation');
    if (conversationArea) {
        window.conversationScrollManager = new ScrollManager(conversationArea);
        console.log('✓ Smart scrolling initialized');
    }
    
    // Initialize chat manager FIRST (existing)
    if (!window.chatManager) {
        window.chatManager = new ChatManager();
        console.log('✓ Chat manager initialized');
    }
    
    // Initialize the main chat interface (existing)
    const mathInterface = new MathInterface();
    mathInterface.chatManager = window.chatManager;
    window.chatManager.mathInterface = mathInterface;
    console.log('✓ Chat interface initialized');
    
    // Make interface globally accessible (existing)
    window.mathInterface = mathInterface;
    
    // Initialize header controls with database support
    initializeEnhancedHeaderButtons();
    console.log('✓ Header controls with database support initialized');
    
    // Initialize database integration
    initializeDatabaseIntegration();
    
    // Setup keyboard shortcuts (existing + database)
    initializeKeyboardShortcuts();
    console.log('✓ Keyboard shortcuts registered');
    
    // Enable enhanced auto-save with database sync
    enableEnhancedAutoSave();
    console.log('✓ Enhanced auto-save with database sync enabled');
    
    // Initialize conversation persistence (will be handled by database integration)
    // initializeConversationPersistence(); // This is now handled by checkInitialServerHealth
    
    // Cleanup old data (existing)
    cleanupOldConversations();
    
    console.log('🎉 AI Math Teacher Interface with Database ready!');
    logAvailableFeatures();
    logDatabaseFeatures();
});

// Export functions for global access
window.dbIntegration = {
    initializeDatabaseIntegration,
    checkInitialServerHealth,
    scheduleDatabaseSync,
    initializeConversationPersistenceWithDatabase
};