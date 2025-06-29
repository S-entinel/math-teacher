// Practice problem handling
EnhancedMathInterface.prototype.handlePracticeCommand = async function(element, content) {
    const practiceRegex = /\[PRACTICE:([^:]+):([^\]]+)\]/g;
    let match;
    
    while ((match = practiceRegex.exec(content)) !== null) {
        const [fullMatch, difficulty, problem] = match;
        await this.createPracticeElement(element, difficulty, problem, fullMatch);
    }
};

EnhancedMathInterface.prototype.createPracticeElement = async function(element, difficulty, problem, replaceText) {
    try {
        const practiceContainer = document.createElement('div');
        practiceContainer.className = 'practice-container';
        
        practiceContainer.innerHTML = `
            <div class="practice-header">
                <span>Practice Problem</span>
                <span class="practice-difficulty">${difficulty.toUpperCase()}</span>
            </div>
            <div class="practice-problem">${problem}</div>
            <div class="practice-actions">
                <button class="practice-btn show-solution">Show Hint</button>
                <button class="practice-btn new-problem">New Problem</button>
                <button class="practice-btn solve-step">Solve Together</button>
            </div>
        `;
        
        // Add event listeners
        const showSolutionBtn = practiceContainer.querySelector('.show-solution');
        const newProblemBtn = practiceContainer.querySelector('.new-problem');
        const solveStepBtn = practiceContainer.querySelector('.solve-step');
        
        showSolutionBtn.addEventListener('click', () => {
            this.messageInput.value = `Can you give me a hint for: ${problem}`;
            this.messageInput.focus();
        });
        
        newProblemBtn.addEventListener('click', () => {
            this.messageInput.value = `Generate a new ${difficulty} practice problem similar to this one.`;
            this.messageInput.focus();
        });
        
        solveStepBtn.addEventListener('click', () => {
            this.messageInput.value = `Can you solve this step by step: ${problem}`;
            this.messageInput.focus();
        });
        
        element.innerHTML = element.innerHTML.replace(replaceText, '');
        element.appendChild(practiceContainer);
        renderMath(practiceContainer);
        
    } catch (error) {
        console.error('Practice creation error:', error);
        element.innerHTML = element.innerHTML.replace(replaceText, `[Practice Error: ${problem}]`);
    }
};