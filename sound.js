(function () {
  'use strict';

  var audioCtx = null;
  var enabled = false;

  function getCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    return audioCtx;
  }

  function playTone(freq, duration, type, volume) {
    if (!enabled) return;
    var ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function hover() {
    playTone(1200, 0.04, 'sine', 0.02);
  }

  function click() {
    playTone(800, 0.06, 'sine', 0.025);
    setTimeout(function () { playTone(1000, 0.04, 'sine', 0.02); }, 30);
  }

  function success() {
    playTone(523, 0.12, 'sine', 0.03);
    setTimeout(function () { playTone(659, 0.12, 'sine', 0.03); }, 100);
    setTimeout(function () { playTone(784, 0.2, 'sine', 0.025); }, 200);
  }

  function chime() {
    playTone(880, 0.3, 'sine', 0.02);
    setTimeout(function () { playTone(1108, 0.3, 'sine', 0.015); }, 100);
    setTimeout(function () { playTone(1318, 0.5, 'sine', 0.01); }, 200);
  }

  function error() {
    playTone(200, 0.15, 'sawtooth', 0.02);
    setTimeout(function () { playTone(180, 0.2, 'sawtooth', 0.015); }, 100);
  }

  function setEnabled(val) {
    enabled = !!val;
  }

  function isEnabled() {
    return enabled;
  }

  window.Sound = {
    hover: hover,
    click: click,
    success: success,
    chime: chime,
    error: error,
    setEnabled: setEnabled,
    isEnabled: isEnabled
  };

})();
