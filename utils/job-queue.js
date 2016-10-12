const _ = require('lodash');
const BPromise = require('bluebird');
const redis = require('./redis').connect();

const REDIS_PREFIX = 'hubot';

function addJob(job) {
  return redis.set(`${REDIS_PREFIX}:queue-data:${job.id}`, JSON.stringify(job))
    .then(() => redis.lpush(`${REDIS_PREFIX}:queue`, job.id));
}

function getJob(id) {
  return redis.get(`${REDIS_PREFIX}:queue-data:${id}`)
    .then((str) => {
      if (str) {
        return JSON.parse(str);
      }

      return null;
    });
}

function updateJob(id, newJobData) {
  return redis.set(`${REDIS_PREFIX}:queue-data:${id}`, JSON.stringify(newJobData));
}


function getCurrentlyProcessingJob() {
  return redis.lrange(`${REDIS_PREFIX}:queue-processing`, 0, 0)
    .then((arr) => {
      if (_.isEmpty(arr)) {
        return null;
      }

      return getJob(arr[0]);
    });
}

// No-op if there already is a currently processing job
function startProcessingNextJob() {
  return redis.rpoplpush(`${REDIS_PREFIX}:queue`, `${REDIS_PREFIX}:queue-processing`)
    .then(() => getCurrentlyProcessingJob());
}

// Removes currently processing job from the queue and returns the job data
const popCurrentlyProcessingJob = BPromise.coroutine(function* popCurrentlyProcessingJob() {
  const currentJob = yield getCurrentlyProcessingJob();
  const delProcessingCount = yield redis.lrem(`${REDIS_PREFIX}:queue-processing`, 0, currentJob.id);
  if (!delProcessingCount) {
    return null;
  }

  const data = yield getJob(currentJob.id);
  const delDataCount = redis.del(`${REDIS_PREFIX}:queue-data:${currentJob.id}`);

  if (!delDataCount) {
    return null;
  }

  return data;
});


module.exports = {
  addJob,
  getJob,
  updateJob,
  getCurrentlyProcessingJob,
  startProcessingNextJob,
  popCurrentlyProcessingJob,
};
