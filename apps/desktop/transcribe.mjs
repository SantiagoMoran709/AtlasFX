process.parentPort.once('message', async ({data: {audio, language}}) => {
  try {
    const {env, pipeline} = await import('@huggingface/transformers');
    env.cacheDir = process.env.ATLASFX_MODEL_CACHE;
    env.allowLocalModels = false;
    const transcribe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      device: 'cpu',
      dtype: 'q8',
    });
    const result = await transcribe(audio, {
      task: 'transcribe',
      ...(language === 'auto' ? {} : {language}),
      chunk_length_s: 25,
      stride_length_s: 4,
      return_timestamps: true,
    });
    process.parentPort.postMessage({chunks: result.chunks ?? []});
  } catch (error) {
    process.parentPort.postMessage({error: `No se pudo transcribir. ${error.message}`});
  }
});
