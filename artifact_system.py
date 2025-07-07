#!/usr/bin/env python3
"""
Artifact System for AI Math Teacher
"""

import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel
from enum import Enum

class ArtifactType(str, Enum):
    GRAPH = "graph"

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
    x_min: float = -10
    x_max: float = 10
    y_min: Optional[float] = None
    y_max: Optional[float] = None
    grid: bool = True
    axes_labels: Dict[str, str] = {"x": "x", "y": "y"}
    title: Optional[str] = None
    annotations: List[Dict[str, Any]] = []
    interactive: bool = True
    line_style: str = "solid"  # solid, dashed, dotted
    line_width: int = 2
    show_points: bool = False
    point_annotations: List[Dict[str, Any]] = []

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
    
    def create_graph_artifact(self, session_id: str, function: str, x_min: float = -10, 
                            x_max: float = 10, title: str = None, **kwargs) -> str:
        """Create a graph artifact with clean terminal styling"""
        artifact_id = str(uuid.uuid4())
        
        # Clean up function name for title
        display_function = function.replace("**", "^").replace("*", "·")
        
        metadata = ArtifactMetadata(
            id=artifact_id,
            type=ArtifactType.GRAPH,
            title=title or f"f(x) = {display_function}",
            description=f"Interactive graph of {display_function}",
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
When students ask you to graph, plot, visualize, or show a mathematical function, 
use the artifact system to create interactive graphs.

ARTIFACT GENERATION SYNTAX:
Use this JSON structure wrapped in <artifact> tags:

<artifact>
{
    "type": "graph",
    "title": "Descriptive title",
    "content": {
        "function": "mathematical_expression",
        "x_min": -10,
        "x_max": 10,
        "annotations": []
    }
}
</artifact>

FUNCTION FORMAT:
- Use standard mathematical notation: x^2, sin(x), log(x), sqrt(x)
- Examples: "x^2", "sin(x)", "x^3 - 2*x + 1", "sqrt(x)", "1/x"
- For compound functions: "sin(x^2)", "log(x+1)", "exp(-x^2)"

WHEN TO USE GRAPH ARTIFACTS:
- Student asks to "graph", "plot", "visualize", or "show" a function
- Student wants to see the behavior of a mathematical function
- When comparing multiple functions (create separate artifacts)
- For demonstrating mathematical concepts visually

ANNOTATION EXAMPLES:
For special points, extrema, or important features:
"annotations": [
    {"x": 0, "y": 0, "text": "Origin", "type": "point"},
    {"x": 2, "y": 4, "text": "Local max", "type": "point"}
]

Remember: Use artifacts for visual mathematical content that enhances understanding.
The terminal-style interface will render these with appropriate monochrome styling.
"""

# Global instance
artifact_generator = ArtifactGenerator()

def get_artifact_generator() -> ArtifactGenerator:
    return artifact_generator