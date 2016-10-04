const pickRandom = require('pick-random');

function randomNiceEmoji() {
  return pickRandom(['👊', '🙏', '🏄', '😎', '🎵', '✅', '👌🏻', '🎶'])[0];
}

module.exports = {
  randomNiceEmoji,
};
