const _ = require('lodash');
const SpotifyWebApi = require('spotify-web-api-node');

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: 'http://localhost:9000',
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
});

function connect() {
  return spotifyApi.refreshAccessToken()
    .then(function(data) {
      console.log('The access token has been refreshed!');

      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body['access_token']);

      return spotifyApi;
    })
    .catch(err => {
      console.log('Error when refreshing access token', err);
      throw err;
    });
}

// Poor man's parser
// Link must be either spotify track http link or spotify internal link
function linkToTrackId(link) {
  if (_.startsWith(link, 'http')) {
    return _.last(link.split('/')).trim('/');
  }  else if (_.startsWith(link, 'spotify:track')) {
    return _.last(link.split(':'));
  }

  throw new Error('Unknown link format: ' + link);
}

module.exports = {
  connect,
  linkToTrackId,
};
