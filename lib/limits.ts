/**
 * Size limits shared by the API route (where they are enforced) and the lab UI
 * (where they become `maxLength` hints). Together they bound how much text one
 * unauthenticated request can make the server forward to Jev.
 */

export const MAX_INPUT_CHARS = 20_000;
export const MAX_CONTEXT_CHARS = 20_000;
export const MAX_OPTIONS = 32;
export const MAX_OPTION_ID_CHARS = 64;
export const MAX_OPTION_LABEL_CHARS = 120;
export const MAX_OPTION_DESCRIPTION_CHARS = 1_000;
/** Upper bound on the raw request body. Anything larger is refused before it is parsed. */
export const MAX_BODY_BYTES = 256 * 1024;
