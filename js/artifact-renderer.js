class ArtifactRenderer {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.artifacts = new Map();
        this.renderingQueue = [];
    }

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

    async processArtifacts(element, text, sessionId) {
        const artifacts = this.parseArtifacts(text);
        
        if (artifacts.length === 0) {
            return text;
        }

        let processedText = text;

        for (const artifact of artifacts) {
            try {
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

                const artifactElement = this.renderArtifact(artifactId, artifact.data);
                
                const placeholder = `__ARTIFACT_PLACEHOLDER_${artifactId}__`;
                processedText = processedText.replace(artifact.originalText, placeholder);
                
                this.renderingQueue.push({
                    placeholder,
                    element: artifactElement,
                    artifactId
                });

            } catch (error) {
                console.error('Failed to create artifact:', error);
                processedText = processedText.replace(
                    artifact.originalText, 
                    `[Artifact Error: ${artifact.data.title || 'Unknown'}]`
                );
            }
        }

        return processedText;
    }

    applyArtifacts(element) {
        for (const item of this.renderingQueue) {
            const textContent = element.innerHTML;
            if (textContent.includes(item.placeholder)) {
                const container = document.createElement('div');
                container.innerHTML = textContent.replace(
                    item.placeholder,
                    `<div id="artifact-${item.artifactId}"></div>`
                );
                
                element.innerHTML = container.innerHTML;
                
                const artifactContainer = element.querySelector(`#artifact-${item.artifactId}`);
                if (artifactContainer) {
                    artifactContainer.replaceWith(item.element);
                }
            }
        }
        
        this.renderingQueue = [];
    }

    renderArtifact(artifactId, artifactData) {
        const container = document.createElement('div');
        container.className = 'artifact-container';
        container.dataset.artifactId = artifactId;

        switch (artifactData.type) {
            case 'graph':
                return this.renderGraphArtifact(container, artifactData);
            case 'step_by_step':
                return this.renderStepByStepArtifact(container, artifactData);
            default:
                container.innerHTML = `<div class="artifact-error">Unknown artifact type: ${artifactData.type}</div>`;
                return container;
        }
    }

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

        this.renderPlotlyGraph(container.querySelector('.graph-container'), content, isDarkMode);
        this.setupGraphControls(container, content);

        return container;
    }

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

        this.setupStepByStepAnimation(container);

        return container;
    }

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
            
            setTimeout(() => {
                const graphDiv = graphContainer.querySelector('.js-plotly-plot');
                if (graphDiv) {
                    Plotly.Plots.resize(graphDiv);
                }
            }, 100);
        });
    }

    setupStepByStepAnimation(container) {
        const steps = container.querySelectorAll('.solution-step');
        
        steps.forEach((step, index) => {
            if (index > 0) {
                step.style.opacity = '0.3';
                step.style.transform = 'translateY(20px)';
            }
        });

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

        let autoAdvance = setInterval(animateNextStep, 2000);
        
        container.addEventListener('click', () => {
            clearInterval(autoAdvance);
            animateNextStep();
        });

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
                    color: isDarkMode ? '#00ff00' : '#000000',
                    width: 2
                },
                name: content.function
            };
            
            const layout = {
                paper_bgcolor: 'transparent',
                plot_bgcolor: isDarkMode ? '#000000' : '#ffffff',
                font: {
                    family: 'JetBrains Mono, monospace',
                    size: 12,
                    color: isDarkMode ? '#00ff00' : '#000000'
                },

                xaxis: {
                    gridcolor: isDarkMode ? '#333333' : '#cccccc',
                    zerolinecolor: isDarkMode ? '#00ff00' : '#000000',
                    color: isDarkMode ? '#00ff00' : '#000000',
                    title: content.axes_labels?.x || 'x'
                },

                yaxis: {
                    gridcolor: isDarkMode ? '#333333' : '#cccccc',
                    zerolinecolor: isDarkMode ? '#00ff00' : '#000000',
                    color: isDarkMode ? '#00ff00' : '#000000',
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

window.artifactRenderer = new ArtifactRenderer();