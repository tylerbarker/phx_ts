import { describe, expect, it } from "bun:test";

import { Presence } from "../assets/js/phoenix";

const clone = (obj) => {
  const cloned = JSON.parse(JSON.stringify(obj));
  Object.entries(obj).map(([key, val]) => {
    if (val === undefined) {
      cloned[key] = undefined;
    }
  });
  return cloned;
};

const fixtures = {
  joins() {
    return { u1: { metas: [{ id: 1, phx_ref: "1.2" }] } };
  },
  leaves() {
    return { u2: { metas: [{ id: 2, phx_ref: "2" }] } };
  },
  state() {
    return {
      u1: { metas: [{ id: 1, phx_ref: "1" }] },
      u2: { metas: [{ id: 2, phx_ref: "2" }] },
      u3: { metas: [{ id: 3, phx_ref: "3" }] },
    };
  },
};

const channelStub = {
  ref: 1,
  events: {},

  on(event, callback) {
    this.events[event] = callback;
  },

  trigger(event, data) {
    this.events[event](data);
  },

  joinRef() {
    return `${this.ref}`;
  },

  simulateDisconnectAndReconnect() {
    this.ref++;
  },
};

const listByFirst = (id, { metas: [first, ..._rest] }) => first;

describe("syncState", () => {
  it("syncs empty state", () => {
    const newState = { u1: { metas: [{ id: 1, phx_ref: "1" }] } };
    let state = {};
    const stateBefore = clone(state);
    Presence.syncState(state, newState);
    expect(state).toStrictEqual(stateBefore);

    state = Presence.syncState(state, newState);
    expect(state).toStrictEqual(newState);
  });

  it("onJoins new presences and onLeave's left presences", () => {
    const newState = fixtures.state();
    let state = { u4: { metas: [{ id: 4, phx_ref: "4" }] } };
    const joined = {};
    const left = {};
    const onJoin = (key, current, newPres) => {
      joined[key] = { current: current, newPres: newPres };
    };
    const onLeave = (key, current, leftPres) => {
      left[key] = { current: current, leftPres: leftPres };
    };

    state = Presence.syncState(state, newState, onJoin, onLeave);
    expect(state).toStrictEqual(newState);
    expect(joined).toStrictEqual({
      u1: { current: undefined, newPres: { metas: [{ id: 1, phx_ref: "1" }] } },
      u2: { current: undefined, newPres: { metas: [{ id: 2, phx_ref: "2" }] } },
      u3: { current: undefined, newPres: { metas: [{ id: 3, phx_ref: "3" }] } },
    });
    expect(left).toStrictEqual({
      u4: {
        current: { metas: [] },
        leftPres: { metas: [{ id: 4, phx_ref: "4" }] },
      },
    });
  });

  it("onJoins only newly added metas", () => {
    const newState = {
      u3: {
        metas: [
          { id: 3, phx_ref: "3" },
          { id: 3, phx_ref: "3.new" },
        ],
      },
    };
    let state = { u3: { metas: [{ id: 3, phx_ref: "3" }] } };
    const joined = [];
    const left = [];
    const onJoin = (key, current, newPres) => {
      joined.push([key, clone({ current: current, newPres: newPres })]);
    };
    const onLeave = (key, current, leftPres) => {
      left.push([key, clone({ current: current, leftPres: leftPres })]);
    };
    state = Presence.syncState(state, clone(newState), onJoin, onLeave);
    expect(state).toStrictEqual(newState);
    expect(joined).toStrictEqual([
      [
        "u3",
        {
          current: { metas: [{ id: 3, phx_ref: "3" }] },
          newPres: { metas: [{ id: 3, phx_ref: "3.new" }] },
        },
      ],
    ]);
    expect(left).toStrictEqual([]);
  });
});

describe("syncDiff", () => {
  it("syncs empty state", () => {
    const joins = { u1: { metas: [{ id: 1, phx_ref: "1" }] } };
    const state = Presence.syncDiff(
      {},
      {
        joins: joins,
        leaves: {},
      },
    );
    expect(state).toStrictEqual(joins);
  });

  it("removes presence when meta is empty and adds additional meta", () => {
    let state = fixtures.state();
    state = Presence.syncDiff(state, {
      joins: fixtures.joins(),
      leaves: fixtures.leaves(),
    });

    expect(state).toStrictEqual({
      u1: {
        metas: [
          { id: 1, phx_ref: "1" },
          { id: 1, phx_ref: "1.2" },
        ],
      },
      u3: { metas: [{ id: 3, phx_ref: "3" }] },
    });
  });

  it("removes meta while leaving key if other metas exist", () => {
    let state = {
      u1: {
        metas: [
          { id: 1, phx_ref: "1" },
          { id: 1, phx_ref: "1.2" },
        ],
      },
    };
    state = Presence.syncDiff(state, {
      joins: {},
      leaves: { u1: { metas: [{ id: 1, phx_ref: "1" }] } },
    });

    expect(state).toStrictEqual({
      u1: { metas: [{ id: 1, phx_ref: "1.2" }] },
    });
  });
});

describe("list", () => {
  it("lists full presence by default", () => {
    const state = fixtures.state();
    expect(Presence.list(state)).toStrictEqual([
      { metas: [{ id: 1, phx_ref: "1" }] },
      { metas: [{ id: 2, phx_ref: "2" }] },
      { metas: [{ id: 3, phx_ref: "3" }] },
    ]);
  });

  it("lists with custom function", () => {
    const state = {
      u1: {
        metas: [
          { id: 1, phx_ref: "1.first" },
          { id: 1, phx_ref: "1.second" },
        ],
      },
    };

    const listBy = (key, { metas: [first, ..._rest] }) => {
      return first;
    };

    expect(Presence.list(state, listBy)).toStrictEqual([{ id: 1, phx_ref: "1.first" }]);
  });
});

describe("instance", () => {
  it("syncs state and diffs", () => {
    const presence = new Presence(channelStub);
    const user1 = { metas: [{ id: 1, phx_ref: "1" }] };
    const user2 = { metas: [{ id: 2, phx_ref: "2" }] };
    const newState = { u1: user1, u2: user2 };

    channelStub.trigger("presence_state", newState);
    expect(presence.list(listByFirst)).toStrictEqual([
      { id: 1, phx_ref: "1" },
      { id: 2, phx_ref: "2" },
    ]);

    channelStub.trigger("presence_diff", { joins: {}, leaves: { u1: user1 } });
    expect(presence.list(listByFirst)).toStrictEqual([{ id: 2, phx_ref: "2" }]);
  });

  it("applies pending diff if state is not yet synced", () => {
    const presence = new Presence(channelStub);
    const onJoins = [];
    const onLeaves = [];

    presence.onJoin((id, current, newPres) => {
      onJoins.push(clone({ id, current, newPres }));
    });
    presence.onLeave((id, current, leftPres) => {
      onLeaves.push(clone({ id, current, leftPres }));
    });

    // new connection
    const user1 = { metas: [{ id: 1, phx_ref: "1" }] };
    const user2 = { metas: [{ id: 2, phx_ref: "2" }] };
    const user3 = { metas: [{ id: 3, phx_ref: "3" }] };
    const newState = { u1: user1, u2: user2 };
    const leaves = { u2: user2 };

    channelStub.trigger("presence_diff", { joins: {}, leaves: leaves });

    expect(presence.list(listByFirst)).toStrictEqual([]);
    expect(presence.pendingDiffs).toStrictEqual([{ joins: {}, leaves: leaves }]);

    channelStub.trigger("presence_state", newState);
    expect(onLeaves).toStrictEqual([
      {
        id: "u2",
        current: { metas: [] },
        leftPres: { metas: [{ id: 2, phx_ref: "2" }] },
      },
    ]);

    expect(presence.list(listByFirst)).toStrictEqual([{ id: 1, phx_ref: "1" }]);
    expect(presence.pendingDiffs).toStrictEqual([]);
    expect(onJoins).toStrictEqual([
      {
        id: "u1",
        current: undefined,
        newPres: { metas: [{ id: 1, phx_ref: "1" }] },
      },
      {
        id: "u2",
        current: undefined,
        newPres: { metas: [{ id: 2, phx_ref: "2" }] },
      },
    ]);

    // disconnect and reconnect
    expect(presence.inPendingSyncState()).toEqual(false);
    channelStub.simulateDisconnectAndReconnect();
    expect(presence.inPendingSyncState()).toEqual(true);

    channelStub.trigger("presence_diff", { joins: {}, leaves: { u1: user1 } });
    expect(presence.list(listByFirst)).toStrictEqual([{ id: 1, phx_ref: "1" }]);

    channelStub.trigger("presence_state", { u1: user1, u3: user3 });
    expect(presence.list(listByFirst)).toStrictEqual([{ id: 3, phx_ref: "3" }]);
  });

  it("allows custom channel events", () => {
    const presence = new Presence(channelStub, {
      events: {
        state: "the_state",
        diff: "the_diff",
      },
    });

    const user1 = { metas: [{ id: 1, phx_ref: "1" }] };
    channelStub.trigger("the_state", { user1: user1 });
    expect(presence.list(listByFirst)).toStrictEqual([{ id: 1, phx_ref: "1" }]);
    channelStub.trigger("the_diff", { joins: {}, leaves: { user1: user1 } });
    expect(presence.list(listByFirst)).toStrictEqual([]);
  });

  it("updates existing meta for a presence update (leave + join)", () => {
    const presence = new Presence(channelStub);
    const onJoins = [];
    const onLeaves = [];

    // new connection
    const user1 = { metas: [{ id: 1, phx_ref: "1" }] };
    const user2 = { metas: [{ id: 2, name: "chris", phx_ref: "2" }] };
    const newState = { u1: user1, u2: user2 };

    channelStub.trigger("presence_state", clone(newState));

    presence.onJoin((id, current, newPres) => {
      onJoins.push(clone({ id, current, newPres }));
    });
    presence.onLeave((id, current, leftPres) => {
      onLeaves.push(clone({ id, current, leftPres }));
    });

    expect(presence.list((id, { metas }) => metas)).toStrictEqual([
      [
        {
          id: 1,
          phx_ref: "1",
        },
      ],
      [
        {
          id: 2,
          name: "chris",
          phx_ref: "2",
        },
      ],
    ]);

    const leaves = { u2: user2 };
    const joins = {
      u2: {
        metas: [{ id: 2, name: "chris.2", phx_ref: "2.2", phx_ref_prev: "2" }],
      },
    };
    channelStub.trigger("presence_diff", { joins: joins, leaves: leaves });

    expect(presence.list((id, { metas }) => metas)).toStrictEqual([
      [
        {
          id: 1,
          phx_ref: "1",
        },
      ],
      [
        {
          id: 2,
          name: "chris.2",
          phx_ref: "2.2",
          phx_ref_prev: "2",
        },
      ],
    ]);

    expect(onJoins).toStrictEqual([
      {
        current: {
          metas: [
            {
              id: 2,
              name: "chris",
              phx_ref: "2",
            },
          ],
        },
        id: "u2",
        newPres: {
          metas: [
            {
              id: 2,
              name: "chris.2",
              phx_ref: "2.2",
              phx_ref_prev: "2",
            },
          ],
        },
      },
    ]);
  });
});
