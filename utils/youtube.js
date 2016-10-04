const BPromise = require('bluebird');
const YouTube = require('youtube-node');

const youTube = BPromise.promisifyAll(new YouTube());
youTube.setKey(process.env.YOUTUBE_API_KEY);

module.exports = {
  client: youTube,
};
