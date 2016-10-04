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

function handleConfirmAddToPlaylist(answer, messageData, msg) {
  const lowerCaseAnswer = answer.toLowerCase();
  console.log(`Got answer  "${answer}"`);

  if (lowerCaseAnswer === 'y') {
    return BPromise.resolve(spotifyApi.addTracksToPlaylist(
      process.env.SPOTIFY_PLAYLIST_USER,
      process.env.SPOTIFY_PLAYLIST_ID,
      [`spotify:track:${messageData.meta.trackId}`]
    ))
      .then(() => {
        msg.send(`Track added to playlist! ${randomNiceEmoji()}`);
        return true;
      })
      .catch((err) => {
        console.log('Error adding track to playlist: ', err);
        msg.send(`Failed to add track to playlist 😓 "${err.message}"`);
        return true;
      });
  } else if (lowerCaseAnswer === 'n') {
    msg.send('Ok won\'t add it.');
    return BPromise.resolve(true);
  }

  return BPromise.resolve(false);
}

function parseAnswer(msg) {
  const answer = msg.message.text;
  if (_.startsWith(answer, process.env.HUBOT_NAME)) {
    // For some reason when talking to hubot via private,
    // msg.message.text starts with bot name and space. E.g.
    // If someone says "y", it will show up as:
    // "PPMusicBot y"
    return answer.slice(process.env.HUBOT_NAME.length + 1, answer.length);
  }

  return answer;
}

const popMessageFromProcessing = BPromise.coroutine(function* popMessageFromProcessing(uniqueId) {
  const delProcessingCount = yield redis.lrem(`${REDIS_PREFIX}:askhuman-processing`, 0, uniqueId);
  if (!delProcessingCount) {
    return null;
  }

  const data = yield getMessageData(uniqueId);
  const delDataCount = redis.del(`${REDIS_PREFIX}:askhuman-data:${uniqueId}`);

  if (!delDataCount) {
    return null;
  }

  return data;
});

function handleAnswer(data, msg) {
  const answer = parseAnswer(msg);

  return BPromise.resolve(true)
    .then(() => {
      if (data.type === 'CONFIRM_ADD_TO_PLAYLIST') {
        return handleConfirmAddToPlaylist(answer, data, msg);
      }

      throw new Error(`Unknown message type: ${data.type}`);
    })
    .then((shouldRemove) => {
      if (shouldRemove) {
        return popMessageFromProcessing(data.id);
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
          return popMessageFromProcessing(data.id);
        }
      }

      return BPromise.resolve(null);
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
      .then((deletedJob) => {
        if (deletedJob) {
          robot.messageRoom(deletedJob.room, 'I\'ll take the silence as a no.');
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
            robot.messageRoom(data.room, data.question);

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
