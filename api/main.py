from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

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

@app.post("/api/transcript")
async def get_transcript(video: VideoURL):
    try:
        video_id = extract_video_id(video.url)
        
        # First try to get English transcript
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        except:
            # If English fails, try auto-generated English
            try:
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en-US'])
            except:
                # If that fails too, get all available transcripts and use the first one
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                transcript = transcript_list.find_transcript(['en']).translate('en').fetch()

        # Format transcript with timestamps
        formatted_transcript = []
        for entry in transcript:
            minutes = int(entry['start'] // 60)
            seconds = int(entry['start'] % 60)
            timestamp = f"[{minutes}:{seconds:02d}]"
            formatted_transcript.append(f"{timestamp} {entry['text']}")

        return {
            "success": True,
            "transcript": "\n".join(formatted_transcript)
        }

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
