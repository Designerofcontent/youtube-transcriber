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
    // Get video page with specific headers to mimic browser
    const videoInfoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const { data: videoPage } = await axios.get(videoInfoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    // Try to find the new format first
    const ytInitialData = videoPage.match(/ytInitialData\s*=\s*({.+?});/);
    if (!ytInitialData) {
      throw new Error('Could not find video data');
    }

    const data = JSON.parse(ytInitialData[1]);
    const transcriptData = data?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap?.[0]?.value?.chapters;

    if (!transcriptData) {
      // Try alternative path for captions
      const captionsPath = data?.engagementPanels?.find(panel => 
        panel?.engagementPanelSectionListRenderer?.content?.transcriptRenderer
      );

      if (!captionsPath) {
        throw new Error('No captions found');
      }

      const transcriptLines = captionsPath.engagementPanelSectionListRenderer.content
        .transcriptRenderer.body.transcriptBodyRenderer.cueGroups
        .map(group => group.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.cue.simpleText);

      return transcriptLines.join('\n');
    }

    // Process transcript data
    return transcriptData
      .map(chapter => chapter.chapterRenderer.title.simpleText)
      .join('\n');

  } catch (error) {
    throw new Error('Failed to fetch transcript: ' + error.message);
  }
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
      const transcript = await getTranscript(videoId);
      return res.json({ transcript });
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
