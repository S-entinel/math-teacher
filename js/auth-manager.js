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
        
        // Check for password reset token in URL
        this.handlePasswordResetFromURL();
        
        // Initialize user settings
        this.initializeUserSettings();
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
        document.getElementById('register-confirm-password').addEventListener('input', () => {
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

    // Handle password reset from URL token (when user clicks email link)
    handlePasswordResetFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const resetToken = urlParams.get('reset_token');
        const email = urlParams.get('email');
        
        if (resetToken && email) {
            this.showPasswordResetConfirmModal(resetToken, email);
            // Clean up URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    showPasswordResetConfirmModal(resetToken, email) {
        // Create reset confirm modal if it doesn't exist
        if (!document.getElementById('reset-confirm-overlay')) {
            this.createPasswordResetConfirmModal();
        }
        
        // Set the email and token
        document.getElementById('reset-confirm-email').value = email;
        document.getElementById('reset-confirm-token').value = resetToken;
        
        // Show modal
        const overlay = document.getElementById('reset-confirm-overlay');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    createPasswordResetConfirmModal() {
        const overlay = document.createElement('div');
        overlay.id = 'reset-confirm-overlay';
        overlay.className = 'auth-overlay hidden';
        overlay.innerHTML = `
            <div class="auth-modal">
                <div class="auth-header">
                    <h2 class="auth-title">Reset Your Password</h2>
                    <button class="auth-close-btn" id="reset-confirm-close">Close</button>
                </div>
                <div class="auth-content">
                    <form class="auth-form" id="reset-confirm-form">
                        <input type="hidden" id="reset-confirm-token">
                        <input type="hidden" id="reset-confirm-email">
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="reset-new-password">New Password</label>
                            <input type="password" id="reset-new-password" class="auth-input" 
                                   placeholder="Enter new password" required autocomplete="new-password">
                            <div class="password-strength hidden" id="reset-password-strength">
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                            </div>
                            <div class="password-strength-text hidden" id="reset-password-strength-text">Weak</div>
                            <div class="field-error hidden" id="reset-new-password-error"></div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="reset-confirm-new-password">Confirm New Password</label>
                            <input type="password" id="reset-confirm-new-password" class="auth-input" 
                                   placeholder="Confirm new password" required autocomplete="new-password">
                            <div class="field-error hidden" id="reset-confirm-new-password-error"></div>
                        </div>
                        
                        <!-- Messages -->
                        <div class="auth-error hidden" id="reset-confirm-error"></div>
                        <div class="auth-success hidden" id="reset-confirm-success"></div>
                        
                        <!-- Actions -->
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="reset-confirm-submit">
                                <span class="auth-loading hidden">
                                    <span>Resetting Password</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Reset Password</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.setupPasswordResetConfirmModalEvents();
    }

    setupPasswordResetConfirmModalEvents() {
        // Close button
        document.getElementById('reset-confirm-close').addEventListener('click', () => {
            this.hidePasswordResetConfirmModal();
        });
        
        // Close on overlay click
        document.getElementById('reset-confirm-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'reset-confirm-overlay') {
                this.hidePasswordResetConfirmModal();
            }
        });
        
        // Form submission
        document.getElementById('reset-confirm-form').addEventListener('submit', (e) => {
            this.handlePasswordResetConfirm(e);
        });
        
        // Password strength checking
        document.getElementById('reset-new-password').addEventListener('input', (e) => {
            this.checkResetPasswordStrength(e.target.value);
        });
        
        // Password confirmation
        document.getElementById('reset-confirm-new-password').addEventListener('input', () => {
            this.checkResetPasswordConfirmation();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('reset-confirm-overlay').classList.contains('hidden')) {
                this.hidePasswordResetConfirmModal();
            }
        });
    }
    
    hidePasswordResetConfirmModal() {
        const overlay = document.getElementById('reset-confirm-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
            this.clearPasswordResetConfirmForm();
            this.clearPasswordResetConfirmMessages();
        }
    }
    
    async handlePasswordResetConfirm(e) {
        e.preventDefault();
        
        const token = document.getElementById('reset-confirm-token').value;
        const email = document.getElementById('reset-confirm-email').value;
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-new-password').value;
        
        // Validate passwords match
        if (newPassword !== confirmPassword) {
            this.showPasswordResetConfirmFieldError('reset-confirm-new-password-error', 'Passwords do not match');
            return;
        }
        
        // Validate password strength
        if (newPassword.length < 8) {
            this.showPasswordResetConfirmFieldError('reset-new-password-error', 'Password must be at least 8 characters long');
            return;
        }
        
        this.setPasswordResetConfirmFormLoading(true);
        this.clearPasswordResetConfirmMessages();
        
        try {
            const response = await this.apiRequest('/auth/password-reset/confirm', {
                method: 'POST',
                body: JSON.stringify({
                    token: token,
                    email: email,
                    new_password: newPassword
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Password reset failed');
            }
            
            this.showPasswordResetConfirmSuccess('Password reset successfully! You can now sign in.');
            
            // Redirect to login after successful reset
            setTimeout(() => {
                this.hidePasswordResetConfirmModal();
                this.showAuthModal('login');
            }, 3000);
            
        } catch (error) {
            this.showPasswordResetConfirmError(error.message);
        } finally {
            this.setPasswordResetConfirmFormLoading(false);
        }
    }
    
    checkResetPasswordStrength(password) {
        const strengthIndicator = document.getElementById('reset-password-strength');
        const strengthText = document.getElementById('reset-password-strength-text');
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

    checkResetPasswordConfirmation() {
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-new-password').value;
        const errorField = document.getElementById('reset-confirm-new-password-error');
        
        if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
            this.showPasswordResetConfirmFieldError('reset-confirm-new-password-error', 'Passwords do not match');
        } else if (errorField) {
            errorField.classList.add('hidden');
        }
    }
    
    // ===== PASSWORD RESET CONFIRM UTILITIES =====
    
    setPasswordResetConfirmFormLoading(loading) {
        const submitBtn = document.getElementById('reset-confirm-submit');
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
    
    clearPasswordResetConfirmForm() {
        const form = document.getElementById('reset-confirm-form');
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
        
        // Clear password strength indicator
        const strengthIndicator = document.getElementById('reset-password-strength');
        const strengthText = document.getElementById('reset-password-strength-text');
        if (strengthIndicator) strengthIndicator.classList.add('hidden');
        if (strengthText) strengthText.classList.add('hidden');
    }
    
    clearPasswordResetConfirmMessages() {
        const error = document.getElementById('reset-confirm-error');
        const success = document.getElementById('reset-confirm-success');
        
        if (error) {
            error.classList.add('hidden');
            error.textContent = '';
        }
        if (success) {
            success.classList.add('hidden');
            success.textContent = '';
        }
    }
    
    showPasswordResetConfirmError(message) {
        const error = document.getElementById('reset-confirm-error');
        if (error) {
            error.textContent = message;
            error.classList.remove('hidden');
        }
    }
    
    showPasswordResetConfirmSuccess(message) {
        const success = document.getElementById('reset-confirm-success');
        if (success) {
            success.textContent = message;
            success.classList.remove('hidden');
        }
    }
    
    showPasswordResetConfirmFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.textContent = message;
            field.classList.remove('hidden');
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
    
    // Initialize user settings on first load
    initializeUserSettings() {
        const settings = this.getUserSettings();
        if (Object.keys(settings).length === 0) {
            // Set default settings
            const defaultSettings = {
                theme: 'dark',
                fontSize: 'normal',
                animationsEnabled: true,
                mathNotation: 'latex',
                difficultyLevel: 'intermediate',
                stepByStepEnabled: true,
                hintsEnabled: true,
                responseSpeed: 'normal',
                autoScrollEnabled: true,
                typingIndicatorsEnabled: true,
                messageTimestampsEnabled: false,
                soundNotificationsEnabled: false,
                sessionRemindersEnabled: true,
                analyticsEnabled: true,
                conversationHistoryEnabled: true,
                autoDelete: 'never'
            };
            
            this.saveUserSettings(defaultSettings);
            this.applyAllSettings(defaultSettings);
        } else {
            // Apply existing settings
            this.applyAllSettings(settings);
        }
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
        if (!this.currentUser || this.currentUser.account_type === 'anonymous') {
            showNotification('Please sign in to access your profile', 'info');
            this.showAuthModal('login');
            return;
        }
        
        // Create profile modal if it doesn't exist
        if (!document.getElementById('profile-overlay')) {
            this.createProfileModal();
        }
        
        // Load current user data
        this.loadProfileData();
        
        // Show modal
        const overlay = document.getElementById('profile-overlay');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    createProfileModal() {
        const overlay = document.createElement('div');
        overlay.id = 'profile-overlay';
        overlay.className = 'auth-overlay hidden';
        overlay.innerHTML = `
            <div class="auth-modal">
                <div class="auth-header">
                    <h2 class="auth-title">User Profile</h2>
                    <button class="auth-close-btn" id="profile-close">Close</button>
                </div>
                <div class="auth-content">
                    <!-- Profile Form -->
                    <form class="auth-form" id="profile-form">
                        <div class="auth-form-group">
                            <label class="auth-label" for="profile-email">Email</label>
                            <input type="email" id="profile-email" class="auth-input" readonly>
                            <div class="field-info">Email cannot be changed after registration</div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="profile-display-name">Display Name</label>
                            <input type="text" id="profile-display-name" class="auth-input" 
                                   placeholder="Your display name" maxlength="50">
                            <div class="field-error hidden" id="profile-name-error"></div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="profile-username">Username</label>
                            <input type="text" id="profile-username" class="auth-input" 
                                   placeholder="Optional username" maxlength="30">
                            <div class="field-error hidden" id="profile-username-error"></div>
                        </div>
                        
                        <!-- Account Information -->
                        <div class="profile-info-section">
                            <h3 class="profile-section-title">Account Information</h3>
                            <div class="profile-info-grid">
                                <div class="profile-info-item">
                                    <span class="profile-info-label">Account Type</span>
                                    <span class="profile-info-value" id="profile-account-type"></span>
                                </div>
                                <div class="profile-info-item">
                                    <span class="profile-info-label">Member Since</span>
                                    <span class="profile-info-value" id="profile-created-at"></span>
                                </div>
                                <div class="profile-info-item">
                                    <span class="profile-info-label">Last Active</span>
                                    <span class="profile-info-value" id="profile-last-active"></span>
                                </div>
                                <div class="profile-info-item">
                                    <span class="profile-info-label">Email Verified</span>
                                    <span class="profile-info-value" id="profile-verified-status"></span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Messages -->
                        <div class="auth-error hidden" id="profile-error"></div>
                        <div class="auth-success hidden" id="profile-success"></div>
                        
                        <!-- Actions -->
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="profile-submit">
                                <span class="auth-loading hidden">
                                    <span>Updating Profile</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Update Profile</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.setupProfileModalEvents();
    }


    setupProfileModalEvents() {
        // Close button
        document.getElementById('profile-close').addEventListener('click', () => {
            this.hideProfileModal();
        });
        
        // Close on overlay click
        document.getElementById('profile-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'profile-overlay') {
                this.hideProfileModal();
            }
        });
        
        // Form submission
        document.getElementById('profile-form').addEventListener('submit', (e) => {
            this.handleProfileUpdate(e);
        });
        
        // Input validation
        document.getElementById('profile-display-name').addEventListener('blur', (e) => {
            this.validateDisplayName(e.target.value);
        });
        
        document.getElementById('profile-username').addEventListener('blur', (e) => {
            this.validateUsername(e.target.value);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('profile-overlay').classList.contains('hidden')) {
                this.hideProfileModal();
            }
        });
    }
    
    hideProfileModal() {
        const overlay = document.getElementById('profile-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
            this.clearProfileMessages();
        }
    }
    
    async loadProfileData() {
        try {
            const response = await this.apiRequest('/auth/me');
            
            if (!response.ok) {
                throw new Error('Failed to load profile data');
            }
            
            const profile = await response.json();
            
            // Populate form fields
            document.getElementById('profile-email').value = profile.email || '';
            document.getElementById('profile-display-name').value = profile.display_name || '';
            document.getElementById('profile-username').value = profile.username || '';
            
            // Populate info fields
            document.getElementById('profile-account-type').textContent = 
                (profile.account_type || 'anonymous').toUpperCase();
            document.getElementById('profile-created-at').textContent = 
                this.formatDate(profile.created_at);
            document.getElementById('profile-last-active').textContent = 
                this.formatDate(profile.last_active);
            document.getElementById('profile-verified-status').textContent = 
                profile.is_verified ? 'VERIFIED' : 'UNVERIFIED';
            
        } catch (error) {
            console.error('Failed to load profile:', error);
            this.showProfileError('Failed to load profile data');
        }
    }
    
    async handleProfileUpdate(e) {
        e.preventDefault();
        
        const displayName = document.getElementById('profile-display-name').value.trim();
        const username = document.getElementById('profile-username').value.trim();
        
        // Validate inputs
        if (!this.validateDisplayName(displayName)) return;
        if (username && !this.validateUsername(username)) return;
        
        this.setProfileFormLoading(true);
        this.clearProfileMessages();
        
        try {
            const response = await this.apiRequest('/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    display_name: displayName || null,
                    username: username || null
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Profile update failed');
            }
            
            const updatedProfile = await response.json();
            
            // Update stored user data
            this.currentUser = {
                ...this.currentUser,
                display_name: updatedProfile.display_name,
                username: updatedProfile.username
            };
            
            // Update UI
            this.updateUIForAuthenticatedUser();
            
            this.showProfileSuccess('Profile updated successfully');
            
        } catch (error) {
            this.showProfileError(error.message);
        } finally {
            this.setProfileFormLoading(false);
        }
    }
    
    // ===== PROFILE VALIDATION =====
    
    validateDisplayName(displayName) {
        const errorField = document.getElementById('profile-name-error');
        
        if (!displayName || displayName.length < 2) {
            this.showProfileFieldError('profile-name-error', 'Display name must be at least 2 characters');
            return false;
        }
        
        if (displayName.length > 50) {
            this.showProfileFieldError('profile-name-error', 'Display name must be less than 50 characters');
            return false;
        }
        
        errorField.classList.add('hidden');
        return true;
    }
    
    validateUsername(username) {
        const errorField = document.getElementById('profile-username-error');
        
        if (username && username.length > 0) {
            if (username.length < 3) {
                this.showProfileFieldError('profile-username-error', 'Username must be at least 3 characters');
                return false;
            }
            
            if (username.length > 30) {
                this.showProfileFieldError('profile-username-error', 'Username must be less than 30 characters');
                return false;
            }
            
            if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                this.showProfileFieldError('profile-username-error', 'Username can only contain letters, numbers, dashes, and underscores');
                return false;
            }
        }
        
        errorField.classList.add('hidden');
        return true;
    }
    
    // ===== PROFILE UTILITIES =====
    
    setProfileFormLoading(loading) {
        const submitBtn = document.getElementById('profile-submit');
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
    
    clearProfileMessages() {
        const error = document.getElementById('profile-error');
        const success = document.getElementById('profile-success');
        
        if (error) {
            error.classList.add('hidden');
            error.textContent = '';
        }
        if (success) {
            success.classList.add('hidden');
            success.textContent = '';
        }
    }
    
    showProfileError(message) {
        const error = document.getElementById('profile-error');
        if (error) {
            error.textContent = message;
            error.classList.remove('hidden');
        }
    }
    
    showProfileSuccess(message) {
        const success = document.getElementById('profile-success');
        if (success) {
            success.textContent = message;
            success.classList.remove('hidden');
        }
    }
    
    showProfileFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.textContent = message;
            field.classList.remove('hidden');
        }
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    }
    
    showSettingsModal() {
        // Create settings modal if it doesn't exist
        if (!document.getElementById('settings-overlay')) {
            this.createSettingsModal();
        }
        
        // Load current settings
        this.loadSettingsData();
        
        // Show modal
        const overlay = document.getElementById('settings-overlay');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    createSettingsModal() {
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        overlay.className = 'auth-overlay hidden';
        overlay.innerHTML = `
            <div class="auth-modal settings-modal">
                <div class="auth-header">
                    <h2 class="auth-title">Settings</h2>
                    <button class="auth-close-btn" id="settings-close">Close</button>
                </div>
                <div class="auth-content">
                    <form class="settings-form" id="settings-form">
                        
                        <!-- Appearance Section -->
                        <div class="settings-section">
                            <h3 class="settings-section-title">► Appearance</h3>
                            <div class="settings-group">
                                <div class="setting-item">
                                    <label class="setting-label" for="theme-select">Theme</label>
                                    <select id="theme-select" class="setting-select">
                                        <option value="dark">Dark Mode</option>
                                        <option value="light">Light Mode</option>
                                        <option value="auto">Auto (System)</option>
                                    </select>
                                    <div class="setting-description">Choose your preferred color scheme</div>
                                </div>
                                
                                <div class="setting-item">
                                    <label class="setting-label" for="font-size-select">Font Size</label>
                                    <select id="font-size-select" class="setting-select">
                                        <option value="small">Small</option>
                                        <option value="normal">Normal</option>
                                        <option value="large">Large</option>
                                    </select>
                                    <div class="setting-description">Adjust text size for better readability</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="animations-enabled" class="setting-checkbox">
                                        <label for="animations-enabled" class="setting-checkbox-label">Enable Animations</label>
                                    </div>
                                    <div class="setting-description">Toggle UI animations and transitions</div>
                                </div>
                            </div>
                        </div>
    
                        <!-- Math & Learning Section -->
                        <div class="settings-section">
                            <h3 class="settings-section-title">► Math & Learning</h3>
                            <div class="settings-group">
                                <div class="setting-item">
                                    <label class="setting-label" for="math-notation-select">Math Notation</label>
                                    <select id="math-notation-select" class="setting-select">
                                        <option value="latex">LaTeX</option>
                                        <option value="ascii">ASCII Math</option>
                                        <option value="unicode">Unicode Math</option>
                                    </select>
                                    <div class="setting-description">Preferred format for mathematical expressions</div>
                                </div>
                                
                                <div class="setting-item">
                                    <label class="setting-label" for="difficulty-level-select">Default Difficulty</label>
                                    <select id="difficulty-level-select" class="setting-select">
                                        <option value="beginner">Beginner</option>
                                        <option value="intermediate">Intermediate</option>
                                        <option value="advanced">Advanced</option>
                                        <option value="expert">Expert</option>
                                    </select>
                                    <div class="setting-description">Starting difficulty level for new problems</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="step-by-step-enabled" class="setting-checkbox">
                                        <label for="step-by-step-enabled" class="setting-checkbox-label">Show Step-by-Step Solutions</label>
                                    </div>
                                    <div class="setting-description">Display detailed solution steps by default</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="hints-enabled" class="setting-checkbox">
                                        <label for="hints-enabled" class="setting-checkbox-label">Enable Hints</label>
                                    </div>
                                    <div class="setting-description">Show helpful hints during problem solving</div>
                                </div>
                            </div>
                        </div>
    
                        <!-- Chat & Interface Section -->
                        <div class="settings-section">
                            <h3 class="settings-section-title">► Chat & Interface</h3>
                            <div class="settings-group">
                                <div class="setting-item">
                                    <label class="setting-label" for="response-speed-select">Response Speed</label>
                                    <select id="response-speed-select" class="setting-select">
                                        <option value="fast">Fast</option>
                                        <option value="normal">Normal</option>
                                        <option value="thoughtful">Thoughtful</option>
                                    </select>
                                    <div class="setting-description">Balance between speed and thoroughness</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="auto-scroll-enabled" class="setting-checkbox">
                                        <label for="auto-scroll-enabled" class="setting-checkbox-label">Auto-scroll Chat</label>
                                    </div>
                                    <div class="setting-description">Automatically scroll to new messages</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="typing-indicators-enabled" class="setting-checkbox">
                                        <label for="typing-indicators-enabled" class="setting-checkbox-label">Show Typing Indicators</label>
                                    </div>
                                    <div class="setting-description">Display when AI is generating responses</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="message-timestamps-enabled" class="setting-checkbox">
                                        <label for="message-timestamps-enabled" class="setting-checkbox-label">Show Message Timestamps</label>
                                    </div>
                                    <div class="setting-description">Display time for each message</div>
                                </div>
                            </div>
                        </div>
    
                        <!-- Notifications Section -->
                        <div class="settings-section">
                            <h3 class="settings-section-title">► Notifications</h3>
                            <div class="settings-group">
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="sound-notifications-enabled" class="setting-checkbox">
                                        <label for="sound-notifications-enabled" class="setting-checkbox-label">Sound Notifications</label>
                                    </div>
                                    <div class="setting-description">Play sound for important notifications</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="session-reminders-enabled" class="setting-checkbox">
                                        <label for="session-reminders-enabled" class="setting-checkbox-label">Session Reminders</label>
                                    </div>
                                    <div class="setting-description">Remind to save progress during long sessions</div>
                                </div>
                            </div>
                        </div>
    
                        <!-- Privacy & Data Section -->
                        <div class="settings-section">
                            <h3 class="settings-section-title">► Privacy & Data</h3>
                            <div class="settings-group">
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="analytics-enabled" class="setting-checkbox">
                                        <label for="analytics-enabled" class="setting-checkbox-label">Analytics & Usage Data</label>
                                    </div>
                                    <div class="setting-description">Help improve the app by sharing anonymous usage data</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-checkbox-group">
                                        <input type="checkbox" id="conversation-history-enabled" class="setting-checkbox">
                                        <label for="conversation-history-enabled" class="setting-checkbox-label">Save Conversation History</label>
                                    </div>
                                    <div class="setting-description">Store conversations for future reference</div>
                                </div>
                                
                                <div class="setting-item">
                                    <label class="setting-label" for="auto-delete-select">Auto-delete Old Data</label>
                                    <select id="auto-delete-select" class="setting-select">
                                        <option value="never">Never</option>
                                        <option value="30days">After 30 days</option>
                                        <option value="90days">After 90 days</option>
                                        <option value="1year">After 1 year</option>
                                    </select>
                                    <div class="setting-description">Automatically remove old conversation data</div>
                                </div>
                            </div>
                        </div>
    
                        <!-- Data Management Section -->
                        <div class="settings-section">
                            <h3 class="settings-section-title">► Data Management</h3>
                            <div class="settings-group">
                                <div class="setting-item">
                                    <div class="setting-actions">
                                        <button type="button" class="setting-action-btn" id="export-data-btn">
                                            Export All Data
                                        </button>
                                        <button type="button" class="setting-action-btn" id="import-data-btn">
                                            Import Data
                                        </button>
                                        <input type="file" id="import-file-input" class="hidden" accept=".json">
                                    </div>
                                    <div class="setting-description">Backup and restore your conversation data</div>
                                </div>
                                
                                <div class="setting-item">
                                    <div class="setting-actions">
                                        <button type="button" class="setting-action-btn" id="clear-cache-btn">
                                            Clear Cache
                                        </button>
                                        <button type="button" class="setting-action-btn danger" id="reset-settings-btn">
                                            Reset All Settings
                                        </button>
                                    </div>
                                    <div class="setting-description">Clear temporary data or reset to defaults</div>
                                </div>
                            </div>
                        </div>
    
                        <!-- Messages -->
                        <div class="auth-error hidden" id="settings-error"></div>
                        <div class="auth-success hidden" id="settings-success"></div>
    
                        <!-- Save Button -->
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="settings-submit">
                                <span class="auth-loading hidden">
                                    <span>Saving Settings</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Save Settings</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.setupSettingsModalEvents();
    }

    setupSettingsModalEvents() {
        // Close button
        document.getElementById('settings-close').addEventListener('click', () => {
            this.hideSettingsModal();
        });
        
        // Close on overlay click
        document.getElementById('settings-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'settings-overlay') {
                this.hideSettingsModal();
            }
        });
        
        // Form submission
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            this.handleSettingsSave(e);
        });
        
        // Theme change handler
        document.getElementById('theme-select').addEventListener('change', (e) => {
            this.applyTheme(e.target.value);
        });
        
        // Font size change handler
        document.getElementById('font-size-select').addEventListener('change', (e) => {
            this.applyFontSize(e.target.value);
        });
        
        // Animation toggle handler
        document.getElementById('animations-enabled').addEventListener('change', (e) => {
            this.toggleAnimations(e.target.checked);
        });
        
        // Data management actions
        document.getElementById('export-data-btn').addEventListener('click', () => {
            this.exportUserData();
        });
        
        document.getElementById('import-data-btn').addEventListener('click', () => {
            document.getElementById('import-file-input').click();
        });
        
        document.getElementById('import-file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importUserData(e.target);
            }
        });
        
        document.getElementById('clear-cache-btn').addEventListener('click', () => {
            this.clearAppCache();
        });
        
        document.getElementById('reset-settings-btn').addEventListener('click', () => {
            this.confirmResetSettings();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('settings-overlay').classList.contains('hidden')) {
                this.hideSettingsModal();
            }
        });
    }
    
    hideSettingsModal() {
        const overlay = document.getElementById('settings-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
            this.clearSettingsMessages();
        }
    }
    
    loadSettingsData() {
        // Load settings from localStorage or use defaults
        const settings = this.getUserSettings();
        
        // Appearance settings
        document.getElementById('theme-select').value = settings.theme || 'dark';
        document.getElementById('font-size-select').value = settings.fontSize || 'normal';
        document.getElementById('animations-enabled').checked = settings.animationsEnabled !== false;
        
        // Math & Learning settings
        document.getElementById('math-notation-select').value = settings.mathNotation || 'latex';
        document.getElementById('difficulty-level-select').value = settings.difficultyLevel || 'intermediate';
        document.getElementById('step-by-step-enabled').checked = settings.stepByStepEnabled !== false;
        document.getElementById('hints-enabled').checked = settings.hintsEnabled !== false;
        
        // Chat & Interface settings
        document.getElementById('response-speed-select').value = settings.responseSpeed || 'normal';
        document.getElementById('auto-scroll-enabled').checked = settings.autoScrollEnabled !== false;
        document.getElementById('typing-indicators-enabled').checked = settings.typingIndicatorsEnabled !== false;
        document.getElementById('message-timestamps-enabled').checked = settings.messageTimestampsEnabled !== false;
        
        // Notifications settings
        document.getElementById('sound-notifications-enabled').checked = settings.soundNotificationsEnabled !== false;
        document.getElementById('session-reminders-enabled').checked = settings.sessionRemindersEnabled !== false;
        
        // Privacy & Data settings
        document.getElementById('analytics-enabled').checked = settings.analyticsEnabled !== false;
        document.getElementById('conversation-history-enabled').checked = settings.conversationHistoryEnabled !== false;
        document.getElementById('auto-delete-select').value = settings.autoDelete || 'never';
    }
    
    async handleSettingsSave(e) {
        e.preventDefault();
        
        this.setSettingsFormLoading(true);
        this.clearSettingsMessages();
        
        try {
            // Collect all settings
            const settings = {
                // Appearance
                theme: document.getElementById('theme-select').value,
                fontSize: document.getElementById('font-size-select').value,
                animationsEnabled: document.getElementById('animations-enabled').checked,
                
                // Math & Learning
                mathNotation: document.getElementById('math-notation-select').value,
                difficultyLevel: document.getElementById('difficulty-level-select').value,
                stepByStepEnabled: document.getElementById('step-by-step-enabled').checked,
                hintsEnabled: document.getElementById('hints-enabled').checked,
                
                // Chat & Interface
                responseSpeed: document.getElementById('response-speed-select').value,
                autoScrollEnabled: document.getElementById('auto-scroll-enabled').checked,
                typingIndicatorsEnabled: document.getElementById('typing-indicators-enabled').checked,
                messageTimestampsEnabled: document.getElementById('message-timestamps-enabled').checked,
                
                // Notifications
                soundNotificationsEnabled: document.getElementById('sound-notifications-enabled').checked,
                sessionRemindersEnabled: document.getElementById('session-reminders-enabled').checked,
                
                // Privacy & Data
                analyticsEnabled: document.getElementById('analytics-enabled').checked,
                conversationHistoryEnabled: document.getElementById('conversation-history-enabled').checked,
                autoDelete: document.getElementById('auto-delete-select').value,
                
                // Metadata
                lastUpdated: new Date().toISOString()
            };
            
            // Save settings
            await this.saveUserSettings(settings);
            
            // Apply settings immediately
            this.applyAllSettings(settings);
            
            this.showSettingsSuccess('Settings saved successfully');
            
        } catch (error) {
            this.showSettingsError('Failed to save settings: ' + error.message);
        } finally {
            this.setSettingsFormLoading(false);
        }
    }
    
    // ===== SETTINGS UTILITIES =====
    
    getUserSettings() {
        try {
            const stored = localStorage.getItem('math_teacher_settings');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Failed to load settings:', error);
            return {};
        }
    }
    
    async saveUserSettings(settings) {
        try {
            // Save locally
            localStorage.setItem('math_teacher_settings', JSON.stringify(settings));
            
            // If user is authenticated, also save to backend
            if (this.currentUser && this.currentUser.account_type !== 'anonymous') {
                await this.apiRequest('/auth/profile', {
                    method: 'PUT',
                    body: JSON.stringify({
                        preferences: settings
                    })
                });
            }
            
        } catch (error) {
            console.error('Failed to save settings:', error);
            throw error;
        }
    }
    
    applyAllSettings(settings) {
        this.applyTheme(settings.theme);
        this.applyFontSize(settings.fontSize);
        this.toggleAnimations(settings.animationsEnabled);
        // Apply other settings as needed
    }
    
    applyTheme(theme) {
        const body = document.body;
        
        if (theme === 'auto') {
            // Use system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            theme = prefersDark ? 'dark' : 'light';
        }
        
        body.setAttribute('data-theme', theme);
        
        // Remove the old theme toggle from header if it exists
        const oldThemeToggle = document.getElementById('theme-toggle');
        if (oldThemeToggle) {
            oldThemeToggle.remove();
        }
    }
    
    applyFontSize(fontSize) {
        const root = document.documentElement;
        
        switch (fontSize) {
            case 'small':
                root.style.setProperty('--font-size-base', '12px');
                root.style.setProperty('--font-size-sm', '11px');
                root.style.setProperty('--font-size-lg', '14px');
                break;
            case 'large':
                root.style.setProperty('--font-size-base', '16px');
                root.style.setProperty('--font-size-sm', '14px');
                root.style.setProperty('--font-size-lg', '18px');
                break;
            default: // normal
                root.style.setProperty('--font-size-base', '14px');
                root.style.setProperty('--font-size-sm', '12px');
                root.style.setProperty('--font-size-lg', '16px');
                break;
        }
    }
    
    toggleAnimations(enabled) {
        const root = document.documentElement;
        
        if (enabled) {
            root.classList.remove('no-animations');
        } else {
            root.classList.add('no-animations');
        }
    }
    
    // ===== DATA MANAGEMENT METHODS =====
    
    async exportUserData() {
        try {
            // Use existing export function if available
            if (typeof exportConversationData === 'function') {
                await exportConversationData();
            } else {
                // Fallback export
                const data = {
                    settings: this.getUserSettings(),
                    conversations: loadFromLocalStorage('math_conversation', []),
                    messageHistory: loadFromLocalStorage('message_history', []),
                    exportDate: new Date().toISOString()
                };
                
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `math_teacher_settings_export_${new Date().toISOString().split('T')[0]}.json`;
                link.click();
            }
            
            this.showSettingsSuccess('Data exported successfully');
        } catch (error) {
            this.showSettingsError('Export failed: ' + error.message);
        }
    }
    
    async importUserData(fileInput) {
        try {
            const file = fileInput.files[0];
            if (!file) return;
            
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.settings) {
                await this.saveUserSettings(data.settings);
                this.loadSettingsData();
                this.applyAllSettings(data.settings);
            }
            
            // Import other data if available
            if (typeof importConversationData === 'function' && 
                (data.conversations || data.messageHistory)) {
                await importConversationData(fileInput);
            }
            
            this.showSettingsSuccess('Data imported successfully');
            
        } catch (error) {
            this.showSettingsError('Import failed: ' + error.message);
        }
    }
    
    clearAppCache() {
        try {
            // Clear various cache items but preserve essential data
            const itemsToKeep = ['math_teacher_auth', 'user_token', 'math_teacher_settings'];
            const itemsToRemove = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && !itemsToKeep.includes(key)) {
                    itemsToRemove.push(key);
                }
            }
            
            itemsToRemove.forEach(key => localStorage.removeItem(key));
            
            this.showSettingsSuccess('Cache cleared successfully');
        } catch (error) {
            this.showSettingsError('Failed to clear cache: ' + error.message);
        }
    }
    
    confirmResetSettings() {
        if (confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) {
            this.resetAllSettings();
        }
    }
    
    resetAllSettings() {
        try {
            localStorage.removeItem('math_teacher_settings');
            this.loadSettingsData();
            this.applyAllSettings({});
            this.showSettingsSuccess('Settings reset to defaults');
        } catch (error) {
            this.showSettingsError('Failed to reset settings: ' + error.message);
        }
    }
    
    // ===== SETTINGS FORM UTILITIES =====
    
    setSettingsFormLoading(loading) {
        const submitBtn = document.getElementById('settings-submit');
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
    
    clearSettingsMessages() {
        const error = document.getElementById('settings-error');
        const success = document.getElementById('settings-success');
        
        if (error) {
            error.classList.add('hidden');
            error.textContent = '';
        }
        if (success) {
            success.classList.add('hidden');
            success.textContent = '';
        }
    }
    
    showSettingsError(message) {
        const error = document.getElementById('settings-error');
        if (error) {
            error.textContent = message;
            error.classList.remove('hidden');
        }
    }
    
    showSettingsSuccess(message) {
        const success = document.getElementById('settings-success');
        if (success) {
            success.textContent = message;
            success.classList.remove('hidden');
        }
    }
    

    showChangePasswordModal() {
        if (!this.currentUser || this.currentUser.account_type === 'anonymous') {
            showNotification('Please sign in to change your password', 'info');
            this.showAuthModal('login');
            return;
        }
        
        // Create change password modal if it doesn't exist
        if (!document.getElementById('change-password-overlay')) {
            this.createChangePasswordModal();
        }
        
        // Show modal
        const overlay = document.getElementById('change-password-overlay');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    createChangePasswordModal() {
        const overlay = document.createElement('div');
        overlay.id = 'change-password-overlay';
        overlay.className = 'auth-overlay hidden';
        overlay.innerHTML = `
            <div class="auth-modal">
                <div class="auth-header">
                    <h2 class="auth-title">Change Password</h2>
                    <button class="auth-close-btn" id="change-password-close">Close</button>
                </div>
                <div class="auth-content">
                    <form class="auth-form" id="change-password-form">
                        <div class="auth-form-group">
                            <label class="auth-label" for="current-password">Current Password</label>
                            <input type="password" id="current-password" class="auth-input" 
                                   placeholder="Enter current password" required autocomplete="current-password">
                            <div class="field-error hidden" id="current-password-error"></div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="new-password">New Password</label>
                            <input type="password" id="new-password" class="auth-input" 
                                   placeholder="Enter new password" required autocomplete="new-password">
                            <div class="password-strength hidden" id="new-password-strength">
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                                <div class="password-strength-bar"></div>
                            </div>
                            <div class="password-strength-text hidden" id="new-password-strength-text">Weak</div>
                            <div class="field-error hidden" id="new-password-error"></div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label class="auth-label" for="confirm-new-password">Confirm New Password</label>
                            <input type="password" id="confirm-new-password" class="auth-input" 
                                   placeholder="Confirm new password" required autocomplete="new-password">
                            <div class="field-error hidden" id="confirm-new-password-error"></div>
                        </div>
                        
                        <!-- Messages -->
                        <div class="auth-error hidden" id="change-password-error"></div>
                        <div class="auth-success hidden" id="change-password-success"></div>
                        
                        <!-- Actions -->
                        <div class="auth-form-actions">
                            <button type="submit" class="auth-button" id="change-password-submit">
                                <span class="auth-loading hidden">
                                    <span>Changing Password</span>
                                    <span class="auth-loading-dots">
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                        <span class="dot"></span>
                                    </span>
                                </span>
                                <span class="auth-text">Change Password</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.setupChangePasswordModalEvents();
    }

    setupChangePasswordModalEvents() {
        // Close button
        document.getElementById('change-password-close').addEventListener('click', () => {
            this.hideChangePasswordModal();
        });
        
        // Close on overlay click
        document.getElementById('change-password-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'change-password-overlay') {
                this.hideChangePasswordModal();
            }
        });
        
        // Form submission
        document.getElementById('change-password-form').addEventListener('submit', (e) => {
            this.handleChangePassword(e);
        });
        
        // Password strength checking for new password
        document.getElementById('new-password').addEventListener('input', (e) => {
            this.checkNewPasswordStrength(e.target.value);
        });
        
        // Password confirmation
        document.getElementById('confirm-new-password').addEventListener('input', () => {
            this.checkNewPasswordConfirmation();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('change-password-overlay').classList.contains('hidden')) {
                this.hideChangePasswordModal();
            }
        });
    }
    
    hideChangePasswordModal() {
        const overlay = document.getElementById('change-password-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
            this.clearChangePasswordForm();
            this.clearChangePasswordMessages();
        }
    }
    
    async handleChangePassword(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;
        
        // Validate passwords match
        if (newPassword !== confirmNewPassword) {
            this.showChangePasswordFieldError('confirm-new-password-error', 'New passwords do not match');
            return;
        }
        
        // Validate password strength
        if (newPassword.length < 8) {
            this.showChangePasswordFieldError('new-password-error', 'Password must be at least 8 characters long');
            return;
        }
        
        this.setChangePasswordFormLoading(true);
        this.clearChangePasswordMessages();
        
        try {
            const response = await this.apiRequest('/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Password change failed');
            }
            
            this.showChangePasswordSuccess('Password changed successfully');
            
            // Clear form after successful change
            setTimeout(() => {
                this.hideChangePasswordModal();
            }, 2000);
            
        } catch (error) {
            this.showChangePasswordError(error.message);
        } finally {
            this.setChangePasswordFormLoading(false);
        }
    }
    
    checkNewPasswordStrength(password) {
        const strengthIndicator = document.getElementById('new-password-strength');
        const strengthText = document.getElementById('new-password-strength-text');
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

    checkNewPasswordConfirmation() {
        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;
        const errorField = document.getElementById('confirm-new-password-error');
        
        if (confirmNewPassword.length > 0 && newPassword !== confirmNewPassword) {
            this.showChangePasswordFieldError('confirm-new-password-error', 'Passwords do not match');
        } else if (errorField) {
            errorField.classList.add('hidden');
        }
    }
    
    // ===== CHANGE PASSWORD UTILITIES =====
    
    setChangePasswordFormLoading(loading) {
        const submitBtn = document.getElementById('change-password-submit');
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
    
    clearChangePasswordForm() {
        const form = document.getElementById('change-password-form');
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
        
        // Clear password strength indicator
        const strengthIndicator = document.getElementById('new-password-strength');
        const strengthText = document.getElementById('new-password-strength-text');
        if (strengthIndicator) strengthIndicator.classList.add('hidden');
        if (strengthText) strengthText.classList.add('hidden');
    }
    
    clearChangePasswordMessages() {
        const error = document.getElementById('change-password-error');
        const success = document.getElementById('change-password-success');
        
        if (error) {
            error.classList.add('hidden');
            error.textContent = '';
        }
        if (success) {
            success.classList.add('hidden');
            success.textContent = '';
        }
    }
    
    showChangePasswordError(message) {
        const error = document.getElementById('change-password-error');
        if (error) {
            error.textContent = message;
            error.classList.remove('hidden');
        }
    }
    
    showChangePasswordSuccess(message) {
        const success = document.getElementById('change-password-success');
        if (success) {
            success.textContent = message;
            success.classList.remove('hidden');
        }
    }
    
    showChangePasswordFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.textContent = message;
            field.classList.remove('hidden');
        }
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

