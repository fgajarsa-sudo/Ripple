import { recordFatalError } from './lib/crashLog';

// Installed before anything else loads so it's in place even if a fatal error happens
// during module evaluation of expo-router/app code, not just during React rendering.
const existingHandler = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  if (isFatal) recordFatalError(error);
  existingHandler?.(error, isFatal);
});

require('expo-router/entry');
