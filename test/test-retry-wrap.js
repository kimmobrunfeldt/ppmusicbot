const assert = require('assert');
const retryWrap = require('../utils/retry-wrap');

const moduleX = function create(opts = {}) {
  let failsLeft = opts.failCount || 5;
  function asyncOperation() {
    if (failsLeft === 0) {
      if (opts.cycle) {
        failsLeft = opts.failCount || 5;
      }

      return Promise.resolve('Success');
    }

    failsLeft -= 1;
    return Promise.reject(new Error('Fail'));
  }

  return {
    asyncOperation: asyncOperation,

    // retryWrap should keep non-function attributes as is
    number: 1,
    string: 'a',
    arr: [1, 2, 3],
    deep: {
      // This function will not be wrapped. Only
      // the first level functions will be wrapped.
      asyncOperation: asyncOperation,
    },

    // retryWrap doesn't intercept functions which don't
    // return Promise objects
    getFailsLeft: () => failsLeft,
  };
};

describe('retryWrap', () => {
  it('retrying should work', () => {
    const wrapped = retryWrap(
      moduleX({ failCount: 5 }),
      { retryTimeout: () => 10 }
    );

    return wrapped.asyncOperation()
      .then((res) => {
        assert.strictEqual(res, 'Success');
        assert.strictEqual(wrapped.getFailsLeft(), 0);
      });
  });

  it('retrying should work multiple times in a row', () => {
    const wrapped = retryWrap(
      moduleX({ failCount: 2, cycle: true }),
      { maxRetries: 3, retryTimeout: () => 10 }
    );

    return wrapped.asyncOperation()
      .then((res) => {
        assert.strictEqual(res, 'Success');
        assert.strictEqual(wrapped.getFailsLeft(), 2);

        // The new call should have a fresh state of retry counter, it starts
        // from 0 again.
        return wrapped.asyncOperation();
      })
      .then((res) => {
        assert.strictEqual(res, 'Success');
        assert.strictEqual(wrapped.getFailsLeft(), 2);
      });
  });

  it('opts.shouldRetry', () => {
    const wrapped = retryWrap(
      moduleX({ failCount: 5 }),
      {
        maxRetries: Infinity,
        retryTimeout: () => 10,
        shouldRetry: () => false,  // never retry
      }
    );

    return wrapped.asyncOperation()
      .then(() => {
        throw new Error('This should never happen. Operation should not succeed.');
      })
      .catch((err) => {
        assert.strictEqual(err.message, 'Fail');
        assert.strictEqual(wrapped.getFailsLeft(), 4);
      });
  });

  it('opts.beforeRetry', () => {
    let beforeCalled = false;

    const wrapped = retryWrap(
      moduleX({ failCount: 1 }),
      {
        maxRetries: Infinity,
        retryTimeout: () => 10,
        beforeRetry: (tryCount) => {
          beforeCalled = true;
          assert.strictEqual(tryCount, 1);

          return new Promise(resolve => setTimeout(resolve, 100));
        },
      }
    );

    return wrapped.asyncOperation()
      .then(() => {
        assert.strictEqual(beforeCalled, true);
      });
  });

  it('opts.maxRetries', () => {
    const wrapped = retryWrap(
      moduleX({ failCount: 5 }),
      { maxRetries: 2, retryTimeout: () => 10 }
    );

    return wrapped.asyncOperation()
      .then(() => {
        throw new Error('This should never happen. Operation should not succeed.');
      })
      .catch((err) => {
        assert.strictEqual(err.message, 'Fail');
      });
  });

  it('opts.maxRetries = 0 should disable retrying', () => {
    const wrapped = retryWrap(
      moduleX({ failCount: 5 }),
      { maxRetries: 0 }
    );

    return wrapped.asyncOperation()
      .then(() => {
        throw new Error('This should never happen. Operation should not succeed.');
      })
      .catch((err) => {
        assert.strictEqual(err.message, 'Fail');
        assert.strictEqual(wrapped.getFailsLeft(), 4);
      });
  });

  it('non-function attributes should be left as is', () => {
    const wrapped = retryWrap(moduleX());
    assert.strictEqual(wrapped.number, 1);
    assert.strictEqual(wrapped.string, 'a');
    assert.deepStrictEqual(wrapped.arr, [1, 2, 3]);
  });

  it('wrapping should not be done deeply', () => {
    const wrapped = retryWrap(
      moduleX({ failCount: 2 }),
      { maxRetries: 10, retryTimeout: () => 10 }
    );

    // Because retryWrap doesn't wrap given object deeply,
    // Calling wrapped.deep.asyncOperation() will fail immediately instead
    // of being retried
    return wrapped.deep.asyncOperation()
      .then((res) => {
        // Test case shouldn't end up here.
        assert.notStrictEqual(res, 'Success');
      })
      .catch((err) => {
        assert.strictEqual(err.message, 'Fail');
        assert.strictEqual(wrapped.getFailsLeft(), 1);
      });
  });
});
