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
    // First get video info
    const videoInfoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const { data: videoPage } = await axios.get(videoInfoUrl);

    // Extract caption track URLs
    const captionTrackPattern = /"captionTracks":\[(.*?)\]/;
    const match = videoPage.match(captionTrackPattern);
    if (!match) {
      throw new Error('No captions found');
    }

    const captionTracks = JSON.parse(`[${match[1]}]`);
    const englishTrack = captionTracks.find(
      track => track.languageCode === 'en' || track.languageCode.startsWith('en-')
    );

    if (!englishTrack) {
      throw new Error('No English captions available');
    }

    // Get caption track content
    const { data: captionData } = await axios.get(englishTrack.baseUrl);
    
    // Parse XML caption data
    const lines = captionData.match(/<text[^>]*>(.*?)<\/text>/g)
      .map(line => {
        const text = line.match(/<text[^>]*>(.*?)<\/text>/)[1];
        return decodeURIComponent(text.replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
      })
      .filter(text => text.trim().length > 0);

    return lines.join('\n');
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
