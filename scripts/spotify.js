const spotifyUtils = require('../utils/spotify');
const { randomNiceEmoji } = require('../utils');
const spotifyUri = require('spotify-uri');

const linkRegex = new RegExp('(https?://(open|play).spotify.com/track/|spotify:track:)\\S+');
const spotifyApi = spotifyUtils.client;

module.exports = (robot) => {
  robot.hear(linkRegex, (msg) => {
    const parsed = spotifyUri.parse(msg.match[0]);
    if (parsed.type !== 'track') {
      console.error('Only track type spotify links are supported!');
      console.error(parsed);
      return;
    }

    const trackId = parsed.id;
    console.log('Link:', msg.match[0], 'Track ID:', trackId);

    spotifyApi.addTracksToPlaylist(
      process.env.SPOTIFY_PLAYLIST_USER,
      process.env.SPOTIFY_PLAYLIST_ID,
      [`spotify:track:${trackId}`]
    )
      .then(() => msg.send(`Track added to playlist! ${randomNiceEmoji()}`))
      .catch((err) => {
        console.log('Error adding track to playlist: ', err);
        msg.send(`Failed to add track to playlist 😓 "${err.message}"`);
      });
  });
};
