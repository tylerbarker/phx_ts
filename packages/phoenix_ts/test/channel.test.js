import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import sinon from "sinon";
import { Channel, Socket } from "../assets/js/phoenix";

let channel, socket;

const defaultRef = 1;
const defaultTimeout = 10000;

class WSMock {
  constructor() {}
  close() {}
  send() {}
}

describe("with transport", () => {
  beforeAll(() => {
    window.WebSocket = WSMock;
  });

  describe("constructor", () => {
    beforeEach(() => {
      socket = new Socket("/", { timeout: 1234 });
    });

    it("sets defaults", () => {
      channel = new Channel("topic", { one: "two" }, socket);

      expect(channel.state).toEqual("closed");
      expect(channel.topic).toEqual("topic");
      expect(channel.params()).toStrictEqual({ one: "two" });
      expect(channel.socket).toStrictEqual(socket);
      expect(channel.timeout).toEqual(1234);
      expect(channel.joinedOnce).toBeFalse();
      expect(channel.joinPush).toBeTruthy();
      expect(channel.pushBuffer).toStrictEqual([]);
    });

    it("sets up joinPush object with literal params", () => {
      channel = new Channel("topic", { one: "two" }, socket);
      const joinPush = channel.joinPush;

      expect(joinPush.channel).toStrictEqual(channel);
      expect(joinPush.payload()).toStrictEqual({ one: "two" });
      expect(joinPush.event).toEqual("phx_join");
      expect(joinPush.timeout).toEqual(1234);
    });

    it("sets up joinPush object with closure params", () => {
      channel = new Channel("topic", () => ({ one: "two" }), socket);
      const joinPush = channel.joinPush;

      expect(joinPush.channel).toStrictEqual(channel);
      expect(joinPush.payload()).toStrictEqual({ one: "two" });
      expect(joinPush.event).toEqual("phx_join");
      expect(joinPush.timeout).toEqual(1234);
    });
  });

  describe("updating join params", () => {
    it("can update the join params", () => {
      let counter = 0;
      const params = () => ({ value: counter });
      socket = {
        timeout: 1234,
        onError: () => {},
        onOpen: () => {},
      };

      channel = new Channel("topic", params, socket);
      const joinPush = channel.joinPush;

      expect(joinPush.channel).toStrictEqual(channel);
      expect(joinPush.payload()).toStrictEqual({ value: 0 });
      expect(joinPush.event).toEqual("phx_join");
      expect(joinPush.timeout).toEqual(1234);

      counter++;

      expect(joinPush.channel).toStrictEqual(channel);
      expect(joinPush.payload()).toStrictEqual({ value: 1 });
      expect(channel.params()).toStrictEqual({ value: 1 });
      expect(joinPush.event).toEqual("phx_join");
      expect(joinPush.timeout).toEqual(1234);
    });
  });

  describe("join", () => {
    beforeEach(() => {
      socket = new Socket("/socket", { timeout: defaultTimeout });

      channel = socket.channel("topic", { one: "two" });
    });

    it("sets state to joining", () => {
      channel.join();

      expect(channel.state).toEqual("joining");
    });

    it("sets joinedOnce to true", () => {
      expect(!channel.joinedOnce).toBeTruthy();

      channel.join();

      expect(channel.joinedOnce).toBeTruthy();
    });

    it("throws if attempting to join multiple times", () => {
      channel.join();

      // /^Error: tried to join multiple times/
      expect(() => channel.join()).toThrowError(/^tried to join multiple times/i);
    });

    it("triggers socket push with channel params", () => {
      sinon.stub(socket, "makeRef").callsFake(() => defaultRef);
      const spy = sinon.spy(socket, "push");

      channel.join();

      expect(spy.calledOnce).toBeTruthy();
      expect(
        spy.calledWith({
          topic: "topic",
          event: "phx_join",
          payload: { one: "two" },
          ref: defaultRef,
          join_ref: channel.joinRef(),
        }),
      ).toBeTruthy();
    });

    it("can set timeout on joinPush", () => {
      const newTimeout = 2000;
      const joinPush = channel.joinPush;

      expect(joinPush.timeout).toEqual(defaultTimeout);

      channel.join(newTimeout);

      expect(joinPush.timeout).toEqual(newTimeout);
    });

    it("leaves existing duplicate topic on new join", () => {
      channel.join().receive("ok", () => {
        const newChannel = socket.channel("topic");
        expect(channel.isJoined()).toBeTrue();
        newChannel.join();
        expect(channel.isJoined()).toBeFalse();
      });

      channel.joinPush.trigger("ok", {});
    });

    describe("timeout behavior", () => {
      let clock, joinPush;

      const helpers = {
        receiveSocketOpen() {
          sinon.stub(socket, "isConnected").callsFake(() => true);
          socket.onConnOpen();
        },
      };

      beforeEach(() => {
        clock = sinon.useFakeTimers();
        joinPush = channel.joinPush;
      });

      afterEach(() => {
        clock.restore();
      });

      it("succeeds before timeout", () => {
        const spy = sinon.stub(socket, "push");
        const timeout = joinPush.timeout;

        socket.connect();
        helpers.receiveSocketOpen();

        channel.join();
        expect(spy.callCount).toEqual(1);

        expect(channel.timeout).toEqual(10000);
        clock.tick(100);

        joinPush.trigger("ok", {});

        expect(channel.state).toEqual("joined");

        clock.tick(timeout);
        expect(spy.callCount).toEqual(1);
      });

      it("retries with backoff after timeout", () => {
        const spy = sinon.stub(socket, "push");
        const timeoutSpy = sinon.spy();
        const timeout = joinPush.timeout;

        socket.connect();
        helpers.receiveSocketOpen();

        channel.join().receive("timeout", timeoutSpy);

        expect(spy.callCount).toEqual(1);
        expect(timeoutSpy.callCount).toEqual(0);

        clock.tick(timeout);
        expect(spy.callCount).toEqual(2); // leave pushed to server
        expect(timeoutSpy.callCount).toEqual(1);

        clock.tick(timeout + 1000);
        expect(spy.callCount).toEqual(4); // leave + rejoin
        expect(timeoutSpy.callCount).toEqual(2);

        clock.tick(10000);
        joinPush.trigger("ok", {});
        expect(spy.callCount).toEqual(6);
        expect(channel.state).toEqual("joined");
      });

      it("with socket and join delay", () => {
        const spy = sinon.stub(socket, "push");
        const joinPush = channel.joinPush;

        channel.join();
        expect(spy.callCount).toEqual(1);

        // open socket after delay
        clock.tick(9000);

        expect(spy.callCount).toEqual(1);

        // join request returns between timeouts
        clock.tick(1000);
        socket.connect();

        expect(channel.state).toEqual("errored");

        helpers.receiveSocketOpen();
        joinPush.trigger("ok", {});

        // join request succeeds after delay
        clock.tick(1000);

        expect(channel.state).toEqual("joined");
        expect(spy.callCount).toEqual(3); // leave pushed to server
      });

      it("with socket delay only", () => {
        const joinPush = channel.joinPush;

        channel.join();

        expect(channel.state).toEqual("joining");

        // connect socket after delay
        clock.tick(6000);
        socket.connect();

        // open socket after delay
        clock.tick(5000);
        helpers.receiveSocketOpen();
        joinPush.trigger("ok", {});

        joinPush.trigger("ok", {});
        expect(channel.state).toEqual("joined");
      });
    });
  });

  describe("joinPush", () => {
    let joinPush, clock, response;

    const helpers = {
      receiveOk() {
        clock.tick(joinPush.timeout / 2); // before timeout
        return joinPush.channel.trigger(
          "phx_reply",
          { status: "ok", response: response },
          joinPush.ref,
          joinPush.ref,
        );
        // return joinPush.trigger("ok", response)
      },

      receiveTimeout() {
        clock.tick(joinPush.timeout * 2); // after timeout
      },

      receiveError() {
        clock.tick(joinPush.timeout / 2); // before timeout
        return joinPush.trigger("error", response);
      },

      getBindings(event) {
        return channel.bindings.filter((bind) => bind.event === event);
      },
    };

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      socket = new Socket("/socket", { timeout: defaultTimeout });
      sinon.stub(socket, "isConnected").callsFake(() => true);
      sinon.stub(socket, "push").callsFake(() => true);

      channel = socket.channel("topic", { one: "two" });
      joinPush = channel.joinPush;

      channel.join();
    });

    afterEach(() => {
      clock.restore();
    });

    describe("receives 'ok'", () => {
      beforeEach(() => {
        response = { chan: "reply" };
      });

      it("sets channel state to joined", () => {
        expect(channel.state).not.toEqual("joined");

        helpers.receiveOk();

        expect(channel.state).toEqual("joined");
      });

      it("triggers receive('ok') callback after ok response", () => {
        const spyOk = sinon.spy();

        joinPush.receive("ok", spyOk);

        helpers.receiveOk();

        expect(spyOk.calledOnce).toBeTruthy();
      });

      it("triggers receive('ok') callback if ok response already received", () => {
        const spyOk = sinon.spy();

        helpers.receiveOk();

        joinPush.receive("ok", spyOk);

        expect(spyOk.calledOnce).toBeTruthy();
      });

      it("does not trigger other receive callbacks after ok response", () => {
        const spyError = sinon.spy();
        const spyTimeout = sinon.spy();

        joinPush.receive("error", spyError).receive("timeout", spyTimeout);

        helpers.receiveOk();
        clock.tick(channel.timeout * 2); // attempt timeout

        expect(!spyError.called).toBeTruthy();
        expect(!spyTimeout.called).toBeTruthy();
      });

      it("clears timeoutTimer", () => {
        expect(joinPush.timeoutTimer).toBeTruthy();

        helpers.receiveOk();

        expect(joinPush.timeoutTimer).toBeNull();
      });

      it("sets receivedResp", () => {
        expect(joinPush.receivedResp).toBeNull();

        helpers.receiveOk();

        expect(joinPush.receivedResp).toStrictEqual({ status: "ok", response });
      });

      it("removes channel bindings", () => {
        let bindings = helpers.getBindings("chan_reply_3");
        expect(bindings.length).toEqual(1);

        helpers.receiveOk();

        bindings = helpers.getBindings("chan_reply_3");
        expect(bindings.length).toEqual(0);
      });

      it("resets channel rejoinTimer", () => {
        expect(channel.rejoinTimer).toBeTruthy();

        const spy = sinon.spy(channel.rejoinTimer, "reset");

        helpers.receiveOk();

        expect(spy.calledOnce).toBeTruthy();
      });

      it("sends and empties channel's buffered pushEvents", () => {
        const pushEvent = { send() {} };
        const spy = sinon.spy(pushEvent, "send");

        channel.pushBuffer.push(pushEvent);

        expect(channel.state).toEqual("joining");
        joinPush.receive("ok", () => {
          expect(spy.callCount).toEqual(1);
          expect(channel.pushBuffer.length).toEqual(0);
        });
        helpers.receiveOk();
      });
    });

    describe("receives 'timeout'", () => {
      it("sets channel state to errored", () => {
        joinPush.receive("timeout", () => {
          expect(channel.state).toEqual("errored");
        });

        helpers.receiveTimeout();
      });

      it("triggers receive('timeout') callback after ok response", () => {
        const spyTimeout = sinon.spy();

        joinPush.receive("timeout", spyTimeout);

        helpers.receiveTimeout();

        expect(spyTimeout.calledOnce).toBeTruthy();
      });

      it("does not trigger other receive callbacks after timeout response", () => {
        const spyOk = sinon.spy();
        const spyError = sinon.spy();
        sinon.stub(channel.rejoinTimer, "scheduleTimeout").callsFake(() => true);

        channel.test = true;
        joinPush
          .receive("ok", spyOk)
          .receive("error", spyError)
          .receive("timeout", () => {
            expect(!spyOk.called).toBeTruthy();
            expect(!spyError.called).toBeTruthy();
          });

        helpers.receiveTimeout();
        helpers.receiveOk();
      });

      it("schedules rejoinTimer timeout", () => {
        expect(channel.rejoinTimer).toBeTruthy();

        const spy = sinon.spy(channel.rejoinTimer, "scheduleTimeout");

        helpers.receiveTimeout();

        expect(spy.called).toBeTruthy(); // TODO why called multiple times?
      });
    });

    describe("receives 'error'", () => {
      beforeEach(() => {
        response = { chan: "fail" };
      });

      it("triggers receive('error') callback after error response", () => {
        const spyError = sinon.spy();

        expect(channel.state).toEqual("joining");
        joinPush.receive("error", spyError);

        helpers.receiveError();
        joinPush.trigger("error", {});

        expect(spyError.callCount).toEqual(1);
      });

      it("triggers receive('error') callback if error response already received", () => {
        const spyError = sinon.spy();

        helpers.receiveError();

        joinPush.receive("error", spyError);

        expect(spyError.calledOnce).toBeTruthy();
      });

      it("does not trigger other receive callbacks after error response", () => {
        const spyOk = sinon.spy();
        const spyError = sinon.spy();
        const spyTimeout = sinon.spy();

        joinPush
          .receive("ok", spyOk)
          .receive("error", () => {
            spyError();
            channel.leave();
          })
          .receive("timeout", spyTimeout);

        helpers.receiveError();
        clock.tick(channel.timeout * 2); // attempt timeout

        expect(spyError.calledOnce).toBeTruthy();
        expect(!spyOk.called).toBeTruthy();
        expect(!spyTimeout.called).toBeTruthy();
      });

      it("clears timeoutTimer", () => {
        expect(joinPush.timeoutTimer).toBeTruthy();

        helpers.receiveError();

        expect(joinPush.timeoutTimer).toBeNull();
      });

      it("sets receivedResp with error trigger after binding", () => {
        expect(joinPush.receivedResp).toBeNull();

        joinPush.receive("error", (resp) => {
          expect(resp).toStrictEqual(response);
        });

        helpers.receiveError();
      });

      it("sets receivedResp with error trigger before binding", () => {
        expect(joinPush.receivedResp).toBeNull();

        helpers.receiveError();
        joinPush.receive("error", (resp) => {
          expect(resp).toStrictEqual(response);
        });
      });

      it("does not set channel state to joined", () => {
        helpers.receiveError();

        expect(channel.state).toEqual("errored");
      });

      it("does not trigger channel's buffered pushEvents", () => {
        const pushEvent = { send: () => {} };
        const spy = sinon.spy(pushEvent, "send");

        channel.pushBuffer.push(pushEvent);

        helpers.receiveError();

        expect(!spy.called).toBeTruthy();
        expect(channel.pushBuffer.length).toEqual(1);
      });
    });
  });

  describe("onError", () => {
    let clock, joinPush;

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      socket = new Socket("/socket", { timeout: defaultTimeout });
      sinon.stub(socket, "isConnected").callsFake(() => true);
      sinon.stub(socket, "push").callsFake(() => true);

      channel = socket.channel("topic", { one: "two" });

      joinPush = channel.joinPush;

      channel.join();
      joinPush.trigger("ok", {});
    });

    afterEach(() => {
      clock.restore();
    });

    it("sets state to 'errored'", () => {
      expect(channel.state).not.toEqual("errored");

      channel.trigger("phx_error");

      expect(channel.state).toEqual("errored");
    });

    it("does not trigger redundant errors during backoff", () => {
      const spy = sinon.stub(joinPush, "send");

      expect(spy.callCount).toEqual(0);

      channel.trigger("phx_error");

      clock.tick(1000);
      expect(spy.callCount).toEqual(1);

      joinPush.trigger("error", {});

      clock.tick(10000);
      expect(spy.callCount).toEqual(1);
    });

    it("does not rejoin if channel leaving", () => {
      channel.state = "leaving";

      const spy = sinon.stub(joinPush, "send");

      socket.onConnError({});

      clock.tick(1000);
      expect(spy.callCount).toEqual(0);

      clock.tick(2000);
      expect(spy.callCount).toEqual(0);

      expect(channel.state).toEqual("leaving");
    });

    it("does not rejoin if channel closed", () => {
      channel.state = "closed";

      const spy = sinon.stub(joinPush, "send");

      socket.onConnError({});

      clock.tick(1000);
      expect(spy.callCount).toEqual(0);

      clock.tick(2000);
      expect(spy.callCount).toEqual(0);

      expect(channel.state).toEqual("closed");
    });

    it("triggers additional callbacks after join", () => {
      const spy = sinon.spy();
      channel.onError(spy);
      joinPush.trigger("ok", {});

      expect(channel.state).toEqual("joined");
      expect(spy.callCount).toEqual(0);

      channel.trigger("phx_error");

      expect(spy.callCount).toEqual(1);
    });
  });

  describe("onClose", () => {
    let clock, joinPush;

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      socket = new Socket("/socket", { timeout: defaultTimeout });
      sinon.stub(socket, "isConnected").callsFake(() => true);
      sinon.stub(socket, "push").callsFake(() => true);

      channel = socket.channel("topic", { one: "two" });

      joinPush = channel.joinPush;

      channel.join();
    });

    afterEach(() => {
      clock.restore();
    });

    it("sets state to 'closed'", () => {
      expect(channel.state).not.toEqual("closed");

      channel.trigger("phx_close");

      expect(channel.state).toEqual("closed");
    });

    it("does not rejoin", () => {
      const spy = sinon.stub(joinPush, "send");

      channel.trigger("phx_close");

      clock.tick(1000);
      expect(spy.callCount).toEqual(0);

      clock.tick(2000);
      expect(spy.callCount).toEqual(0);
    });

    it("triggers additional callbacks", () => {
      const spy = sinon.spy();
      channel.onClose(spy);

      expect(spy.callCount).toEqual(0);

      channel.trigger("phx_close");

      expect(spy.callCount).toEqual(1);
    });

    it("removes channel from socket", () => {
      expect(socket.channels.length).toEqual(1);
      expect(socket.channels[0]).toStrictEqual(channel);

      channel.trigger("phx_close");

      expect(socket.channels.length).toEqual(0);
    });
  });

  describe("onMessage", () => {
    it("returns payload by default", () => {
      socket = new Socket("/socket");
      channel = socket.channel("topic", { one: "two" });
      sinon.stub(socket, "makeRef").callsFake(() => defaultRef);
      const payload = channel.onMessage("event", { one: "two" }, defaultRef);

      expect(payload).toStrictEqual({ one: "two" });
    });
  });

  describe("canPush", () => {
    beforeEach(() => {
      socket = new Socket("/socket");

      channel = socket.channel("topic", { one: "two" });
    });

    it("returns true when socket connected and channel joined", () => {
      sinon.stub(socket, "isConnected").returns(true);
      channel.state = "joined";

      expect(channel.canPush()).toBeTruthy();
    });

    it("otherwise returns false", () => {
      const isConnectedStub = sinon.stub(socket, "isConnected");

      isConnectedStub.returns(false);
      channel.state = "joined";

      expect(!channel.canPush()).toBeTruthy();

      isConnectedStub.returns(true);
      channel.state = "joining";

      expect(!channel.canPush()).toBeTruthy();

      isConnectedStub.returns(false);
      channel.state = "joining";

      expect(!channel.canPush()).toBeTruthy();
    });
  });

  describe("on", () => {
    beforeEach(() => {
      socket = new Socket("/socket");
      sinon.stub(socket, "makeRef").callsFake(() => defaultRef);

      channel = socket.channel("topic", { one: "two" });
    });

    it("sets up callback for event", () => {
      const spy = sinon.spy();

      channel.trigger("event", {}, defaultRef);
      expect(!spy.called).toBeTruthy();

      channel.on("event", spy);

      channel.trigger("event", {}, defaultRef);

      expect(spy.called).toBeTruthy();
    });

    it("other event callbacks are ignored", () => {
      const spy = sinon.spy();
      const ignoredSpy = sinon.spy();

      channel.trigger("event", {}, defaultRef);

      expect(!ignoredSpy.called).toBeTruthy();

      channel.on("event", spy);

      channel.trigger("event", {}, defaultRef);

      expect(!ignoredSpy.called).toBeTruthy();
    });

    it("generates unique refs for callbacks", () => {
      const ref1 = channel.on("event1", () => 0);
      const ref2 = channel.on("event2", () => 0);
      expect(ref1 + 1).toEqual(ref2);
    });

    it("calls all callbacks for event if they modified during event processing", () => {
      const spy = sinon.spy();

      const ref = channel.on("event", () => {
        channel.off("event", ref);
      });
      channel.on("event", spy);

      channel.trigger("event", {}, defaultRef);

      expect(spy.called).toBeTruthy();
    });
  });

  describe("off", () => {
    beforeEach(() => {
      socket = new Socket("/socket");
      sinon.stub(socket, "makeRef").callsFake(() => defaultRef);

      channel = socket.channel("topic", { one: "two" });
    });

    it("removes all callbacks for event", () => {
      const spy1 = sinon.spy();
      const spy2 = sinon.spy();
      const spy3 = sinon.spy();

      channel.on("event", spy1);
      channel.on("event", spy2);
      channel.on("other", spy3);

      channel.off("event");

      channel.trigger("event", {}, defaultRef);
      channel.trigger("other", {}, defaultRef);

      expect(!spy1.called).toBeTruthy();
      expect(!spy2.called).toBeTruthy();
      expect(spy3.called).toBeTruthy();
    });

    it("removes callback by its ref", () => {
      const spy1 = sinon.spy();
      const spy2 = sinon.spy();

      const ref1 = channel.on("event", spy1);
      const _ref2 = channel.on("event", spy2);

      channel.off("event", ref1);
      channel.trigger("event", {}, defaultRef);

      expect(!spy1.called).toBeTruthy();
      expect(spy2.called).toBeTruthy();
    });
  });

  describe("push", () => {
    let clock, joinPush;
    let socketSpy;

    const pushParams = (channel) => {
      return {
        topic: "topic",
        event: "event",
        payload: { foo: "bar" },
        join_ref: channel.joinRef(),
        ref: defaultRef,
      };
    };

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      socket = new Socket("/socket", { timeout: defaultTimeout });
      sinon.stub(socket, "makeRef").callsFake(() => defaultRef);
      sinon.stub(socket, "isConnected").callsFake(() => true);
      socketSpy = sinon.stub(socket, "push");

      channel = socket.channel("topic", { one: "two" });
    });

    afterEach(() => {
      clock.restore();
    });

    it("sends push event when successfully joined", () => {
      channel.join().trigger("ok", {});
      channel.push("event", { foo: "bar" });

      expect(socketSpy.calledWith(pushParams(channel))).toBeTruthy();
    });

    it("enqueues push event to be sent once join has succeeded", () => {
      joinPush = channel.join();
      channel.push("event", { foo: "bar" });

      expect(!socketSpy.calledWith(pushParams(channel))).toBeTruthy();

      clock.tick(channel.timeout / 2);
      joinPush.trigger("ok", {});

      expect(socketSpy.calledWith(pushParams(channel))).toBeTruthy();
    });

    it("does not push if channel join times out", () => {
      joinPush = channel.join();
      channel.push("event", { foo: "bar" });

      expect(!socketSpy.calledWith(pushParams(channel))).toBeTruthy();

      clock.tick(channel.timeout * 2);
      joinPush.trigger("ok", {});

      expect(!socketSpy.calledWith(pushParams(channel))).toBeTruthy();
    });

    it("uses channel timeout by default", () => {
      const timeoutSpy = sinon.spy();
      channel.join().trigger("ok", {});

      channel.push("event", { foo: "bar" }).receive("timeout", timeoutSpy);

      clock.tick(channel.timeout / 2);
      expect(!timeoutSpy.called).toBeTruthy();

      clock.tick(channel.timeout);
      expect(timeoutSpy.called).toBeTruthy();
    });

    it("accepts timeout arg", () => {
      const timeoutSpy = sinon.spy();
      channel.join().trigger("ok", {});

      channel.push("event", { foo: "bar" }, channel.timeout * 2).receive("timeout", timeoutSpy);

      clock.tick(channel.timeout);
      expect(!timeoutSpy.called).toBeTruthy();

      clock.tick(channel.timeout * 2);
      expect(timeoutSpy.called).toBeTruthy();
    });

    it("does not time out after receiving 'ok'", () => {
      channel.join().trigger("ok", {});
      const timeoutSpy = sinon.spy();
      const push = channel.push("event", { foo: "bar" });
      push.receive("timeout", timeoutSpy);

      clock.tick(push.timeout / 2);
      expect(!timeoutSpy.called).toBeTruthy();

      push.trigger("ok", {});

      clock.tick(push.timeout);
      expect(!timeoutSpy.called).toBeTruthy();
    });

    it("throws if channel has not been joined", () => {
      expect(() => channel.push("event", {})).toThrow(/^tried to push.*before joining/i);
    });
  });

  describe("leave", () => {
    let clock;
    let socketSpy;

    beforeEach(() => {
      clock = sinon.useFakeTimers();

      socket = new Socket("/socket", { timeout: defaultTimeout });
      sinon.stub(socket, "isConnected").callsFake(() => true);
      socketSpy = sinon.stub(socket, "push");

      channel = socket.channel("topic", { one: "two" });
      channel.join().trigger("ok", {});
    });

    afterEach(() => {
      clock.restore();
    });

    it("unsubscribes from server events", () => {
      sinon.stub(socket, "makeRef").callsFake(() => defaultRef);
      const joinRef = channel.joinRef();

      channel.leave();

      expect(
        socketSpy.calledWith({
          topic: "topic",
          event: "phx_leave",
          payload: {},
          ref: defaultRef,
          join_ref: joinRef,
        }),
      ).toBeTruthy();
    });

    it("closes channel on 'ok' from server", () => {
      const anotherChannel = socket.channel("another", { three: "four" });
      expect(socket.channels.length).toEqual(2);

      channel.leave().trigger("ok", {});

      expect(socket.channels.length).toEqual(1);
      expect(socket.channels[0]).toStrictEqual(anotherChannel);
    });

    it("sets state to closed on 'ok' event", () => {
      expect(channel.state).not.toEqual("closed");

      channel.leave().trigger("ok", {});

      expect(channel.state).toEqual("closed");
    });

    // TODO - the following tests are skipped until Channel.leave
    // behavior can be fixed; currently, 'ok' is triggered immediately
    // within Channel.leave so timeout callbacks are never reached
    //
    it.skip("sets state to leaving initially", () => {
      expect(channel.state).not.toEqual("leaving");

      channel.leave();

      expect(channel.state).toEqual("leaving");
    });

    it.skip("closes channel on 'timeout'", () => {
      channel.leave();

      clock.tick(channel.timeout);

      expect(channel.state).toEqual("closed");
    });

    it.skip("accepts timeout arg", () => {
      channel.leave(channel.timeout * 2);

      clock.tick(channel.timeout);

      expect(channel.state).toEqual("leaving");

      clock.tick(channel.timeout * 2);

      expect(channel.state).toEqual("closed");
    });
  });
});
