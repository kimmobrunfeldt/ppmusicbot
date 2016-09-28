const _ = require('lodash');
const spotifyUtils = require('../utils/spotify');
const linkRegex = new RegExp('(https?://(open|play).spotify.com/track/|spotify:track:)\\S+');

// XXX: Known problem: if bot hears a Spotify link before connection has been
//      established, it will cause an error.
let spotifyApi;
spotifyUtils.connect().then(client => {
  spotifyApi = client;
});

module.exports = robot => {
  robot.hear(linkRegex, msg => {
    console.log('Link:', msg.match[0]);
    const trackId = spotifyUtils.linkToTrackId(msg.match[0]);
    console.log('Track ID:', trackId);

    spotifyApi.addTracksToPlaylist(
      process.env.SPOTIFY_PLAYLIST_USER,
      process.env.SPOTIFY_PLAYLIST_ID,
      ['spotify:track:' + trackId]
    )
    .then(function(data) {
      msg.send('Track added to playlist! 👊');
    }, function(err) {
      console.log('Error adding track to playlist: ', err);
      msg.send(`Unable to add track to playlist 😓 "${err.message}"`);
    });
  });
};
