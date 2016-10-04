const BPromise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const { randomNiceEmoji } = require('../utils');
const spotifyApi = require('../utils/spotify').client;
const redis = require('../utils/redis').connect();

const REDIS_PREFIX = 'hubot';

function getMessageData(uniqueId) {
  return redis.get(`${REDIS_PREFIX}:askhuman-data:${uniqueId}`)
    .then((str) => {
      if (str) {
        return JSON.parse(str);
      }

      return null;
    });
}

function setMessageData(uniqueId, data) {
  return redis.set(
    `${REDIS_PREFIX}:askhuman-data:${uniqueId}`,
    JSON.stringify(data)
  );
}

function getCurrentlyProcessingData() {
  return redis.lrange(`${REDIS_PREFIX}:askhuman-processing`, 0, 0)
    .then((arr) => {
      if (_.isEmpty(arr)) {
        return null;
      }

      return getMessageData(_.first(arr));
    });
}

function handleConfirmAddToPlaylist(messageData, msg) {
  const answer = msg.match[0].toLowerCase().trim();
  if (answer === 'y') {
    return spotifyApi.addTracksToPlaylist(
      process.env.SPOTIFY_PLAYLIST_USER,
      process.env.SPOTIFY_PLAYLIST_ID,
      [`spotify:track:${messageData.meta.trackId}`]
    )
      .then(() => msg.send(`Track added to playlist! ${randomNiceEmoji()}`))
      .catch((err) => {
        console.log('Error adding track to playlist: ', err);
        msg.send(`Failed to add track to playlist 😓 "${err.message}"`);
      });
  } else if (answer === 'n') {
    msg.send('Ok won\'t add it.');
    return BPromise.resolve(true);
  }

  return BPromise.resolve(false);
}

function removeMessageFromProcessing(uniqueId) {
  return redis.lrem(`${REDIS_PREFIX}:askhuman-processing`, 0, uniqueId)
    .then(() => redis.del(`${REDIS_PREFIX}:askhuman-data:${uniqueId}`));
}

function handleAnswer(data, msg) {
  return BPromise.resolve(true)
    .then(() => {
      if (data.type === 'CONFIRM_ADD_TO_PLAYLIST') {
        return handleConfirmAddToPlaylist(data, msg);
      }

      throw new Error(`Unknown message type: ${data.type}`);
    })
    .then((shouldRemove) => {
      if (shouldRemove) {
        return removeMessageFromProcessing(data.id);
      }

      return BPromise.resolve();
    });
}

function removeTooOldCurrentlyProcessing() {
  return getCurrentlyProcessingData()
    .then((data) => {
      if (data) {
        const diff = Math.abs(moment().diff(moment(data.askedAt), 'seconds'));

        if (diff > 10) {
          return removeMessageFromProcessing(data.id);
        }
      }

      return BPromise.resolve(0);
    });
}

module.exports = (robot) => {
  robot.hear(/(.*)/, (msg) => {
    getCurrentlyProcessingData()
      .then((data) => {
        if (!data) {
          return BPromise.resolve();
        }

        return handleAnswer(data, msg);
      });
  });

  function pollMessage() {
    return removeTooOldCurrentlyProcessing()
      .then((deletedCount) => {
        if (deletedCount > 0) {
          robot.messageRoom('telegram', 'I\'ll take the silence as a no.');
        }
      })
      .then(() => getCurrentlyProcessingData())
      .then((data) => {
        if (data) {
          return null;
        }

        return redis.rpoplpush(
          `${REDIS_PREFIX}:askhuman-jobs`,
          `${REDIS_PREFIX}:askhuman-processing`
        );
      })
      .then((id) => {
        if (!id) {
          return BPromise.resolve();
        }

        return getMessageData(id)
          .then((data) => {
            robot.messageRoom('telegram', data.question);

            const newData = _.merge({}, data, { askedAt: moment().toISOString() });
            return setMessageData(data.id, newData);
          });
      })
      .finally(() => {
        setTimeout(pollMessage, 1000);
      });
  }

  pollMessage();
};
