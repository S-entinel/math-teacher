// Database integration utilities for AI Math Teacher
// Extends existing localStorage functionality with server sync

// ===== USER TOKEN MANAGEMENT =====
function getUserToken() {
    return loadFromLocalStorage('user_token', null);
}

function setUserToken(token) {
    return saveToLocalStorage('user_token', token);
}

function ensureUserToken() {
    const currentUser = window.authManager ? window.authManager.getCurrentUser() : null;
    const isAuthenticated = currentUser && currentUser.account_type !== 'anonymous';
    
    if (isAuthenticated) {
        // For authenticated users, use their session token
        return currentUser.session_token;
    } else {
        // For anonymous users, use traditional token management
        let token = getUserToken();
        if (!token) {
            token = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            setUserToken(token);
        }
        return token;
    }
}

// ===== API HELPERS WITH USER TOKEN =====
async function apiRequest(endpoint, options = {}) {
    const userToken = ensureUserToken();
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'X-User-Token': userToken
    };
    
    const requestOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {})
        }
    };
    
    try {
        const response = await fetch(`http://localhost:8000${endpoint}`, requestOptions);
        
        // Handle new user token from server
        const newUserToken = response.headers.get('X-User-Token');
        if (newUserToken && newUserToken !== userToken) {
            setUserToken(newUserToken);
        }
        
        return response;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// ===== DATABASE SYNC FUNCTIONALITY =====
let syncInProgress = false;
let lastSyncTime = 0;
const SYNC_INTERVAL = 30000; // 30 seconds

async function syncConversationToServer() {
    if (syncInProgress || !window.mathInterface?.sessionId) {
        return false;
    }
    
    const now = Date.now();
    if (now - lastSyncTime < SYNC_INTERVAL) {
        return false; // Too soon since last sync
    }
    
    syncInProgress = true;
    lastSyncTime = now;
    
    try {
        // This will automatically sync when sending messages
        // The server now stores all messages in the database
        console.log('✓ Conversation sync: handled by server during normal operations');
        return true;
    } catch (error) {
        console.error('Failed to sync conversation:', error);
        return false;
    } finally {
        syncInProgress = false;
    }
}

async function loadConversationFromServer(sessionId) {
    try {
        const response = await apiRequest(`/history/${sessionId}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log('No server conversation found for session:', sessionId);
                return null;
            }
            throw new Error(`Server returned ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✓ Loaded conversation from server: ${data.messages.length} messages`);
        return data;
        
    } catch (error) {
        console.error('Failed to load conversation from server:', error);
        return null;
    }
}

// ===== ENHANCED CONVERSATION MANAGEMENT =====
async function saveConversationToStorageAndServer() {
    // First save to localStorage (for immediate backup)
    const localSaved = saveConversationToStorage();
    
    // Then sync with server (handled automatically by API calls)
    const serverSynced = await syncConversationToServer();
    
    return { local: localSaved, server: serverSynced };
}

async function loadConversationWithFallback() {
    const sessionId = window.mathInterface?.sessionId;
    if (!sessionId) {
        return loadConversationFromStorage();
    }
    
    try {
        // Try to load from server first
        const serverData = await loadConversationFromServer(sessionId);
        if (serverData && serverData.messages.length > 0) {
            
            // Convert server data to localStorage format and save locally
            const conversationData = {
                messages: serverData.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp
                })),
                sessionId: sessionId,
                lastSaved: new Date().toISOString()
            };
            
            saveToLocalStorage('math_conversation', conversationData);
            
            // Apply to UI
            restoreConversationFromData(conversationData);
            
            showNotification(`Restored ${serverData.messages.length} messages from server`, 'success');
            return true;
        }
    } catch (error) {
        console.warn('Server restore failed, falling back to localStorage:', error);
    }
    
    // Fallback to localStorage
    return loadConversationFromStorage();
}

function restoreConversationFromData(conversationData) {
    const conversationArea = document.getElementById('conversation');
    if (!conversationArea) return false;
    
    // Clear existing conversation
    conversationArea.innerHTML = '';
    
    // Restore messages
    conversationData.messages.forEach(message => {
        addMessageToUI(message.role, message.content);
    });
    
    // Update session display
    if (window.mathInterface && conversationData.sessionId) {
        window.mathInterface.sessionId = conversationData.sessionId;
        updateSessionDisplay(conversationData.sessionId);
    }
    
    console.log(`✓ Restored conversation with ${conversationData.messages.length} messages`);
    return true;
}

// ===== DATABASE STATISTICS =====
async function getDatabaseStats() {
    try {
        const response = await apiRequest('/admin/stats');
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('Failed to get database stats:', error);
        return null;
    }
}

async function showDatabaseInfo() {
    const stats = await getDatabaseStats();
    if (stats) {
        console.log('📊 Database Statistics:');
        console.log(`  Total Sessions: ${stats.total_sessions}`);
        console.log(`  Total Messages: ${stats.total_messages}`);
        console.log(`  Active (24h): ${stats.active_sessions_24h}`);
        console.log(`  Avg Messages/Session: ${stats.avg_messages_per_session}`);
        
        showNotification(
            `DB: ${stats.total_sessions} sessions, ${stats.total_messages} messages`, 
            'info'
        );
    } else {
        console.log('📊 Database: Not available or no stats');
        showNotification('Database statistics not available', 'warning');
    }
}

// ===== EXPORT/IMPORT FUNCTIONALITY =====
async function exportConversationData() {
    try {
        const userToken = getUserToken();
        if (!userToken) {
            showNotification('No user token found', 'error');
            return null;
        }
        
        // For now, export localStorage data
        // In future versions, could export from server
        const conversationData = loadFromLocalStorage('math_conversation', null);
        const messageHistory = loadFromLocalStorage('message_history', []);
        const chats = loadFromLocalStorage('math_teacher_chats', null);
        
        const exportData = {
            conversation: conversationData,
            messageHistory: messageHistory,
            chats: chats,
            userToken: userToken,
            exportDate: new Date().toISOString(),
            version: '1.1.0'
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `math_teacher_export_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        showNotification('Conversation data exported', 'success');
        return exportData;
        
    } catch (error) {
        console.error('Failed to export data:', error);
        showNotification('Export failed', 'error');
        return null;
    }
}

async function importConversationData(fileInput) {
    try {
        const file = fileInput.files[0];
        if (!file) return false;
        
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate import data
        if (!importData.version || !importData.exportDate) {
            throw new Error('Invalid export file format');
        }
        
        // Import data
        if (importData.conversation) {
            saveToLocalStorage('math_conversation', importData.conversation);
        }
        
        if (importData.messageHistory) {
            saveToLocalStorage('message_history', importData.messageHistory);
        }
        
        if (importData.chats) {
            saveToLocalStorage('math_teacher_chats', importData.chats);
        }
        
        if (importData.userToken) {
            setUserToken(importData.userToken);
        }
        
        // Reload the page to apply imported data
        showNotification('Data imported successfully. Reloading...', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1500);
        
        return true;
        
    } catch (error) {
        console.error('Failed to import data:', error);
        showNotification('Import failed: ' + error.message, 'error');
        return false;
    }
}

// ===== AUTO-SYNC ENHANCEMENT =====
function enableDatabaseSync() {
    // Enhanced auto-save with server sync
    const conversationArea = document.getElementById('conversation');
    if (conversationArea) {
        const observer = new MutationObserver(async () => {
            // Save locally immediately
            scheduleAutoSave();
            
            // Sync to server after a delay
            setTimeout(() => {
                syncConversationToServer();
            }, 5000);
        });
        
        observer.observe(conversationArea, {
            childList: true,
            subtree: true
        });
    }
    
    // Periodic sync
    setInterval(() => {
        syncConversationToServer();
    }, 60000); // Every minute
    
    // Sync on page unload
    window.addEventListener('beforeunload', () => {
        syncConversationToServer();
    });
}

function clearAllDataCompletely() {
    // Set a flag to prevent auto-restore
    localStorage.setItem('prevent_restore', 'true');
    
    // Clear all data
    localStorage.clear();
    sessionStorage.clear();
    
    // Set the flag again (since clear() removed it)
    localStorage.setItem('prevent_restore', 'true');
    
    console.log('✓ All data cleared, auto-restore disabled');
    
    // Reload page to start fresh
    location.reload();
}

// Make it globally available
window.clearAllDataCompletely = clearAllDataCompletely;

// ===== HEALTH CHECK =====
async function checkServerHealth() {
    try {
        const response = await apiRequest('/health');
        if (response.ok) {
            const health = await response.json();
            console.log('🔌 Server Health:', health);
            
            const dbStatus = health.database === 'connected' ? '✅' : '❌';
            console.log(`📊 Database: ${dbStatus} ${health.database}`);
            
            return health;
        }
        return null;
    } catch (error) {
        console.error('Health check failed:', error);
        return null;
    }
}

// ===== KEYBOARD SHORTCUTS FOR DATABASE FEATURES =====
function initializeDatabaseShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Shift + E to export data
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            exportConversationData();
        }
        
        // Ctrl/Cmd + Shift + I to show import dialog
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = () => importConversationData(input);
            input.click();
        }
        
        // Ctrl/Cmd + Shift + B to show database info
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            showDatabaseInfo();
        }
        
        // Ctrl/Cmd + Shift + H to check health
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            checkServerHealth();
        }
    });
}

// ===== MIGRATION HELPERS =====
async function migrateLocalStorageToServer() {
    try {
        showNotification('Migrating local data to server...', 'info');
        
        const response = await apiRequest('/admin/sync', { method: 'POST' });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✓ Migration completed:', result);
            showNotification('Local data migrated to server', 'success');
            return true;
        } else {
            throw new Error(`Migration failed: ${response.status}`);
        }
    } catch (error) {
        console.error('Migration failed:', error);
        showNotification('Migration failed: ' + error.message, 'error');
        return false;
    }
}

// ===== GLOBAL EXPORTS =====
// Add these functions to the global scope for easy access
window.dbUtils = {
    getUserToken,
    setUserToken,
    ensureUserToken,
    apiRequest,
    syncConversationToServer,
    loadConversationWithFallback,
    getDatabaseStats,
    showDatabaseInfo,
    exportConversationData,
    importConversationData,
    checkServerHealth,
    migrateLocalStorageToServer
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeDatabaseShortcuts();
        enableDatabaseSync();
    });
} else {
    initializeDatabaseShortcuts();
    enableDatabaseSync();
}