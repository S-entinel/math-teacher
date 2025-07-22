class ArtifactRenderer {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.artifacts = new Map();
        this.renderingQueue = [];
        this.plotlyGraphs = new Map();
    }

    parseArtifacts(text) {
        const artifactRegex = /<artifact>([\s\S]*?)<\/artifact>/g;
        const artifacts = [];
        let match;

        while ((match = artifactRegex.exec(text)) !== null) {
            try {
                const artifactData = JSON.parse(match[1]);
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
                    headers: { 'Content-Type': 'application/json' },
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
            return this.renderGraphArtifact(container, artifactData, artifactId);
        }
        
        container.innerHTML = `<div class="artifact-error">UNKNOWN ARTIFACT TYPE</div>`;
        return container;
    }

    renderGraphArtifact(container, data, artifactId) {
        const content = data.content;
        const cleanFunction = this.cleanFunctionDisplay(content.function);
        const graphId = `graph-${artifactId}`;

        container.innerHTML = `
            <div class="artifact-header">
                <div class="artifact-title">► ${data.title || `f(x) = ${cleanFunction}`}</div>
                <div class="artifact-actions">
                    <button class="artifact-btn reset-btn" title="Reset view">RESET</button>
                    <button class="artifact-btn fullscreen-btn" title="Fullscreen">FULL</button>
                </div>
            </div>
            <div class="artifact-content">
                <div class="graph-container">
                    <div class="graph-display" id="${graphId}">
                        <div class="graph-loading">
                            <span class="loading-text">RENDERING GRAPH</span>
                            <span class="thinking-dots">
                                <span class="dot"></span>
                                <span class="dot"></span>
                                <span class="dot"></span>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="graph-controls">
                    <div class="control-group">
                        <label class="control-label">FUNCTION</label>
                        <input type="text" class="function-input terminal-input" value="${content.function}" placeholder="e.g. x^2, sin(x), log(x)" />
                    </div>
                    <div class="control-group">
                        <label class="control-label">X RANGE</label>
                        <div class="range-inputs">
                            <input type="number" class="x-min-input terminal-input" value="${content.x_min}" step="0.5" />
                            <span class="range-separator">TO</span>
                            <input type="number" class="x-max-input terminal-input" value="${content.x_max}" step="0.5" />
                        </div>
                    </div>
                    <div class="control-group">
                        <label class="control-label">Y RANGE</label>
                        <div class="range-inputs">
                            <input type="number" class="y-min-input terminal-input" value="${content.y_min || ''}" step="0.5" placeholder="auto" />
                            <span class="range-separator">TO</span>
                            <input type="number" class="y-max-input terminal-input" value="${content.y_max || ''}" step="0.5" placeholder="auto" />
                        </div>
                    </div>
                    <button class="update-graph-btn terminal-btn primary">UPDATE</button>
                </div>
            </div>
        `;

        // Initialize graph after brief delay for loading effect
        setTimeout(() => {
            this.renderGraph(container.querySelector('.graph-display'), content, artifactId);
        }, 400);
        
        this.setupGraphControls(container, content, artifactId);
        return container;
    }

    setupGraphControls(container, content, artifactId) {
        const updateBtn = container.querySelector('.update-graph-btn');
        const functionInput = container.querySelector('.function-input');
        const xMinInput = container.querySelector('.x-min-input');
        const xMaxInput = container.querySelector('.x-max-input');
        const yMinInput = container.querySelector('.y-min-input');
        const yMaxInput = container.querySelector('.y-max-input');
        const graphDisplay = container.querySelector('.graph-display');

        const updateGraph = () => {
            const newContent = {
                ...content,
                function: functionInput.value.trim() || 'x',
                x_min: parseFloat(xMinInput.value) || -10,
                x_max: parseFloat(xMaxInput.value) || 10,
                y_min: yMinInput.value === '' ? null : parseFloat(yMinInput.value),
                y_max: yMaxInput.value === '' ? null : parseFloat(yMaxInput.value)
            };
            
            // Update using react
            this.updateExistingGraph(graphDisplay, newContent);
            
            // Update the content reference
            Object.assign(content, newContent);
            
            // Update title
            const title = container.querySelector('.artifact-title');
            const cleanFunction = this.cleanFunctionDisplay(newContent.function);
            title.textContent = `► f(x) = ${cleanFunction}`;
        };

        updateBtn.addEventListener('click', updateGraph);

        // Enter key support for all inputs
        [functionInput, xMinInput, xMaxInput, yMinInput, yMaxInput].forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
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
            yMinInput.value = content.y_min || '';
            yMaxInput.value = content.y_max || '';
            updateGraph();
        });

        // Fullscreen functionality
        this.setupFullscreenControls(container, artifactId);
    }

    setupFullscreenControls(container, artifactId) {
        const fullscreenBtn = container.querySelector('.fullscreen-btn');
        const graphDisplay = container.querySelector('.graph-display');

        fullscreenBtn.addEventListener('click', () => {
            const isFullscreen = container.classList.contains('fullscreen');
            
            if (!isFullscreen) {
                container.classList.add('fullscreen');
                fullscreenBtn.textContent = 'EXIT';
                document.body.style.overflow = 'hidden';
                
                // Let CSS handle the fullscreen sizing
                setTimeout(() => {
                    this.resizeGraph(graphDisplay);
                }, 150);
            } else {
                container.classList.remove('fullscreen');
                fullscreenBtn.textContent = 'FULL';
                document.body.style.overflow = '';
                
                // Let CSS handle the normal sizing  
                setTimeout(() => {
                    this.resizeGraph(graphDisplay);
                }, 150);
            }
        });

        // Escape key to exit fullscreen
        const handleEscape = (e) => {
            if (e.key === 'Escape' && container.classList.contains('fullscreen')) {
                fullscreenBtn.click();
            }
        };

        document.addEventListener('keydown', handleEscape);
        
        // Cleanup on container removal
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.removedNodes.forEach((node) => {
                        if (node === container) {
                            this.plotlyGraphs.delete(artifactId);
                            document.removeEventListener('keydown', handleEscape);
                            observer.disconnect();
                        }
                    });
                }
            });
        });
        
        if (container.parentNode) {
            observer.observe(container.parentNode, { childList: true });
        }
    }

    renderGraph(container, content, artifactId) {
        try {
            // Clear loading state
            container.innerHTML = '';
            
            const plotData = this.generatePlotData(content);
            const layout = this.createPlotLayout(content);
            const config = this.getPlotConfig();
            
            // Create the plot
            window.Plotly.newPlot(container, plotData, layout, config).then(() => {
                // Store reference
                this.plotlyGraphs.set(artifactId, container);
            });
            
        } catch (error) {
            console.error('Graph rendering error:', error);
            this.showGraphError(container, error.message);
        }
    }

    updateExistingGraph(container, content) {
        try {
            const plotData = this.generatePlotData(content);
            const layout = this.createPlotLayout(content);
            
            // Use Plotly.react to update without changing container
            window.Plotly.react(container, plotData, layout);
            
        } catch (error) {
            console.error('Graph update error:', error);
            // Fallback to full re-render if update fails
            this.renderGraph(container, content);
        }
    }

    generatePlotData(content) {
        const points = 1000;
        const xValues = [];
        const yValues = [];
        
        const step = (content.x_max - content.x_min) / points;
        
        for (let i = 0; i <= points; i++) {
            const x = content.x_min + (i * step);
            xValues.push(x);
            
            try {
                const y = this.evaluateFunction(content.function, x);
                yValues.push(isFinite(y) ? y : null);
            } catch (e) {
                yValues.push(null);
            }
        }
        
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        
        return [{
            x: xValues,
            y: yValues,
            type: 'scatter',
            mode: 'lines',
            line: {
                color: isDarkMode ? '#ffffff' : '#000000',
                width: 2,
                shape: 'spline'
            },
            name: content.function,
            connectgaps: false,
            hovertemplate: 'x: %{x:.3f}<br>y: %{y:.3f}<extra></extra>'
        }];
    }

    createPlotLayout(content) {
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        
        // Calculate Y range if specified
        let yRange = {};
        if (content.y_min !== null && content.y_max !== null) {
            yRange = {
                range: [content.y_min, content.y_max]
            };
        }
        
        return {
            paper_bgcolor: 'transparent',
            plot_bgcolor: isDarkMode ? '#000000' : '#ffffff',
            
            font: {
                family: 'JetBrains Mono, monospace',
                size: 12,
                color: isDarkMode ? '#ffffff' : '#000000'
            },
            
            xaxis: {
                range: [content.x_min, content.x_max],
                gridcolor: isDarkMode ? '#333333' : '#cccccc',
                gridwidth: 1,
                zerolinecolor: isDarkMode ? '#ffffff' : '#000000',
                zerolinewidth: 2,
                color: isDarkMode ? '#ffffff' : '#000000',
                title: {
                    text: 'x',
                    font: { size: 14, color: isDarkMode ? '#ffffff' : '#000000' }
                },
                tickfont: { size: 11 },
                showspikes: true,
                spikecolor: isDarkMode ? '#ffffff' : '#000000',
                spikethickness: 1
            },
            
            yaxis: {
                ...yRange,
                gridcolor: isDarkMode ? '#333333' : '#cccccc',
                gridwidth: 1,
                zerolinecolor: isDarkMode ? '#ffffff' : '#000000',
                zerolinewidth: 2,
                color: isDarkMode ? '#ffffff' : '#000000',
                title: {
                    text: 'y',
                    font: { size: 14, color: isDarkMode ? '#ffffff' : '#000000' }
                },
                tickfont: { size: 11 },
                showspikes: true,
                spikecolor: isDarkMode ? '#ffffff' : '#000000',
                spikethickness: 1
            },
            
            margin: { l: 60, r: 20, b: 50, t: 20 },
            showlegend: false,
            hovermode: 'x unified',
            autosize: true,
            
            annotations: (content.annotations || []).map(ann => ({
                x: ann.x,
                y: ann.y,
                text: ann.text,
                showarrow: true,
                arrowhead: 2,
                arrowsize: 1,
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
    }

    getPlotConfig() {
        return {
            displayModeBar: true,
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: [
                'pan2d', 'lasso2d', 'select2d', 'autoScale2d',
                'hoverClosestCartesian', 'hoverCompareCartesian'
            ],
            modeBarButtons: [[
                'zoom2d', 'zoomIn2d', 'zoomOut2d', 'resetScale2d', 'toImage'
            ]]
        };
    }

    resizeGraph(container) {
        const plotDiv = container.querySelector('.js-plotly-plot');
        if (plotDiv && window.Plotly) {
            window.Plotly.Plots.resize(plotDiv);
        }
    }

    showGraphError(container, message) {
        container.innerHTML = `
            <div class="graph-error">
                <div class="error-title">GRAPH RENDER ERROR</div>
                <div class="error-message">${message}</div>
                <div class="error-hint">Check function syntax and try again</div>
            </div>
        `;
    }

    evaluateFunction(expression, x) {
        // Clean and prepare the expression
        let expr = expression.replace(/f\(x\)\s*=\s*/, '');
        
        // Handle mathematical functions and operators
        expr = expr.replace(/\^/g, '**');
        expr = expr.replace(/\bx\b/g, `(${x})`);
        
        // Math functions
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
        
        return eval(expr);
    }

    cleanFunctionDisplay(functionStr) {
        return functionStr.replace(/\*\*/g, '^').replace(/\*/g, '·');
    }

    // Public method to resize all graphs
    resizeAllGraphs() {
        this.plotlyGraphs.forEach((container) => {
            this.resizeGraph(container);
        });
    }
}

// Initialize global instance
window.artifactRenderer = new ArtifactRenderer();

// Handle window resize
window.addEventListener('resize', () => {
    if (window.artifactRenderer) {
        setTimeout(() => {
            window.artifactRenderer.resizeAllGraphs();
        }, 100);
    }
});