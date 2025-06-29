// Graph handling functionality
EnhancedMathInterface.prototype.handleGraphCommand = async function(element, content) {
    const graphRegex = /\[GRAPH:([^:]+):([^:]+):([^:]+):([^\]]+)\]/g;
    let match;
    
    while ((match = graphRegex.exec(content)) !== null) {
        const [fullMatch, type, expression, xMin, xMax] = match;
        if (type === 'function') {
            await this.createFunctionGraph(element, expression, parseFloat(xMin), parseFloat(xMax), fullMatch);
        }
    }
};

EnhancedMathInterface.prototype.createFunctionGraph = async function(element, expression, xMin, xMax, replaceText) {
    try {
        const x = [], y = [];
        const steps = 300;
        
        for (let i = 0; i <= steps; i++) {
            const xVal = xMin + (xMax - xMin) * i / steps;
            x.push(xVal);
            
            try {
                const expr = parseMathExpression(expression, xVal);
                y.push(eval(expr));
            } catch (e) {
                y.push(null);
            }
        }
        
        const graphContainer = document.createElement('div');
        graphContainer.className = 'graph-container';
        graphContainer.style.height = '350px';
        
        // Detect current theme
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        
        const trace = {
            x: x, 
            y: y, 
            type: 'scatter', 
            mode: 'lines',
            line: { 
                color: isDarkMode ? '#b19cd9' : '#7c6ab0', 
                width: 2.5 
            },
            name: expression
        };
        
        const layout = {
            paper_bgcolor: 'transparent',
            plot_bgcolor: isDarkMode ? 'rgba(26, 15, 46, 0.9)' : 'rgba(253, 252, 255, 0.9)',
            font: { 
                family: 'Inter', 
                size: 11, 
                color: isDarkMode ? '#b19cd9' : '#4a3968'
            },
            xaxis: { 
                gridcolor: isDarkMode ? '#3a2848' : '#e8e2ff', 
                zerolinecolor: isDarkMode ? '#b19cd9' : '#7c6ab0', 
                color: isDarkMode ? '#b19cd9' : '#4a3968',
                title: { 
                    text: 'x', 
                    font: { color: isDarkMode ? '#b19cd9' : '#4a3968' } 
                }
            },
            yaxis: { 
                gridcolor: isDarkMode ? '#3a2848' : '#e8e2ff', 
                zerolinecolor: isDarkMode ? '#b19cd9' : '#7c6ab0', 
                color: isDarkMode ? '#b19cd9' : '#4a3968',
                title: { 
                    text: 'y', 
                    font: { color: isDarkMode ? '#b19cd9' : '#4a3968' } 
                }
            },
            margin: { l: 40, r: 20, b: 40, t: 20 },
            showlegend: false
        };
        
        const config = {
            displayModeBar: true,
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d', 'autoScale2d']
        };
        
        await Plotly.newPlot(graphContainer, [trace], layout, config);
        
        element.innerHTML = element.innerHTML.replace(replaceText, '');
        element.appendChild(graphContainer);
        
    } catch (error) {
        console.error('Graph creation error:', error);
        element.innerHTML = element.innerHTML.replace(replaceText, `[Graph Error: ${expression}]`);
    }
};