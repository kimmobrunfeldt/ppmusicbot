// Singleton

const Redis = require('ioredis');

let redis = null;
function connect() {
  if (redis === null) {
    redis = new Redis(process.env.REDIS_URL, {
      retryStrategy: times => Math.min(times * 100, 4000),
    });

    redis.on('error', (err) => {
      console.error('Error occured with redis:');
      console.error(err);
    });

    redis.on('ready', () => {
      console.log('Connected to redis.');
    });
  }

  return redis;
}

module.exports = {
  connect: connect
};
