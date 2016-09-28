module.exports = robot => {
  robot.hear(/hello bot/i, msg => {
    msg.send('Hello!');
  });
};
