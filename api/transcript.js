const { YoutubeTranscript } = require('youtube-transcript');

// Helper function to extract video ID
function getVideoId(url) {
  const pattern = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(pattern);
  if (match) {
    return match[1];
  }
  throw new Error('Invalid YouTube URL');
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      const videoId = getVideoId(url);
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      const text = transcript.map(item => item.text).join('\n');
      return res.json({ transcript: text });
    } catch (error) {
      console.error('Transcript Error:', error);
      return res.status(400).json({
        error: 'Could not get transcript. Make sure the video exists and has captions enabled.'
      });
    }
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
