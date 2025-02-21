from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
import re
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter, SRTFormatter
from typing import Optional
import json

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VideoURL(BaseModel):
    url: str
    format: Optional[str] = "text"

@app.get("/")
async def root():
    return HTMLResponse("<h1>YouTube Transcriber API</h1>")

def extract_video_id(url: str) -> str:
    """Extract video ID from various YouTube URL formats."""
    patterns = [
        r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise HTTPException(status_code=400, detail="Could not extract video ID from URL")

def format_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def create_youtube_link(video_id: str, timestamp: float) -> str:
    """Create a YouTube link that starts at a specific timestamp."""
    return f"https://youtube.com/watch?v={video_id}&t={int(timestamp)}s"

@app.post("/api/transcript")
async def get_transcript(video: VideoURL):
    try:
        video_id = extract_video_id(video.url)
        
        try:
            # First try to get English transcript
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        except Exception as e1:
            try:
                # If English fails, try auto-generated English
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en-US'])
            except Exception as e2:
                try:
                    # If that fails too, get all available transcripts and use the first one
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    transcript = transcript_list.find_transcript(['en']).translate('en').fetch()
                except Exception as e3:
                    # If all attempts fail, return a detailed error
                    error_details = f"Failed to get transcript. Errors: {str(e1)} | {str(e2)} | {str(e3)}"
                    raise HTTPException(status_code=400, detail=error_details)

        # Format based on requested format
        if video.format == "srt":
            formatter = SRTFormatter()
            formatted_transcript = formatter.format_transcript(transcript)
            return JSONResponse({
                "success": True,
                "format": "srt",
                "transcript": formatted_transcript
            })
        elif video.format == "json":
            # Enhanced JSON format with clickable timestamps
            formatted_transcript = []
            for entry in transcript:
                formatted_transcript.append({
                    "text": entry["text"],
                    "start": entry["start"],
                    "duration": entry["duration"],
                    "timestamp": format_timestamp(entry["start"]),
                    "link": create_youtube_link(video_id, entry["start"])
                })
            return JSONResponse({
                "success": True,
                "format": "json",
                "transcript": formatted_transcript
            })
        else:
            # Default text format with clickable timestamps
            formatted_transcript = []
            for entry in transcript:
                timestamp = format_timestamp(entry["start"])
                link = create_youtube_link(video_id, entry["start"])
                formatted_transcript.append({
                    "text": entry["text"],
                    "timestamp": timestamp,
                    "link": link
                })
            
            return JSONResponse({
                "success": True,
                "format": "text",
                "transcript": formatted_transcript,
                "video_id": video_id
            })

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error processing request: {str(e)}"
        )
