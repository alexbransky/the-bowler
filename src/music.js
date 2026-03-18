const BUMBLEBEE_PATTERN = [
  76, 75, 76, 75, 76, 75, 76, 78,
  79, 78, 79, 78, 79, 78, 79, 81,
  83, 81, 79, 78, 79, 78, 76, 75,
  76, 75, 73, 72, 73, 72, 71, 69,
  71, 72, 73, 75, 76, 75, 73, 72,
  73, 72, 71, 69, 71, 69, 68, 66,
  69, 71, 72, 74, 76, 74, 72, 71,
  72, 74, 76, 77, 79, 77, 76, 74,
  76, 77, 79, 81, 83, 81, 79, 77,
  79, 77, 76, 74, 76, 74, 72, 71,
  72, 71, 69, 68, 69, 71, 72, 74,
  76, 74, 72, 71, 72, 71, 69, 68,
  71, 73, 74, 76, 78, 76, 74, 73,
  74, 76, 78, 79, 81, 79, 78, 76,
  78, 79, 81, 83, 84, 83, 81, 79,
  81, 79, 78, 76, 78, 76, 74, 73,
  74, 73, 71, 69, 71, 69, 68, 66,
  68, 69, 71, 72, 74, 72, 71, 69,
];

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function createBumblebeeMusic() {
  let ctx = null;
  let master = null;
  let schedulerId = null;
  let stepIndex = 0;
  let nextNoteTime = 0;
  let muted = false;

  const bpm = 186;
  const stepDuration = 60 / bpm / 4; // 16th-note grid
  const scheduleAhead = 0.12;

  function ensureAudioGraph() {
    if (ctx) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();

    master = ctx.createGain();
    master.gain.value = 0.085;
    master.connect(ctx.destination);
  }

  function playLead(midi, time) {
    const freq = midiToHz(midi);
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.08, time + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + stepDuration * 0.9);

    osc.connect(amp);
    amp.connect(master);
    osc.start(time);
    osc.stop(time + stepDuration * 0.95);
  }

  function playBass(midi, time) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(midiToHz(midi - 24), time);

    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.03, time + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + stepDuration * 3.8);

    osc.connect(amp);
    amp.connect(master);
    osc.start(time);
    osc.stop(time + stepDuration * 3.9);
  }

  function scheduleNotes() {
    if (!ctx || !master) return;

    while (nextNoteTime < ctx.currentTime + scheduleAhead) {
      const note = BUMBLEBEE_PATTERN[stepIndex % BUMBLEBEE_PATTERN.length];
      if (note != null) {
        playLead(note, nextNoteTime);
      }

      if (stepIndex % 4 === 0) {
        playBass(note ?? 69, nextNoteTime);
      }

      stepIndex += 1;
      nextNoteTime += stepDuration;
    }
  }

  function startScheduler() {
    if (schedulerId !== null) return;
    nextNoteTime = ctx.currentTime + 0.04;
    schedulerId = window.setInterval(scheduleNotes, 25);
  }

  function updateGain() {
    if (!ctx || !master) return;
    const target = muted ? 0.0001 : 0.085;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
  }

  async function start() {
    ensureAudioGraph();
    await ctx.resume();
    updateGain();
    startScheduler();
  }

  function toggleMute() {
    muted = !muted;
    updateGain();
    return muted;
  }

  function isMuted() {
    return muted;
  }

  return {
    start,
    toggleMute,
    isMuted,
  };
}
