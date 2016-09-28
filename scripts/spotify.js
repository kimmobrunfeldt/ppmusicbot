// Description:
//   Add spotify links to playlist
//
// Dependencies:
//   http://www.node-spotify.com/index.html
//
// Configuration:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
//
// Commands:
//   <spotify track link> - adds track to playlist
//
// Author:
//   kimmobrunfeldt

const _ = require('lodash');
const spotifyUtils = require('../utils/spotify');
const linkRegex = new RegExp('(https?://(open|play).spotify.com/track/|spotify:track:)\\S+');

_.each([
  'SPOTIFY_PLAYLIST_USER',
  'SPOTIFY_PLAYLIST_ID',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
  'TELEGRAM_TOKEN',
], key => {
  console.log(key, '=', process.env[key]);

  if (!process.env[key]) {
    throw new Error('Environment variable not defined: ' + key);
  }
});

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
      msg.send(`Something went wrong! ${err.message}`);
    });
  });
};
