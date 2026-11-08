// Music is input 0. The voice on input 1 controls the gain without entering the output.
class AtlasDuckingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.envelope = 0;
    this.gain = 1;
    this.threshold = 10 ** (-30 / 20);
    this.reducedGain = 10 ** (-12 / 20);
    this.attackStep = (1 - this.reducedGain) / (.035 * sampleRate);
    this.releaseStep = (1 - this.reducedGain) / (.4 * sampleRate);
    this.envelopeDecay = Math.exp(-1 / (.025 * sampleRate));
    this.port.onmessage = () => {
      this.envelope = 0;
      this.gain = 1;
    };
  }

  process([music, voice], [output]) {
    for (let sample = 0; sample < output[0].length; sample++) {
      const voicePeak = Math.max(Math.abs(voice[0]?.[sample] ?? 0), Math.abs(voice[1]?.[sample] ?? 0));
      this.envelope = Math.max(voicePeak, this.envelope * this.envelopeDecay);
      this.gain = this.envelope >= this.threshold
        ? Math.max(this.reducedGain, this.gain - this.attackStep)
        : Math.min(1, this.gain + this.releaseStep);
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][sample] = (music[channel]?.[sample] ?? 0) * this.gain;
      }
    }
    return true;
  }
}

registerProcessor('atlas-ducking', AtlasDuckingProcessor);
