const BPromise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const { randomNiceEmoji } = require('../utils');
const spotifyApi = require('../utils/spotify').client;
const jobQueue = require('../utils/job-queue');

const handlers = {
  // Handler function should return a Promise which resolves with true/false
  // If true, the job will be marked as processed
  CONFIRM_ADD_TO_PLAYLIST: handleConfirmAddToPlaylist,
};

function handleConfirmAddToPlaylist(answer, job, msg) {
  const lowerCaseAnswer = answer.toLowerCase();
  console.log(`Got answer  "${answer}"`);

  if (lowerCaseAnswer === 'y') {
    return BPromise.resolve(spotifyApi.addTracksToPlaylist(
      process.env.SPOTIFY_PLAYLIST_USER,
      process.env.SPOTIFY_PLAYLIST_ID,
      [`spotify:track:${job.meta.trackId}`]
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

function handleAnswer(job, msg) {
  const answer = parseAnswer(msg);

  return BPromise.resolve(true)
    .then(() => {
      const handler = handlers[job.type];
      if (!handler) {
        throw new Error(`Unknown message type: ${job.type}`);
      }

      return handler(answer, job, msg);
    })
    .then((shouldRemove) => {
      if (shouldRemove) {
        return jobQueue.popCurrentlyProcessingJob();
      }

      return BPromise.resolve();
    });
}

function removeTooOldCurrentlyProcessing() {
  return jobQueue.getCurrentlyProcessingJob()
    .then((job) => {
      if (job) {
        const diff = Math.abs(moment().diff(moment(job.askedAt), 'seconds'));

        if (diff > 10) {
          return jobQueue.popCurrentlyProcessingJob();
        }
      }

      return BPromise.resolve(null);
    });
}

const pollMessage = BPromise.coroutine(function* (robot) {
  const deletedJob = yield removeTooOldCurrentlyProcessing();
  if (deletedJob) {
    robot.messageRoom(deletedJob.room, deletedJob.onTimeoutMessage);
  }

  const currentJob = yield jobQueue.getCurrentlyProcessingJob();
  if (!currentJob) {
    const nextJob = yield jobQueue.startProcessingNextJob();

    if (nextJob) {
      robot.messageRoom(nextJob.room, nextJob.question);

      const newJob = _.merge({}, nextJob, { askedAt: moment().toISOString() });
      yield jobQueue.updateJob(nextJob.id, newJob);
    }
  }

  setTimeout(pollMessage.bind(this, robot), 1000);
});

module.exports = (robot) => {
  robot.hear(/(.*)/, (msg) => {
    jobQueue.getCurrentlyProcessingJob()
      .then((job) => {
        if (!job) {
          return BPromise.resolve();
        }

        return handleAnswer(job, msg);
      });
  });

  pollMessage(robot);
};
