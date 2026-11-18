import { createFile, DataStream } from "https://cdn.jsdelivr.net/npm/mp4box@2.3.0/+esm";
class MP4FileSink {
  #setStatus = null;
  #file = null;
  #offset = 0;
  constructor(file, setStatus) {
    this.#file = file;
    this.#setStatus = setStatus;
  }
  write(chunk) {
    const buffer = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(buffer).set(chunk);
    buffer.fileStart = this.#offset;
    this.#offset += buffer.byteLength;
    this.#setStatus("fetch", (this.#offset / 1024 ** 2).toFixed(1) + " MiB");
    this.#file.appendBuffer(buffer);
  }
  close() {
    this.#setStatus("fetch", "Done");
    this.#file.flush();
  }
}
export class MP4Demuxer {
  #onConfig = null;
  #onChunk = null;
  #setStatus = null;
  #file = null;
  constructor(uri, { onConfig, onChunk, setStatus }) {
    this.#onConfig = onConfig;
    this.#onChunk = onChunk;
    this.#setStatus = setStatus;
    this.#file = createFile();
    this.#file.onError = (error) => setStatus("demux", error);
    this.#file.onReady = this.#onReady.bind(this);
    this.#file.onSamples = this.#onSamples.bind(this);
    const fileSink = new MP4FileSink(this.#file, setStatus);
    fetch(uri).then((response) => {
      response.body.pipeTo(new WritableStream(fileSink, { highWaterMark: 2 }));
    });
  }
  // Get the appropriate `description` for a specific track. Assumes that the
  // track is H.264, H.265, VP8, VP9, or AV1.
  #description(track) {
    const trak = this.#file.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(void 0, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8);
      }
    }
    throw new Error("avcC, hvcC, vpcC, or av1C box not found");
  }
  #onReady(info) {
    this.#setStatus("demux", "Ready");
    const track = info.videoTracks[0];
    this.#onConfig({
      // Browser doesn't support parsing full vp8 codec (eg: `vp08.00.41.08`),
      // they only support `vp8`.
      codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
      codedHeight: track.video.height,
      codedWidth: track.video.width,
      description: this.#description(track)
    });
    this.#file.setExtractionOptions(track.id);
    this.#file.start();
  }
  #onSamples(track_id, ref, samples) {
    for (const sample of samples) {
      this.#onChunk(new EncodedVideoChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: 1e6 * sample.cts / sample.timescale,
        duration: 1e6 * sample.duration / sample.timescale,
        data: sample.data
      }));
    }
  }
}
