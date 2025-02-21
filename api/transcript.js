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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      details: 'Only POST requests are allowed'
    });
  }

  try {
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Request body must be a JSON object'
      });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'URL is required and must be a string'
      });
    }

    // Extract video ID
    const videoId = getVideoId(url);
    console.log('Processing video ID:', videoId);

    // Fetch transcript
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      if (!transcript || !Array.isArray(transcript)) {
        throw new Error('Invalid transcript format received');
      }

      // Format transcript
      const text = transcript
        .map(item => item.text.trim())
        .filter(text => text.length > 0)
        .join('\n');

      if (!text) {
        throw new Error('No transcript text found');
      }

      return res.json({ transcript: text });
    } catch (error) {
      console.error('Transcript fetch error:', error);
      return res.status(400).json({
        error: 'Could not get transcript',
        details: 'Make sure the video exists and has captions enabled'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
};
