const _ = require('lodash');
const SpotifyWebApi = require('spotify-web-api-node');
const retryWrap = require('./retry-wrap');

const spotifyApi = retryWrap(
  new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: 'http://localhost:9000',
    refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
  }),
  {
    // The subsequent call should work after the access_token has been refreshed
    maxRetries: 1,
    // milliseconds
    retryTimeout: () => 100,

    shouldRetry: (err) => {
      console.log('Error when requesting Spotify API', err);

      if (err.statusCode === 401) {
        // Only retry at Unauthorized response, it most probably means we
        // need to refresh access_token.
        return true;
      }

      return false;
    },

    beforeRetry: () => {
      console.log('Refreshing access token and retrying ..');
      return refreshToken();
    },

    attributePicker: name => !_.startsWith(name, '_'),
  }
);

function refreshToken() {
  return spotifyApi.refreshAccessToken()
    .then((data) => {
      console.log('The access token has been refreshed!');

      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body.access_token);

      return spotifyApi;
    })
    .catch((err) => {
      console.log('Error when refreshing access token', err);
      throw err;
    });
}

module.exports = {
  client: spotifyApi,
  refreshToken,
};
