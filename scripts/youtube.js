const BPromise = require('bluebird');
const _ = require('lodash');
const getYouTubeID = require('get-youtube-id');
const getArtistTitle = require('get-artist-title');
const { oneLine } = require('common-tags');
const moment = require('moment');
const uuid = require('node-uuid');
const spotifyApi = require('../utils/spotify').client;
const youTube = require('../utils/youtube').client;
const redis = require('../utils/redis').connect();

const REDIS_PREFIX = 'hubot';
const linkRegex = new RegExp('(https?://.*youtube.com/watch\\S+|https?://.*youtu.be/\\S+)');

function removeFeat(string) {
  // Transform
  // "David Guetta - Without You ft. Usher"
  // to
  // -> "David Guetta - Without You"
  const matches = string.match(/(.*)f.*\./);
  if (!matches) {
    return string;
  }

  return matches[1];
}

function normalizeYoutubeTitle(title) {
  const parsed = getArtistTitle(title);
  const artistAndSong = parsed.join(' ');
  return removeFeat(artistAndSong);
}

module.exports = (robot) => {
  robot.hear(linkRegex, (msg) => {
    const youtubeId = getYouTubeID(msg.match[0], { fuzzy: false });
    if (!youtubeId) {
      console.error(`Malformed youtube link: ${msg.match[0]}`);
      return;
    }

    youTube.getByIdAsync(youtubeId)
      .then((result) => {
        const title = _.get(result, 'items.0.snippet.title');
        console.log(`Normalize title: "${title}" -> "${normalizeYoutubeTitle(title)}"`);
        return spotifyApi.searchTracks(normalizeYoutubeTitle(title));
      })
      .then((data) => {
        if (_.isEmpty(_.get(data, 'body.tracks.items'))) {
          return BPromise.resolve(false);
        }

        const artistName = _.get(data, 'body.tracks.items.0.artists.0.name');
        const trackName = _.get(data, 'body.tracks.items.0.name');
        const trackId = _.get(data, 'body.tracks.items.0.id');
        const spotifyUrl = _.get(data, 'body.tracks.items.0.external_urls.spotify');

        const uniqueId = uuid.v4();
        const askHuman = {
          id: uniqueId,
          room: msg.message.room,
          question: oneLine`Add ${artistName} - ${trackName} ${spotifyUrl} to playlist?
                            Anyone can answer y/n.`,
          type: 'CONFIRM_ADD_TO_PLAYLIST',
          createdAt: moment().toISOString(),
          meta: {
            trackId,
          },
        };

        console.log('Add ask human job', askHuman);
        return BPromise.props({
          set: redis.set(`${REDIS_PREFIX}:askhuman-data:${uniqueId}`, JSON.stringify(askHuman)),
          uniqueId,
        });
      })
      .then((res) => {
        if (!res) {
          msg.send('Couldn\'t find any match from Spotify.');
          return BPromise.resolve(false);
        }

        return redis.lpush(`${REDIS_PREFIX}:askhuman-jobs`, res.uniqueId)
      })
      .catch((err) => {
        console.log('Error adding youtube track to playlist: ', err);
        msg.send(`Failed to search Youtube track from Spotify 😓  "${err.message}"`);
      });
  });
};
