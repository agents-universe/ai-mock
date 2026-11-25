/* eslint-disable */
// Plain-JS worker so it loads identically under tsx (dev/prod) and vitest.
// Registers tsx to require the TypeScript context module; jobs arrive over
// the message port so a single warm worker can serve many evaluations.
require('tsx/cjs/api').register();

const vm = require('node:vm');
const { parentPort } = require('node:worker_threads');
const { buildScriptContext } = require('./context.ts');

function msg(err) {
  return err instanceof Error ? err.message : String(err);
}

parentPort.on('message', (job) => {
  let sandbox;
  let context;
  let script;
  try {
    sandbox = buildScriptContext(job.requestContext, job.envVars);
    context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });
    script = new vm.Script(job.wrapped, { filename: job.filename });
  } catch (err) {
    parentPort.postMessage({ t: 'result', ok: false, phase: 'compile', error: msg(err) });
    return;
  }

  // main thread arms the execution timeout from here, excluding worker boot
  parentPort.postMessage({ t: 'started' });

  let promise;
  try {
    // vm timeout covers the synchronous segment (up to the first await);
    // the main thread terminates this worker if an async continuation hangs
    promise = script.runInContext(context, { timeout: job.timeoutMs });
  } catch (err) {
    parentPort.postMessage({ t: 'result', ok: false, phase: 'runtime', error: msg(err) });
    return;
  }

  Promise.resolve(promise).then(
    (value) => {
      try {
        parentPort.postMessage({ t: 'result', ok: true, value, effects: sandbox.__effects });
      } catch (err) {
        parentPort.postMessage({
          t: 'result',
          ok: false,
          phase: 'runtime',
          error: `返回值无法跨线程传递: ${msg(err)}`,
        });
      }
    },
    (err) => {
      parentPort.postMessage({ t: 'result', ok: false, phase: 'runtime', error: msg(err) });
    }
  );
});
