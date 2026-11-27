/* Coastal Cruise - radio station list.
   Radio works offline. Every station uses a bundled MP3 in audio/; a missing
   or unplayable file falls back to silence instead of a synthesized station.

   Keep the compressed audio filenames below in sync with audio/. The game
   tries each entry in order, so adding a secondary format is still possible,
   but the published build intentionally ships MP3s only. See MEDIA-GUIDE.md.
*/
(function () {
  'use strict';

  const CC = window.CC;
  CC.radioStationDefs = [
    {
      name: 'COASTAL FM',
      format: 'Chill adult contemporary',
      files: ['audio/coastal-fm.mp3'],
      fallback: 'chill'
    },
    {
      name: 'CRUISE 101',
      format: 'Upbeat cruising pop/rock',
      files: ['audio/cruise-101.mp3'],
      fallback: 'cruise'
    },
    {
      name: 'PLAYBACK FM',
      format: 'Old-school hip-hop and R&B',
      files: ['audio/playback-fm.mp3'],
      fallback: 'retro'
    },
    {
      name: 'ISLAND WAVE',
      format: 'Reggae and tropical',
      files: ['audio/island-wave.mp3'],
      fallback: 'island'
    },
    {
      name: 'MOONLIGHT',
      format: 'Late-night jazz and soul',
      files: ['audio/moonlight.mp3'],
      fallback: 'night'
    },
    {
      name: 'OUTLAW 99',
      format: 'Country and twang',
      files: ['audio/outlaw-99.mp3'],
      fallback: 'country'
    },
    {
      name: 'NEON PULSE',
      format: 'Synthwave and electronic',
      files: ['audio/neon-pulse.mp3'],
      fallback: 'pulse'
    },
    {
      name: 'BAY NEWS TALK',
      format: 'News and call-in talk',
      files: ['audio/bay-news-talk.mp3'],
      fallback: 'talk'
    },
    {
      name: 'SPORTS REEL',
      format: 'Sports talk and highlights',
      files: ['audio/sports-reel.mp3'],
      fallback: 'sports'
    },
    {
      name: 'DRIVE-IN OLDIES',
      format: 'Classic rock and oldies',
      files: ['audio/drive-in-oldies.mp3'],
      fallback: 'oldies'
    },
    {
      // Last choice when cycling: silence. Picking any station resumes play.
      name: 'RADIO OFF',
      format: 'Silence — no station playing',
      files: [],
      fallback: 'silent',
      off: true
    }
  ];
})();
