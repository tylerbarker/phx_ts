import { CHANNEL_EVENTS } from "./constants";

export enum BINARY_KINDS {
  push = 0,
  reply = 1,
  broadcast = 2,
}

export type MessageMeta = {
  join_ref: string | null;
  ref: string | null;
  topic: string;
  event: string;
};

export type ObjectMessage = MessageMeta & {
  payload: Record<string | number, unknown>;
};

export type BinaryMessage = MessageMeta & {
  payload: ArrayBuffer;
};

export type DecodedMessage = ObjectMessage | BinaryMessage;
export type EncodedMessage = ArrayBuffer | string;
export type AfterEncodeCallback = (encodedMsg: EncodedMessage) => void;
export type AfterDecodeCallback = (decodedMsg: DecodedMessage) => void;

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function isBinaryMessage(msg: DecodedMessage): msg is BinaryMessage {
  return msg.payload instanceof ArrayBuffer;
}

export default {
  HEADER_LENGTH: 1,
  META_LENGTH: 4,

  encode(msg: DecodedMessage, callback: AfterEncodeCallback) {
    if (isBinaryMessage(msg)) {
      return callback(this.binaryEncode(msg));
    } else {
      const payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
      return callback(JSON.stringify(payload));
    }
  },

  decode(rawMsg: EncodedMessage, callback: AfterDecodeCallback) {
    if (isArrayBuffer(rawMsg)) {
      return callback(this.binaryDecode(rawMsg));
    } else {
      const [join_ref, ref, topic, event, payload] = JSON.parse(rawMsg);
      return callback({ join_ref, ref, topic, event, payload });
    }
  },

  // private

  binaryEncode(message: BinaryMessage): ArrayBuffer {
    const { join_ref, ref, event, topic, payload } = message;
    const metaLength =
      this.META_LENGTH + (join_ref?.length || 0) + (ref?.length || 0) + topic.length + event.length;
    const header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
    const view = new DataView(header);
    let offset = 0;

    view.setUint8(offset++, BINARY_KINDS.push); // kind
    view.setUint8(offset++, join_ref?.length || 0);
    view.setUint8(offset++, ref?.length || 0);
    view.setUint8(offset++, topic.length);
    view.setUint8(offset++, event.length);
    Array.from(join_ref || "", (char) => view.setUint8(offset++, char.charCodeAt(0)));
    Array.from(ref || "", (char) => view.setUint8(offset++, char.charCodeAt(0)));
    Array.from(topic, (char) => view.setUint8(offset++, char.charCodeAt(0)));
    Array.from(event, (char) => view.setUint8(offset++, char.charCodeAt(0)));

    const combined = new Uint8Array(header.byteLength + payload.byteLength);
    combined.set(new Uint8Array(header), 0);
    combined.set(new Uint8Array(payload), header.byteLength);

    // ArrayBufferLike is not quite ArrayBuffer
    return (combined.buffer as ArrayBuffer);
  },

  binaryDecode(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    const kind = view.getUint8(0) as BINARY_KINDS;
    const decoder = new TextDecoder();
    switch (kind) {
      case BINARY_KINDS.push:
        return this.decodePush(buffer, view, decoder);
      case BINARY_KINDS.reply:
        return this.decodeReply(buffer, view, decoder);
      case BINARY_KINDS.broadcast:
        return this.decodeBroadcast(buffer, view, decoder);
    }
  },

  decodePush(buffer: ArrayBuffer, view: DataView, decoder: TextDecoder): DecodedMessage {
    const joinRefSize = view.getUint8(1);
    const topicSize = view.getUint8(2);
    const eventSize = view.getUint8(3);
    let offset = this.HEADER_LENGTH + this.META_LENGTH - 1; // pushes have no ref
    const joinRef = decoder.decode(buffer.slice(offset, offset + joinRefSize));
    offset = offset + joinRefSize;
    const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    const event = decoder.decode(buffer.slice(offset, offset + eventSize));
    offset = offset + eventSize;
    const data = buffer.slice(offset, buffer.byteLength);
    return {
      join_ref: joinRef,
      ref: null,
      topic: topic,
      event: event,
      payload: data,
    };
  },

  decodeReply(buffer: ArrayBuffer, view: DataView, decoder: TextDecoder): DecodedMessage {
    const joinRefSize = view.getUint8(1);
    const refSize = view.getUint8(2);
    const topicSize = view.getUint8(3);
    const eventSize = view.getUint8(4);
    let offset = this.HEADER_LENGTH + this.META_LENGTH;
    const joinRef = decoder.decode(buffer.slice(offset, offset + joinRefSize));
    offset = offset + joinRefSize;
    const ref = decoder.decode(buffer.slice(offset, offset + refSize));
    offset = offset + refSize;
    const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    const event = decoder.decode(buffer.slice(offset, offset + eventSize));
    offset = offset + eventSize;
    const data = buffer.slice(offset, buffer.byteLength);
    const payload = { status: event, response: data };
    return {
      join_ref: joinRef,
      ref: ref,
      topic: topic,
      event: CHANNEL_EVENTS.reply,
      payload: payload,
    };
  },

  decodeBroadcast(buffer: ArrayBuffer, view: DataView, decoder: TextDecoder): DecodedMessage {
    const topicSize = view.getUint8(1);
    const eventSize = view.getUint8(2);
    let offset = this.HEADER_LENGTH + 2;
    const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
    offset = offset + topicSize;
    const event = decoder.decode(buffer.slice(offset, offset + eventSize));
    offset = offset + eventSize;
    const data = buffer.slice(offset, buffer.byteLength);

    return {
      join_ref: null,
      ref: null,
      topic: topic,
      event: event,
      payload: data,
    };
  },
};
