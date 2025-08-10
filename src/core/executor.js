/**
 * Step-by-step Execution Engine
 * Handles the execution of plans and individual tasks
 */

class ExecutionEngine {
    constructor() {
        this.activeExecutions = new Map();
        this.executionQueue = [];
        this.isProcessing = false;
    }

    /**
     * Initialize the execution engine
     */
    initialize(dependencies) {
        this.toolManager = dependencies.toolManager;
        this.contextManager = dependencies.contextManager;
        this.planner = dependencies.planner;
        console.log('Execution Engine initialized');
    }

    /**
     * Execute a plan step by step
     */
    async executePlan(planId, options = {}) {
        const plan = this.planner.getPlan(planId);
        if (!plan) {
            throw new Error(`Plan ${planId} not found`);
        }

        const executionId = this.generateExecutionId();
        const execution = {
            id: executionId,
            planId,
            status: 'running',
            startedAt: Date.now(),
            currentStep: null,
            results: [],
            options
        };

        this.activeExecutions.set(executionId, execution);

        try {
            // Execute steps in dependency order
            const sortedSteps = this.sortStepsByDependencies(plan.steps);
            
            for (const step of sortedSteps) {
                execution.currentStep = step.id;
                
                // Check if dependencies are satisfied
                if (!this.areDependenciesSatisfied(step, execution.results)) {
                    throw new Error(`Dependencies not satisfied for step ${step.id}`);
                }

                // Execute the step
                const stepResult = await this.executeStep(step, execution);
                execution.results.push(stepResult);

                // Update plan with step result
                await this.planner.updatePlan(planId, step.id, stepResult);

                // Check if execution should continue
                if (!stepResult.success && !options.continueOnError) {
                    execution.status = 'failed';
                    execution.error = stepResult.error;
                    break;
                }
            }

            if (execution.status === 'running') {
                execution.status = 'completed';
            }
            
            execution.completedAt = Date.now();
            execution.duration = execution.completedAt - execution.startedAt;

            return execution;
        } catch (error) {
            execution.status = 'failed';
            execution.error = error.message;
            execution.completedAt = Date.now();
            throw error;
        }
    }

    /**
     * Execute a single step
     */
    async executeStep(step, execution) {
        const stepResult = {
            stepId: step.id,
            success: false,
            startedAt: Date.now(),
            tools: [],
            outputs: []
        };

        try {
            console.log(`Executing step: ${step.description}`);

            // Execute each tool required by the step
            for (const toolName of step.tools) {
                const toolResult = await this.executeTool(toolName, step, execution);
                stepResult.tools.push(toolResult);
                
                if (!toolResult.success && !step.continueOnToolFailure) {
                    throw new Error(`Tool ${toolName} failed: ${toolResult.error}`);
                }
            }

            stepResult.success = true;
            stepResult.completedAt = Date.now();
            stepResult.duration = stepResult.completedAt - stepResult.startedAt;

            return stepResult;
        } catch (error) {
            stepResult.success = false;
            stepResult.error = error.message;
            stepResult.completedAt = Date.now();
            return stepResult;
        }
    }

    /**
     * Execute a specific tool
     */
    async executeTool(toolName, step, execution) {
        const toolResult = {
            toolName,
            success: false,
            startedAt: Date.now()
        };

        try {
            // Get tool parameters from step context
            const toolParams = this.extractToolParameters(toolName, step, execution);
            
            // Execute the tool
            const result = await this.toolManager.executeTool(toolName, toolParams);
            
            toolResult.success = true;
            toolResult.result = result;
            toolResult.completedAt = Date.now();

            return toolResult;
        } catch (error) {
            toolResult.success = false;
            toolResult.error = error.message;
            toolResult.completedAt = Date.now();
            return toolResult;
        }
    }

    /**
     * Extract tool parameters from step context
     */
    extractToolParameters(toolName, step, execution) {
        // TODO: Implement parameter extraction logic
        return step.parameters?.[toolName] || {};
    }

    /**
     * Sort steps by their dependencies
     */
    sortStepsByDependencies(steps) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (step) => {
            if (visiting.has(step.id)) {
                throw new Error(`Circular dependency detected involving step ${step.id}`);
            }
            if (visited.has(step.id)) {
                return;
            }

            visiting.add(step.id);

            // Visit dependencies first
            for (const depId of step.dependencies || []) {
                const depStep = steps.find(s => s.id === depId);
                if (depStep) {
                    visit(depStep);
                }
            }

            visiting.delete(step.id);
            visited.add(step.id);
            sorted.push(step);
        };

        for (const step of steps) {
            visit(step);
        }

        return sorted;
    }

    /**
     * Check if step dependencies are satisfied
     */
    areDependenciesSatisfied(step, results) {
        if (!step.dependencies || step.dependencies.length === 0) {
            return true;
        }

        const completedSteps = results
            .filter(r => r.success)
            .map(r => r.stepId);

        return step.dependencies.every(depId => completedSteps.includes(depId));
    }

    /**
     * Get execution status
     */
    getExecution(executionId) {
        return this.activeExecutions.get(executionId);
    }

    /**
     * Get all active executions
     */
    getActiveExecutions() {
        return Array.from(this.activeExecutions.values());
    }

    /**
     * Cancel an execution
     */
    async cancelExecution(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (execution && execution.status === 'running') {
            execution.status = 'cancelled';
            execution.completedAt = Date.now();
            // TODO: Implement cleanup logic
        }
    }

    /**
     * Generate unique execution ID
     */
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = { ExecutionEngine };