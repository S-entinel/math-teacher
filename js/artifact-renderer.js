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
                // Only process graph artifacts now
                if (artifactData.type === 'graph') {
                    artifacts.push({
                        originalText: match[0],
                        data: artifactData
                    });
                }
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
                    `[GRAPH ERROR: ${artifact.data.title || 'Function visualization failed'}]`
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
        container.className = 'artifact-container graph-artifact';
        container.dataset.artifactId = artifactId;

        if (artifactData.type === 'graph') {
            return this.renderGraphArtifact(container, artifactData);
        }
        
        container.innerHTML = `<div class="artifact-error">UNKNOWN ARTIFACT TYPE</div>`;
        return container;
    }

    renderGraphArtifact(container, data) {
        const content = data.content;
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        
        // Clean function display for title
        const displayFunction = content.function.replace(/\*\*/g, '^').replace(/\*/g, '·');

        container.innerHTML = `
            <div class="artifact-header">
                <div class="artifact-title">► ${data.title || `f(x) = ${displayFunction}`}</div>
                <div class="artifact-actions">
                    <button class="artifact-btn reset-btn" title="Reset view">RESET</button>
                    <button class="artifact-btn fullscreen-btn" title="Fullscreen">FULL</button>
                </div>
            </div>
            <div class="artifact-content">
                <div class="graph-display" style="height: 350px; position: relative;">
                    <div class="graph-loading">
                        <span class="loading-text">RENDERING GRAPH</span>
                        <span class="thinking-dots">
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </span>
                    </div>
                </div>
                <div class="graph-controls">
                    <div class="control-group">
                        <label class="control-label">
                            FUNCTION
                            <input type="text" class="function-input terminal-input" value="${content.function}" />
                        </label>
                    </div>
                    <div class="control-group">
                        <label class="control-label">
                            X RANGE
                            <div class="range-inputs">
                                <input type="number" class="x-min-input terminal-input" value="${content.x_min}" step="0.5" />
                                <span class="range-separator">TO</span>
                                <input type="number" class="x-max-input terminal-input" value="${content.x_max}" step="0.5" />
                            </div>
                        </label>
                    </div>
                    <button class="update-graph-btn terminal-btn primary">UPDATE</button>
                </div>
            </div>
        `;

        // Render graph after a brief delay to show loading state
        setTimeout(() => {
            this.renderPlotlyGraph(container.querySelector('.graph-display'), content, isDarkMode);
        }, 300);
        
        this.setupGraphControls(container, content);
        return container;
    }

    setupGraphControls(container, content) {
        const updateBtn = container.querySelector('.update-graph-btn');
        const functionInput = container.querySelector('.function-input');
        const xMinInput = container.querySelector('.x-min-input');
        const xMaxInput = container.querySelector('.x-max-input');
        const graphDisplay = container.querySelector('.graph-display');

        // Update graph handler
        const updateGraph = () => {
            const newContent = {
                ...content,
                function: functionInput.value.trim(),
                x_min: parseFloat(xMinInput.value),
                x_max: parseFloat(xMaxInput.value)
            };
            
            // Show loading state
            graphDisplay.innerHTML = `
                <div class="graph-loading">
                    <span class="loading-text">UPDATING GRAPH</span>
                    <span class="thinking-dots">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                    </span>
                </div>
            `;
            
            setTimeout(() => {
                const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
                this.renderPlotlyGraph(graphDisplay, newContent, isDarkMode);
            }, 200);
        };

        updateBtn.addEventListener('click', updateGraph);

        // Enter key support
        [functionInput, xMinInput, xMaxInput].forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    updateGraph();
                }
            });
        });

        // Reset button
        const resetBtn = container.querySelector('.reset-btn');
        resetBtn.addEventListener('click', () => {
            functionInput.value = content.function;
            xMinInput.value = content.x_min;
            xMaxInput.value = content.x_max;
            updateGraph();
        });

        // Fullscreen toggle
        const fullscreenBtn = container.querySelector('.fullscreen-btn');
        fullscreenBtn.addEventListener('click', () => {
            container.classList.toggle('fullscreen');
            
            if (container.classList.contains('fullscreen')) {
                graphDisplay.style.height = '80vh';
                fullscreenBtn.textContent = 'EXIT';
                document.body.style.overflow = 'hidden';
            } else {
                graphDisplay.style.height = '350px';
                fullscreenBtn.textContent = 'FULL';
                document.body.style.overflow = '';
            }
            
            // Resize Plotly graph
            setTimeout(() => {
                const plotlyDiv = graphDisplay.querySelector('.js-plotly-plot');
                if (plotlyDiv) {
                    Plotly.Plots.resize(plotlyDiv);
                }
            }, 100);
        });

        // Close fullscreen on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && container.classList.contains('fullscreen')) {
                fullscreenBtn.click();
            }
        });
    }

    renderPlotlyGraph(container, content, isDarkMode) {
        try {
            // Clear loading state
            container.innerHTML = '';
            
            const x = [];
            const y = [];
            const steps = 500; // Higher resolution for smoother curves
            
            for (let i = 0; i <= steps; i++) {
                const xVal = content.x_min + (content.x_max - content.x_min) * i / steps;
                x.push(xVal);
                
                try {
                    const expr = this.parseMathExpression(content.function, xVal);
                    const result = eval(expr);
                    y.push(isFinite(result) ? result : null);
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
                    color: isDarkMode ? '#ffffff' : '#000000',
                    width: 2
                },
                name: content.function,
                connectgaps: false
            };
            
            // Terminal-style layout
            const layout = {
                paper_bgcolor: 'transparent',
                plot_bgcolor: isDarkMode ? '#000000' : '#ffffff',
                font: {
                    family: 'JetBrains Mono, monospace',
                    size: 11,
                    color: isDarkMode ? '#ffffff' : '#000000'
                },
                
                xaxis: {
                    gridcolor: isDarkMode ? '#333333' : '#cccccc',
                    gridwidth: 1,
                    zerolinecolor: isDarkMode ? '#ffffff' : '#000000',
                    zerolinewidth: 2,
                    color: isDarkMode ? '#ffffff' : '#000000',
                    title: {
                        text: content.axes_labels?.x || 'x',
                        font: { size: 12 }
                    },
                    showspikes: true,
                    spikecolor: isDarkMode ? '#ffffff' : '#000000',
                    spikethickness: 1,
                    spikedash: 'solid'
                },
                
                yaxis: {
                    gridcolor: isDarkMode ? '#333333' : '#cccccc',
                    gridwidth: 1,
                    zerolinecolor: isDarkMode ? '#ffffff' : '#000000',
                    zerolinewidth: 2,
                    color: isDarkMode ? '#ffffff' : '#000000',
                    title: {
                        text: content.axes_labels?.y || 'y',
                        font: { size: 12 }
                    },
                    showspikes: true,
                    spikecolor: isDarkMode ? '#ffffff' : '#000000',
                    spikethickness: 1,
                    spikedash: 'solid'
                },
                
                title: {
                    text: content.title || '',
                    font: { 
                        color: isDarkMode ? '#ffffff' : '#000000',
                        size: 14
                    }
                },
                
                margin: { l: 60, r: 20, b: 60, t: content.title ? 60 : 20 },
                showlegend: false,
                hovermode: 'x unified',
                
                // Terminal-style annotations for special points
                annotations: (content.annotations || []).map(ann => ({
                    x: ann.x,
                    y: ann.y,
                    text: ann.text,
                    showarrow: true,
                    arrowhead: 2,
                    arrowsize: 1,
                    arrowwidth: 1,
                    arrowcolor: isDarkMode ? '#ffffff' : '#000000',
                    font: {
                        color: isDarkMode ? '#ffffff' : '#000000',
                        size: 10
                    },
                    bgcolor: isDarkMode ? '#000000' : '#ffffff',
                    bordercolor: isDarkMode ? '#ffffff' : '#000000',
                    borderwidth: 1
                }))
            };
            
            const config = {
                displayModeBar: true,
                displaylogo: false,
                responsive: true,
                modeBarButtonsToRemove: [
                    'pan2d', 'lasso2d', 'select2d', 'autoScale2d',
                    'hoverClosestCartesian', 'hoverCompareCartesian'
                ],
                modeBarButtons: [[
                    'zoom2d', 'zoomIn2d', 'zoomOut2d', 'resetScale2d',
                    'toImage'
                ]]
            };
            
            Plotly.newPlot(container, [trace], layout, config);
            
        } catch (error) {
            console.error('Graph rendering error:', error);
            container.innerHTML = `
                <div class="graph-error">
                    <div class="error-title">GRAPH RENDER ERROR</div>
                    <div class="error-message">${error.message}</div>
                    <div class="error-hint">Check function syntax and try again</div>
                </div>
            `;
        }
    }

    parseMathExpression(expression, xVal) {
        let expr = expression;
        
        // Clean up common function format
        expr = expr.replace(/f\(x\)\s*=\s*/, '');
        
        // Handle exponents
        expr = expr.replace(/\^/g, '**');
        expr = expr.replace(/(\d+)\s*\*\s*\*/g, 'Math.pow($1,');
        expr = expr.replace(/x\*\*(\d+)/g, 'Math.pow(x, $1)');
        expr = expr.replace(/x\^(\d+)/g, 'Math.pow(x, $1)');
        
        // Replace x with actual value
        expr = expr.replace(/\bx\b/g, `(${xVal})`);
        
        // Mathematical functions
        expr = expr.replace(/\bsin\b/g, 'Math.sin');
        expr = expr.replace(/\bcos\b/g, 'Math.cos');
        expr = expr.replace(/\btan\b/g, 'Math.tan');
        expr = expr.replace(/\basin\b/g, 'Math.asin');
        expr = expr.replace(/\bacos\b/g, 'Math.acos');
        expr = expr.replace(/\batan\b/g, 'Math.atan');
        expr = expr.replace(/\blog\b/g, 'Math.log10');
        expr = expr.replace(/\bln\b/g, 'Math.log');
        expr = expr.replace(/\bsqrt\b/g, 'Math.sqrt');
        expr = expr.replace(/\babs\b/g, 'Math.abs');
        expr = expr.replace(/\bexp\b/g, 'Math.exp');
        expr = expr.replace(/\bfloor\b/g, 'Math.floor');
        expr = expr.replace(/\bceil\b/g, 'Math.ceil');
        
        // Constants
        expr = expr.replace(/\bpi\b/g, 'Math.PI');
        expr = expr.replace(/\be\b/g, 'Math.E');
        
        return expr;
    }
}

// Initialize global instance
window.artifactRenderer = new ArtifactRenderer();