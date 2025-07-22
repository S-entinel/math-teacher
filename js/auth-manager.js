// js/auth-manager.js
// Frontend authentication management for AI Math Teacher

class AuthManager {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.isAuthenticated = false;
        this.sessionWarningTimeout = null;
        this.refreshTimeout = null;
        
        this.initializeAuth();
        this.createAuthModal();
        this.setupEventListeners();
    }

    // ===== INITIALIZATION =====
    
    async initializeAuth() {
        console.log('🔐 Initializing authentication system...');
        
        // Try to restore authentication from localStorage
        const stored = this.loadStoredAuth();
        if (stored.accessToken) {
            try {
                const user = await this.validateToken(stored.accessToken);
                if (user) {
                    this.setAuthenticationState(user, stored.accessToken, stored.refreshToken);
                    console.log('✓ Authentication restored from storage');
                    return;
                } else {
                    // Token invalid, try to refresh
                    if (stored.refreshToken) {
                        const refreshed = await this.refreshAccessToken(stored.refreshToken);
                        if (refreshed) {
                            console.log('✓ Authentication refreshed successfully');
                            return;
                        }
                    }
                }
            } catch (error) {
                console.log('Stored token invalid, clearing...', error);
                this.clearStoredAuth();
            }
        }
        
        // Try to get anonymous user for backward compatibility
        try {
            const userToken = this.getStoredUserToken();
            if (userToken) {
                const response = await this.apiRequest('/auth/validate-session', {
                    method: 'POST',
                    body: JSON.stringify({ session_token: userToken })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.currentUser = data.user;
                    console.log('✓ Anonymous session validated');
                    this.updateUIForAnonymousUser();
                    return;
                }
            }
        } catch (error) {
            console.log('Anonymous session validation failed:', error);
        }
        
        // Create new anonymous session if nothing else works
        this.createAnonymousSession();
    }

    async createAnonymousSession() {
        try {
            const response = await this.apiRequest('/auth/anonymous', {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                this.saveUserToken(data.user.session_token);
                console.log('✓ Anonymous session created');
                this.updateUIForAnonymousUser();
                
                // Notify of user context change
                this.notifyUserContextChange();
            }
        } catch (error) {
            console.error('Failed to create anonymous session:', error);
        }
    }

    // ===== AUTHENTICATION STATE MANAGEMENT =====
    
    setAuthenticationState(user, accessToken, refreshToken) {
        this.currentUser = user;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.isAuthenticated = true;
        
        this.saveStoredAuth({
            user: user,
            accessToken: accessToken,
            refreshToken: refreshToken
        });
        
        this.updateUIForAuthenticatedUser();
        this.scheduleTokenRefresh();
        
        // Notify of user context change
        this.notifyUserContextChange();
        
        console.log('✓ Authentication state set for user:', user.email || user.id);
    }

    clearAuthenticationState() {
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.isAuthenticated = false;
        
        this.clearStoredAuth();
        this.clearTokenRefresh();
        this.updateUIForAnonymousUser();
    }

    notifyUserContextChange() {
        // Notify chat manager of user context change
        if (window.chatManager) {
            window.chatManager.onUserContextChanged();
        }
        
        // Clear any stored conversation data that might be cached
        if (window.mathInterface) {
            window.mathInterface.sessionId = null;
        }
    }

    // ===== UI MANAGEMENT =====
    
    createAuthModal() {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'auth-overlay';
        overlay.className = 'auth-overlay hidden';
        
        overlay.innerHTML = `
            <div class="auth-modal" id="auth-modal">
                <div class="auth-header">
                    <h2 class="auth-title" id="auth-title">Sign In</h2>
                    <button class="auth-close-btn" id="auth-close">ESC</button>
                </div>
                <div class="auth-content">
                    <div class="auth-error hidden" id="auth-error"></div>
                    <div class="auth-success hidden" id="auth-success"></div>
                    
                    <!-- Login Form -->
                    <form class="auth-form" id="login-form">
                        <div class="upgrade-prompt" id="upgrade-prompt" style="display: none;">
                            <div class="upgrade-prompt-title">Save Your Progress</div>
                            <div class="upgrade-prompt-text">
                                Create an account to save your conversations and access them from any device.
                            </div>
                            <button type="button" class="upgrade-prompt-button" id="show-register">
                                Create Account
                            </button>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="login-email">Email</label>
                            <input type="email" id="login-email" class="auth-input" 
                                   placeholder="your@email.com" required autocomplete="email">
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="login-password">Password</label>
                            <input type="password" id="login-password" class="auth-input" 
                                   placeholder="password" required autocomplete="current-password">
                        </div>
                        
                        <div class="auth-checkbox-group">
                            <div class="auth-checkbox">
                                <input type="checkbox" id="remember-me">
                                <div class="auth-checkbox-mark"></div>
                            </div>
                            <label class="auth-checkbox-label" for="remember-me">Remember Me</label>
                        </div>
                        
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="login-submit">
                                <span class="auth-loading hidden">
                                    <span>Signing In</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Sign In</span>
                            </button>
                        </div>
                        
                        <div class="auth-form-footer">
                            <a href="#" class="auth-link" id="show-register-link">Create Account</a>
                            <div class="auth-separator">
                                <span class="auth-separator-text">or</span>
                            </div>
                            <a href="#" class="auth-link" id="show-forgot-password">Forgot Password?</a>
                        </div>
                    </form>
                    
                    <!-- Registration Form -->
                    <form class="auth-form hidden" id="register-form">
                        <div class="auth-form-group">
                            <label class="auth-label" for="register-email">Email</label>
                            <input type="email" id="register-email" class="auth-input" 
                                   placeholder="your@email.com" required autocomplete="email">
                            <div class="field-error hidden" id="register-email-error"></div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="register-display-name">Display Name</label>
                            <input type="text" id="register-display-name" class="auth-input" 
                                   placeholder="your name" autocomplete="name">
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="register-password">Password</label>
                            <input type="password" id="register-password" class="auth-input" 
                                   placeholder="password" required autocomplete="new-password">
                            <div class="password-strength hidden" id="password-strength">
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                            </div>
                            <div class="password-strength-text hidden" id="password-strength-text">Weak</div>
                            <div class="field-error hidden" id="register-password-error"></div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="register-confirm-password">Confirm Password</label>
                            <input type="password" id="register-confirm-password" class="auth-input" 
                                   placeholder="confirm password" required autocomplete="new-password">
                            <div class="field-error hidden" id="register-confirm-error"></div>
                        </div>
                        
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="register-submit">
                                <span class="auth-loading hidden">
                                    <span>Creating Account</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Create Account</span>
                            </button>
                        </div>
                        
                        <div class="auth-form-footer">
                            <a href="#" class="auth-link" id="show-login-link">Already have an account? Sign In</a>
                        </div>
                    </form>
                    
                    <!-- Password Reset Form -->
                    <form class="auth-form hidden" id="reset-form">
                        <div class="auth-form-group">
                            <label class="auth-label" for="reset-email">Email</label>
                            <input type="email" id="reset-email" class="auth-input" 
                                   placeholder="your@email.com" required autocomplete="email">
                        </div>
                        
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="reset-submit">
                                <span class="auth-loading hidden">
                                    <span>Sending Reset</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Send Reset Link</span>
                            </button>
                        </div>
                        
                        <div class="auth-form-footer">
                            <a href="#" class="auth-link" id="back-to-login">Back to Sign In</a>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }

    updateUIForAuthenticatedUser() {
        // Update header to show user menu
        const headerActions = document.querySelector('.header-actions');
        const existingUserMenu = document.getElementById('user-menu');
        const authButton = document.getElementById('auth-button');
        
        if (existingUserMenu) {
            existingUserMenu.remove();
        }
        if (authButton) {
            authButton.remove();
        }
        
        const userMenu = document.createElement('div');
        userMenu.id = 'user-menu';
        userMenu.className = 'user-menu';
        userMenu.innerHTML = `
            <button class="user-menu-toggle" id="user-menu-toggle">
                <span>${this.getUserDisplayName()}</span>
                <span>▼</span>
            </button>
            <div class="user-menu-dropdown hidden" id="user-menu-dropdown">
                <div class="user-profile-info">
                    <div class="user-email">${this.currentUser.email || 'Anonymous'}</div>
                    <div class="user-account-type">${this.currentUser.account_type}</div>
                </div>
                <button class="user-menu-item" id="user-profile">Profile</button>
                <button class="user-menu-item" id="user-settings">Settings</button>
                <button class="user-menu-item" id="change-password">Change Password</button>
                <button class="user-menu-item danger" id="sign-out">Sign Out</button>
            </div>
        `;
        
        // Insert before theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        headerActions.insertBefore(userMenu, themeToggle);
        
        this.setupUserMenuEvents();
    }

    updateUIForAnonymousUser() {
        // Update header to show sign in button
        const headerActions = document.querySelector('.header-actions');
        const existingUserMenu = document.getElementById('user-menu');
        const authButton = document.getElementById('auth-button');
        
        if (existingUserMenu) {
            existingUserMenu.remove();
        }
        if (authButton) {
            authButton.remove();
        }
        
        const signInButton = document.createElement('button');
        signInButton.id = 'auth-button';
        signInButton.className = 'header-btn';
        signInButton.innerHTML = '<span>SIGN IN</span>';
        signInButton.addEventListener('click', () => this.showAuthModal('login'));
        
        // Insert before theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        headerActions.insertBefore(signInButton, themeToggle);
        
        // Show upgrade prompt periodically for anonymous users
        this.maybeShowUpgradePrompt();
    }

    getUserDisplayName() {
        if (!this.currentUser) return 'USER';
        return this.currentUser.display_name || 
               this.currentUser.email?.split('@')[0] || 
               'USER';
    }

    maybeShowUpgradePrompt() {
        // Show upgrade prompt after user has been active for a while
        const sessionStart = loadFromLocalStorage('session_start_time', null);
        if (sessionStart) {
            const sessionDuration = Date.now() - new Date(sessionStart).getTime();
            if (sessionDuration > 5 * 60 * 1000) { // 5 minutes
                const upgradePrompt = document.getElementById('upgrade-prompt');
                if (upgradePrompt) {
                    upgradePrompt.style.display = 'block';
                }
            }
        }
    }

    // ===== EVENT LISTENERS =====
    
    setupEventListeners() {
        // Modal close events
        document.getElementById('auth-close').addEventListener('click', () => this.hideAuthModal());
        document.getElementById('auth-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'auth-overlay') {
                this.hideAuthModal();
            }
        });
        
        // Form switching
        document.getElementById('show-register-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm('register');
        });
        
        document.getElementById('show-register').addEventListener('click', () => {
            this.showForm('register');
        });
        
        document.getElementById('show-login-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm('login');
        });
        
        document.getElementById('show-forgot-password').addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm('reset');
        });
        
        document.getElementById('back-to-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.showForm('login');
        });
        
        // Form submissions
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('reset-form').addEventListener('submit', (e) => this.handlePasswordReset(e));
        
        // Password strength checking
        document.getElementById('register-password').addEventListener('input', (e) => {
            this.checkPasswordStrength(e.target.value);
        });
        
        // Password confirmation
        document.getElementById('register-confirm-password').addEventListener('input', (e) => {
            this.checkPasswordConfirmation();
        });
        
        // Email validation
        document.getElementById('register-email').addEventListener('blur', (e) => {
            this.validateEmail(e.target.value, 'register-email-error');
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAuthModal();
            }
        });
    }

    setupUserMenuEvents() {
        const toggle = document.getElementById('user-menu-toggle');
        const dropdown = document.getElementById('user-menu-dropdown');
        
        toggle.addEventListener('click', () => {
            dropdown.classList.toggle('hidden');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#user-menu')) {
                dropdown.classList.add('hidden');
            }
        });
        
        // Menu item events
        document.getElementById('user-profile').addEventListener('click', () => {
            this.showProfileModal();
            dropdown.classList.add('hidden');
        });
        
        document.getElementById('user-settings').addEventListener('click', () => {
            this.showSettingsModal();
            dropdown.classList.add('hidden');
        });
        
        document.getElementById('change-password').addEventListener('click', () => {
            this.showChangePasswordModal();
            dropdown.classList.add('hidden');
        });
        
        document.getElementById('sign-out').addEventListener('click', () => {
            this.signOut();
            dropdown.classList.add('hidden');
        });
    }

    // ===== MODAL MANAGEMENT =====
    
    showAuthModal(form = 'login') {
        const overlay = document.getElementById('auth-overlay');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        this.showForm(form);
        this.clearMessages();
        
        // Focus first input
        setTimeout(() => {
            const firstInput = overlay.querySelector('form:not(.hidden) input');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    hideAuthModal() {
        const overlay = document.getElementById('auth-overlay');
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
        
        this.clearForms();
        this.clearMessages();
    }

    showForm(formType) {
        const forms = ['login-form', 'register-form', 'reset-form'];
        const titles = {
            'login': 'Sign In',
            'register': 'Create Account', 
            'reset': 'Reset Password'
        };
        
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (formId === `${formType}-form`) {
                form.classList.remove('hidden');
            } else {
                form.classList.add('hidden');
            }
        });
        
        document.getElementById('auth-title').textContent = titles[formType];
        this.clearMessages();
    }

    // ===== FORM HANDLERS =====
    
    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me').checked;
        
        this.setFormLoading('login', true);
        this.clearMessages();
        
        try {
            const response = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: email,
                    password: password,
                    remember_me: rememberMe
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Login failed');
            }
            
            const data = await response.json();
            this.setAuthenticationState(data.user, data.tokens.access_token, data.tokens.refresh_token);
            
            this.hideAuthModal();
            showNotification('Successfully signed in', 'success');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setFormLoading('login', false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const email = document.getElementById('register-email').value;
        const displayName = document.getElementById('register-display-name').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        
        // Validate passwords match
        if (password !== confirmPassword) {
            this.showFieldError('register-confirm-error', 'Passwords do not match');
            return;
        }
        
        // Get current session token for account upgrade
        const sessionToken = this.getStoredUserToken();
        
        this.setFormLoading('register', true);
        this.clearMessages();
        
        try {
            const response = await this.apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: email,
                    password: password,
                    display_name: displayName,
                    session_token: sessionToken
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Registration failed');
            }
            
            const data = await response.json();
            this.setAuthenticationState(data.user, data.tokens.access_token, data.tokens.refresh_token);
            
            this.hideAuthModal();
            showNotification('Account created successfully', 'success');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setFormLoading('register', false);
        }
    }

    async handlePasswordReset(e) {
        e.preventDefault();
        
        const email = document.getElementById('reset-email').value;
        
        this.setFormLoading('reset', true);
        this.clearMessages();
        
        try {
            const response = await this.apiRequest('/auth/password-reset', {
                method: 'POST',
                body: JSON.stringify({ email: email })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Password reset failed');
            }
            
            this.showSuccess('Password reset link sent to your email');
            
            // Switch back to login form after a delay
            setTimeout(() => {
                this.showForm('login');
            }, 3000);
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setFormLoading('reset', false);
        }
    }

    // ===== API REQUESTS =====
    
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;
        
        const defaultHeaders = {
            'Content-Type': 'application/json'
        };
        
        // Add authorization header if we have a token
        if (this.accessToken) {
            defaultHeaders['Authorization'] = `Bearer ${this.accessToken}`;
        }
        
        // Add user token for anonymous users
        const userToken = this.getStoredUserToken();
        if (userToken && !this.accessToken) {
            defaultHeaders['X-User-Token'] = userToken;
        }
        
        const requestOptions = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {})
            }
        };
        
        try {
            const response = await fetch(url, requestOptions);
            
            // Handle token refresh if access token expired
            if (response.status === 401 && this.refreshToken && !endpoint.includes('/auth/refresh')) {
                console.log('Token expired, attempting refresh...');
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    // Retry original request with new token
                    requestOptions.headers['Authorization'] = `Bearer ${this.accessToken}`;
                    return await fetch(url, requestOptions);
                } else {
                    // Refresh failed, redirect to login
                    this.showAuthModal('login');
                    throw new Error('Authentication required');
                }
            }
            
            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async validateToken(token) {
        try {
            const response = await fetch(`${this.apiUrl}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                return await response.json();
            } else if (response.status === 401) {
                // Token expired or invalid
                return null;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            return null;
        }
    }

    async refreshAccessToken(refreshToken = null) {
        const tokenToUse = refreshToken || this.refreshToken;
        if (!tokenToUse) return false;
        
        try {
            const response = await fetch(`${this.apiUrl}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refresh_token: tokenToUse
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Get current user info with new token
                const user = await this.validateToken(data.access_token);
                if (user) {
                    this.setAuthenticationState(user, data.access_token, data.refresh_token);
                    return true;
                }
            }
            
            // Refresh failed, sign out user
            this.signOut();
            return false;
            
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.signOut();
            return false;
        }
    }

    // ===== TOKEN MANAGEMENT =====
    
    scheduleTokenRefresh() {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        
        // Refresh token 5 minutes before expiry (assuming 24hr tokens)
        const refreshDelay = (23 * 60 + 55) * 60 * 1000; // 23 hours 55 minutes
        
        this.refreshTimeout = setTimeout(async () => {
            console.log('Scheduled token refresh...');
            await this.refreshAccessToken();
        }, refreshDelay);
    }

    clearTokenRefresh() {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
    }

    // ===== STORAGE MANAGEMENT =====
    
    saveStoredAuth(data) {
        try {
            localStorage.setItem('math_teacher_auth', JSON.stringify({
                user: data.user,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Failed to save auth data:', error);
        }
    }

    loadStoredAuth() {
        try {
            const stored = localStorage.getItem('math_teacher_auth');
            if (stored) {
                const data = JSON.parse(stored);
                
                // Check if stored data is not too old (30 days)
                const age = Date.now() - (data.timestamp || 0);
                if (age < 30 * 24 * 60 * 60 * 1000) {
                    return data;
                } else {
                    // Clear expired data
                    this.clearStoredAuth();
                }
            }
        } catch (error) {
            console.error('Failed to load auth data:', error);
            this.clearStoredAuth();
        }
        
        return {};
    }

    clearStoredAuth() {
        try {
            localStorage.removeItem('math_teacher_auth');
        } catch (error) {
            console.error('Failed to clear auth data:', error);
        }
    }

    getStoredUserToken() {
        return loadFromLocalStorage('user_token', null);
    }

    saveUserToken(token) {
        return saveToLocalStorage('user_token', token);
    }

    // ===== USER ACTIONS =====
    
    async signOut() {
        try {
            // Call logout endpoint if authenticated
            if (this.accessToken) {
                await this.apiRequest('/auth/logout', {
                    method: 'POST'
                });
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
        }
        
        this.clearAuthenticationState();
        
        // Create new anonymous session
        await this.createAnonymousSession();
        
        showNotification('Signed out successfully', 'success');
    }

    showProfileModal() {
        // TODO: Implement profile modal
        showNotification('Profile management coming soon', 'info');
    }

    showSettingsModal() {
        // TODO: Implement settings modal
        showNotification('Settings coming soon', 'info');
    }

    showChangePasswordModal() {
        // TODO: Implement change password modal
        showNotification('Password change coming soon', 'info');
    }

    // ===== FORM UTILITIES =====
    
    setFormLoading(formType, loading) {
        const submitBtn = document.getElementById(`${formType}-submit`);
        const loadingSpan = submitBtn.querySelector('.auth-loading');
        const textSpan = submitBtn.querySelector('.auth-text');
        
        if (loading) {
            loadingSpan.classList.remove('hidden');
            textSpan.classList.add('hidden');
            submitBtn.disabled = true;
        } else {
            loadingSpan.classList.add('hidden');
            textSpan.classList.remove('hidden');
            submitBtn.disabled = false;
        }
    }

    clearForms() {
        const forms = ['login-form', 'register-form', 'reset-form'];
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (form) {
                form.reset();
                // Clear validation states
                form.querySelectorAll('.auth-input').forEach(input => {
                    input.classList.remove('valid', 'invalid', 'error');
                });
                form.querySelectorAll('.field-error').forEach(error => {
                    error.classList.add('hidden');
                });
            }
        });
        
        // Clear password strength indicator
        const strengthIndicator = document.getElementById('password-strength');
        const strengthText = document.getElementById('password-strength-text');
        if (strengthIndicator) strengthIndicator.classList.add('hidden');
        if (strengthText) strengthText.classList.add('hidden');
    }

    clearMessages() {
        const error = document.getElementById('auth-error');
        const success = document.getElementById('auth-success');
        
        if (error) {
            error.classList.add('hidden');
            error.textContent = '';
        }
        if (success) {
            success.classList.add('hidden');
            success.textContent = '';
        }
    }

    showError(message) {
        const error = document.getElementById('auth-error');
        if (error) {
            error.textContent = message;
            error.classList.remove('hidden');
        }
    }

    showSuccess(message) {
        const success = document.getElementById('auth-success');
        if (success) {
            success.textContent = message;
            success.classList.remove('hidden');
        }
    }

    showFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.textContent = message;
            field.classList.remove('hidden');
        }
    }

    // ===== VALIDATION =====
    
    validateEmail(email, errorFieldId = null) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(email);
        
        if (errorFieldId) {
            const errorField = document.getElementById(errorFieldId);
            if (!isValid && email.length > 0) {
                this.showFieldError(errorFieldId, 'Please enter a valid email address');
            } else if (errorField) {
                errorField.classList.add('hidden');
            }
        }
        
        return isValid;
    }

    checkPasswordStrength(password) {
        const strengthIndicator = document.getElementById('password-strength');
        const strengthText = document.getElementById('password-strength-text');
        const bars = strengthIndicator.querySelectorAll('.password-strength-bar');
        
        if (password.length === 0) {
            strengthIndicator.classList.add('hidden');
            strengthText.classList.add('hidden');
            return;
        }
        
        strengthIndicator.classList.remove('hidden');
        strengthText.classList.remove('hidden');
        
        let strength = 0;
        let strengthLabel = 'Weak';
        
        // Length check
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        
        // Character variety checks
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/[^a-zA-Z\d]/.test(password)) strength++;
        
        // Cap at 4 for display
        strength = Math.min(strength, 4);
        
        // Update strength label
        const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
        strengthLabel = labels[strength] || 'Weak';
        
        // Update bars
        bars.forEach((bar, index) => {
            if (index < strength) {
                bar.classList.add('filled');
            } else {
                bar.classList.remove('filled');
            }
        });
        
        strengthText.textContent = strengthLabel;
    }

    checkPasswordConfirmation() {
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const errorField = document.getElementById('register-confirm-error');
        
        if (confirmPassword.length > 0 && password !== confirmPassword) {
            this.showFieldError('register-confirm-error', 'Passwords do not match');
        } else if (errorField) {
            errorField.classList.add('hidden');
        }
    }

    // ===== PUBLIC API =====
    
    getCurrentUser() {
        return this.currentUser;
    }

    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    getAccessToken() {
        return this.accessToken;
    }

    // For backward compatibility with existing code
    getUserToken() {
        return this.accessToken || this.getStoredUserToken();
    }

    // Open auth modal from outside
    openSignIn() {
        this.showAuthModal('login');
    }

    openSignUp() {
        this.showAuthModal('register');
    }
}

// Initialize global auth manager
let authManager = null;

function getAuthManager() {
    if (!authManager) {
        authManager = new AuthManager();
    }
    return authManager;
}

// Export for global access
window.authManager = getAuthManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('✓ Authentication manager initialized');
    });
} else {
    console.log('✓ Authentication manager initialized');
}