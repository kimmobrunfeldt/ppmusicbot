const spotifyUtils = require('../utils/spotify');
const pickRandom = require('pick-random');

const linkRegex = new RegExp('(https?://(open|play).spotify.com/track/|spotify:track:)\\S+');

// XXX: Known problem: if bot hears a Spotify link before connection has been
//      established, it will cause an error.
const spotifyApi = spotifyUtils.client;

function randomNiceEmoji() {
  return pickRandom(['👊', '🙏', '🏄', '😎', '🎵', '✅', '👌🏻', '🎶'])[0];
}

module.exports = (robot) => {
  robot.hear(linkRegex, (msg) => {
    const trackId = spotifyUtils.linkToTrackId(msg.match[0]);
    console.log('Link:', msg.match[0], 'Track ID:', trackId);

    spotifyApi.addTracksToPlaylist(
      process.env.SPOTIFY_PLAYLIST_USER,
      process.env.SPOTIFY_PLAYLIST_ID,
      [`spotify:track:${trackId}`]
    )
      .then(() => msg.send(`Track added to playlist! ${randomNiceEmoji()}`))
      .catch((err) => {
        console.log('Error adding track to playlist: ', err);
        msg.send(`Unable to add track to playlist 😓 "${err.message}"`);
      });
  });
};
