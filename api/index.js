const axios = require('axios');

// Helper function to extract video ID
function getVideoId(url) {
  try {
    const pattern = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
    throw new Error('Could not extract video ID from URL');
  } catch (error) {
    throw new Error('Invalid YouTube URL format');
  }
}

async function getTranscript(videoId) {
  try {
    // First get the video page
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    // Extract initial data
    const match = response.data.match(/ytInitialData\s*=\s*({.+?});/);
    if (!match) {
      throw new Error('Could not find video data');
    }

    const data = JSON.parse(match[1]);

    // Get video title
    const title = data?.playerOverlays?.playerOverlayRenderer?.videoTitle?.simpleText
      || data?.microformat?.playerMicroformatRenderer?.title?.simpleText
      || 'Unknown Title';

    // Find transcript in engagement panels
    const transcriptPanel = data.engagementPanels?.find(panel => 
      panel?.engagementPanelSectionListRenderer?.content?.transcriptRenderer ||
      panel?.engagementPanelSectionListRenderer?.content?.transcriptSearchPanelRenderer
    );

    if (!transcriptPanel) {
      throw new Error('No transcript panel found');
    }

    // Extract transcript
    const transcriptRenderer = transcriptPanel.engagementPanelSectionListRenderer.content.transcriptRenderer;
    if (!transcriptRenderer) {
      throw new Error('No transcript available for this video');
    }

    const transcriptLines = transcriptRenderer.body.transcriptBodyRenderer.cueGroups
      .map(group => {
        const cue = group.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer;
        return {
          text: cue.cue.simpleText,
          startTime: parseFloat(cue.startOffsetMs) / 1000
        };
      });

    // Format transcript with timestamps
    const transcript = transcriptLines
      .map(line => `[${formatTime(line.startTime)}] ${line.text}`)
      .join('\n');

    return {
      title,
      transcript
    };
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to fetch transcript: ' + error.message);
  }
}

// Helper function to format time
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      details: 'Only POST requests are allowed'
    });
  }

  // Set CORS headers for the actual response
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'URL is required and must be a string'
      });
    }

    const videoId = getVideoId(url);
    
    try {
      const result = await getTranscript(videoId);
      return res.json(result);
    } catch (error) {
      console.error('Transcript Error:', error);
      return res.status(400).json({
        error: 'Failed to get transcript',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(400).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
};
