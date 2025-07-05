#!/usr/bin/env python3
"""
Artifact system for AI Math Teacher
Handles generation and rendering of interactive mathematical content
"""

import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel
from enum import Enum

class ArtifactType(str, Enum):
    GRAPH = "graph"
    STEP_BY_STEP = "step_by_step"

class ArtifactStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETE = "complete"
    ERROR = "error"

class ArtifactMetadata(BaseModel):
    id: str
    type: ArtifactType
    title: str
    description: Optional[str] = None
    tags: List[str] = []

class GraphArtifact(BaseModel):
    function: str
    x_min: float
    x_max: float
    y_min: Optional[float] = None
    y_max: Optional[float] = None
    grid: bool = True
    axes_labels: Dict[str, str] = {"x": "x", "y": "y"}
    title: Optional[str] = None
    annotations: List[Dict[str, Any]] = []
    interactive: bool = True

class StepByStepArtifact(BaseModel):
    problem: str
    steps: List[Dict[str, Any]]
    final_result: str
    key_concepts: List[str] = []
    common_mistakes: List[str] = []

class Artifact(BaseModel):
    metadata: ArtifactMetadata
    status: ArtifactStatus = ArtifactStatus.PENDING
    content: Dict[str, Any]
    created_at: datetime = datetime.now()
    updated_at: datetime = datetime.now()
    session_id: str
    error_message: Optional[str] = None

class ArtifactGenerator:
    def __init__(self):
        self.artifacts: Dict[str, Artifact] = {}
    
    def create_graph_artifact(self, session_id: str, function: str, x_min: float, x_max: float, 
                            title: str = None, **kwargs) -> str:
        artifact_id = str(uuid.uuid4())
        
        metadata = ArtifactMetadata(
            id=artifact_id,
            type=ArtifactType.GRAPH,
            title=title or f"Graph of {function}",
            description=f"Interactive graph showing {function}",
            tags=["graph", "function", "visualization"]
        )
        
        graph_data = GraphArtifact(
            function=function,
            x_min=x_min,
            x_max=x_max,
            title=title,
            **kwargs
        )
        
        artifact = Artifact(
            metadata=metadata,
            status=ArtifactStatus.COMPLETE,
            content=graph_data.dict(),
            session_id=session_id
        )
        
        self.artifacts[artifact_id] = artifact
        return artifact_id
    
    def create_step_by_step_artifact(self, session_id: str, problem: str, 
                                   steps: List[Dict], final_result: str,
                                   title: str = None) -> str:
        artifact_id = str(uuid.uuid4())
        
        metadata = ArtifactMetadata(
            id=artifact_id,
            type=ArtifactType.STEP_BY_STEP,
            title=title or "Step-by-Step Solution",
            description=f"Detailed solution for: {problem[:50]}...",
            tags=["solution", "steps", "explanation"]
        )
        
        step_by_step_data = StepByStepArtifact(
            problem=problem,
            steps=steps,
            final_result=final_result
        )
        
        artifact = Artifact(
            metadata=metadata,
            status=ArtifactStatus.COMPLETE,
            content=step_by_step_data.dict(),
            session_id=session_id
        )
        
        self.artifacts[artifact_id] = artifact
        return artifact_id
    
    def get_artifact(self, artifact_id: str) -> Optional[Artifact]:
        return self.artifacts.get(artifact_id)
    
    def list_session_artifacts(self, session_id: str) -> List[Artifact]:
        return [artifact for artifact in self.artifacts.values() 
                if artifact.session_id == session_id]
    
    def update_artifact_status(self, artifact_id: str, status: ArtifactStatus, 
                             error_message: str = None):
        if artifact_id in self.artifacts:
            self.artifacts[artifact_id].status = status
            self.artifacts[artifact_id].updated_at = datetime.now()
            if error_message:
                self.artifacts[artifact_id].error_message = error_message

class ArtifactInstructionGenerator:
    @staticmethod
    def get_artifact_instructions() -> str:
        return """
When generating mathematical content that would benefit from rich visualization or interactivity, 
use the artifact system instead of simple text responses.

ARTIFACT GENERATION SYNTAX:
Use this JSON structure wrapped in <artifact> tags:

<artifact>
{
    "type": "graph|step_by_step",
    "title": "Descriptive title",
    "content": {
        // Type-specific content here
    }
}
</artifact>

GRAPH ARTIFACTS:
For mathematical functions, use:
<artifact>
{
    "type": "graph",
    "title": "Graph of f(x) = x²",
    "content": {
        "function": "x^2",
        "x_min": -5,
        "x_max": 5,
        "title": "Quadratic Function",
        "annotations": [
            {"x": 0, "y": 0, "text": "Vertex", "type": "point"}
        ]
    }
}
</artifact>

STEP-BY-STEP ARTIFACTS:
For detailed solutions, use:
<artifact>
{
    "type": "step_by_step",
    "title": "Solving x² + 5x + 6 = 0",
    "content": {
        "problem": "x² + 5x + 6 = 0",
        "steps": [
            {
                "step": 1,
                "action": "Factor the quadratic",
                "explanation": "Look for two numbers that multiply to 6 and add to 5",
                "result": "(x + 2)(x + 3) = 0"
            },
            {
                "step": 2,
                "action": "Apply zero product property",
                "explanation": "If ab = 0, then a = 0 or b = 0",
                "result": "x + 2 = 0 or x + 3 = 0"
            }
        ],
        "final_result": "x = -2 or x = -3"
    }
}
</artifact>

WHEN TO USE ARTIFACTS:
- Student asks to "graph", "plot", "visualize", or "show" a function
- Student asks for "step-by-step" solutions or detailed explanations
- Complex mathematical content that benefits from structure and interactivity

WHEN NOT TO USE ARTIFACTS:
- Simple conceptual explanations
- Quick calculations
- Basic Q&A responses
- When the student specifically asks for text-only responses

Remember: Artifacts should enhance understanding, not complicate simple explanations.
Use them when they add genuine value to the learning experience.
"""

artifact_generator = ArtifactGenerator()

def get_artifact_generator() -> ArtifactGenerator:
    return artifact_generator