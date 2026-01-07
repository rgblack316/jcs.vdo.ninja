const DEFAULT_SAMPLE_RATE = 48000;

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function interleaveChannels(channelData) {
  if (!channelData.length) {
    return new Float32Array();
  }
  const length = channelData[0].length;
  if (channelData.length === 1) {
    return new Float32Array(channelData[0]);
  }
  const interleaved = new Float32Array(length * channelData.length);
  let index = 0;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < channelData.length; channel += 1) {
      interleaved[index] = channelData[channel][i];
      index += 1;
    }
  }
  return interleaved;
}

function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i += 1, offset += 2) {
    let sample = input[i];
    sample = Math.max(-1, Math.min(1, sample));
    const converted = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, converted, true);
  }
}

export function audioBufferToWav(audioBuffer, { float32 = false } = {}) {
  if (!audioBuffer) {
    throw new Error('audioBufferToWav expects an AudioBuffer.');
  }
  const numberOfChannels = audioBuffer.numberOfChannels || 1;
  const sampleRate = audioBuffer.sampleRate || DEFAULT_SAMPLE_RATE;
  const channelData = [];
  for (let i = 0; i < numberOfChannels; i += 1) {
    channelData.push(audioBuffer.getChannelData(i));
  }
  const interleaved = interleaveChannels(channelData);
  const bytesPerSample = float32 ? 4 : 2;
  const format = float32 ? 3 : 1;
  const dataLength = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true);
  view.setUint16(32, numberOfChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  if (float32) {
    const floatView = new Float32Array(buffer, 44, interleaved.length);
    floatView.set(interleaved);
  } else {
    floatTo16BitPCM(view, 44, interleaved);
  }

  return buffer;
}

async function resampleIfNeeded(audioBuffer, targetSampleRate) {
  if (!targetSampleRate || !audioBuffer) {
    return audioBuffer;
  }
  if (Math.abs(audioBuffer.sampleRate - targetSampleRate) < 1) {
    return audioBuffer;
  }
  if (typeof OfflineAudioContext === 'undefined') {
    return audioBuffer;
  }
  const length = Math.ceil(audioBuffer.duration * targetSampleRate);
  const offline = new OfflineAudioContext(audioBuffer.numberOfChannels, length, targetSampleRate);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

export async function convertBlobToWav(blob, { sampleRate = DEFAULT_SAMPLE_RATE, float32 = false, audioContext = null } = {}) {
  if (!blob) {
    throw new Error('convertBlobToWav expects a Blob.');
  }
  if (typeof window === 'undefined') {
    throw new Error('convertBlobToWav requires a browser environment.');
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!audioContext && !AudioContextCtor) {
    throw new Error('AudioContext not supported in this environment.');
  }

  const context = audioContext || new AudioContextCtor();
  const shouldCloseContext = !audioContext && typeof context.close === 'function';

  let audioBuffer;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bufferCopy = arrayBuffer.slice(0);
    audioBuffer = await new Promise((resolve, reject) => {
      context.decodeAudioData(bufferCopy, resolve, reject);
    });
  } catch (error) {
    if (shouldCloseContext) {
      await context.close();
    }
    throw error;
  }

  if (shouldCloseContext) {
    await context.close();
  }

  let processedBuffer = audioBuffer;
  try {
    processedBuffer = await resampleIfNeeded(audioBuffer, sampleRate);
  } catch (error) {
    console.warn('Failed to resample audio buffer, using original sample rate', error);
  }

  const wavArrayBuffer = audioBufferToWav(processedBuffer, { float32 });
  return new Blob([wavArrayBuffer], { type: 'audio/wav' });
}
