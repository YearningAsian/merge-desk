// A model answer that couldn't be used as data: not JSON, the wrong shape,
// cut off, or empty. These (and a failed parse check) are the only failures
// the pipelines retry automatically; everything else waits for the user.
export class MalformedOutputError extends Error {}
