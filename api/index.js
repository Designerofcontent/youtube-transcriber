const { YoutubeTranscript } = require('youtube-transcript');

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
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcript || !Array.isArray(transcript)) {
      throw new Error('Invalid transcript format received');
    }

    const text = transcript
      .map(item => item.text.trim())
      .filter(text => text.length > 0)
      .join('\n');

    if (!text) {
      throw new Error('No transcript text found');
    }

    return res.json({ transcript: text });
  } catch (error) {
    console.error('Error:', error);
    return res.status(400).json({
      error: 'Failed to get transcript',
      details: error.message
    });
  }
};
