// Artifact system for frontend rendering

class ArtifactRenderer {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.artifacts = new Map();
        this.renderingQueue = [];
    }

    // Parse artifacts from AI response text
    parseArtifacts(text) {
        const artifactRegex = /<artifact>([\s\S]*?)<\/artifact>/g;
        const artifacts = [];
        let match;

        while ((match = artifactRegex.exec(text)) !== null) {
            try {
                const artifactData = JSON.parse(match[1]);
                artifacts.push({
                    originalText: match[0],
                    data: artifactData
                });
            } catch (error) {
                console.error('Failed to parse artifact:', error);
            }
        }

        return artifacts;
    }

    // Process artifacts in AI response
    async processArtifacts(element, text, sessionId) {
        const artifacts = this.parseArtifacts(text);
        
        if (artifacts.length === 0) {
            return text; // No artifacts to process
        }

        let processedText = text;

        for (const artifact of artifacts) {
            try {
                // Create artifact on backend
                const response = await fetch(`${this.apiUrl}/artifacts/create`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ...artifact.data,
                        session_id: sessionId
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                const artifactId = result.artifact_id;

                // Replace artifact text with rendered component
                const artifactElement = this.renderArtifact(artifactId, artifact.data);
                
                // Create a placeholder and replace it after text processing
                const placeholder = `__ARTIFACT_PLACEHOLDER_${artifactId}__`;
                processedText = processedText.replace(artifact.originalText, placeholder);
                
                // Store for later replacement
                this.renderingQueue.push({
                    placeholder,
                    element: artifactElement,
                    artifactId
                });

            } catch (error) {
                console.error('Failed to create artifact:', error);
                // Replace with error message
                processedText = processedText.replace(
                    artifact.originalText, 
                    `[Artifact Error: ${artifact.data.title || 'Unknown'}]`
                );
            }
        }

        return processedText;
    }

    // Apply rendered artifacts to the DOM
    applyArtifacts(element) {
        for (const item of this.renderingQueue) {
            const textContent = element.innerHTML;
            if (textContent.includes(item.placeholder)) {
                // Create a container for the artifact
                const container = document.createElement('div');
                container.innerHTML = textContent.replace(
                    item.placeholder,
                    `<div id="artifact-${item.artifactId}"></div>`
                );
                
                element.innerHTML = container.innerHTML;
                
                // Insert the actual artifact element
                const artifactContainer = element.querySelector(`#artifact-${item.artifactId}`);
                if (artifactContainer) {
                    artifactContainer.replaceWith(item.element);
                }
            }
        }
        
        // Clear the queue
        this.renderingQueue = [];
    }

    // Render specific artifact types
    renderArtifact(artifactId, artifactData) {
        const container = document.createElement('div');
        container.className = 'artifact-container';
        container.dataset.artifactId = artifactId;

        switch (artifactData.type) {
            case 'graph':
                return this.renderGraphArtifact(container, artifactData);
            case 'exercise':
                return this.renderExerciseArtifact(container, artifactData);
            case 'step_by_step':
                return this.renderStepByStepArtifact(container, artifactData);
            default:
                container.innerHTML = `<div class="artifact-error">Unknown artifact type: ${artifactData.type}</div>`;
                return container;
        }
    }

    // Render graph artifacts
    renderGraphArtifact(container, data) {
        container.className += ' graph-artifact';
        
        const content = data.content;
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

        container.innerHTML = `
            <div class="artifact-header">
                <div class="artifact-title">${data.title || 'Mathematical Graph'}</div>
                <div class="artifact-actions">
                    <button class="artifact-btn export-btn" title="Export graph">Export</button>
                    <button class="artifact-btn fullscreen-btn" title="Fullscreen">⛶</button>
                </div>
            </div>
            <div class="artifact-content">
                <div class="graph-container" style="height: 400px;"></div>
                <div class="graph-controls">
                    <label>Function: <input type="text" class="function-input" value="${content.function}" /></label>
                    <label>X Min: <input type="number" class="x-min-input" value="${content.x_min}" /></label>
                    <label>X Max: <input type="number" class="x-max-input" value="${content.x_max}" /></label>
                    <button class="update-graph-btn">Update Graph</button>
                </div>
            </div>
        `;

        // Render the actual graph
        this.renderPlotlyGraph(container.querySelector('.graph-container'), content, isDarkMode);

        // Add event listeners
        this.setupGraphControls(container, content);

        return container;
    }

    // Render exercise artifacts
    renderExerciseArtifact(container, data) {
        container.className += ' exercise-artifact';
        
        const content = data.content;

        let stepsHtml = (content.steps || []).map((step, index) => `
            <div class="exercise-step" data-step="${step.step_number}">
                <div class="step-header">
                    <span class="step-number">Step ${step.step_number}</span>
                    <div class="step-actions">
                        <button class="hint-btn" data-step="${step.step_number}">💡 Hint</button>
                    </div>
                </div>
                <div class="step-instruction">${step.instruction}</div>
                <div class="step-input">
                    <input type="text" class="step-answer" placeholder="Your answer..." />
                    <button class="check-answer-btn" data-step="${step.step_number}">Check</button>
                </div>
                <div class="step-hint hidden">${step.hint || ''}</div>
                <div class="step-feedback hidden"></div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="artifact-header">
                <div class="artifact-title">${data.title || 'Practice Exercise'}</div>
                <div class="artifact-meta">
                    <span class="difficulty-badge ${content.difficulty}">${content.difficulty}</span>
                </div>
            </div>
            <div class="artifact-content">
                <div class="problem-statement">${content.problem_statement}</div>
                <div class="exercise-steps">
                    ${stepsHtml}
                </div>
                <div class="exercise-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <span class="progress-text">0 / ${(content.steps || []).length} steps completed</span>
                </div>
            </div>
        `;

        // Setup exercise interactivity
        this.setupExerciseControls(container, content);

        return container;
    }

    // Render step-by-step artifacts
    renderStepByStepArtifact(container, data) {
        container.className += ' step-by-step-artifact';
        
        const content = data.content;

        let stepsHtml = content.steps.map((step, index) => `
            <div class="solution-step" data-step="${step.step}">
                <div class="step-number">${step.step}</div>
                <div class="step-content">
                    <div class="step-action">${step.action}</div>
                    <div class="step-explanation">${step.explanation}</div>
                    <div class="step-result">${step.result}</div>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="artifact-header">
                <div class="artifact-title">${data.title || 'Step-by-Step Solution'}</div>
                <div class="artifact-actions">
                    <button class="artifact-btn replay-btn" title="Replay solution">⟲</button>
                </div>
            </div>
            <div class="artifact-content">
                <div class="problem-statement">${content.problem}</div>
                <div class="solution-steps">
                    ${stepsHtml}
                </div>
                <div class="final-result">
                    <strong>Final Answer: </strong>${content.final_result}
                </div>
            </div>
        `;

        // Setup step-by-step animation
        this.setupStepByStepAnimation(container);

        return container;
    }

    // Setup graph controls
    setupGraphControls(container, content) {
        const updateBtn = container.querySelector('.update-graph-btn');
        const functionInput = container.querySelector('.function-input');
        const xMinInput = container.querySelector('.x-min-input');
        const xMaxInput = container.querySelector('.x-max-input');
        const graphContainer = container.querySelector('.graph-container');

        updateBtn.addEventListener('click', () => {
            const newContent = {
                ...content,
                function: functionInput.value,
                x_min: parseFloat(xMinInput.value),
                x_max: parseFloat(xMaxInput.value)
            };
            
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            this.renderPlotlyGraph(graphContainer, newContent, isDarkMode);
        });

        // Export functionality
        const exportBtn = container.querySelector('.export-btn');
        exportBtn.addEventListener('click', () => {
            const graphDiv = graphContainer.querySelector('.js-plotly-plot');
            if (graphDiv) {
                Plotly.downloadImage(graphDiv, {
                    format: 'png',
                    width: 800,
                    height: 600,
                    filename: `graph_${content.function.replace(/[^a-zA-Z0-9]/g, '_')}`
                });
            }
        });

        // Fullscreen functionality
        const fullscreenBtn = container.querySelector('.fullscreen-btn');
        fullscreenBtn.addEventListener('click', () => {
            container.classList.toggle('fullscreen');
            if (container.classList.contains('fullscreen')) {
                graphContainer.style.height = '80vh';
                fullscreenBtn.textContent = '⛶';
            } else {
                graphContainer.style.height = '400px';
                fullscreenBtn.textContent = '⛶';
            }
            
            // Resize the plot
            setTimeout(() => {
                const graphDiv = graphContainer.querySelector('.js-plotly-plot');
                if (graphDiv) {
                    Plotly.Plots.resize(graphDiv);
                }
            }, 100);
        });
    }

    // Setup exercise controls
    setupExerciseControls(container, content) {
        const steps = content.steps;
        let completedSteps = 0;

        // Hint buttons
        container.querySelectorAll('.hint-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stepNumber = parseInt(e.target.dataset.step);
                const stepElement = container.querySelector(`[data-step="${stepNumber}"]`);
                const hintElement = stepElement.querySelector('.step-hint');
                
                hintElement.classList.toggle('hidden');
                btn.textContent = hintElement.classList.contains('hidden') ? '💡 Hint' : '🔍 Hide Hint';
            });
        });

        // Answer checking
        container.querySelectorAll('.check-answer-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stepNumber = parseInt(e.target.dataset.step);
                const stepElement = container.querySelector(`[data-step="${stepNumber}"]`);
                const answerInput = stepElement.querySelector('.step-answer');
                const feedbackElement = stepElement.querySelector('.step-feedback');
                
                const userAnswer = answerInput.value.trim();
                const step = steps.find(s => s.step_number === stepNumber);
                
                if (!step) return;

                let isCorrect = false;
                
                // Simple answer validation
                if (step.validation_type === 'numeric' && step.expected_answer) {
                    const expected = parseFloat(step.expected_answer);
                    const user = parseFloat(userAnswer);
                    const tolerance = step.tolerance || 0.01;
                    isCorrect = Math.abs(expected - user) <= tolerance;
                } else if (step.expected_answer) {
                    isCorrect = userAnswer.toLowerCase() === step.expected_answer.toLowerCase();
                }

                feedbackElement.classList.remove('hidden');
                feedbackElement.className = `step-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
                feedbackElement.textContent = isCorrect ? 
                    '✓ Correct! Well done.' : 
                    '✗ Not quite right. Try again or check the hint.';

                if (isCorrect && !stepElement.classList.contains('completed')) {
                    stepElement.classList.add('completed');
                    completedSteps++;
                    this.updateExerciseProgress(container, completedSteps, steps.length);
                }
            });
        });

        // Enter key support for answers
        container.querySelectorAll('.step-answer').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const checkBtn = input.parentElement.querySelector('.check-answer-btn');
                    checkBtn.click();
                }
            });
        });
    }

    // Update exercise progress
    updateExerciseProgress(container, completed, total) {
        const progressFill = container.querySelector('.progress-fill');
        const progressText = container.querySelector('.progress-text');
        
        const percentage = (completed / total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${completed} / ${total} steps completed`;
        
        if (completed === total) {
            const header = container.querySelector('.artifact-header');
            header.classList.add('completed');
            
            // Add completion celebration
            const celebration = document.createElement('div');
            celebration.className = 'completion-message';
            celebration.innerHTML = '🎉 Exercise completed! Great work!';
            container.querySelector('.artifact-content').appendChild(celebration);
        }
    }

    // Setup step-by-step animation
    setupStepByStepAnimation(container) {
        const steps = container.querySelectorAll('.solution-step');
        
        // Initially hide all steps except the first
        steps.forEach((step, index) => {
            if (index > 0) {
                step.style.opacity = '0.3';
                step.style.transform = 'translateY(20px)';
            }
        });

        // Animate steps one by one
        let currentStep = 0;
        
        const animateNextStep = () => {
            if (currentStep < steps.length - 1) {
                currentStep++;
                const step = steps[currentStep];
                step.style.transition = 'all 0.5s ease';
                step.style.opacity = '1';
                step.style.transform = 'translateY(0)';
            }
        };

        // Auto-advance every 2 seconds, or click to advance
        let autoAdvance = setInterval(animateNextStep, 2000);
        
        container.addEventListener('click', () => {
            clearInterval(autoAdvance);
            animateNextStep();
        });

        // Replay functionality
        const replayBtn = container.querySelector('.replay-btn');
        if (replayBtn) {
            replayBtn.addEventListener('click', () => {
                currentStep = 0;
                clearInterval(autoAdvance);
                
                steps.forEach((step, index) => {
                    if (index > 0) {
                        step.style.opacity = '0.3';
                        step.style.transform = 'translateY(20px)';
                    }
                });
                
                autoAdvance = setInterval(animateNextStep, 2000);
            });
        }
    }

    // Render Plotly graph
    renderPlotlyGraph(container, content, isDarkMode) {
        try {
            const x = [];
            const y = [];
            const steps = 300;
            
            for (let i = 0; i <= steps; i++) {
                const xVal = content.x_min + (content.x_max - content.x_min) * i / steps;
                x.push(xVal);
                
                try {
                    const expr = this.parseMathExpression(content.function, xVal);
                    y.push(eval(expr));
                } catch (e) {
                    y.push(null);
                }
            }
            
            const trace = {
                x: x,
                y: y,
                type: 'scatter',
                mode: 'lines',
                line: {
                    color: isDarkMode ? '#4fc3f7' : '#0ea5e9',
                    width: 3
                },
                name: content.function
            };
            
            const layout = {
                paper_bgcolor: 'transparent',
                plot_bgcolor: isDarkMode ? 'rgba(26, 32, 52, 0.9)' : 'rgba(248, 250, 252, 0.9)',
                font: {
                    family: 'Inter',
                    size: 12,
                    color: isDarkMode ? '#e8eaed' : '#1a202c'
                },
                xaxis: {
                    gridcolor: isDarkMode ? '#2d3748' : '#e2e8f0',
                    zerolinecolor: isDarkMode ? '#4fc3f7' : '#0ea5e9',
                    color: isDarkMode ? '#e8eaed' : '#1a202c',
                    title: content.axes_labels?.x || 'x'
                },
                yaxis: {
                    gridcolor: isDarkMode ? '#2d3748' : '#e2e8f0',
                    zerolinecolor: isDarkMode ? '#4fc3f7' : '#0ea5e9',
                    color: isDarkMode ? '#e8eaed' : '#1a202c',
                    title: content.axes_labels?.y || 'y'
                },
                title: {
                    text: content.title || '',
                    font: { color: isDarkMode ? '#e8eaed' : '#1a202c' }
                },
                margin: { l: 60, r: 20, b: 60, t: 60 },
                showlegend: false
            };
            
            const config = {
                displayModeBar: true,
                displaylogo: false,
                responsive: true,
                modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
            };
            
            Plotly.newPlot(container, [trace], layout, config);
            
        } catch (error) {
            console.error('Graph rendering error:', error);
            container.innerHTML = `<div class="artifact-error">Error rendering graph: ${error.message}</div>`;
        }
    }

    // Parse mathematical expressions (same as before)
    parseMathExpression(expression, xVal) {
        let expr = expression.replace(/f\(x\)\s*=\s*/, '');
        
        expr = expr.replace(/\^/g, '**');
        expr = expr.replace(/(\d+)\s*\*\s*\*/g, 'Math.pow($1,');
        expr = expr.replace(/x\*\*(\d+)/g, 'Math.pow(x, $1)');
        expr = expr.replace(/x\^(\d+)/g, 'Math.pow(x, $1)');
        expr = expr.replace(/\bx\b/g, `(${xVal})`);
        
        expr = expr.replace(/\bsin\b/g, 'Math.sin');
        expr = expr.replace(/\bcos\b/g, 'Math.cos');
        expr = expr.replace(/\btan\b/g, 'Math.tan');
        expr = expr.replace(/\blog\b/g, 'Math.log10');
        expr = expr.replace(/\bln\b/g, 'Math.log');
        expr = expr.replace(/\bsqrt\b/g, 'Math.sqrt');
        expr = expr.replace(/\babs\b/g, 'Math.abs');
        expr = expr.replace(/\bexp\b/g, 'Math.exp');
        
        expr = expr.replace(/\bpi\b/g, 'Math.PI');
        expr = expr.replace(/\be\b/g, 'Math.E');
        
        return expr;
    }
}

// Global artifact renderer instance
window.artifactRenderer = new ArtifactRenderer();