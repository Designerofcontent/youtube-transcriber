from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
import re
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled, VideoUnavailable
from youtube_transcript_api.formatters import TextFormatter, SRTFormatter
from typing import Optional
import json
import sys
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

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
    raise HTTPException(
        status_code=400, 
        detail="Could not extract video ID from URL. Please make sure you're using a valid YouTube URL."
    )

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
        logger.debug(f"Extracted video ID: {video_id}")
        
        try:
            logger.debug("Attempting to get transcript...")
            # Try with manual and automatic captions
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            logger.debug(f"Available transcripts: {transcript_list}")
            
            # First try manual captions
            try:
                transcript = transcript_list.find_manually_created_transcript().fetch()
                logger.debug("Found manual transcript")
            except:
                # Then try auto-generated
                try:
                    transcript = transcript_list.find_generated_transcript(['en']).fetch()
                    logger.debug("Found auto-generated transcript")
                except:
                    # Finally, try any available transcript and translate if needed
                    logger.debug("Trying any available transcript...")
                    transcript = transcript_list.find_transcript(['en']).fetch()
                    
            logger.debug(f"Successfully got transcript with {len(transcript)} entries")
            
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
                formatted_transcript = []
                for entry in transcript:
                    formatted_transcript.append({
                        "text": entry["text"],
                        "start": entry["start"],
                        "duration": entry["duration"]
                    })
                return JSONResponse({
                    "success": True,
                    "format": "json",
                    "transcript": formatted_transcript
                })
            else:
                formatted_transcript = []
                for entry in transcript:
                    formatted_transcript.append({
                        "text": entry["text"],
                        "timestamp": format_timestamp(entry["start"]),
                        "start": entry["start"],
                        "link": create_youtube_link(video_id, entry["start"])
                    })
                
                return JSONResponse({
                    "success": True,
                    "format": "text",
                    "transcript": formatted_transcript,
                    "video_id": video_id
                })

        except Exception as e:
            logger.error(f"Error getting transcript: {str(e)}", exc_info=True)
            error_msg = (
                "Could not get transcript. This might be because:\n"
                "1. The video has no captions available\n"
                "2. The captions are disabled\n"
                "3. The video is private or unavailable\n\n"
                f"Technical details: {str(e)}"
            )
            raise HTTPException(status_code=400, detail=error_msg)

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )
