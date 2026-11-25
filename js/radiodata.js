/* Coastal Cruise - radio station list.
   Radio works offline. Stations with no audio file use a distinct synthesized
   station instead, so changing stations always does something.

   Drop compressed audio in the audio/ folder using the filenames below. The
   game tries each file in order and falls back to the built-in style when a
   file is missing or cannot play from file://. See MEDIA-GUIDE.md for settings.
*/
(function () {
  'use strict';

  const CC = window.CC;
  CC.radioStationDefs = [
    {
      name: 'COASTAL FM',
      format: 'Chill adult contemporary',
      files: ['audio/coastal-fm.mp3', 'audio/coastal-fm.ogg', 'audio/coastal-fm.wav'],
      fallback: 'chill'
    },
    {
      name: 'CRUISE 101',
      format: 'Upbeat cruising pop/rock',
      files: ['audio/cruise-101.mp3', 'audio/cruise-101.ogg', 'audio/cruise-101.wav'],
      fallback: 'cruise'
    },
    {
      name: 'PLAYBACK FM',
      format: 'Old-school hip-hop and R&B',
      files: ['audio/playback-fm.mp3', 'audio/playback-fm.ogg', 'audio/playback-fm.wav'],
      fallback: 'retro'
    },
    {
      name: 'ISLAND WAVE',
      format: 'Reggae and tropical',
      files: ['audio/island-wave.mp3', 'audio/island-wave.ogg', 'audio/island-wave.wav'],
      fallback: 'island'
    },
    {
      name: 'MOONLIGHT',
      format: 'Late-night jazz and soul',
      files: ['audio/moonlight.mp3', 'audio/moonlight.ogg', 'audio/moonlight.wav'],
      fallback: 'night'
    },
    {
      name: 'OUTLAW 99',
      format: 'Country and twang',
      files: ['audio/outlaw-99.mp3', 'audio/outlaw-99.ogg', 'audio/outlaw-99.wav'],
      fallback: 'country'
    },
    {
      name: 'NEON PULSE',
      format: 'Synthwave and electronic',
      files: ['audio/neon-pulse.mp3', 'audio/neon-pulse.ogg', 'audio/neon-pulse.wav'],
      fallback: 'pulse'
    },
    {
      name: 'BAY NEWS TALK',
      format: 'News and call-in talk',
      files: ['audio/bay-news-talk.mp3', 'audio/bay-news-talk.ogg', 'audio/bay-news-talk.wav'],
      fallback: 'talk'
    },
    {
      name: 'SPORTS REEL',
      format: 'Sports talk and highlights',
      files: ['audio/sports-reel.mp3', 'audio/sports-reel.ogg', 'audio/sports-reel.wav'],
      fallback: 'sports'
    },
    {
      name: 'DRIVE-IN OLDIES',
      format: 'Classic rock and oldies',
      files: ['audio/drive-in-oldies.mp3', 'audio/drive-in-oldies.ogg', 'audio/drive-in-oldies.wav'],
      fallback: 'oldies'
    }
  ];
})();
