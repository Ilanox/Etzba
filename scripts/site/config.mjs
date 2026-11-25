// Switches for the website. Each one that is empty keeps its part of the site hidden, so nothing shows before it is real.
// After changing anything here: npm run site, and commit the pages it writes.

export const SITE = 'https://etzba.co.il';

// The Google Play page. Empty until the app is live there; until then every download button opens the web app.
export const PLAY = '';   // 'https://play.google.com/store/apps/details?id=com.edvinstudios.etzba'

// The WhatsApp channel's invite link. Empty: no channel link anywhere.
export const WHATSAPP = '';

// What real testers said, only with their permission, in their words: { text, name, role }.
// name can be a first name or initials, as they agreed. Empty: no quotes section.
export const QUOTES = [];

// The Play rating, copied by hand from the Play Console: { value: 4.8, count: 37 }. Only from real reviews.
// Empty: no stars on the site and no rating in Google's results.
export const RATING = null;

/** Where "get the app" goes: Play once it's live, the web app until then. */
export const GET = PLAY || `${SITE}/app/`;
