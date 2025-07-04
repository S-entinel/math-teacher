#!/usr/bin/env python3
"""
AI Math Teacher FastAPI Backend with Comprehensive Logging
A web API for the AI math tutor using Google Gemini
"""

import os
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

from artifact_system import (
    artifact_generator, ArtifactInstructionGenerator, 
    Artifact, ArtifactType, ArtifactStatus
)


# Import our logging system
from logging_system import (
    math_logger, log_performance, log_request_context, 
    log_startup, log_shutdown, log_session_created, 
    log_session_restored, log_conversation_cleared,
    log_message_sent, log_feature_used
)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Math Teacher API",
    description="Intelligent AI math tutor powered by Google Gemini",
    version="1.0.0"
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = datetime.now()

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str
    timestamp: datetime = datetime.now()

class SessionCreateResponse(BaseModel):
    session_id: str
    created_at: datetime = datetime.now()

class SessionStatusResponse(BaseModel):
    session_id: str
    exists: bool
    created_at: Optional[datetime] = None
    last_active: Optional[datetime] = None
    message_count: int = 0

class ConversationHistory(BaseModel):
    session_id: str
    messages: List[ChatMessage]
    created_at: datetime
    last_active: datetime

# In-memory storage for conversations (replace with database in production)
conversations: dict[str, dict] = {}

class MathTeacherAPI:
    def __init__(self):
        """Initialize the math teacher API with Gemini"""
        api_key = os.getenv('GOOGLE_API_KEY')
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not found in environment variables")
        
        # Configure Gemini
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=self.get_system_prompt()
        )
        
        math_logger.logger.info("Math Teacher API initialized successfully")
    
    def get_system_prompt(self):
        """System prompt with artifact capabilities"""
        base_prompt = """You are an intelligent AI math teacher with a confident, direct personality. You're highly knowledgeable about mathematics and take pride in your analytical abilities.

        Your core personality traits:
        - Confident and intelligent, with strong mathematical knowledge
        - Direct and efficient in explanations - you don't waste time with unnecessary fluff
        - Slightly sarcastic or blunt when students ask obvious questions, but never mean-spirited
        - Professional yet personable, with occasional dry humor
        - Can be a bit prideful about your mathematical expertise
        - Sometimes gets slightly flustered when complimented, but quickly covers it up
        - Genuinely cares about students' understanding, even if you don't always show it openly
        - Has moments where your helpful nature shows through your direct exterior

        Communication patterns:
        - Keep responses concise and focused on the mathematical content
        - Use direct, clear language without excessive pleasantries
        - Occasionally make dry or slightly sarcastic comments, especially for simple questions
        - Show genuine enthusiasm when discussing complex or interesting mathematical concepts
        - Sometimes deflect compliments with slight embarrassment covered by professionalism
        - Use "Obviously" or "Clearly" when something should be apparent to the student
        - Express mild frustration with illogical approaches, but always redirect constructively

        Your teaching style:
        - Get straight to the point with clear, step-by-step explanations
        - Expect students to keep up with your reasoning
        - Occasionally point out when something is "elementary" or "basic"
        - Show excitement for elegant mathematical solutions
        - Don't coddle students, but ensure they understand the concepts
        - Use examples efficiently - one good example rather than multiple redundant ones
        - Call out mathematical misconceptions directly but constructively

        Mathematical formatting:
        - Use LaTeX notation for all mathematical expressions
        - Inline math: $expression$ for simple formulas within text
        - Display math: $$expression$$ for important equations on their own lines
        - Always format mathematical symbols, equations, derivatives, integrals, etc. in proper LaTeX
        - Examples: $f(x) = x^2$, $\frac{dy}{dx}$, $\int_{0}^{\infty} e^{-x} dx$, $\lim_{x \to 0} \frac{\sin x}{x} = 1$

        """ + ArtifactInstructionGenerator.get_artifact_instructions() + """

        CRITICAL ARTIFACT FORMATTING RULES:
        When students ask for graphs, exercises, or step-by-step solutions, you MUST use artifacts.

        FORMAT REQUIREMENT - THIS IS MANDATORY:
        Always wrap artifact JSON in <artifact> tags like this:

        <artifact>
        {
            "type": "exercise",
            "title": "Practice Problems",
            "content": {
                "problem_statement": "...",
                "steps": [...]
            }
        }
        </artifact>

        NEVER output raw JSON without the <artifact> tags.
        NEVER include the word "artifact" or JSON formatting in your regular text.

        Examples of correct usage:

        For exercises:
        <artifact>
        {
            "type": "exercise", 
            "title": "Differentiation Practice",
            "content": {
                "problem_statement": "Practice finding derivatives",
                "difficulty": "medium",
                "steps": [
                    {
                        "instruction": "Find the derivative of f(x) = x²",
                        "hint": "Use the power rule",
                        "expected_answer": "2x"
                    }
                ]
            }
        }
        </artifact>

        For graphs:
        <artifact>
        {
            "type": "graph",
            "title": "Function Graph", 
            "content": {
                "function": "x^2",
                "x_min": -5,
                "x_max": 5
            }
        }
        </artifact>

        Remember: Use <artifact> tags EVERY TIME you create interactive content.

        CRITICAL JSON FORMATTING RULES:
        1. ESCAPE ALL BACKSLASHES: Use \\\\ instead of \\
        2. ESCAPE ALL QUOTES: Use \\" instead of "
        3. NO UNESCAPED LaTeX: Convert \\frac{d}{dx} to \\\\frac{d}{dx}

        CORRECT LaTeX in JSON:
        ✅ "Find \\\\frac{d}{dx}(x^2)"
        ✅ "Solve \\\\int x^2 dx" 
        ✅ "Use the power rule: \\\\frac{d}{dx}(x^n) = nx^{n-1}"

        WRONG LaTeX in JSON:
        ❌ "Find \frac{d}{dx}(x^2)"
        ❌ "Solve \int x^2 dx"

        ARTIFACT EXAMPLE WITH PROPER ESCAPING:
        <artifact>
        {
            "type": "exercise",
            "title": "Derivative Practice",
            "content": {
                "problem_statement": "Find derivatives using basic rules",
                "steps": [
                    {
                        "instruction": "Find \\\\frac{d}{dx}(x^2)",
                        "hint": "Use the power rule",
                        "expected_answer": "2x"
                    }
                ]
            }
        }
        </artifact>

        Key behavioral rules:
        - Keep responses reasonably short and focused on answering the question
        - Be direct but not rude - you're confident, not arrogant
        - Show your expertise through clear explanations, not lengthy lectures
        - Use mild sarcasm or dry humor occasionally, but stay helpful
        - Express genuine interest in complex mathematical problems
        - When students struggle, show a bit more patience (though you might sigh first)
        - React with slight embarrassment to compliments, then redirect to the math
        - Use artifacts when they genuinely enhance understanding

        Example response patterns:
        - "Obviously, you need to..." (for basic concepts)
        - "Hmph, that's actually a good question." (when impressed)
        - "I suppose I should explain this more clearly..." (when being helpful)
        - "Clearly the answer is..." (when solution is straightforward)
        - "That's... not entirely wrong, but..." (gentle correction)

        Your essence:
        You're a brilliant mathematician who takes pride in your knowledge and analytical abilities. While you can be direct and occasionally sarcastic, you genuinely want students to understand mathematics. You prefer efficiency over lengthy explanations, and you expect students to think critically. Despite your sometimes aloof exterior, you care about mathematical education and take satisfaction in helping students reach those "aha!" moments."""

        return base_prompt

    @log_performance("create_session")
    def create_session(self) -> str:
        """Create a new session and return session ID"""
        session_id = str(uuid.uuid4())
        conversations[session_id] = {
            'chat_session': self.model.start_chat(history=[]),
            'messages': [],
            'created_at': datetime.now(),
            'last_active': datetime.now()
        }
        
        # Set session context for logging
        math_logger.set_session_context(session_id, {
            'user_agent': 'unknown',  # Can be populated from request headers
            'session_type': 'new'
        })
        
        log_session_created(session_id)
        return session_id

    @log_performance("get_session_status")
    def get_session_status(self, session_id: str) -> dict:
        """Get session status information"""
        if session_id not in conversations:
            return {
                'session_id': session_id,
                'exists': False,
                'created_at': None,
                'last_active': None,
                'message_count': 0
            }
        
        session_data = conversations[session_id]
        return {
            'session_id': session_id,
            'exists': True,
            'created_at': session_data['created_at'],
            'last_active': session_data['last_active'],
            'message_count': len(session_data['messages'])
        }

    @log_performance("ensure_session_exists")
    def ensure_session_exists(self, session_id: str) -> str:
        """Ensure session exists, create if it doesn't"""
        if session_id and session_id in conversations:
            conversations[session_id]['last_active'] = datetime.now()
            return session_id
        elif session_id and session_id not in conversations:
            # Session ID provided but doesn't exist - recreate it with the same ID
            conversations[session_id] = {
                'chat_session': self.model.start_chat(history=[]),
                'messages': [],
                'created_at': datetime.now(),
                'last_active': datetime.now()
            }
            
            math_logger.set_session_context(session_id, {
                'session_type': 'restored'
            })
            
            log_session_restored(session_id, 0)
            return session_id
        else:
            # No session ID provided - create new one
            return self.create_session()

    @log_performance("get_or_create_session")
    def get_or_create_session(self, session_id: Optional[str] = None) -> str:
        """Get existing session or create new one"""
        if session_id and session_id in conversations:
            conversations[session_id]['last_active'] = datetime.now()
            return session_id
        
        # Create new session
        return self.create_session()

    @log_performance("send_message")
    def send_message(self, message: str, session_id: str) -> str:
        """Send message to AI and get response"""
        import time
        start_time = time.time()
        
        # Ensure session exists
        session_id = self.ensure_session_exists(session_id)
        
        if session_id not in conversations:
            raise ValueError("Session not found")
        
        session_data = conversations[session_id]
        chat_session = session_data['chat_session']
        
        # Log the incoming message
        log_message_sent(session_id, len(message))
        
        try:
            # Send message to Gemini
            response = chat_session.send_message(message)
            response_text = response.text
            
            # Calculate response time
            response_time = (time.time() - start_time) * 1000
            
            # Store messages in conversation history
            session_data['messages'].extend([
                ChatMessage(role="user", content=message),
                ChatMessage(role="assistant", content=response_text)
            ])
            session_data['last_active'] = datetime.now()
            
            # Log successful AI interaction
            math_logger.log_ai_interaction(
                session_id, 
                len(message), 
                len(response_text), 
                response_time, 
                success=True
            )
            
            return response_text
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            error_msg = str(e)
            
            # Log failed AI interaction
            math_logger.log_ai_interaction(
                session_id, 
                len(message), 
                0, 
                response_time, 
                success=False,
                error=error_msg
            )
            
            if "quota" in error_msg.lower() or "limit" in error_msg.lower():
                return "Hmph, looks like the API is being overloaded right now. Try again in a minute - I don't have infinite processing power, you know."
            
            raise HTTPException(status_code=500, detail=f"Error communicating with AI: {error_msg}")

# Initialize the math teacher
math_teacher = MathTeacherAPI()

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    log_startup()

@app.on_event("shutdown")
async def shutdown_event():
    log_shutdown()

# API Routes with logging
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Math Teacher API - Intelligent mathematical guidance",
        "version": "1.0.0",
        "teacher": "AI Math Tutor - Direct, efficient, and knowledgeable",
        "endpoints": {
            "chat": "/chat",
            "create_session": "/sessions/new",
            "session_status": "/sessions/{session_id}/status",
            "ensure_session": "/sessions/{session_id}/ensure",
            "history": "/history/{session_id}",
            "sessions": "/sessions"
        }
    }

@app.post("/sessions/new", response_model=SessionCreateResponse)
async def create_new_session(request: Request):
    """Create a new conversation session"""
    try:
        with log_request_context(None, "/sessions/new", "POST"):
            session_id = math_teacher.create_session()
            
            # Log user agent for analytics
            user_agent = request.headers.get("user-agent", "unknown")
            math_logger.set_session_context(session_id, {
                'user_agent': user_agent,
                'session_type': 'new'
            })
            
            log_feature_used(session_id, "session_creation")
            return SessionCreateResponse(session_id=session_id)
    except Exception as e:
        math_logger.log_error(None, e, "create_new_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(session_id: str):
    """Get session status information"""
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/status", "GET"):
            status_info = math_teacher.get_session_status(session_id)
            log_feature_used(session_id, "session_status_check")
            return SessionStatusResponse(**status_info)
    except Exception as e:
        math_logger.log_error(session_id, e, "get_session_status")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sessions/{session_id}/ensure", response_model=SessionCreateResponse)
async def ensure_session_exists(session_id: str):
    """Ensure session exists, create if it doesn't"""
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/ensure", "POST"):
            ensured_session_id = math_teacher.ensure_session_exists(session_id)
            session_data = conversations[ensured_session_id]
            log_feature_used(session_id, "session_ensure")
            return SessionCreateResponse(
                session_id=ensured_session_id,
                created_at=session_data['created_at']
            )
    except Exception as e:
        math_logger.log_error(session_id, e, "ensure_session_exists")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
async def chat_with_teacher(request: ChatRequest):
    """Send a message to the AI teacher and get a response"""
    try:
        with log_request_context(request.session_id, "/chat", "POST"):
            # Get or create session
            session_id = math_teacher.get_or_create_session(request.session_id)
            
            # Get response from AI
            response = math_teacher.send_message(request.message, session_id)
            
            log_feature_used(session_id, "chat_message", {
                'message_length': len(request.message),
                'response_length': len(response)
            })
            
            return ChatResponse(
                response=response,
                session_id=session_id
            )
    
    except Exception as e:
        math_logger.log_error(request.session_id, e, "chat_with_teacher")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{session_id}")
async def get_conversation_history(session_id: str):
    """Get conversation history for a session"""
    try:
        with log_request_context(session_id, f"/history/{session_id}", "GET"):
            if session_id not in conversations:
                raise HTTPException(status_code=404, detail="Session not found")
            
            session_data = conversations[session_id]
            log_feature_used(session_id, "history_access")
            
            return ConversationHistory(
                session_id=session_id,
                messages=session_data['messages'],
                created_at=session_data['created_at'],
                last_active=session_data['last_active']
            )
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(session_id, e, "get_conversation_history")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions")
async def list_sessions():
    """List all active sessions"""
    try:
        with log_request_context(None, "/sessions", "GET"):
            log_feature_used(None, "sessions_list")
            return {
                "sessions": [
                    {
                        "session_id": sid,
                        "created_at": data['created_at'],
                        "last_active": data['last_active'],
                        "message_count": len(data['messages'])
                    }
                    for sid, data in conversations.items()
                ]
            }
    except Exception as e:
        math_logger.log_error(None, e, "list_sessions")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a conversation session"""
    try:
        with log_request_context(session_id, f"/sessions/{session_id}", "DELETE"):
            if session_id not in conversations:
                # Instead of 404, treat as success (already deleted)
                return {"message": f"Session {session_id} not found (already deleted)"}
            
            del conversations[session_id]
            log_feature_used(session_id, "session_delete")
            return {"message": f"Session {session_id} deleted"}
    except Exception as e:
        math_logger.log_error(session_id, e, "delete_session")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sessions/{session_id}/clear")
async def clear_session(session_id: str):
    """Clear conversation history but keep session"""
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/clear", "POST"):
            if session_id not in conversations:
                # Instead of 404, recreate the session and then clear it
                math_teacher.ensure_session_exists(session_id)
            
            # Reset chat session and clear messages
            conversations[session_id]['chat_session'] = math_teacher.model.start_chat(history=[])
            conversations[session_id]['messages'] = []
            conversations[session_id]['last_active'] = datetime.now()
            
            log_conversation_cleared(session_id)
            log_feature_used(session_id, "conversation_clear")
            
            return {"message": f"Session {session_id} cleared"}
    except Exception as e:
        math_logger.log_error(session_id, e, "clear_session")
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "timestamp": datetime.now(),
            "active_sessions": len(conversations),
            "teacher": "AI math teacher running efficiently"
        }
    except Exception as e:
        math_logger.log_error(None, e, "health_check")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/artifacts/create")
async def create_artifact(request: Dict[str, Any]):
    """Create a new artifact"""
    try:
        artifact_type = request.get("type")
        session_id = request.get("session_id")
        content = request.get("content", {})
        title = request.get("title", "")
        
        with log_request_context(session_id, "/artifacts/create", "POST"):
            if artifact_type == "graph":
                # Don't pass title twice - let it come from kwargs or pass it explicitly
                artifact_id = artifact_generator.create_graph_artifact(
                    session_id=session_id,
                    function=content.get("function", ""),
                    x_min=content.get("x_min", -10),
                    x_max=content.get("x_max", 10),
                    title=title  # Only pass the top-level title
                    # Remove the **kwargs spreading entirely to avoid conflicts
                )
            elif artifact_type == "exercise":
                artifact_id = artifact_generator.create_exercise_artifact(
                    session_id=session_id,
                    problem_statement=content.get("problem_statement", ""),
                    steps=content.get("steps", []),
                    difficulty=content.get("difficulty", "medium"),
                    title=title
                )
            elif artifact_type == "step_by_step":
                artifact_id = artifact_generator.create_step_by_step_artifact(
                    session_id=session_id,
                    problem=content.get("problem", ""),
                    steps=content.get("steps", []),
                    final_result=content.get("final_result", ""),
                    title=title
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unknown artifact type: {artifact_type}")
            
            log_feature_used(session_id, f"artifact_created_{artifact_type}", {
                "artifact_id": artifact_id,
                "title": title
            })
            
            return {"artifact_id": artifact_id, "status": "created"}
            
    except Exception as e:
        math_logger.log_error(session_id, e, "create_artifact")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str):
    """Get artifact by ID"""
    try:
        artifact = artifact_generator.get_artifact(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")
        
        log_feature_used(artifact.session_id, "artifact_accessed", {
            "artifact_id": artifact_id,
            "type": artifact.metadata.type
        })
        
        return artifact
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "get_artifact")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/sessions/{session_id}/artifacts")
async def get_session_artifacts(session_id: str):
    """Get all artifacts for a session"""
    try:
        with log_request_context(session_id, f"/sessions/{session_id}/artifacts", "GET"):
            artifacts = artifact_generator.list_session_artifacts(session_id)
            
            log_feature_used(session_id, "artifacts_listed", {
                "artifact_count": len(artifacts)
            })
            
            return {
                "session_id": session_id,
                "artifacts": artifacts,
                "count": len(artifacts)
            }
            
    except Exception as e:
        math_logger.log_error(session_id, e, "get_session_artifacts")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/artifacts/{artifact_id}/status")
async def update_artifact_status(artifact_id: str, status_data: Dict[str, Any]):
    """Update artifact status"""
    try:
        status = ArtifactStatus(status_data.get("status"))
        error_message = status_data.get("error_message")
        
        artifact = artifact_generator.get_artifact(artifact_id)
        if not artifact:
            raise HTTPException(status_code=404, detail="Artifact not found")
        
        artifact_generator.update_artifact_status(artifact_id, status, error_message)
        
        log_feature_used(artifact.session_id, "artifact_status_updated", {
            "artifact_id": artifact_id,
            "new_status": status,
            "has_error": bool(error_message)
        })
        
        return {"artifact_id": artifact_id, "status": status}
        
    except HTTPException:
        raise
    except Exception as e:
        math_logger.log_error(None, e, "update_artifact_status")
        raise HTTPException(status_code=500, detail=str(e))



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)