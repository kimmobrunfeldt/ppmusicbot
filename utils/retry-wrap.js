const _ = require('lodash');

function isPromise(obj) {
  return _.isFunction(_.get(obj, 'then'));
}

function createRetryFunction(func, opts) {
  function retry(/* arguments */) {
    // Keep state in retry function's this scope when running the recursive
    // loop
    const retryThis = this;
    if (!_.isNumber(retryThis.retries)) {
      retryThis.retries = 0;
    }

    const args = Array.prototype.slice.call(arguments);

    const ret = func.apply(func, args);
    if (isPromise(ret)) {
      return ret.catch((err) => {
        const maxRetriesReached = retryThis.retries > opts.maxRetries;

        if (opts.shouldRetry(err) && !maxRetriesReached) {
          return new Promise((resolve, reject) => {
            retryThis.retries += 1;

            setTimeout(() => {
              Promise.resolve(opts.beforeRetry(retryThis.retries))
                // Recursively call `retry` function
                // XXX: We are assuming that all subsequent calls of `func`
                //      return a Promise too.
                .then(() => retry.apply(retryThis, args))
                .then(function resolver() {
                  // Promise should resolve with single value, but pass all
                  // parameters to the resolve just in case.
                  resolve.apply(this, arguments);
                })
                .catch(err2 => reject(err2));
            }, opts.retryTimeout(retryThis.retries));
          });
        }

        throw err;
      });
    }

    return ret;
  }

  return retry;
}

function retryWrap(obj, _opts) {
  const opts = _.merge({
    // Decision function which gets the Promise rejection error as a parameter
    // Should return true of false synchronously
    shouldRetry: err => true,

    // Executed before each retry. Can return a Promise for async operations
    beforeRetry: tryCount => Promise.resolve(),

    // Retry count overrides even though shouldRetry returns true
    // For unlimited retries, use Infinity.
    // To disable retrying, use 0.
    maxRetries: 5,

    // Timeout before retrying
    retryTimeout: tryCount => 1000,
  }, _opts);

  const objCopy = {};

  _.each(obj, (val, key) => {
    if (_.isFunction(val)) {
      objCopy[key] = createRetryFunction(val, opts);
    } else {
      objCopy[key] = val;
    }
  });

  return objCopy;
}

module.exports = retryWrap;
